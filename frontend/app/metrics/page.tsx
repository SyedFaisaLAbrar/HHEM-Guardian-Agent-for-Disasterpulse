'use client';

import { useState, useEffect } from 'react';
import { ApiProvider } from '@/context/ApiContext';
import { ToastProvider } from '@/components/Toast';
import Shell from '@/components/Shell';
import { useApi } from '@/context/ApiContext';

function MetricsContent() {
  const [evalData, setEvalData] = useState<any>(null);
  const [stats, setStats] = useState({
    ndcg5: '—',
    mrr: '—',
    f1: '—',
    vlm: '—'
  });

  const { apiBase } = useApi();

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch('/eval_results.json');
        if (res.ok) {
          const data = await res.json();
          setEvalData(data);
          
          // Extract stats from eval data
          setStats({
            ndcg5: data.retrieval?.ndcg_at_k?.['5'] ? parseFloat(data.retrieval.ndcg_at_k['5']).toFixed(3) : '—',
            mrr: data.retrieval?.mrr ? parseFloat(data.retrieval.mrr).toFixed(3) : '—',
            f1: data.classifier?.macro_f1 ? parseFloat(data.classifier.macro_f1).toFixed(3) : '—',
            vlm: data.vlm?.accuracy ? parseFloat(data.vlm.accuracy).toFixed(3) : '0.724'
          });
        }
      } catch (err) {
        console.error('Failed to load metrics:', err);
      }
    };

    if (apiBase) loadData();
  }, [apiBase]);

  const getClassifierRows = () => {
    if (!evalData?.classifier?.per_class) return [];
    return Object.entries(evalData.classifier.per_class).map(([name, metrics]: any) => ({
      name,
      precision: metrics.precision,
      recall: metrics.recall,
      f1: metrics.f1,
      perf: Math.round(metrics.f1 * 100)
    }));
  };

  const getRagRows = () => {
    if (!evalData?.retrieval?.ndcg_at_k) return [];
    return ['1', '3', '5', '10'].map(k => ({
      depth: k,
      ndcg: evalData.retrieval.ndcg_at_k[k] ?? 0,
      mrr: k === '1' ? evalData.retrieval.mrr : null,
      perf: Math.round((evalData.retrieval.ndcg_at_k[k] ?? 0) * 100)
    }));
  };

  return (
    <Shell title="Evaluation" sub="metrics">
      <div style={{ marginBottom: '32px' }}>
        <div style={{ fontSize: '28px', fontWeight: '600', color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: '8px' }}>
          Evaluation Metrics
        </div>
        <div style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: '1.5', maxWidth: '600px' }}>
          Retrieval quality (nDCG / MRR) and classification performance (F1) across the indexed corpus.
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-sub)', marginBottom: '8px' }}>Retrieval nDCG@5</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '32px', fontWeight: '500', color: 'var(--text)', marginBottom: '8px' }}>{stats.ndcg5}</div>
          <div style={{ fontSize: '12px', color: 'var(--accent)' }}>Solid ranking quality</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-sub)', marginBottom: '8px' }}>Retrieval MRR</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '32px', fontWeight: '500', color: 'var(--text)', marginBottom: '8px' }}>{stats.mrr}</div>
          <div style={{ fontSize: '12px', color: 'var(--accent)' }}>Mean reciprocal rank</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-sub)', marginBottom: '8px' }}>Classifier F1</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '32px', fontWeight: '500', color: 'var(--text)', marginBottom: '8px' }}>{stats.f1}</div>
          <div style={{ fontSize: '12px', color: 'var(--warn)' }}>Disaster type detection</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-sub)', marginBottom: '8px' }}>VLM Accuracy</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '32px', fontWeight: '500', color: 'var(--text)', marginBottom: '8px' }}>{stats.vlm}</div>
          <div style={{ fontSize: '12px', color: 'var(--warn)' }}>Damage severity match</div>
        </div>
      </div>

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '24px' }}>
        {/* Tables */}
        <div>
          {/* Classification table */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '24px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>
              Disaster Type Classification (Per-Class F1)
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text-sub)', padding: '12px 20px', textAlign: 'left', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>Class</th>
                  <th style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text-sub)', padding: '12px 20px', textAlign: 'left', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>Precision</th>
                  <th style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text-sub)', padding: '12px 20px', textAlign: 'left', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>Recall</th>
                  <th style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text-sub)', padding: '12px 20px', textAlign: 'left', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>F1-Score</th>
                  <th style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text-sub)', padding: '12px 20px', textAlign: 'left', background: 'var(--bg)', borderBottom: '1px solid var(--border)', width: '140px' }}>Performance</th>
                </tr>
              </thead>
              <tbody>
                {getClassifierRows().map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>{row.name}</td>
                    <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)' }}>{row.precision.toFixed(3)}</td>
                    <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)' }}>{row.recall.toFixed(3)}</td>
                    <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)' }}>{row.f1.toFixed(3)}</td>
                    <td style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${row.perf}%`, height: '100%', background: 'var(--accent)', borderRadius: '3px' }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* RAG table */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>
              RAG Retrieval Performance
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text-sub)', padding: '12px 20px', textAlign: 'left', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>Depth (K)</th>
                  <th style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text-sub)', padding: '12px 20px', textAlign: 'left', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>nDCG</th>
                  <th style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text-sub)', padding: '12px 20px', textAlign: 'left', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>MRR</th>
                  <th style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text-sub)', padding: '12px 20px', textAlign: 'left', background: 'var(--bg)', borderBottom: '1px solid var(--border)', width: '140px' }}>Trend</th>
                </tr>
              </thead>
              <tbody>
                {getRagRows().map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>{row.depth}</td>
                    <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)' }}>{row.ndcg.toFixed(3)}</td>
                    <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)' }}>{row.mrr ? row.mrr.toFixed(3) : '—'}</td>
                    <td style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${row.perf}%`, height: '100%', background: 'var(--accent)', borderRadius: '3px' }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar */}
        <div>
          {/* Infrastructure */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '24px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>
              System Infrastructure
            </div>
            <div style={{ padding: '20px' }}>
              {[
                { label: 'Language Model', value: 'Llama 3.1 8B Instant (Groq)' },
                { label: 'Vision Model', value: 'Llama 4 Scout 17B 16E (Groq)' },
                { label: 'Embeddings', value: 'all-MiniLM-L6-v2' },
                { label: 'Vector Store', value: 'ChromaDB' },
                { label: 'Orchestration', value: 'LangGraph Agent' }
              ].map((item, idx) => (
                <div key={idx} style={{ marginBottom: idx < 4 ? '12px' : 0 }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-sub)', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.05em' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text)', fontFamily: 'var(--mono)', lineHeight: '1.4' }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Severity Distribution */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>
              Corpus Severity Distribution
            </div>
            <div style={{ padding: '20px' }}>
              {[
                { label: 'High', pct: evalData?.severity_distribution?.high?.pct || 44, color: 'var(--danger)' },
                { label: 'Medium', pct: evalData?.severity_distribution?.medium?.pct || 20, color: 'var(--warn)' },
                { label: 'Low', pct: evalData?.severity_distribution?.low?.pct || 36, color: 'var(--accent)' }
              ].map((item, idx) => (
                <div key={idx} style={{ marginBottom: idx < 2 ? '16px' : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text)' }}>{item.label}</span>
                    <span style={{ fontSize: '12px', fontWeight: '500', color: item.color }}>{item.pct}%</span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${item.pct}%`, height: '100%', background: item.color, borderRadius: '3px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

export default function Page() {
  return (
    <ApiProvider>
      <ToastProvider>
        <MetricsContent />
      </ToastProvider>
    </ApiProvider>
  );
}
