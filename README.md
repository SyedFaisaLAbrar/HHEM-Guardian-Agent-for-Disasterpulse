# DisasterPulse

Agentic RAG pipeline for real-time disaster event intelligence.  
Classifies events, extracts locations, retrieves historical context, 
and generates structured response reports — with optional visual damage 
assessment via LLaVA-class VLM.

**Live demo:** [link] | **Video walkthrough:** [link]

## Architecture

![DisasterPulse Pipeline](docs/architecture_diagram.png)


> 6-node LangGraph agentic pipeline. Flow: text/image input → classifier → location extractor → RAG retriever → router decision → optional VLM analysis → report synthesis

## Pipeline

Six LangGraph nodes process each event end-to-end:

1. **Classifier** — llama-3.1-8b via Groq classifies disaster type and severity
2. **Location extractor** — spaCy NER identifies affected regions  
3. **RAG retriever** — ChromaDB semantic search pulls top-5 similar historical events
4. **Router** — decides whether image analysis is warranted
5. **VLM captioner** — Groq vision model assesses structural damage from uploaded images
6. **Report generator** — llama-3.1-8b synthesizes all signals into actionable JSON report

## Datasets

- **GDELT GKG** — global news event stream with disaster theme tags
- **CrisisMMD v2.0** (QCRI) — 18,082 crisis tweets with humanitarian labels and damage assessments across 7 disaster events
Link : https://crisisnlp.qcri.org/crisismmd

## Evaluation

Evaluated on 200 held-out CrisisMMD test queries:

| Metric | Score |
|--------|-------|
| nDCG@5 | 0.945 |
| nDCG@10 | 0.921 |
| MRR | 1.0 |
| Classifier macro-F1 (keyword baseline) | 0.692 |

Retrieval evaluation uses CrisisMMD damage severity labels as graded 
relevance (severe=3, mild=2, little/none=1). Classifier evaluation 
uses a keyword-matching baseline for reproducibility.

## Stack

Backend: FastAPI · LangGraph · ChromaDB · spaCy · Groq API  
Frontend: Next.js  
Embeddings: all-MiniLM-L6-v2  
LLM: llama-3.1-8b-instant (Groq)  
VLM: llama-4-scout vision (Groq)

## Quick start

### 1. Clone & Setup

\```bash
git clone https://github.com/SyedFaisaLAbrar/DisasterPulse-Agentic-RAG-Pipeline-for-Real-Time-Disaster-Event-Intelligence.git
cd DisasterPulse
\```

### 2. Backend Environment

\```bash
python -m venv venv

# On Windows:
venv\Scripts\activate

# On macOS/Linux:
source venv/bin/activate
\```

### 3. Install Dependencies

\```bash
pip install -r app/requirements.txt
python -m spacy download en_core_web_sm
\```

### 4. Configure API Keys

Create `app/.env` file:

\```bash
GROQ_API_KEY=gsk_your_key_here
HF_TOKEN=hf_your_token_here
\```

Get keys:
- **Groq API:** https://console.groq.com
- **Hugging Face:** https://huggingface.co/settings/tokens

### 5. Load Data

\```bash
cd app
python data_loader.py  # Indexes CrisisMMD & GDELT into ChromaDB
\```

### 6. Start Backend

\```bash
uvicorn main:app --reload --port 8000
\```

Backend runs at: http://localhost:8000

### 7. Start Frontend (Optional)

In a new terminal:

\```bash
cd frontend
npm install
npm run dev
\```

Frontend runs at: http://localhost:3000

## Related work

Built with reference to QCRI's Humanitarian Pulse project and  
CrisisMMD dataset (Alam et al., 2018).