"""
DisasterPulse — Data Layer
Handles: GDELT GKG parsing + CrisisMMD v2 loading + ChromaDB indexing

Run:
    pip install -r requirements.txt
    python data_loader.py
"""

import os
import json
import pandas as pd
from pathlib import Path
from dataclasses import dataclass, asdict, field
from typing import Optional
from tqdm import tqdm

import chromadb
from chromadb.utils import embedding_functions

# ── Config ─────────────────────────────────────────────────────────────────────
GDELT_CSV      = "../data/gdelt_gkg.csv"
CRISIS_MMD_DIR = "../data/crisis_mmd/CrisisMMD_v2.0"
CHROMA_DIR     = "../data/chroma_db"
EMBED_MODEL    = "all-MiniLM-L6-v2"   # CPU-friendly, ~90MB, cached after first run

# GDELT GKG V2Themes prefixes that signal a disaster event
DISASTER_THEME_PREFIXES = [
    "NATURAL_DISASTER",
    "MANMADE_DISASTER",
    "DISASTER_",
    "CRISISLEX_",
    "ENV_WILDFIRE",
    "ENV_FLOOD",
    "ENV_EARTHQUAKE",
    "ENV_HURRICANE",
    "ENV_TORNADO",
    "ENV_TSUNAMI",
    "ENV_DROUGHT",
    "WB_820_DISASTER",
    "WB_1705_DISASTER",
    "WB_2657_EMERGENCY",
]

# CrisisMMD exact label values from the dataset
# image_damage column
DAMAGE_TO_SEVERITY = {
    "severe_damage":       "high",
    "mild_damage":         "medium",
    "little_or_no_damage": "low",
}

# text_human / image_human column
HUMANITARIAN_LABEL_MAP = {
    "affected_individuals":              "medium",
    "infrastructure_and_utility_damage": "high",
    "injured_or_dead_people":            "high",
    "missing_or_found_people":           "high",
    "rescue_volunteering_or_donation_effort": "medium",
    "vehicle_damage":                    "medium",
    "other_relevant_information":        "low",
    "not_humanitarian":                  None,    # will be filtered out
}

# Map event folder name → GDELT-style disaster type tag
EVENT_TO_TYPE = {
    "california_wildfires":  "NATURAL_DISASTER_WILDFIRE",
    "hurricane_harvey":      "NATURAL_DISASTER_HURRICANE",
    "hurricane_irma":        "NATURAL_DISASTER_HURRICANE",
    "hurricane_maria":       "NATURAL_DISASTER_HURRICANE",
    "iraq_iran_earthquake":  "NATURAL_DISASTER_EARTHQUAKE",
    "mexico_earthquake":     "NATURAL_DISASTER_EARTHQUAKE",
    "srilanka_floods":       "NATURAL_DISASTER_FLOOD",
}


# ── Data Model ─────────────────────────────────────────────────────────────────

@dataclass
class DisasterEvent:
    event_id:       str
    source:         str            # "gdelt" | "crisismmd"
    date:           str
    text:           str
    url:            str
    disaster_types: list = field(default_factory=list)
    severity:       Optional[str] = None
    tone_score:     Optional[float] = None
    locations:      list = field(default_factory=list)
    image_path:     Optional[str] = None
    humanitarian_label: Optional[str] = None


# ── GDELT GKG Parser ───────────────────────────────────────────────────────────

def _parse_gdelt_themes(themes_str: str) -> list:
    if not isinstance(themes_str, str):
        return []
    found = []
    for part in themes_str.split(";"):
        theme = part.split(",")[0].strip()
        if any(theme.startswith(p) for p in DISASTER_THEME_PREFIXES):
            if theme not in found:
                found.append(theme)
    return found


def _parse_gdelt_locations(loc_str: str) -> list:
    if not isinstance(loc_str, str) or not loc_str.strip():
        return []

    locs = []
    seen = set()

    for entry in loc_str.split(";"):
        parts = entry.strip().split("#")

        # Relax length constraint
        if len(parts) < 7:
            continue

        try:
            loc_type = parts[0].strip()   # 1=country, 2=state, 3=city
            name     = parts[1].strip()
            country  = parts[2].strip()

            lat = float(parts[5]) if parts[5] else None
            lon = float(parts[6]) if parts[6] else None

            if not name or lat is None or lon is None:
                continue

            key = (name, lat, lon)
            if key in seen:
                continue

            seen.add(key)

            locs.append({
                "name": name,
                "country": country,
                "lat": lat,
                "lon": lon,
                "type": loc_type
            })

        except Exception:
            continue

    #Prioritize city > state > country
    locs = sorted(locs, key=lambda x: x["type"])

    return locs[:5]   # keep top 5 most relevant


def _parse_gdelt_tone(tone_str: str) -> Optional[float]:
    if not isinstance(tone_str, str):
        return None
    try:
        return float(tone_str.split(",")[0])
    except (ValueError, IndexError):
        return None


def _tone_to_severity(tone: Optional[float], types: list) -> str:
    high_themes = {
        "NATURAL_DISASTER_EARTHQUAKE", "NATURAL_DISASTER_TSUNAMI",
        "NATURAL_DISASTER_HURRICANE",  "CRISISLEX_T03_DEAD",
        "MANMADE_DISASTER_PLANE_CRASH","MANMADE_DISASTER_MINING_DISASTER",
    }
    if any(t in high_themes for t in types):
        return "high"
    if tone is None:
        return "unknown"
    if tone < -5.0:
        return "high"
    elif tone < -2.0:
        return "medium"
    return "low"


def load_gdelt(csv_path: str = GDELT_CSV) -> list:
    path = Path(csv_path)
    if not path.exists():
        print(f"[GDELT] Not found: {csv_path} — skipping.")
        return []

    print(f"[GDELT] Loading {csv_path} ...")
    try:
        df = pd.read_csv(
            csv_path,
            dtype=str,
            sep=",",
            on_bad_lines="skip",
            low_memory=False
        )
    except Exception as e:
        print(f"[GDELT] Read error: {e}")
        return []

    df.columns = [c.strip().upper() for c in df.columns]

    def _format_location_text(locs):
        if not locs:
            return "Unknown location"

        # Prefer city-level (type 3)
        cities = [l["name"] for l in locs if l["type"] == "3"]
        states = [l["name"] for l in locs if l["type"] == "2"]
        countries = [l["name"] for l in locs if l["type"] == "1"]

        if cities:
            return ", ".join(cities[:2])
        elif states:
            return ", ".join(states[:2])
        else:
            return ", ".join(countries[:2])
        
    def _find(candidates):
        for c in candidates:
            if c in df.columns:
                return c
        return None

    date_col  = _find(["DATE", "SQLDATE"])
    url_col   = _find(["SOURCEURL", "URL"])
    theme_col = _find(["V2THEMES", "THEMES"])
    loc_col   = _find(["V2LOCATIONS", "LOCATIONS"])
    tone_col  = _find(["V2TONE", "TONE"])

    if not theme_col:
        print(f"[GDELT] No themes column found. Columns: {list(df.columns[:10])}")
        return []

    events = []
    for idx, row in tqdm(df.iterrows(), total=len(df), desc="[GDELT] Filtering"):
        themes_raw     = str(row.get(theme_col, ""))
        disaster_types = _parse_gdelt_themes(themes_raw)
        if not disaster_types:
            continue

        raw_date = str(row.get(date_col, "")) if date_col else ""
        date_clean = raw_date[:8] if len(raw_date) >= 8 else raw_date
        try:
            date_iso = pd.to_datetime(date_clean, format="%Y%m%d").strftime("%Y-%m-%d")
        except Exception:
            date_iso = date_clean

        url      = str(row.get(url_col, "")) if url_col else ""
        tone     = _parse_gdelt_tone(str(row.get(tone_col, "")) if tone_col else "")
        locs     = _parse_gdelt_locations(str(row.get(loc_col, "")) if loc_col else "")
        severity = _tone_to_severity(tone, disaster_types)

        # loc_names  = ", ".join(l["name"] for l in locs[:3]) if locs else "Unknown location"
        loc_names  = _format_location_text(locs)
        type_label = ", ".join(t.replace("_", " ").title() for t in disaster_types[:2])
        # text = f"{type_label} reported near {loc_names}."
        text = f"{type_label}. Location: {loc_names}. Tone: {tone}. Source: {url}"

        events.append(DisasterEvent(
            event_id       = f"gdelt_{idx}",
            source         = "gdelt",
            date           = date_iso,
            text           = text,
            url            = url,
            disaster_types = disaster_types,
            severity       = severity,
            tone_score     = tone,
            locations      = locs,
        ))

    print(f"[GDELT] Disaster events: {len(events)} / {len(df)} total rows")
    return events


# ── CrisisMMD v2 Loader ────────────────────────────────────────────────────────
import re
def load_crisismmd(data_dir: str = CRISIS_MMD_DIR) -> list:
    """
    Loads from annotations/*.tsv using the exact CrisisMMD v2 column schema:
        tweet_id, image_id, text_info, text_info_conf,
        image_info, image_info_conf, text_human, text_human_conf,
        image_human, image_human_conf, image_damage, image_damage_conf,
        tweet_text, image_url, image_path
    """
    def _clean_tweet(text: str) -> str:
        text = re.sub(r"http\S+", "", text)           # remove URLs
        text = re.sub(r"@\w+", "", text)              # remove mentions
        text = re.sub(r"^RT\s*:?\s*", "", text)       # remove RT prefix
        text = re.sub(r"#(\w+)", r"\1", text)         # keep hashtag words, drop #
        return re.sub(r"\s+", " ", text).strip()

    base  = Path(data_dir)
    ann_dir   = base / "annotations"
    image_dir = base / "data_image"

    if not ann_dir.exists():
        print(f"[CrisisMMD] annotations/ not found at {ann_dir}")
        return []

    tsv_files = [f for f in ann_dir.glob("*.tsv") if not f.name.startswith("._")]
    if not tsv_files:
        print("[CrisisMMD] No .tsv files found (excluding ._* macOS metadata files).")
        return []

    print(f"[CrisisMMD] Found {len(tsv_files)} annotation files:")
    for f in tsv_files:
        print(f"   {f.name}")

    events  = []
    seen    = set()

    for tsv_path in tsv_files:
        # Derive disaster event name from filename, e.g. "california_wildfires_final_data.tsv"
        event_name = tsv_path.stem.replace("_final_data", "").strip()
        disaster_type = EVENT_TO_TYPE.get(event_name, "CRISISLEX_CRISISLEXREC")

        try:
            df = pd.read_csv(
                tsv_path,
                sep       = "\t",
                dtype     = str,
                on_bad_lines = "skip",
                encoding  = "utf-8",
            )
        except Exception as e:
            print(f"[CrisisMMD] Skipping {tsv_path.name}: {e}")
            continue

        df.columns = [c.strip().lower() for c in df.columns]

        # Verify expected columns exist
        required = ["tweet_id", "tweet_text"]
        missing  = [c for c in required if c not in df.columns]
        if missing:
            print(f"[CrisisMMD] {tsv_path.name} missing columns: {missing} — skipping")
            continue

        print(f"[CrisisMMD] {tsv_path.name}: {len(df)} rows")

        for _, row in df.iterrows():
            tweet_id = str(row.get("tweet_id", "")).strip()
            if not tweet_id or tweet_id in seen:
                continue
            seen.add(tweet_id)

            # ── Determine severity ──────────────────────────────────────────
            # Priority: image_damage > text_human/image_human > text_info
            severity = None
            humanitarian_label = None

            damage_raw = str(row.get("image_damage", "")).strip().lower()
            if damage_raw in DAMAGE_TO_SEVERITY:
                severity = DAMAGE_TO_SEVERITY[damage_raw]

            if severity is None:
                for hum_col in ["text_human", "image_human"]:
                    hum_raw = str(row.get(hum_col, "")).strip().lower()
                    if hum_raw in HUMANITARIAN_LABEL_MAP:
                        sev_candidate = HUMANITARIAN_LABEL_MAP[hum_raw]
                        if sev_candidate is not None:
                            severity = sev_candidate
                            humanitarian_label = hum_raw
                            break
                        else:
                            # Explicitly "not_humanitarian" — skip this row
                            break

            # Skip if completely non-informative
            text_info = str(row.get("text_info", "")).strip().lower()
            image_info = str(row.get("image_info", "")).strip().lower()
            if severity is None:
                if text_info == "informative" or image_info == "informative":
                    severity = "low"   # informative but no damage label → low
                else:
                    continue           # not_informative + no damage → skip

            # ── Tweet text ─────────────────────────────────────────────────
            text = str(row.get("tweet_text", "")).strip()
            if not text or text.lower() in ("nan", ""):
                continue

            # ── Image path ─────────────────────────────────────────────────
            img_relative = str(row.get("image_path", "")).strip()
            image_path   = None
            candidate = base / img_relative
            if not candidate.exists():
                # fallback: try relative to image_dir
                candidate = image_dir / img_relative
            if candidate.exists():
                image_path = str(candidate)

            text = _clean_tweet(text)

            events.append(DisasterEvent(
                event_id          = f"crisismmd_{tweet_id}",
                source            = "crisismmd",
                date              = "2017",
                text              = text,
                url               = f"https://twitter.com/i/web/status/{tweet_id}",
                disaster_types    = [disaster_type],
                severity          = severity,
                tone_score        = None,
                locations         = [],
                image_path        = image_path,
                humanitarian_label= humanitarian_label,
            ))

    print(f"[CrisisMMD] Total events loaded: {len(events)}")
    return events


# ── ChromaDB Indexer ───────────────────────────────────────────────────────────

def build_chroma_index(events: list, persist_dir: str = CHROMA_DIR) -> chromadb.Collection:
    print(f"\n[ChromaDB] Building index → {persist_dir}")
    os.makedirs(persist_dir, exist_ok=True)

    client = chromadb.PersistentClient(path=persist_dir)
    embed_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=EMBED_MODEL
    )

    try:
        client.delete_collection("disaster_events")
        
    except Exception:
        pass

    collection = client.create_collection(
        name             = "disaster_events",
        embedding_function = embed_fn,
        metadata         = {"hnsw:space": "cosine"},
    )

    BATCH = 100
    for i in tqdm(range(0, len(events), BATCH), desc="[ChromaDB] Indexing"):
        batch = events[i : i + BATCH]
        ids, documents, metadatas = [], [], []

        for e in batch:
            ids.append(e.event_id)
            documents.append(e.text)
            metadatas.append({
                "source":             e.source,
                "date":               e.date,
                "severity":           e.severity or "unknown",
                "disaster_types":     json.dumps(e.disaster_types),
                "locations":          json.dumps(e.locations[:5]),
                "image_path":         e.image_path or "",
                "url":                e.url,
                "humanitarian_label": e.humanitarian_label or "",
                "tone_score":         e.tone_score if e.tone_score is not None else 0.0,
            })

        collection.upsert(documents=documents, ids=ids, metadatas=metadatas)

    print(f"[ChromaDB] Indexed {len(events)} events.")
    return collection


# ── Public API (used by agents.py) ────────────────────────────────────────────

def get_collection(persist_dir: str = CHROMA_DIR) -> chromadb.Collection:
    """Load the persisted ChromaDB collection. Call once at agent startup."""
    client = chromadb.PersistentClient(path=persist_dir)
    embed_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=EMBED_MODEL
    )
    return client.get_collection("disaster_events", embedding_function=embed_fn)


def retrieve_similar_events(
    query:           str,
    collection:      chromadb.Collection,
    n_results:       int = 5,
    severity_filter: Optional[str] = None,
    source_filter:   Optional[str] = None,
) -> list:
    """
    RAG retrieval: free-text query → top-N similar disaster events.

    Returns list of dicts:
        text, source, date, severity, disaster_types, locations,
        url, image_path, humanitarian_label, similarity (0–1)
    """
    where_clauses = []
    if severity_filter:
        where_clauses.append({"severity": {"$eq": severity_filter}})
    if source_filter:
        where_clauses.append({"source": {"$eq": source_filter}})

    where = None
    if len(where_clauses) == 1:
        where = where_clauses[0]
    elif len(where_clauses) > 1:
        where = {"$and": where_clauses}

    results = collection.query(
        query_texts = [query],
        n_results   = n_results,
        where       = where,
        include     = ["documents", "metadatas", "distances"],
    )

    hits = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        hits.append({
            "text":               doc,
            "source":             meta.get("source"),
            "date":               meta.get("date"),
            "severity":           meta.get("severity"),
            "disaster_types":     json.loads(meta.get("disaster_types", "[]")),
            "locations":          json.loads(meta.get("locations", "[]")),
            "url":                meta.get("url"),
            "image_path":         meta.get("image_path") or None,
            "humanitarian_label": meta.get("humanitarian_label") or None,
            "similarity":         round(1 - dist, 4),
        })
    return hits


# ── Stats Helper ───────────────────────────────────────────────────────────────

def print_stats(events: list, label: str):
    if not events:
        print(f"\n[{label}] No events — check your data path.")
        return

    severities = {}
    sources    = {}
    all_types  = []

    for e in events:
        severities[e.severity] = severities.get(e.severity, 0) + 1
        sources[e.source]      = sources.get(e.source, 0) + 1
        all_types.extend(e.disaster_types)

    type_counts = {}
    for t in all_types:
        type_counts[t] = type_counts.get(t, 0) + 1
    top_types = sorted(type_counts.items(), key=lambda x: -x[1])[:8]

    has_image = sum(1 for e in events if e.image_path)
    has_loc   = sum(1 for e in events if e.locations)

    print(f"\n── {label} ──────────────────────────────────")
    print(f"  Total events  : {len(events)}")
    print(f"  Severity      : {severities}")
    print(f"  Sources       : {sources}")
    print(f"  With images   : {has_image}")
    print(f"  With locations: {has_loc}")
    print(f"  Top types     :")
    for t, c in top_types:
        print(f"    {t:<45} {c}")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  DisasterPulse — Data Layer Build")
    print("=" * 60)

    gdelt_events  = load_gdelt(GDELT_CSV)
    crisis_events = load_crisismmd(CRISIS_MMD_DIR)

    print_stats(gdelt_events,  "GDELT Stats")
    print_stats(crisis_events, "CrisisMMD Stats")

    all_events = gdelt_events + crisis_events
    print(f"\n[Merge] Total for indexing: {len(all_events)}")

    if not all_events:
        print("\n[!] Nothing to index. Check data paths above.")
        return

    collection = build_chroma_index(all_events, CHROMA_DIR)

    # ── Quick smoke test ───────────────────────────────────────────────────
    print("\n── Retrieval Smoke Test ──────────────────────────")
    for query in [
        "earthquake building collapse rescue operations",
        "hurricane flooding displaced families",
        "wildfire evacuation California",
    ]:
        hits = retrieve_similar_events(query, collection, n_results=2)
        print(f"\nQuery: '{query}'")
        for i, h in enumerate(hits, 1):
            print(f"  [{i}] sim={h['similarity']} | sev={h['severity']} | {h['disaster_types'][:1]}")
            print(f"       {h['text'][:100]}")

    # Save 20-event sample for inspection
    sample = [asdict(e) for e in all_events[:20]]
    out    = Path(CHROMA_DIR) / "sample_events.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump(sample, f, indent=2, default=str)
    print(f"\n[Done] Sample saved → {out}")
    print(f"[Done] ChromaDB index → {CHROMA_DIR}/")
    print("\nNext: run  python agents.py")


if __name__ == "__main__":
    from dataclasses import asdict
    main()
