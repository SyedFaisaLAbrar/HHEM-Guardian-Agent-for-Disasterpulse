"""
DisasterPulse — Agent Layer  (HHEM Edition)
LangGraph pipeline with 7 nodes:
  1. classifier      — disaster type + severity from raw text
  2. location        — extract locations with spaCy NER
  3. rag_retriever   — pull similar past events from ChromaDB
  4. router          — decide if VLM is needed
  5. vlm_captioner   — generate damage caption from image (Groq Vision)
  6. hhem_guard      — Vectara HHEM-2.1-Open hallucination detection + auto-correction  ← NEW
  7. report_gen      — produce final structured JSON + natural language summary

Run standalone:
    python agents.py

Or import process_event() from main.py / FastAPI.
"""

import json
import re
from typing import TypedDict, Optional
from pathlib import Path
import os
from dotenv import load_dotenv
load_dotenv()

from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END
import spacy
import base64

from data_loader import get_collection, retrieve_similar_events

# ── Config ──────────────────────────────────────────────────────────────────────

CHROMA_DIR       = "data/chroma_db"
RAG_TOP_K        = 5

GROQ_MODEL_TEXT  = "llama-3.1-8b-instant"
GROQ_MODEL_VLM   = "meta-llama/llama-4-scout-17b-16e-instruct"

# HHEM threshold: below this score the answer is considered hallucinated
# Vectara paper recommends 0.5 as the default decision boundary
HHEM_THRESHOLD   = 0.5

# ── Shared Pipeline State ───────────────────────────────────────────────────────

class PipelineState(TypedDict):
    # Input
    raw_text:        str
    image_path:      Optional[str]
    source_url:      Optional[str]

    # Node outputs
    disaster_types:  list
    severity:        str
    locations:       list
    rag_context:     list
    needs_vlm:       bool
    vlm_caption:     Optional[str]

    # HHEM outputs  ← NEW
    hhem_score:      Optional[float]   # 0–1, higher = more consistent
    hhem_triggered:  bool              # True if correction was attempted
    hhem_correction: Optional[str]     # corrected summary if triggered
    hhem_original_draft: Optional[str] # original draft before correction (for UI display)

    final_report:    Optional[dict]
    error:           Optional[str]


# ── Node 1: Classifier ──────────────────────────────────────────────────────────

CLASSIFIER_SYSTEM = """You are a disaster event classifier for a humanitarian AI system.
Given tweet or news text, output ONLY valid JSON with no markdown or explanation.

Schema:
{
  "disaster_types": ["<type>"],
  "severity": "<level>",
  "is_disaster": true|false
}

Valid disaster types:
NATURAL_DISASTER_EARTHQUAKE, NATURAL_DISASTER_FLOOD, NATURAL_DISASTER_HURRICANE,
NATURAL_DISASTER_WILDFIRE, NATURAL_DISASTER_TORNADO, NATURAL_DISASTER_TSUNAMI,
NATURAL_DISASTER_DROUGHT, MANMADE_DISASTER_EXPLOSION, MANMADE_DISASTER_FIRE,
CRISISLEX_CRISISLEXREC (use this if uncertain)

Severity guidelines:
- high: deaths confirmed, severe infrastructure damage, mass displacement
- medium: injuries, moderate damage, active rescue operations
- low: warnings, minor damage, precautionary alerts
"""

def node_classifier(state: PipelineState) -> PipelineState:
    text = state["raw_text"]
    llm  = ChatGroq(model=GROQ_MODEL_TEXT, temperature=0, api_key=os.getenv("GROQ_API_KEY"))

    try:
        response = llm.invoke([
            SystemMessage(content=CLASSIFIER_SYSTEM),
            HumanMessage(content=f"Classify this text:\n\n{text[:1000]}"),
        ])
        raw    = re.sub(r"```json|```", "", response.content).strip()
        parsed = json.loads(raw)
        
        print(f"[CLASSIFIER] Parsed: {parsed}")

        # Process regardless of is_disaster flag - we'll classify everything
        disaster_types = parsed.get("disaster_types", ["CRISISLEX_CRISISLEXREC"])
        severity = parsed.get("severity", "unknown")
        
        # If marked as not_disaster but we still got types, use them
        # If marked as not_disaster AND no types, still classify as CRISISLEX_CRISISLEXREC
        if not disaster_types or disaster_types == []:
            disaster_types = ["CRISISLEX_CRISISLEXREC"]
        
        print(f"[CLASSIFIER] Types: {disaster_types}, Severity: {severity}, is_disaster: {parsed.get('is_disaster', True)}")
        
        return {**state,
                "disaster_types": disaster_types,
                "severity":       severity}

    except Exception as e:
        print(f"[CLASSIFIER] Error: {e}")
        return {**state,
                "disaster_types": ["CRISISLEX_CRISISLEXREC"],
                "severity":       "unknown",
                "error":          f"classifier_error: {str(e)[:100]}"}


# ── Node 2: Location Extractor ──────────────────────────────────────────────────

_nlp = None

def _get_nlp():
    global _nlp
    if _nlp is None:
        try:
            _nlp = spacy.load("en_core_web_sm")
        except OSError:
            _nlp = None
    return _nlp


def node_location_extractor(state: PipelineState) -> PipelineState:
    nlp = _get_nlp()
    if nlp is None:
        return {**state, "locations": []}

    doc  = nlp(state["raw_text"][:2000])
    locs = []
    seen = set()

    for ent in doc.ents:
        if ent.label_ in ("GPE", "LOC", "FAC") and ent.text not in seen:
            seen.add(ent.text)
            locs.append({"name": ent.text, "country": "", "lat": None,
                         "lon": None, "type": ent.label_})

    return {**state, "locations": locs}


# ── Node 3: RAG Retriever ───────────────────────────────────────────────────────

def node_rag_retriever(state: PipelineState) -> PipelineState:
    loc_names = " ".join(l["name"] for l in state.get("locations", []))
    type_str  = " ".join(t.replace("_", " ").lower()
                         for t in state.get("disaster_types", []))
    query = f"{type_str} {state['raw_text'][:300]} {loc_names}".strip()

    try:
        collection = get_collection(CHROMA_DIR)
        hits = retrieve_similar_events(query=query, collection=collection,
                                       n_results=RAG_TOP_K)
        return {**state, "rag_context": hits}
    except Exception as e:
        return {**state, "rag_context": [], "error": f"rag_error: {e}"}


# ── Node 4: Router ──────────────────────────────────────────────────────────────

def node_router(state: PipelineState) -> PipelineState:
    image_path = state.get("image_path")
    severity   = state.get("severity", "unknown")
    types      = state.get("disaster_types", [])

    damage_types = {
        "NATURAL_DISASTER_EARTHQUAKE", "NATURAL_DISASTER_HURRICANE",
        "NATURAL_DISASTER_FLOOD",      "NATURAL_DISASTER_WILDFIRE",
        "NATURAL_DISASTER_TSUNAMI",    "MANMADE_DISASTER_EXPLOSION",
    }

    needs_vlm = bool(
        image_path and Path(image_path).exists()
        and (severity in ("medium", "high") or any(t in damage_types for t in types))
    )
    return {**state, "needs_vlm": needs_vlm}


# ── Node 5: VLM Captioner ───────────────────────────────────────────────────────

VLM_PROMPT = """You are analyzing a disaster scene image for a humanitarian response system.
Provide a structured assessment with:
1. What is visible (buildings, people, vehicles, infrastructure)
2. Damage level: none / minor / moderate / severe / catastrophic
3. Specific damage indicators (collapsed structures, flooding, fire, etc.)
4. Estimated number of affected people or structures if visible
5. Recommended humanitarian response priority: low / medium / high / critical

Be concise and factual. Focus on actionable information for first responders."""


def _extract_severity_from_vlm(vlm_caption: str) -> Optional[str]:
    if not vlm_caption:
        return None
    c = vlm_caption.lower()
    if any(w in c for w in ["catastrophic", "severe damage", "collapsed", "destroyed"]):
        return "high"
    if any(w in c for w in ["moderate damage", "partially", "significant damage"]):
        return "medium"
    if any(w in c for w in ["minor damage", "minimal", "light damage", "intact"]):
        return "low"
    return None


def node_vlm_captioner(state: PipelineState) -> PipelineState:
    if not state.get("needs_vlm"):
        return {**state, "vlm_caption": None}

    image_path = state["image_path"]
    try:
        with open(image_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()

        ext        = Path(image_path).suffix.lstrip(".") or "jpeg"
        media_type = f"image/{ext}"

        llm = ChatGroq(model=GROQ_MODEL_VLM, temperature=0,
                       api_key=os.getenv("GROQ_API_KEY"))
        response = llm.invoke([
            HumanMessage(content=[
                {"type": "image_url",
                 "image_url": {"url": f"data:{media_type};base64,{b64}"}},
                {"type": "text", "text": VLM_PROMPT}
            ])
        ])
        caption = response.content.strip()

        vlm_severity    = _extract_severity_from_vlm(caption)
        updated_severity = state.get("severity", "unknown")
        if vlm_severity and state.get("severity") == "unknown":
            updated_severity = vlm_severity

        return {**state, "vlm_caption": caption, "severity": updated_severity}

    except Exception as e:
        return {**state, "vlm_caption": None, "error": f"vlm_error: {e}"}


# ── Node 6: HHEM Hallucination Guard  ← NEW ────────────────────────────────────

# Lazy-loaded — only imported when first needed so the model download
# doesn't block startup if transformers is unavailable.
_hhem_model = None

def _get_hhem():
    """Lazy-load Vectara HHEM-2.1-Open.  Returns None if not installed."""
    global _hhem_model
    if _hhem_model is None:
        try:
            from transformers import AutoModelForSequenceClassification
            _hhem_model = AutoModelForSequenceClassification.from_pretrained(
                "vectara/hallucination_evaluation_model",
                trust_remote_code=True,
            )
            _hhem_model.eval()
            print("[HHEM] Model loaded — vectara/hallucination_evaluation_model")
        except Exception as e:
            print(f"[HHEM] Could not load model: {e}. Skipping hallucination check.")
            _hhem_model = "unavailable"
    return None if _hhem_model == "unavailable" else _hhem_model


def _build_premise(state: PipelineState) -> str:
    """
    Build the evidence/premise string from RAG context + VLM caption.
    This is what the LLM *should* have grounded its answer in.
    """
    parts = []
    for hit in state.get("rag_context", [])[:3]:
        parts.append(hit["text"][:350])
    if state.get("vlm_caption"):
        parts.append(state["vlm_caption"])
    if not parts:
        parts.append(state["raw_text"][:500])
    return " | ".join(parts)


CORRECTION_SYSTEM = """You are a factual correction agent for a disaster intelligence system.
You are given:
  - CONTEXT: the only trusted source of facts
  - DRAFT SUMMARY: a generated summary that may contain claims not supported by the context

Your task: rewrite the DRAFT SUMMARY so that EVERY claim is directly supported by the CONTEXT.
Remove or correct any statement not found in the context.
Output only the corrected summary text — no JSON, no markdown, no explanation."""


# def node_hhem_guard(state: PipelineState) -> PipelineState:
#     """
#     Node 6 — Vectara HHEM-2.1-Open hallucination guard.

#     Steps:
#       1. Generate a short draft summary from the current state (before full report).
#       2. Score it against the retrieved context with HHEM.
#       3. If score < HHEM_THRESHOLD → auto-correct via Groq and store result.
#       4. Pass hhem_score, hhem_triggered, hhem_correction into state for
#          the report generator and the API response.
#     """
    
#     # ── Step 1: build a short draft to score ───────────────────────────────────
#     draft = (
#         f"Disaster type: {', '.join(state.get('disaster_types', []))}. "
#         f"Severity: {state.get('severity', 'unknown')}. "
#         f"Locations: {', '.join(l['name'] for l in state.get('locations', []))}. "
#         f"{state['raw_text'][:300]}"
#     )
#     premise = _build_premise(state)

#     # ── Step 2: HHEM score ─────────────────────────────────────────────────────
#     hhem_score = None
#     model      = _get_hhem()

#     if model is not None:
#         try:
#             import torch
#             with torch.no_grad():
#                 scores = model.predict([(premise, draft)])
#             hhem_score = float(scores[0].item())
#         except Exception as e:
#             print(f"[HHEM] Scoring error: {e}")

#     # ── Step 3: auto-correct if triggered ─────────────────────────────────────
#     hhem_triggered  = False
#     hhem_correction = None

#     needs_correction = (hhem_score is not None and hhem_score < HHEM_THRESHOLD)

#     if needs_correction:
#         hhem_triggered = True
#         try:
#             llm = ChatGroq(model=GROQ_MODEL_TEXT, temperature=0,
#                            api_key=os.getenv("GROQ_API_KEY"))
#             correction_prompt = (
#                 f"CONTEXT:\n{premise}\n\n"
#                 f"DRAFT SUMMARY:\n{draft}\n\n"
#                 f"Rewrite the draft so every claim is supported by the context only."
#             )
#             resp = llm.invoke([
#                 SystemMessage(content=CORRECTION_SYSTEM),
#                 HumanMessage(content=correction_prompt),
#             ])
#             hhem_correction = resp.content.strip()
#             print(f"[HHEM] Score {hhem_score:.3f} < {HHEM_THRESHOLD} → correction applied.")
#         except Exception as e:
#             print(f"[HHEM] Correction LLM error: {e}")
#     else:
#         score_str = f"{hhem_score:.3f}" if hhem_score is not None else "N/A (model unavailable)"
#         print(f"[HHEM] Score {score_str} — no correction needed.")

#     return {
#         **state,
#         "hhem_score":           hhem_score,
#         "hhem_triggered":       hhem_triggered,
#         "hhem_correction":      hhem_correction,
#         "hhem_original_draft":  draft,  # Store original draft for frontend comparison
#     }

# ── Node 6: HHEM Hallucination Guard (Improved) ───────────────────────────────

def node_hhem_guard(state: PipelineState) -> PipelineState:
    """Improved: First create a clean short draft summary, then score + correct."""
    
    # ── Step 1: Create a proper short draft summary (this was missing) ───────
    draft_prompt = f"""Create a short, complete, clear factual sentence summary of the disaster event.
        Do NOT ask questions. Do NOT speculate about "similar events in last decade".
        Stick strictly to the facts below.

        Raw text: {state['raw_text'][:500]}
        Disaster types: {', '.join(state.get('disaster_types', []))}
        Severity: {state.get('severity', 'unknown')}
        Locations: {', '.join(l['name'] for l in state.get('locations', []))}
        RAG context: {' '.join([h['text'][:250] for h in state.get('rag_context', [])[:2]])}
        VLM caption: {state.get('vlm_caption', '') or 'None'}

        Summary:"""

    llm = ChatGroq(model=GROQ_MODEL_TEXT, temperature=0, api_key=os.getenv("GROQ_API_KEY"))
    draft_response = llm.invoke([HumanMessage(content=draft_prompt)])
    draft = draft_response.content.strip()

    premise = _build_premise(state)   # your existing helper (good)

    # ── Step 2: Score with HHEM ───────────────────────────────────────────────
    hhem_score = None
    model = _get_hhem()
    if model is not None:
        try:
            import torch
            with torch.no_grad():
                scores = model.predict([(premise, draft)])
            hhem_score = float(scores[0].item())
        except Exception as e:
            print(f"[HHEM] Scoring error: {e}")

    # ── Step 3: Auto-correct only if needed ───────────────────────────────────
    hhem_triggered = False
    hhem_correction = None

    if hhem_score is not None and hhem_score < HHEM_THRESHOLD:
        hhem_triggered = True
        correction_prompt = (
            f"CONTEXT (only trusted facts):\n{premise}\n\n"
            f"DRAFT SUMMARY (may contain unsupported claims):\n{draft}\n\n"
            f"Rewrite the draft into a clean, natural 1-2 sentence summary. "
            f"Remove or fix anything not directly supported by the context. "
            f"Keep it factual and ready for humanitarian responders."
        )
        try:
            resp = llm.invoke([
                SystemMessage(content=CORRECTION_SYSTEM),
                HumanMessage(content=correction_prompt),
            ])
            hhem_correction = resp.content.strip()
            print(f"[HHEM] Score {hhem_score:.3f} → correction applied")
        except Exception as e:
            print(f"[HHEM] Correction failed: {e}")

    return {
        **state,
        "hhem_score":          hhem_score,
        "hhem_triggered":      hhem_triggered,
        "hhem_correction":     hhem_correction,
        "hhem_original_draft": draft,          # ← now a clean summary
    }


# ── Node 7: Report Generator (was Node 6) ──────────────────────────────────────

REPORT_SYSTEM = """You are generating a structured disaster intelligence report for humanitarian responders.
Output ONLY valid JSON with no markdown, no explanation, no extra text.

CRITICAL: Re-assess severity using ALL available evidence (text, image analysis, historical context).
If image analysis or historical similar events indicate moderate/high damage, SET SEVERITY ACCORDINGLY.
Do NOT preserve "unknown" if evidence is available.

Schema:
{
  "event_summary": "<2-3 sentence factual summary>",
  "disaster_types": ["<type>"],
  "severity": "<low|medium|high>",
  "affected_locations": ["<location names>"],
  "key_impacts": ["<bullet points>"],
  "response_recommendations": ["<actionable recommendations>"],
  "confidence": "<low|medium|high>",
  "data_sources": ["text_analysis", "rag_context", "vlm_analysis"],
  "historical_context": "<1-2 sentences comparing to retrieved past events>"
}

Severity rules:
- high: confirmed deaths, severe structural damage, mass displacement
- medium: injuries confirmed, moderate damage visible, active rescue operations
- low: warnings, minor damage, precautionary alerts"""


def node_report_generator(state: PipelineState) -> PipelineState:
    """Node 7: synthesize all signals into a final structured report.
    Now intelligently uses HHEM-corrected summary when available."""

    rag_summary = ""
    if state.get("rag_context"):
        rag_summary = "Similar past events:\n" + "\n".join(
            f"- [{h['severity']}] {h['text'][:350]} | locations: "
            f"{[l.get('name') for l in h.get('locations', [])]} | source: {h.get('source')}"
            for h in state["rag_context"][:3]
        )

    vlm_summary = ""
    if state.get("vlm_caption"):
        vlm_summary = f"\nImage analysis:\n{state['vlm_caption']}"

    # ── NEW: Use HHEM correction as the source of truth ─────────────────────
    if state.get("hhem_triggered") and state.get("hhem_correction"):
        final_summary = state["hhem_correction"]
        hhem_note = (
            f"\nHHEM Guard applied correction (score: {state.get('hhem_score'):.3f})"
        )
    else:
        # If no correction needed, still create a clean draft for the report
        final_summary = state.get("hhem_original_draft") or state["raw_text"][:400]
        hhem_note = (
            f"\nHHEM score: {state.get('hhem_score'):.3f} — no correction needed"
        )

    prompt = f"""Generate a disaster intelligence report from this data:

        ORIGINAL TEXT: {state['raw_text'][:500]}

        INITIAL ASSESSMENT:
        - Disaster types: {state.get('disaster_types', [])}
        - Preliminary severity: {state.get('severity', 'unknown')}
        - Locations: {[l['name'] for l in state.get('locations', [])]}

        ADDITIONAL EVIDENCE:
        {rag_summary}
        {vlm_summary}
        {hhem_note}

        FINAL SUMMARY TO USE (already HHEM-checked):
        {final_summary}

        Based on ALL evidence above, generate the final disaster intelligence report.
        Use the FINAL SUMMARY above as the base for "event_summary".
        Output the JSON now:"""

    llm = ChatGroq(model=GROQ_MODEL_TEXT, temperature=0,
                   api_key=os.getenv("GROQ_API_KEY"))

    try:
        response = llm.invoke([
            SystemMessage(content=REPORT_SYSTEM),
            HumanMessage(content=prompt),
        ])
        raw    = re.sub(r"```json|```", "", response.content).strip()
        report = json.loads(raw)

        # ── Force HHEM-corrected summary into the final report ───────────────
        report["event_summary"] = final_summary

        print(f"[REPORT] Generated report keys: {list(report.keys())}")

        # Validate and ensure required fields
        if not report.get("disaster_types") or not isinstance(report.get("disaster_types"), list) or len(report.get("disaster_types", [])) == 0:
            report["disaster_types"] = state.get("disaster_types", []) or ["CRISISLEX_CRISISLEXREC"]

        if not report.get("severity") or report.get("severity") == "unknown":
            if state.get("severity") and state.get("severity") != "unknown":
                report["severity"] = state.get("severity")
            else:
                report["severity"] = "medium"

        if not report.get("affected_locations"):
            report["affected_locations"] = [l["name"] for l in state.get("locations", [])] or ["Unknown"]

        # Enrich with pipeline metadata
        report["rag_context_count"] = len(state.get("rag_context", []))
        report["vlm_used"]          = bool(state.get("vlm_caption"))
        report["source_url"]        = state.get("source_url", "")
        report["image_path"]        = state.get("image_path", "")

        # HHEM fields
        report["hhem_score"]             = state.get("hhem_score")
        report["hhem_triggered"]         = state.get("hhem_triggered", False)
        report["hhem_correction"]        = state.get("hhem_correction")
        report["hhem_original_summary"]  = state.get("hhem_original_draft")

        print(f"[REPORT] Final report severity: {report.get('severity')}, types: {report.get('disaster_types')}")
        return {**state, "final_report": report}

    except Exception as e:
        # Fallback (kept almost the same)
        disaster_types_fallback = state.get("disaster_types", []) or ["CRISISLEX_CRISISLEXREC"]
        severity_fallback = state.get("severity", "medium")

        fallback = {
            "event_summary":            final_summary,   # ← still uses corrected version
            "disaster_types":           disaster_types_fallback,
            "severity":                 severity_fallback,
            "affected_locations":       [l["name"] for l in state.get("locations", [])] or ["Unknown"],
            "key_impacts":              ["Analysis incomplete"],
            "response_recommendations": ["Contact local authorities for updates"],
            "confidence":               "low",
            "data_sources":             ["text_analysis"],
            "rag_context_count":        len(state.get("rag_context", [])),
            "vlm_used":                 False,
            "hhem_score":               state.get("hhem_score"),
            "hhem_triggered":           state.get("hhem_triggered", False),
            "hhem_correction":          state.get("hhem_correction"),
            "hhem_original_summary":    state.get("hhem_original_draft"),
            "error":                    f"report_generation_error: {str(e)[:200]}",
        }
        print(f"[REPORT] Fallback generated due to error: {e}")
        return {**state, "final_report": fallback}

# ── Graph Assembly ──────────────────────────────────────────────────────────────

def _should_continue(state: PipelineState) -> str:
    # Always continue to location extraction
    return "location"


def build_graph() -> StateGraph:
    graph = StateGraph(PipelineState)

    graph.add_node("classifier", node_classifier)
    graph.add_node("location",   node_location_extractor)
    graph.add_node("rag",        node_rag_retriever)
    graph.add_node("router",     node_router)
    graph.add_node("vlm",        node_vlm_captioner)
    graph.add_node("hhem",       node_hhem_guard)        # ← NEW Node 6
    graph.add_node("report",     node_report_generator)  #   Node 7

    graph.set_entry_point("classifier")

    graph.add_conditional_edges(
        "classifier",
        _should_continue,
        {"location": "location", "report": "report"},
    )

    graph.add_edge("location", "rag")
    graph.add_edge("rag",      "router")
    graph.add_edge("router",   "vlm")
    graph.add_edge("vlm",      "hhem")    # ← vlm → hhem → report
    graph.add_edge("hhem",     "report")
    graph.add_edge("report",   END)

    return graph.compile()


# ── Public API ──────────────────────────────────────────────────────────────────

_pipeline = None

def get_pipeline():
    global _pipeline
    if _pipeline is None:
        _pipeline = build_graph()
    return _pipeline


def process_event(
    text:       str,
    image_path: Optional[str] = None,
    source_url: Optional[str] = None,
) -> dict:
    pipeline = get_pipeline()

    initial_state: PipelineState = {
        "raw_text":             text,
        "image_path":           image_path,
        "source_url":           source_url,
        "disaster_types":       [],
        "severity":             "unknown",
        "locations":            [],
        "rag_context":          [],
        "needs_vlm":            False,
        "vlm_caption":          None,
        "hhem_score":           None,       # ← NEW
        "hhem_triggered":       False,      # ← NEW
        "hhem_correction":      None,       # ← NEW
        "hhem_original_draft":  None,       # ← NEW (stores original before correction)
        "final_report":         None,
        "error":                None,
    }

    result = pipeline.invoke(initial_state)
    return result.get("final_report", {})


# ── CLI Test ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("  DisasterPulse — HHEM Edition Pipeline Test")
    print("=" * 60)

    test_cases = [
        {
            "text": "Major earthquake hits Mexico City. Buildings collapsed, hundreds trapped. "
                    "Rescue teams deployed. Death toll rising. #earthquake #Mexico",
        },
        {
            "text": "Hurricane Harvey floods Houston. Entire neighborhoods underwater. "
                    "Residents stranded on rooftops waiting for rescue. #HurricaneHarvey",
        },
        {
            "text": "The weather today is really nice. Planning a picnic.",
        },
    ]

    for i, case in enumerate(test_cases, 1):
        print(f"\n── Test {i} ──────────────────────────────────────────")
        print(f"Input: {case['text'][:80]}...")
        report = process_event(**case)
        print(f"HHEM score    : {report.get('hhem_score')}")
        print(f"HHEM triggered: {report.get('hhem_triggered')}")
        if report.get("hhem_correction"):
            print(f"Correction    : {report['hhem_correction'][:120]}...")
        print(json.dumps({k: v for k, v in report.items()
                          if k not in ("hhem_correction",)}, indent=2))
