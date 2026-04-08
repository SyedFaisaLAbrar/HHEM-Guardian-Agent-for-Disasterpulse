# DisasterPulse

Agentic RAG pipeline for real-time disaster event intelligence.  
Classifies events, extracts locations, retrieves historical context, 
and generates structured response reports — with optional visual damage 
assessment via LLaVA-class VLM.

**Live demo:** [link] | **Video walkthrough:** [link]

## Architecture

[embed the diagram from above]

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

\```bash
git clone ... 
cd disasterpulse
python -m venv venv && source venv/bin/activate
pip install -r app/requirements.txt
python -m spacy download en_core_web_sm
echo "GROQ_API_KEY=your_key" > .env
cd app && python data_loader.py
uvicorn main:app --host 0.0.0.0 --port 8000
\```

## Related work

Built with reference to QCRI's Humanitarian Pulse project and  
CrisisMMD dataset (Alam et al., 2018).