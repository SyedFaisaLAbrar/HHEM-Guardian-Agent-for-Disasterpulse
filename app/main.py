"""
DisasterPulse — FastAPI Backend  (HHEM Edition)

Endpoints:
    POST /analyze          — process text (+ optional image) through the full 7-node pipeline
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

# ── Helpers ────────────────────────────────────────────────────────────────────

def normalize_event(event: dict) -> dict:
    disaster_types = event.get("disaster_types", [])
    disaster_type  = None

    if isinstance(disaster_types, list) and len(disaster_types) > 0:
        dt = disaster_types[0]
        if isinstance(dt, str):
            parts = dt.split("_")
            disaster_type = parts[-1] if len(parts) > 2 else dt

    return {
        "id":           event.get("url", "").split("/")[-1][:16] or "event-001",
        "text":         event.get("text", ""),
        "disaster_type": disaster_type or "UNKNOWN",
        "severity":     event.get("severity") or "unknown",
        "source":       (event.get("source", "unknown") or "unknown").lower(),
        "timestamp":    event.get("date") or None,
        "locations":    event.get("locations", []),
        "similarity":   event.get("similarity"),
    }

# ── Lifespan ───────────────────────────────────────────────────────────────────

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        get_pipeline()
        print("[Startup] LangGraph pipeline (7-node HHEM edition) loaded.")
    except Exception as e:
        print(f"[Startup] Pipeline warning: {e}")

    try:
        get_collection()
        print("[Startup] ChromaDB collection loaded.")
    except Exception as e:
        print(f"[Startup] ChromaDB warning (run data_loader.py first): {e}")

    yield
    print("[Shutdown] Cleaning up resources...")

# ── App Setup ──────────────────────────────────────────────────────────────────

app = FastAPI(
    title       = "DisasterPulse API",
    description = "Agentic RAG + VLM + HHEM hallucination guard pipeline for disaster intelligence",
    version     = "2.0.0",
    lifespan    = lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins = ["*"],
    allow_methods = ["*"],
    allow_headers = ["*"],
)

EVAL_RESULTS_PATH = "evaluation/eval_results.json"

@app.get("/evaluate")
async def get_evaluation():
    path = Path(EVAL_RESULTS_PATH)
    if not path.exists():
        return {
            "error":   "Run evaluation.py first to generate real metrics.",
            "command": "python evaluation.py"
        }
    with open(path) as f:
        return json.load(f)

# ── Request / Response Models ──────────────────────────────────────────────────

class AnalyzeTextRequest(BaseModel):
    text:       str
    source_url: Optional[str] = None


class HHEMResult(BaseModel):
    """Hallucination evaluation result from Vectara HHEM-2.1-Open."""
    score:      Optional[float]   # 0–1; None if model unavailable
    triggered:  bool              # True if score < threshold and correction was applied
    correction: Optional[str]     # corrected text if triggered


class AnalyzeResponse(BaseModel):
    report:     dict
    processing: dict
    hhem:       HHEMResult        # ← NEW top-level field


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "DisasterPulse", "version": "2.0.0-hhem"}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_text(request: AnalyzeTextRequest):
    """
    Analyze text through the full 7-node LangGraph + HHEM pipeline.
    Returns structured disaster intelligence report with hallucination score.
    """
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="text cannot be empty")

    report = process_event(text=request.text, source_url=request.source_url)

    return {
        "report": report,
        "processing": {
            "rag_hits":  report.get("rag_context_count", 0),
            "vlm_used":  report.get("vlm_used", False),
            "pipeline":  "classifier → location → rag → router → vlm → hhem → report",
        },
        "hhem": {
            "score":      report.get("hhem_score"),
            "triggered":  report.get("hhem_triggered", False),
            "correction": report.get("hhem_correction"),
        },
    }


@app.post("/analyze/multimodal", response_model=AnalyzeResponse)
async def analyze_multimodal(
    text:       str                  = Form(...),
    source_url: Optional[str]        = Form(None),
    image:      Optional[UploadFile] = File(None),
):
    """Analyze text + optional image through the full 7-node pipeline."""
    if not text.strip():
        raise HTTPException(status_code=400, detail="text cannot be empty")

    image_path = None
    tmp_dir    = None

    if image and image.filename:
        suffix   = Path(image.filename).suffix or ".jpg"
        tmp_dir  = tempfile.mkdtemp()
        tmp_path = Path(tmp_dir) / f"upload{suffix}"
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(image.file, f)
        image_path = str(tmp_path)

    try:
        report = process_event(text=text, image_path=image_path, source_url=source_url)
    finally:
        if tmp_dir:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    return {
        "report": report,
        "processing": {
            "rag_hits":  report.get("rag_context_count", 0),
            "vlm_used":  report.get("vlm_used", False),
            "pipeline":  "classifier → location → rag → router → vlm → hhem → report",
        },
        "hhem": {
            "score":      report.get("hhem_score"),
            "triggered":  report.get("hhem_triggered", False),
            "correction": report.get("hhem_correction"),
        },
    }


@app.get("/events/search")
async def search_events(
    q:        str           = Query(..., description="Search query"),
    n:        int           = Query(5, ge=1, le=20),
    severity: Optional[str] = Query(None),
    source:   Optional[str] = Query(None),
):
    try:
        collection = get_collection()
    except Exception:
        raise HTTPException(status_code=503,
                            detail="ChromaDB not ready. Run data_loader.py first.")

    hits       = retrieve_similar_events(query=q, collection=collection,
                                         n_results=n,
                                         severity_filter=severity,
                                         source_filter=source)
    normalized = [normalize_event(hit) for hit in hits]
    return {"query": q, "results": normalized, "count": len(normalized)}


@app.get("/events/feed")
async def events_feed(
    page:     int           = Query(1, ge=1),
    per_page: int           = Query(20, ge=1, le=50000),
    severity: Optional[str] = Query(None),
    source:   Optional[str] = Query(None),
):
    try:
        collection = get_collection()
    except Exception:
        raise HTTPException(status_code=503,
                            detail="ChromaDB not ready. Run data_loader.py first.")

    total_count = collection.count()
    hits        = retrieve_similar_events(
        query          = "disaster emergency flood earthquake hurricane fire rescue",
        collection     = collection,
        n_results      = max(total_count, 1000),
        severity_filter = severity,
        source_filter  = source,
    )
    normalized = [normalize_event(hit) for hit in hits]
    start  = (page - 1) * per_page
    paged  = normalized[start : start + per_page]

    return {"page": page, "per_page": per_page, "results": paged, "count": len(paged)}


@app.get("/stats")
async def collection_stats():
    try:
        collection = get_collection()
        count      = collection.count()

        all_events = retrieve_similar_events(
            query="disaster emergency",
            collection=collection,
            n_results=max(count, 1000),
        )
        high_count = sum(1 for e in all_events if e.get("severity") == "high")
        high_pct   = int(high_count / len(all_events) * 100) if all_events else 0

    except Exception:
        return {
            "error":         "ChromaDB not ready. Run data_loader.py first.",
            "total_events":  0,
            "high_severity": 0,
            "high_pct":      "0%",
        }

    return {
        "total_events":  count,
        "high_severity": high_count,
        "high_pct":      f"{high_pct}%",
        "sources":       ["gdelt", "crisismmd"],
        "embed_model":   "all-MiniLM-L6-v2",
        "pipeline":      "LangGraph (7 nodes) + Groq VLM + Vectara HHEM-2.1-Open",
    }
