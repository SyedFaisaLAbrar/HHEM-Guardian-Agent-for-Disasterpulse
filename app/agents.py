"""
DisasterPulse — Agent Layer
LangGraph pipeline with 6 nodes:
  1. classifier   — disaster type + severity from raw text
  2. location     — extract locations with spaCy NER
  3. rag_retriever— pull similar past events from ChromaDB
  4. router       — decide if VLM is needed
  5. vlm_captioner— generate damage caption from image (via Ollama LLaVA)
  6. report_gen   — produce final structured JSON + natural language summary

Run standalone:
    python agents.py

Or import process_event() from main.py / FastAPI.
"""

import json
import re
from typing import TypedDict, Optional, Annotated
from pathlib import Path
import os
from dotenv import load_dotenv
load_dotenv()
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END
import spacy

from data_loader import get_collection, retrieve_similar_events

# ── Config ─────────────────────────────────────────────────────────────────────

CHROMA_DIR        = "../data/chroma_db"
RAG_TOP_K         = 5

from langchain_groq import ChatGroq
import base64, os
import os

GROQ_MODEL_TEXT = "llama-3.1-8b-instant"  # free, fast
GROQ_MODEL_VLM  = "meta-llama/llama-4-scout-17b-16e-instruct"


# OLLAMA_MODEL_TEXT = "llama3.1:8b"   # ollama pull llama3.1:8b
# OLLAMA_MODEL_VLM  = "llava:7b"      # ollama pull llava:7b

# ── Shared Pipeline State ──────────────────────────────────────────────────────

class PipelineState(TypedDict):
    # Input
    raw_text:       str
    image_path:     Optional[str]
    source_url:     Optional[str]

    # Node outputs
    disaster_types: list[str]
    severity:       str                    # "low" | "medium" | "high" | "unknown"
    locations:      list[dict]             # [{name, lat, lon, country}]
    rag_context:    list[dict]             # top-K similar events
    needs_vlm:      bool
    vlm_caption:    Optional[str]
    final_report:   Optional[dict]

    # Error passthrough
    error:          Optional[str]


# ── Node 1: Classifier ─────────────────────────────────────────────────────────

CLASSIFIER_SYSTEM = """You are a disaster event classifier for a humanitarian AI system.
Given tweet or news text, output ONLY valid JSON with no markdown or explanation.

Schema:
{
  "disaster_types": ["<type>"],   // one or more from the list below
  "severity": "<level>",          // "low", "medium", or "high"
  "is_disaster": true|false       // false if text is clearly not disaster-related
}

Valid disaster types:
NATURAL_DISASTER_EARTHQUAKE, NATURAL_DISASTER_FLOOD, NATURAL_DISASTER_HURRICANE,
NATURAL_DISASTER_WILDFIRE, NATURAL_DISASTER_TORNADO, NATURAL_DISASTER_TSUNAMI,
NATURAL_DISASTER_DROUGHT, MANMADE_DISASTER_EXPLOSION, MANMADE_DISASTER_FIRE,
CRISISLEX_CRISISLEXREC (use this if uncertain)

Severity guidelines:
- high: deaths confirmed, severe infrastructure damage, mass displacement
- medium: injuries, moderate damage, active rescue operations
- low: warnings, minor damage, precautionary alerts, general informative content
"""

def node_classifier(state: PipelineState) -> PipelineState:
    """Node 1: classify disaster type and severity from raw text."""
    text = state["raw_text"]
    llm  = ChatOllama(model=GROQ_MODEL_TEXT, temperature=0)

    try:
        response = llm.invoke([
            SystemMessage(content=CLASSIFIER_SYSTEM),
            HumanMessage(content=f"Classify this text:\n\n{text[:1000]}"),
        ])
        raw = response.content.strip()

        # Strip accidental markdown fences
        raw = re.sub(r"```json|```", "", raw).strip()
        parsed = json.loads(raw)

        if not parsed.get("is_disaster", True):
            return {**state,
                    "disaster_types": [],
                    "severity": "unknown",
                    "error": "not_disaster"}

        return {**state,
                "disaster_types": parsed.get("disaster_types", ["CRISISLEX_CRISISLEXREC"]),
                "severity":       parsed.get("severity", "unknown")}

    except Exception as e:
        return {**state,
                "disaster_types": ["CRISISLEX_CRISISLEXREC"],
                "severity":       "unknown",
                "error":          f"classifier_error: {e}"}


# ── Node 2: Location Extractor ─────────────────────────────────────────────────

_nlp = None

def _get_nlp():
    global _nlp
    if _nlp is None:
        try:
            _nlp = spacy.load("en_core_web_sm")
        except OSError:
            print("[Location] spaCy model not found. Run: python -m spacy download en_core_web_sm")
            _nlp = None
    return _nlp


def node_location_extractor(state: PipelineState) -> PipelineState:
    """Node 2: extract named locations from text using spaCy NER."""
    if state.get("error") == "not_disaster":
        return state

    nlp = _get_nlp()
    if nlp is None:
        return {**state, "locations": []}

    doc   = nlp(state["raw_text"][:2000])
    locs  = []
    seen  = set()

    for ent in doc.ents:
        if ent.label_ in ("GPE", "LOC", "FAC") and ent.text not in seen:
            seen.add(ent.text)
            locs.append({
                "name":    ent.text,
                "country": "",
                "lat":     None,
                "lon":     None,
                "type":    ent.label_,
            })

    return {**state, "locations": locs}


# ── Node 3: RAG Retriever ──────────────────────────────────────────────────────

def node_rag_retriever(state: PipelineState) -> PipelineState:
    """Node 3: retrieve similar past disaster events for context."""
    if state.get("error") == "not_disaster":
        return {**state, "rag_context": []}

    # Build a rich query from what we know so far
    loc_names = " ".join(l["name"] for l in state.get("locations", []))
    type_str  = " ".join(
        t.replace("_", " ").lower()
        for t in state.get("disaster_types", [])
    )
    query = f"{type_str} {state['raw_text'][:300]} {loc_names}".strip()

    try:
        collection = get_collection(CHROMA_DIR)
        hits = retrieve_similar_events(
            query      = query,
            collection = collection,
            n_results  = RAG_TOP_K,
        )
        return {**state, "rag_context": hits}
    except Exception as e:
        return {**state, "rag_context": [], "error": f"rag_error: {e}"}


# ── Node 4: Router ─────────────────────────────────────────────────────────────

def node_router(state: PipelineState) -> PipelineState:
    """
    Node 4: decide whether to call the VLM.
    VLM is called if:
      - an image_path is provided AND
      - severity is medium or high OR disaster_types indicate structural damage
    """
    image_path = state.get("image_path")
    severity   = state.get("severity", "unknown")
    types      = state.get("disaster_types", [])

    damage_types = {
        "NATURAL_DISASTER_EARTHQUAKE", "NATURAL_DISASTER_HURRICANE",
        "NATURAL_DISASTER_FLOOD",      "NATURAL_DISASTER_WILDFIRE",
        "NATURAL_DISASTER_TSUNAMI",    "MANMADE_DISASTER_EXPLOSION",
    }

    needs_vlm = bool(
        image_path
        and Path(image_path).exists()
        and (
            severity in ("medium", "high")
            or any(t in damage_types for t in types)
        )
    )

    return {**state, "needs_vlm": needs_vlm}


# ── Node 5: VLM Captioner ──────────────────────────────────────────────────────

VLM_PROMPT = """You are analyzing a disaster scene image for a humanitarian response system.
Provide a structured assessment with:

1. What is visible (buildings, people, vehicles, infrastructure)
2. Damage level: none / minor / moderate / severe / catastrophic
3. Specific damage indicators (collapsed structures, flooding, fire, etc.)
4. Estimated number of affected people or structures if visible
5. Recommended humanitarian response priority: low / medium / high / critical

Be concise and factual. Focus on actionable information for first responders."""


def node_vlm_captioner(state: PipelineState) -> PipelineState:
    """Node 5: generate damage caption using LLaVA via Ollama."""
    if not state.get("needs_vlm"):
        return {**state, "vlm_caption": None}

    image_path = state["image_path"]

    try:
        with open(image_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()

        ext = Path(image_path).suffix.lstrip(".") or "jpeg"
        media_type = f"image/{ext}"

        llm = ChatGroq(model=GROQ_MODEL_VLM, temperature=0, api_key=os.getenv("GROQ_API_KEY"))
        response = llm.invoke([
            HumanMessage(content=[
                {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64}"}},
                {"type": "text", "text": VLM_PROMPT}
            ])
        ])
        caption = response.content.strip()
        return {**state, "vlm_caption": caption}

    except ImportError:
        return {**state,
                "vlm_caption": None,
                "error": "ollama not installed. Run: pip install ollama"}
    except Exception as e:
        return {**state,
                "vlm_caption": None,
                "error": f"vlm_error: {e}"}


# ── Node 6: Report Generator ───────────────────────────────────────────────────

# REPORT_SYSTEM = """You are generating a structured disaster intelligence report for humanitarian responders.
# Output ONLY valid JSON with no markdown, no explanation, no extra text.

# Schema:
# {
#   "event_summary": "<2-3 sentence factual summary>",
#   "disaster_types": ["<type>"],
#   "severity": "<low|medium|high>",
#   "affected_locations": ["<location names>"],
#   "key_impacts": ["<bullet points of specific impacts>"],
#   "response_recommendations": ["<actionable recommendations>"],
#   "confidence": "<low|medium|high>",
#   "data_sources": ["text_analysis", "rag_context", "vlm_analysis"]
# }"""
REPORT_SYSTEM = """You are generating a structured disaster intelligence report for humanitarian responders.
Output ONLY valid JSON with no markdown, no explanation, no extra text.

Schema:
{
  "event_summary": "<2-3 sentence factual summary>",
  "disaster_types": ["<type>"],
  "severity": "<low|medium|high>",
  "affected_locations": ["<location names>"],
  "key_impacts": ["<bullet points of specific impacts>"],
  "response_recommendations": ["<actionable recommendations>"],
  "confidence": "<low|medium|high>",
  "data_sources": ["text_analysis", "rag_context", "vlm_analysis"],
  "historical_context": "<1-2 sentences comparing this event to retrieved past events, noting if severity is higher or lower than baseline>"
}

Compare this event against the similar past events retrieved. Note escalation patterns,
what response was deployed in past similar events, and whether current severity appears
higher or lower than historical baseline. Reflect this in historical_context and
response_recommendations."""

def node_report_generator(state: PipelineState) -> PipelineState:
    """Node 6: synthesize all signals into a final structured report."""
    if state.get("error") == "not_disaster":
        return {**state, "final_report": {"error": "not_disaster_related"}}

    # Build context summary for the LLM
    rag_summary = ""
    if state.get("rag_context"):
        rag_summary = "Similar past events:\n" + "\n".join(
            # f"- [{h['severity']}] {h['text'][:120]}"
            f"- [{h['severity']}] {h['text'][:350]} | locations: {[l.get('name') for l in h.get('locations',[])]} | source: {h.get('source')}"
            for h in state["rag_context"][:3]
        )

    vlm_summary = ""
    if state.get("vlm_caption"):
        vlm_summary = f"\nImage analysis:\n{state['vlm_caption']}"

    prompt = f"""Generate a disaster intelligence report from this data:

ORIGINAL TEXT: {state['raw_text'][:500]}

CLASSIFIED AS:
- Disaster types: {state.get('disaster_types', [])}
- Severity: {state.get('severity', 'unknown')}
- Locations: {[l['name'] for l in state.get('locations', [])]}

{rag_summary}
{vlm_summary}

Output the JSON report now:"""

    # llm = ChatOllama(model=OLLAMA_MODEL_TEXT, temperature=0.1)
    llm = ChatGroq(model=GROQ_MODEL_TEXT, temperature=0, api_key=os.getenv("GROQ_API_KEY"))

    try:
        response = llm.invoke([
            SystemMessage(content=REPORT_SYSTEM),
            HumanMessage(content=prompt),
        ])
        raw = re.sub(r"```json|```", "", response.content).strip()
        report = json.loads(raw)

        # Enrich with pipeline metadata not in the LLM output
        report["rag_context_count"] = len(state.get("rag_context", []))
        report["vlm_used"]          = bool(state.get("vlm_caption"))
        report["source_url"]        = state.get("source_url", "")
        report["image_path"]        = state.get("image_path", "")

        return {**state, "final_report": report}

    except Exception as e:
        # Fallback: build report without LLM if it fails
        fallback = {
            "event_summary":            state["raw_text"][:300],
            "disaster_types":           state.get("disaster_types", []),
            "severity":                 state.get("severity", "unknown"),
            "affected_locations":       [l["name"] for l in state.get("locations", [])],
            "key_impacts":              [],
            "response_recommendations": [],
            "confidence":               "low",
            "data_sources":             ["text_analysis"],
            "rag_context_count":        len(state.get("rag_context", [])),
            "vlm_used":                 False,
            "error":                    f"report_llm_error: {e}",
        }
        return {**state, "final_report": fallback}


# ── Graph Assembly ─────────────────────────────────────────────────────────────

def _should_continue(state: PipelineState) -> str:
    """Edge condition: short-circuit if text is not disaster-related."""
    if state.get("error") == "not_disaster":
        return "report"    # skip to report which will handle it gracefully
    return "location"


def build_graph() -> StateGraph:
    graph = StateGraph(PipelineState)

    graph.add_node("classifier",  node_classifier)
    graph.add_node("location",    node_location_extractor)
    graph.add_node("rag",         node_rag_retriever)
    graph.add_node("router",      node_router)
    graph.add_node("vlm",         node_vlm_captioner)
    graph.add_node("report",      node_report_generator)

    graph.set_entry_point("classifier")

    graph.add_conditional_edges(
        "classifier",
        _should_continue,
        {"location": "location", "report": "report"},
    )

    graph.add_edge("location", "rag")
    graph.add_edge("rag",      "router")
    graph.add_edge("router",   "vlm")
    graph.add_edge("vlm",      "report")
    graph.add_edge("report",   END)

    return graph.compile()


# ── Public API ─────────────────────────────────────────────────────────────────

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
    """
    Main entry point. Call from FastAPI or directly.

    Returns the final_report dict.
    """
    pipeline = get_pipeline()

    initial_state: PipelineState = {
        "raw_text":      text,
        "image_path":    image_path,
        "source_url":    source_url,
        "disaster_types": [],
        "severity":      "unknown",
        "locations":     [],
        "rag_context":   [],
        "needs_vlm":     False,
        "vlm_caption":   None,
        "final_report":  None,
        "error":         None,
    }

    result = pipeline.invoke(initial_state)
    return result.get("final_report", {})


# ── CLI Test ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("  DisasterPulse — Agent Pipeline Test")
    print("=" * 60)

    test_cases = [
        {
            "text": "Major earthquake hits Mexico City. Buildings collapsed, hundreds trapped. "
                    "Rescue teams deployed. Death toll rising. #earthquake #Mexico",
            "image_path": None,
        },
        {
            "text": "Hurricane Harvey floods Houston. Entire neighborhoods underwater. "
                    "Residents stranded on rooftops waiting for rescue. #HurricaneHarvey",
            "image_path": None,
        },
        {
            "text": "The weather today is really nice. Planning a picnic.",
            "image_path": None,
        },
    ]

    for i, case in enumerate(test_cases, 1):
        print(f"\n── Test {i} ─────────────────────────────────────────")
        print(f"Input: {case['text'][:80]}...")
        report = process_event(**case)
        print(json.dumps(report, indent=2))

    print("\n[Done] agents.py working. Next: python main.py")
