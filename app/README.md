# DisasterPulse

> Agentic RAG + VLM pipeline for real-time disaster event intelligence.
> Directly aligned with QCRI's Humanitarian Pulse and Disaster Impact Assessment projects.

---

## Project Structure

```
disasterpulse/
├── data_loader.py      ← Step 1: data layer (GDELT + CrisisMMD → ChromaDB)
├── agents.py           ← Step 2: LangGraph 6-node pipeline
├── main.py             ← Step 3: FastAPI backend
├── requirements.txt
├── data/
│   ├── gdelt_gkg.csv                          ← your GDELT file
│   ├── crisis_mmd/
│   │   └── CrisisMMD_v2.0/
│   │       ├── annotations/                   ← 7 x .tsv files
│   │       │   ├── california_wildfires_final_data.tsv
│   │       │   ├── hurricane_harvey_final_data.tsv
│   │       │   ├── hurricane_irma_final_data.tsv
│   │       │   ├── hurricane_maria_final_data.tsv
│   │       │   ├── iraq_iran_earthquake_final_data.tsv
│   │       │   ├── mexico_earthquake_final_data.tsv
│   │       │   └── srilanka_floods_final_data.tsv
│   │       ├── data_image/                    ← disaster images
│   │       └── json/
│   └── chroma_db/                             ← auto-created
└── frontend/                                  ← Next.js (coming next)
```

---

## Setup — Step by Step

### 1. Create virtual environment

```bash
python -m venv venv
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

### 3. Install Ollama (local LLM + VLM — zero API cost)

Download from https://ollama.com/download then:

```bash
ollama pull llama3.1:8b    # ~5GB — text classification + report generation
ollama pull llava:7b       # ~4GB — image damage captioning
```

> If you're low on disk/RAM, use `llama3.2:3b` and `llava:7b` instead.
> Skip Ollama entirely for now — agents.py has a fallback that still works.

### 4. Run the data layer

```bash
python data_loader.py
```

Expected output:
```
── GDELT Stats ─────────────────────────────
  Total events  : ~600-900
  Severity      : {'high': ..., 'medium': ..., 'low': ...}

── CrisisMMD Stats ─────────────────────────
  Total events  : ~18000

[ChromaDB] Indexed ~19000 events.

── Retrieval Smoke Test ────────────────────
Query: 'earthquake building collapse rescue operations'
  [1] sim=0.87 | sev=high ...
```

### 5. Test the agent pipeline

```bash
python agents.py
```

### 6. Start the API

```bash
uvicorn main:app --reload --port 8000
```

API docs auto-generated at: http://localhost:8000/docs

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/health` | Health check |
| POST | `/analyze` | Analyze text through full pipeline |
| POST | `/analyze/multimodal` | Text + image upload |
| GET  | `/events/search?q=...` | Semantic search |
| GET  | `/events/feed` | Paginated event feed |
| GET  | `/stats` | Collection statistics |

### Example: analyze a tweet

```bash
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"text": "Major earthquake hits Mexico City. Buildings collapsed. Hundreds trapped. #earthquake"}'
```

Response:
```json
{
  "report": {
    "event_summary": "A major earthquake struck Mexico City causing building collapses...",
    "disaster_types": ["NATURAL_DISASTER_EARTHQUAKE"],
    "severity": "high",
    "affected_locations": ["Mexico City"],
    "key_impacts": ["Building collapses", "People trapped"],
    "response_recommendations": ["Deploy urban search and rescue", "..."],
    "confidence": "high",
    "rag_context_count": 5,
    "vlm_used": false
  }
}
```

---

## Architecture

```
Input Text/Image
      │
      ▼
┌─────────────┐
│  Node 1     │  LLaMA 3.1 → disaster_types + severity
│  Classifier │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Node 2     │  spaCy NER → locations [{name, lat, lon}]
│  Location   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Node 3     │  ChromaDB cosine search → top-5 similar events
│  RAG        │  (18,000+ indexed from GDELT + CrisisMMD)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Node 4     │  Rule-based → needs_vlm = True/False
│  Router     │
└──────┬──────┘
       │
     ┌─┴──────────────┐
     │ (if image)      │
     ▼                 │
┌─────────────┐        │
│  Node 5     │  LLaVA → damage caption + severity
│  VLM        │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Node 6     │  LLaMA 3.1 → final JSON report
│  Report Gen │
└─────────────┘
```

---

## Datasets

- **CrisisMMD v2.0** — QCRI dataset. Authors: Ferda Ofli, Firoj Alam, Muhammad Imran (QCRI/HBKU).
  Cite: Alam et al., ICWSM 2018.

- **GDELT GKG** — Global Knowledge Graph. https://www.gdeltproject.org

---

## Credits

Built as an independent research prototype directly inspired by:
- QCRI Humanitarian Pulse (SIP26 project)
- QCRI Disaster Impact Assessment using Visual-Language Models (SIP26 project)
- CrisisMMD dataset (Ofli, Alam, Imran — QCRI/HBKU)
