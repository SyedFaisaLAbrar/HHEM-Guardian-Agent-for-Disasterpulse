"""
DisasterPulse — FastAPI Backend

Endpoints:
    POST /analyze          — process text (+ optional image) through the full pipeline
    GET  /events/feed      — paginated list of indexed disaster events
    GET  /events/search    — semantic search over ChromaDB
    GET  /stats            — collection statistics
    GET  /health           — health check

Run:
    uvicorn main:app --reload --port 8000
"""

import json
import shutil
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agents import process_event, get_pipeline
from data_loader import get_collection, retrieve_similar_events

# ── Helpers ───────────────────────────────────────────────────────────────────

def normalize_event(event: dict) -> dict:
    """
    Transform backend event structure to match frontend CrisisEvent interface.
    Frontend expects: id, text, disaster_type, severity, source, timestamp, locations, similarity
    """
    disaster_types = event.get("disaster_types", [])
    disaster_type = None
    
    if isinstance(disaster_types, list) and len(disaster_types) > 0:
        # Extract type name from GDELT format: "NATURAL_DISASTER_WILDFIRE" → "WILDFIRE"
        dt = disaster_types[0]
        if isinstance(dt, str):
            parts = dt.split("_")
            if len(parts) > 2:
                disaster_type = parts[-1]
            else:
                disaster_type = dt
    
    return {
        "id": event.get("url", "").split("/")[-1][:16] or "event-001",  # Use URL slug as ID
        "text": event.get("text", ""),
        "disaster_type": disaster_type or "UNKNOWN",
        "severity": event.get("severity") or "unknown",
        "source": (event.get("source", "unknown") or "unknown").lower(),
        "timestamp": event.get("date") or None,
        "locations": event.get("locations", []),
        "similarity": event.get("similarity")
    }

# ── Startup ───────────────────────────────────────────────────────────────────

# @app.on_event("startup")
# async def startup():
#     """Pre-warm the pipeline and ChromaDB connection at startup."""
#     try:
#         get_pipeline()
#         print("[Startup] LangGraph pipeline loaded.")
#     except Exception as e:
#         print(f"[Startup] Pipeline warning: {e}")

#     try:
#         get_collection()
#         print("[Startup] ChromaDB collection loaded.")
#     except Exception as e:
#         print(f"[Startup] ChromaDB warning (run data_loader.py first): {e}")

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    try:
        get_pipeline()
        print("[Startup] LangGraph pipeline loaded.")
    except Exception as e:
        print(f"[Startup] Pipeline warning: {e}")

    try:
        get_collection()
        print("[Startup] ChromaDB collection loaded.")
    except Exception as e:
        print(f"[Startup] ChromaDB warning (run data_loader.py first): {e}")

    yield  # Application runs here

    # (Optional) Shutdown logic
    print("[Shutdown] Cleaning up resources...")

# ── App Setup ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title       = "DisasterPulse API",
    description = "Agentic RAG + VLM pipeline for disaster event intelligence",
    version     = "1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins  = ["*"],   # tighten in production
    allow_methods  = ["*"],
    allow_headers  = ["*"],
)


EVAL_RESULTS_PATH = "../data/eval_results.json"

@app.get("/evaluate")
async def get_evaluation():
    """
    Returns real evaluation results computed by evaluation.py.
    Run evaluation.py first to generate data/eval_results.json.
    """
    path = Path(EVAL_RESULTS_PATH)
    if not path.exists():
        return {
            "error": "Run evaluation.py first to generate real metrics.",
            "command": "python evaluation.py"
        }
    with open(path) as f:
        return json.load(f)
    
# ── Request / Response Models ─────────────────────────────────────────────────

class AnalyzeTextRequest(BaseModel):
    text:       str
    source_url: Optional[str] = None


class AnalyzeResponse(BaseModel):
    report:     dict
    processing: dict


class SearchRequest(BaseModel):
    query:          str
    n_results:      int   = 5
    severity_filter: Optional[str] = None
    source_filter:   Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "DisasterPulse"}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_text(request: AnalyzeTextRequest):
    """
    Analyze text through the full 6-node LangGraph pipeline.
    Returns structured disaster intelligence report.
    """
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="text cannot be empty")

    report = process_event(
        text       = request.text,
        source_url = request.source_url,
    )

    return {
        "report": report,
        "processing": {
            "rag_hits":  report.get("rag_context_count", 0),
            "vlm_used":  report.get("vlm_used", False),
            "pipeline":  "classifier → location → rag → router → vlm → report",
        },
    }


@app.post("/analyze/multimodal", response_model=AnalyzeResponse)
async def analyze_multimodal(
    text:       str        = Form(...),
    source_url: Optional[str] = Form(None),
    image:      Optional[UploadFile] = File(None),
):
    """
    Analyze text + optional image upload through the full pipeline.
    Image is passed to LLaVA for damage assessment if present.
    """
    if not text.strip():
        raise HTTPException(status_code=400, detail="text cannot be empty")

    image_path = None
    tmp_dir    = None

    if image and image.filename:
        suffix = Path(image.filename).suffix or ".jpg"
        tmp_dir = tempfile.mkdtemp()
        tmp_path = Path(tmp_dir) / f"upload{suffix}"
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(image.file, f)
        image_path = str(tmp_path)

    try:
        report = process_event(
            text       = text,
            image_path = image_path,
            source_url = source_url,
        )
    finally:
        if tmp_dir:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    return {
        "report": report,
        "processing": {
            "rag_hits":  report.get("rag_context_count", 0),
            "vlm_used":  report.get("vlm_used", False),
            "pipeline":  "classifier → location → rag → router → vlm → report",
        },
    }


@app.get("/events/search")
async def search_events(
    q:        str          = Query(..., description="Search query"),
    n:        int          = Query(5, ge=1, le=20),
    severity: Optional[str] = Query(None, description="low | medium | high"),
    source:   Optional[str] = Query(None, description="gdelt | crisismmd"),
):
    """
    Semantic search over the ChromaDB disaster event index.
    Used by the frontend live feed and event cards.
    """
    try:
        collection = get_collection()
    except Exception:
        raise HTTPException(status_code=503, detail="ChromaDB not ready. Run data_loader.py first.")

    hits = retrieve_similar_events(
        query          = q,
        collection     = collection,
        n_results      = n,
        severity_filter = severity,
        source_filter  = source,
    )
    normalized = [normalize_event(hit) for hit in hits]
    return {"query": q, "results": normalized, "count": len(normalized)}


@app.get("/events/feed")
async def events_feed(
    page:     int           = Query(1, ge=1),
    per_page: int           = Query(20, ge=1, le=50000),
    severity: Optional[str] = Query(None),
    source:   Optional[str] = Query(None),
):
    """
    Paginated disaster event feed for the frontend dashboard.
    Returns events ordered by recency (GDELT) or severity (CrisisMMD).
    """
    try:
        collection = get_collection()
    except Exception:
        raise HTTPException(status_code=503, detail="ChromaDB not ready. Run data_loader.py first.")

    # Use a broad disaster query to get the feed
    # Fetch all available events (not just 200)
    total_count = collection.count()
    hits = retrieve_similar_events(
        query          = "disaster emergency flood earthquake hurricane fire rescue",
        collection     = collection,
        n_results      = max(total_count, 1000),  # Fetch all available events
        severity_filter = severity,
        source_filter  = source,
    )
    
    # Normalize to frontend format
    normalized_hits = [normalize_event(hit) for hit in hits]

    start  = (page - 1) * per_page
    paged  = normalized_hits[start : start + per_page]

    return {
        "page":     page,
        "per_page": per_page,
        "results":  paged,
        "count":    len(paged),
    }


@app.get("/stats")
async def collection_stats():
    """Return summary statistics about the indexed event collection."""
    try:
        collection = get_collection()
        count = collection.count()
        
        # Get all events to calculate severity distribution
        all_events = retrieve_similar_events(
            query="disaster emergency",
            collection=collection,
            n_results=max(count, 1000),  # Fetch all available events
        )
        
        high_severity_count = sum(1 for e in all_events if e.get("severity") == "high")
        high_pct = int((high_severity_count / len(all_events) * 100)) if all_events else 0
        
    except Exception as e:
        return {
            "error": "ChromaDB not ready. Run data_loader.py first.",
            "total_events": 0,
            "high_severity": 0,
            "high_pct": "0%"
        }

    return {
        "total_events": count,
        "high_severity": high_severity_count,
        "high_pct": f"{high_pct}%",
        "sources": ["gdelt", "crisismmd"],
        "embed_model": "all-MiniLM-L6-v2",
        "pipeline": "LangGraph (6 nodes) + LLaVA VLM",
    }
