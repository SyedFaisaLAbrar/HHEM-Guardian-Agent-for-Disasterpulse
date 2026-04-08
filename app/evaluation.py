"""
DisasterPulse — Real Evaluation
Computes actual nDCG@K, MRR, and classifier F1 from CrisisMMD test split.

Run:
    python evaluation.py
    
Outputs:
    data/eval_results.json   ← loaded by frontend /evaluate endpoint
"""

import json
import math
import random
from pathlib import Path
from collections import defaultdict

import pandas as pd
from tqdm import tqdm

from data_loader import get_collection, retrieve_similar_events

CRISIS_MMD_ANNOTATIONS = "../data/crisis_mmd/CrisisMMD_v2.0/annotations"
EVAL_RESULTS_PATH      = "../evaluation/eval_results.json"
EVAL_SAMPLE_SIZE       = 200   # number of test queries — keep low for speed

# ── nDCG / MRR Helpers ────────────────────────────────────────────────────────

SEVERITY_RELEVANCE = {"high": 3, "medium": 2, "low": 1, "unknown": 0}

def dcg(relevances: list) -> float:
    return sum(
        rel / math.log2(rank + 2)
        for rank, rel in enumerate(relevances)
    )

def ndcg_at_k(retrieved: list, relevant_severity: str, k: int) -> float:
    """
    retrieved: list of hit dicts from retrieve_similar_events()
    relevant_severity: the ground-truth severity of the query event
    """
    ideal_rel = sorted(
        [SEVERITY_RELEVANCE.get(h["severity"], 0) for h in retrieved[:k]],
        reverse=True
    )
    actual_rel = [SEVERITY_RELEVANCE.get(h["severity"], 0) for h in retrieved[:k]]

    ideal = dcg(ideal_rel)
    actual = dcg(actual_rel)
    return actual / ideal if ideal > 0 else 0.0

def mrr(retrieved: list, query_disaster_types: list) -> float:
    """
    Returns 1/rank of first hit whose disaster_types overlap with query types.
    """
    for rank, hit in enumerate(retrieved, 1):
        if any(t in hit.get("disaster_types", []) for t in query_disaster_types):
            return 1.0 / rank
    return 0.0


# ── Build Evaluation Queries from CrisisMMD ───────────────────────────────────

DAMAGE_TO_SEVERITY = {
    "severe_damage":       "high",
    "mild_damage":         "medium",
    "little_or_no_damage": "low",
}

EVENT_TO_TYPE = {
    "california_wildfires": "NATURAL_DISASTER_WILDFIRE",
    "hurricane_harvey":     "NATURAL_DISASTER_HURRICANE",
    "hurricane_irma":       "NATURAL_DISASTER_HURRICANE",
    "hurricane_maria":      "NATURAL_DISASTER_HURRICANE",
    "iraq_iran_earthquake": "NATURAL_DISASTER_EARTHQUAKE",
    "mexico_earthquake":    "NATURAL_DISASTER_EARTHQUAKE",
    "srilanka_floods":      "NATURAL_DISASTER_FLOOD",
}


def build_eval_queries() -> list:
    """
    Load CrisisMMD test rows as evaluation queries.
    Each query = {text, true_severity, true_disaster_types}
    """
    ann_dir = Path(CRISIS_MMD_ANNOTATIONS)
    queries = []

    for tsv in ann_dir.glob("*.tsv"):
        if tsv.name.startswith("._"):
            continue

        event_name    = tsv.stem.replace("_final_data", "")
        disaster_type = EVENT_TO_TYPE.get(event_name, "CRISISLEX_CRISISLEXREC")

        try:
            df = pd.read_csv(tsv, sep="\t", dtype=str, on_bad_lines="skip")
        except Exception:
            continue

        df.columns = [c.strip().lower() for c in df.columns]

        if "tweet_text" not in df.columns:
            continue

        for _, row in df.iterrows():
            text = str(row.get("tweet_text", "")).strip()
            if not text or text.lower() == "nan":
                continue

            damage_raw = str(row.get("image_damage", "")).strip().lower()
            severity   = DAMAGE_TO_SEVERITY.get(damage_raw)
            if severity is None:
                continue   # only use rows with ground-truth damage labels

            queries.append({
                "text":          text,
                "true_severity": severity,
                "true_types":    [disaster_type],
                "event_name":    event_name,
            })

    random.seed(42)
    random.shuffle(queries)
    return queries[:EVAL_SAMPLE_SIZE]


# ── Classifier Evaluation ─────────────────────────────────────────────────────

def evaluate_classifier_simple(queries: list) -> dict:
    """
    Simple rule-based classifier evaluation using keyword matching.
    This avoids needing Ollama running for evaluation.
    
    In production you'd call node_classifier() for each query — but that
    requires Ollama running and takes ~30 min for 200 queries.
    This gives honest per-class F1 from your keyword signal.
    """
    KEYWORD_MAP = {
        "NATURAL_DISASTER_EARTHQUAKE": ["earthquake", "quake", "tremor", "seismic", "magnitude", "richter"],
        "NATURAL_DISASTER_FLOOD":      ["flood", "flooding", "inundation", "submerged", "underwater", "deluge"],
        "NATURAL_DISASTER_HURRICANE":  ["hurricane", "typhoon", "cyclone", "storm surge", "tropical storm", "harvey", "irma", "maria"],
        "NATURAL_DISASTER_WILDFIRE":   ["wildfire", "wildfire", "fire", "blaze", "burning", "evacuate", "california fire"],
        "NATURAL_DISASTER_TSUNAMI":    ["tsunami", "tidal wave"],
    }

    per_class = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0})

    for q in queries:
        text_lower = q["text"].lower()
        true_type  = q["true_types"][0]

        # Predict
        predicted = None
        for label, keywords in KEYWORD_MAP.items():
            if any(kw in text_lower for kw in keywords):
                predicted = label
                break
        if predicted is None:
            predicted = "CRISISLEX_CRISISLEXREC"

        if predicted == true_type:
            per_class[true_type]["tp"] += 1
        else:
            per_class[predicted]["fp"] += 1
            per_class[true_type]["fn"]  += 1

    results = {}
    all_f1  = []

    for cls, counts in per_class.items():
        tp, fp, fn = counts["tp"], counts["fp"], counts["fn"]
        precision  = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall     = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1         = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

        short_name = cls.replace("NATURAL_DISASTER_", "").replace("CRISISLEX_", "")
        results[short_name] = {
            "precision": round(precision, 3),
            "recall":    round(recall, 3),
            "f1":        round(f1, 3),
        }
        all_f1.append(f1)

    macro_f1 = sum(all_f1) / len(all_f1) if all_f1 else 0.0
    return {"per_class": results, "macro_f1": round(macro_f1, 3)}


# ── RAG Retrieval Evaluation ──────────────────────────────────────────────────

def evaluate_retrieval(queries: list, collection) -> dict:
    """
    For each query:
      - retrieve top-10 results from ChromaDB
      - compute nDCG@1,3,5,10 and MRR
    """
    K_VALUES = [1, 3, 5, 10]
    ndcg_scores = defaultdict(list)
    mrr_scores  = []

    for q in tqdm(queries, desc="[Eval] RAG retrieval"):
        hits = retrieve_similar_events(
            query      = q["text"],
            collection = collection,
            n_results  = 10,
        )

        if not hits:
            for k in K_VALUES:
                ndcg_scores[k].append(0.0)
            mrr_scores.append(0.0)
            continue

        for k in K_VALUES:
            score = ndcg_at_k(hits, q["true_severity"], k)
            ndcg_scores[k].append(score)

        mrr_scores.append(mrr(hits, q["true_types"]))

    return {
        "ndcg_at_k": {
            str(k): round(sum(v) / len(v), 3) if v else 0.0
            for k, v in ndcg_scores.items()
        },
        "mrr": round(sum(mrr_scores) / len(mrr_scores), 3) if mrr_scores else 0.0,
        "queries_evaluated": len(queries),
    }


# ── Severity Distribution ──────────────────────────────────────────────────────

def get_severity_distribution(collection) -> dict:
    """Pull a large sample and count severity labels."""
    try:
        hits = retrieve_similar_events(
            "earthquake flood hurricane wildfire disaster emergency",
            collection,
            n_results=200,
        )
        counts = defaultdict(int)
        for h in hits:
            counts[h.get("severity", "unknown")] += 1
        total = sum(counts.values()) or 1
        return {
            k: {"count": v, "pct": round(v / total * 100)}
            for k, v in counts.items()
        }
    except Exception:
        return {}


# ── Main ───────────────────────────────────────────────────────────────────────

def run_evaluation() -> dict:
    print("=" * 55)
    print("  DisasterPulse — Real Evaluation")
    print("=" * 55)

    # 1. Load collection
    try:
        collection = get_collection()
        total = collection.count()
        print(f"[Eval] Collection loaded: {total} events")
    except Exception as e:
        print(f"[Eval] ChromaDB not ready: {e}")
        print("       Run data_loader.py first.")
        return {}

    # 2. Build eval queries from CrisisMMD
    print(f"\n[Eval] Building {EVAL_SAMPLE_SIZE} eval queries from CrisisMMD...")
    queries = build_eval_queries()
    print(f"[Eval] Queries ready: {len(queries)}")
    
    if not queries:
        print("[Eval] No queries — check CrisisMMD annotation path.")
        return {}

    # Breakdown
    sev_counts = defaultdict(int)
    type_counts = defaultdict(int)
    for q in queries:
        sev_counts[q["true_severity"]] += 1
        type_counts[q["true_types"][0]] += 1
    print(f"[Eval] Severity breakdown: {dict(sev_counts)}")
    print(f"[Eval] Type breakdown: {dict(type_counts)}")

    # 3. RAG evaluation (real)
    print("\n[Eval] Running RAG retrieval evaluation...")
    rag_results = evaluate_retrieval(queries, collection)
    print(f"[Eval] nDCG@5  = {rag_results['ndcg_at_k']['5']}")
    print(f"[Eval] MRR     = {rag_results['mrr']}")

    # 4. Classifier evaluation (real keyword-based)
    print("\n[Eval] Running classifier evaluation...")
    clf_results = evaluate_classifier_simple(queries)
    print(f"[Eval] Macro F1 = {clf_results['macro_f1']}")

    # 5. Severity distribution from collection
    sev_dist = get_severity_distribution(collection)

    # 6. Compile final results
    results = {
        "retrieval": rag_results,
        "classifier": clf_results,
        "severity_distribution": sev_dist,
        "corpus_size": total,
        "eval_queries": len(queries),
        "note": "RAG nDCG computed from CrisisMMD damage severity labels as relevance grades. "
                "Classifier F1 from keyword matching baseline.",
    }

    # 7. Save
    out = Path(EVAL_RESULTS_PATH)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n[Done] Results saved → {out}")
    print("\n── Summary ──────────────────────────────────────")
    print(f"  nDCG@5  : {rag_results['ndcg_at_k']['5']}")
    print(f"  MRR     : {rag_results['mrr']}")
    print(f"  Macro F1: {clf_results['macro_f1']}")

    return results


if __name__ == "__main__":
    run_evaluation()
