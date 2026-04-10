'use client';

import React, { useState } from 'react';
import { ApiProvider } from '@/context/ApiContext';
import { ToastProvider } from '@/components/Toast';
import Shell from '@/components/Shell';
import { useApi } from '@/context/ApiContext';

function PipelineContent() {
  const [activeNode, setActiveNode] = useState<number | null>(null);
  const { apiBase } = useApi();

  const nodes = [
    {
      id: 1,
      name: 'Classifier',
      icon: '🏷️',
      description: 'Disaster type & severity detection from raw text',
      details: [
        'Model: Llama 3.1 8B Instant (Groq)',
        'Detects disaster types: earthquakes, floods, hurricanes, wildfires, etc.',
        'Classifies severity: low, medium, high',
        'Returns structured JSON output'
      ]
    },
    {
      id: 2,
      name: 'Location Extractor',
      icon: '📍',
      description: 'Named entity recognition for geographic locations',
      details: [
        'Tool: spaCy en_core_web_sm',
        'Extracts locations, facilities, geopolitical entities',
        'Returns: country, region, coordinates',
        'Populates context for RAG queries'
      ]
    },
    {
      id: 3,
      name: 'RAG Retriever',
      icon: '🗄️',
      description: 'Semantic search for similar past events',
      details: [
        'Vector Store: ChromaDB',
        'Embeddings: all-MiniLM-L6-v2',
        'Retrieves top-5 similar events by semantic similarity',
        'Provides historical context for the current event'
      ]
    },
    {
      id: 4,
      name: 'Router',
      icon: '🔀',
      description: 'Conditional routing to VLM based on evidence',
      details: [
        'Decides if image analysis is needed',
        'Triggered when severity >= "medium" AND image available',
        'Routes to VLM node or skips directly to Report',
        'Optimizes cost & latency'
      ]
    },
    {
      id: 5,
      name: 'VLM Captioner',
      icon: '👁️',
      description: 'Vision-language understanding for damage assessment',
      details: [
        'Model: Llama 4 Scout 17B 16E (Groq)',
        'Analyzes damage from images',
        'Generates severity descriptions',
        'Validates text-based severity classification'
      ]
    },
    {
      id: 6,
      name: 'Report Generator',
      icon: '📄',
      description: 'Produce final structured report',
      details: [
        'Synthesizes all pipeline outputs',
        'Generates JSON schema with metadata',
        'Creates natural language summary',
        'Returns to API consumer'
      ]
    }
  ];

  return (
    <Shell title="System" sub="pipeline">
      <div style={{ marginBottom: '32px' }}>
        <div style={{ fontSize: '28px', fontWeight: '600', color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: '8px' }}>
          Processing Pipeline
        </div>
        <div style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: '1.5', maxWidth: '600px' }}>
          LangGraph orchestration layer with 6 specialized nodes for crisis event intelligence. Each node is stateless and composable.
        </div>
      </div>

      {/* Pipeline Arc */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '32px 24px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          {nodes.map((node, idx) => (
            <React.Fragment key={node.id}>
              <button
                onClick={() => setActiveNode(activeNode === node.id ? null : node.id)}
                onMouseEnter={() => setActiveNode(node.id)}
                onMouseLeave={() => setActiveNode(null)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: activeNode === node.id ? '2px solid var(--accent)' : '2px solid transparent',
                  background: activeNode === node.id ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  flex: 1,
                }}
              >
                <div style={{ fontSize: '28px' }}>{node.icon}</div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)', textAlign: 'center' }}>
                  {node.name}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: '1.3' }}>
                  {node.description}
                </div>
              </button>
              {idx < nodes.length - 1 && (
                <div style={{ fontSize: '20px', color: 'var(--border)', margin: '0 4px' }}>→</div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Node Details */}
      {activeNode && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: '10px', padding: '20px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ fontSize: '32px' }}>{nodes[activeNode - 1].icon}</div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text)' }}>
                {nodes[activeNode - 1].name}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Node {activeNode} of {nodes.length}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-sub)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Description
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text)', lineHeight: '1.5' }}>
                {nodes[activeNode - 1].description}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-sub)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Technical Details
              </div>
              <ul style={{ fontSize: '13px', color: 'var(--text)', lineHeight: '1.6', listStyle: 'none', padding: 0 }}>
                {nodes[activeNode - 1].details.map((detail, idx) => (
                  <li key={idx} style={{ marginBottom: '6px', display: 'flex', gap: '8px' }}>
                    <span style={{ color: 'var(--accent)' }}>→</span>
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Architecture Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* State Management */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>
            Pipeline State
          </div>
          <div style={{ padding: '20px' }}>
            {[
              { label: 'Input', value: 'raw_text, image_path, source_url' },
              { label: 'Processing', value: 'disaster_types, severity, locations' },
              { label: 'Context', value: 'rag_context, needs_vlm, vlm_caption' },
              { label: 'Output', value: 'final_report (JSON + summary)' },
              { label: 'Error Handling', value: 'error tracking across nodes' }
            ].map((item, idx) => (
              <div key={idx} style={{ marginBottom: idx < 4 ? '12px' : 0 }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-sub)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text)', fontFamily: 'var(--mono)', lineHeight: '1.4' }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Models & Tools */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>
            Models & Services
          </div>
          <div style={{ padding: '20px' }}>
            {[
              { label: 'Language Model', value: 'Llama 3.1 8B (Groq)' },
              { label: 'Vision Model', value: 'Llama 4 Scout 17B (Groq)' },
              { label: 'NER Tool', value: 'spaCy en_core_web_sm' },
              { label: 'Embeddings', value: 'all-MiniLM-L6-v2' },
              { label: 'Vector Store', value: 'ChromaDB' }
            ].map((item, idx) => (
              <div key={idx} style={{ marginBottom: idx < 4 ? '12px' : 0 }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-sub)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text)', fontFamily: 'var(--mono)', lineHeight: '1.4' }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Data Flow */}
      <div style={{ marginTop: '32px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '12px' }}>
          Data Flow Through Pipeline
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.8', fontFamily: 'var(--mono)' }}>
          <div>1. Event arrives with text/image → Classifier</div>
          <div>2. Classifier outputs disaster type & severity → Location Extractor parallel</div>
          <div>3. Location Extractor outputs coordinates → RAG Retriever</div>
          <div>4. RAG provides context → Router decision point</div>
          <div>5a. If image needed: → VLM Captioner → Report Generator</div>
          <div>5b. If no image: skip VLM → Report Generator directly</div>
          <div>6. Report Generator orchestrates all outputs → returns final JSON + summary</div>
        </div>
      </div>
    </Shell>
  );
}

export default function Page() {
  return (
    <ApiProvider>
      <ToastProvider>
        <PipelineContent />
      </ToastProvider>
    </ApiProvider>
  );
}
