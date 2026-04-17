'use client';

import React, { useState, useRef } from 'react';
import { ApiProvider } from '@/context/ApiContext';
import { ToastProvider, useToast } from '@/components/Toast';
import Shell from '@/components/Shell';
import Pipeline, { PipelineHandle } from '@/components/Pipeline';
import { useApi } from '@/context/ApiContext';

const SAMPLES = [
  'A devastating 7.2 magnitude earthquake struck off the coast of Fukushima, Japan early this morning, triggering tsunami warnings across the Pacific. Emergency services report significant structural damage in Sendai.',
  'Hurricane Milton strengthens to Category 5 as it approaches Florida coast. Residents are urged to evacuate immediately. Wind speeds exceed 150 mph. Flight path projection indicates landfall near Tampa Bay region.'
];

// ── HHEM Score Badge ──────────────────────────────────────────────────────────
function HHEMBadge({ score }: { score: number | null }) {
  if (score === null) return null;

  const pct     = Math.round(score * 100);
  const isGood  = score >= 0.5;
  const color   = isGood ? '#16a34a' : '#dc2626';
  const bg      = isGood ? '#dcfce7' : '#fee2e2';
  const label   = isGood ? 'Consistent' : 'Flagged';

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '3px 10px', borderRadius: '999px',
      background: bg, border: `1px solid ${color}22`,
    }}>
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%', background: color
      }} />
      <span style={{ fontSize: '12px', fontWeight: '600', color }}>
        {label} · {pct}%
      </span>
    </div>
  );
}

// ── HHEM Panel ────────────────────────────────────────────────────────────────
interface HHEMResult {
  score:      number | null;
  triggered:  boolean;
  correction: string | null;
}

function HHEMPanel({ hhem, originalSummary }: { hhem: HHEMResult; originalSummary?: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'before' | 'after'>('before');

  const barWidth  = hhem.score !== null ? `${Math.round(hhem.score * 100)}%` : '0%';
  const barColor  = (hhem.score ?? 0) >= 0.5 ? '#16a34a' : '#dc2626';

  return (
    <div style={{
      background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: '6px', padding: '12px 16px',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Vectara HHEM Guard
        </div>
        <HHEMBadge score={hhem.score} />
      </div>

      {/* Score bar */}
      {hhem.score !== null && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{
            height: '6px', background: 'var(--border)',
            borderRadius: '999px', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: barWidth,
              background: barColor,
              borderRadius: '999px',
              transition: 'width 0.6s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-sub)' }}>Hallucinated</span>
            <span style={{ fontSize: '11px', color: 'var(--text-sub)' }}>Consistent</span>
          </div>
        </div>
      )}

      {hhem.score === null && (
        <p style={{ fontSize: '12px', color: 'var(--text-sub)', margin: '0 0 8px' }}>
          HHEM model unavailable — install <code>transformers</code> on the server.
        </p>
      )}

      {/* Correction section */}
      {hhem.triggered && hhem.correction && (
        <div style={{ marginTop: '10px' }}>
          <button
            onClick={() => setOpen((o: boolean) => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: '600', color: '#dc2626', padding: 0,
              marginBottom: '8px',
            }}
          >
            <span style={{ fontSize: '14px' }}>{open ? '▾' : '▸'}</span>
            ⚠️ Hallucination detected & corrected
          </button>

          {open && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                <button
                  onClick={() => setTab('before')}
                  style={{
                    background: tab === 'before' ? '#dc2626' : 'transparent',
                    color: tab === 'before' ? '#fff' : 'var(--text-muted)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '600',
                  }}
                >
                  Original (Flagged)
                </button>
                <button
                  onClick={() => setTab('after')}
                  style={{
                    background: tab === 'after' ? '#16a34a' : 'transparent',
                    color: tab === 'after' ? '#fff' : 'var(--text-muted)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '600',
                  }}
                >
                  Corrected
                </button>
              </div>

              {/* Content */}
              {tab === 'before' && originalSummary && (
                <div style={{
                  padding: '10px 12px',
                  background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: '6px', fontSize: '13px',
                  color: '#7f1d1d', lineHeight: '1.5',
                }}>
                  {originalSummary}
                </div>
              )}
              {tab === 'after' && (
                <div style={{
                  padding: '10px 12px',
                  background: '#f0fdf4', border: '1px solid #bbf7d0',
                  borderRadius: '6px', fontSize: '13px',
                  color: '#15803d', lineHeight: '1.5',
                  fontWeight: '500',
                }}>
                  {hhem.correction}
                </div>
              )}

              {/* Explanation note */}
              <div style={{
                padding: '8px 10px',
                background: 'var(--bg-secondary)',
                borderRadius: '4px',
                fontSize: '11px',
                color: 'var(--text-muted)',
                lineHeight: '1.4',
                fontStyle: 'italic',
              }}>
                💡 The original draft was flagged during generation. This corrected version removes unsupported claims and focuses on verified context.
              </div>
            </div>
          )}
        </div>
      )}

      {!hhem.triggered && hhem.score !== null && (
        <p style={{ fontSize: '12px', color: '#16a34a', margin: '4px 0 0', fontWeight: '500' }}>
          ✓ No correction needed
        </p>
      )}
    </div>
  );
}

// ── Main Content ──────────────────────────────────────────────────────────────
function AnalyzeContent() {
  const [text,    setText]    = useState('');
  const [url,     setUrl]     = useState('');
  const [image,   setImage]   = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<any>(null);

  const pipelineRef = useRef<PipelineHandle>(null);
  const { apiBase, online } = useApi();
  const { showToast }       = useToast();

  const loadSample = (idx: number) => {
    setText(SAMPLES[idx] || '');
    showToast('Sample text loaded');
  };

  const runAnalysis = async () => {
    if (!text.trim()) {
      showToast('Please enter event text', 'err');
      return;
    }

    setLoading(true);
    if (pipelineRef.current) await pipelineRef.current.animate();

    try {
      let res;

      if (image) {
        const formData = new FormData();
        formData.append('text', text);
        if (url) formData.append('source_url', url);
        formData.append('image', image);

        res = await fetch(`${apiBase}/analyze/multimodal`, {
          method: 'POST', body: formData,
        });
      } else {
        res = await fetch(`${apiBase}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, source_url: url || null }),
        });
      }

      if (!res.ok) throw new Error('Analysis failed');

      const data = await res.json();
      setResult(data);

      if (pipelineRef.current) await pipelineRef.current.completeReport();
      showToast('Analysis complete! Check results below.');
    } catch {
      showToast('Analysis failed. Check API connection.', 'err');
      if (pipelineRef.current) pipelineRef.current.reset();
    } finally {
      setLoading(false);
    }
  };

  const hhem: HHEMResult = result?.hhem ?? { score: null, triggered: false, correction: null };

  return (
    <Shell title="Submit Event" sub="analysis">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '24px', marginBottom: '32px' }}>

        {/* ── Left: pipeline + form ─────────────────────────────────────── */}
        <div>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '10px', overflow: 'hidden', marginBottom: '24px',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>
              Agentic Pipeline Status
            </div>
            <div style={{ padding: '20px' }}>
              <Pipeline ref={pipelineRef} />
            </div>
          </div>

          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '10px', overflow: 'hidden',
          }}>
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: '13px', fontWeight: '600', color: 'var(--text)',
            }}>
              Event Input
              <div style={{ display: 'flex', gap: '8px' }}>
                {[0, 1].map(i => (
                  <button key={i} onClick={() => loadSample(i)} style={{
                    padding: '6px 12px', background: 'var(--surface-hover)',
                    border: '1px solid var(--border)', borderRadius: '6px',
                    color: 'var(--text)', cursor: 'pointer', fontSize: '12px', fontWeight: '500',
                  }}>
                    Sample {i + 1}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500', color: 'var(--text)' }}>
                  Event Text or Tweet content
                </label>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Paste a tweet, news excerpt, or GDELT article text here…"
                  rows={5}
                  style={{
                    width: '100%', padding: '10px 14px',
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: '6px', color: 'var(--text)',
                    fontFamily: 'var(--sans)', fontSize: '14px', resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500', color: 'var(--text)' }}>
                  Source URL <span style={{ color: 'var(--text-sub)', fontWeight: 'normal' }}>(optional)</span>
                </label>
                <input
                  type="text" value={url} onChange={e => setUrl(e.target.value)}
                  placeholder="https://…"
                  style={{
                    width: '100%', padding: '10px 14px',
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: '6px', color: 'var(--text)',
                    fontFamily: 'var(--sans)', fontSize: '14px',
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500', color: 'var(--text)' }}>
                  Image <span style={{ color: 'var(--text-sub)', fontWeight: 'normal' }}>(optional)</span>
                </label>
                <input
                  type="file" accept="image/*"
                  onChange={e => setImage(e.target.files?.[0] || null)}
                  style={{
                    width: '100%', padding: '10px 14px',
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: '6px', color: 'var(--text)',
                    fontFamily: 'var(--sans)', fontSize: '14px',
                  }}
                />
              </div>

              <button
                onClick={runAnalysis}
                disabled={loading || !online}
                style={{
                  width: '100%', padding: '10px 16px',
                  background: loading ? 'var(--text-sub)' : 'var(--text)',
                  color: 'var(--bg)', border: 'none', borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: '500', fontSize: '13px',
                  opacity: loading || !online ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}
              >
                {loading ? (
                  <>
                    <div style={{
                      width: '12px', height: '12px',
                      border: '2px solid currentColor',
                      borderTop: '2px solid transparent',
                      borderRadius: '50%', animation: 'spin 0.6s linear infinite',
                    }} />
                    Analyzing…
                  </>
                ) : '▶ Execute Pipeline'}
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </button>
            </div>
          </div>
        </div>

        {/* ── Right: results sidebar ────────────────────────────────────── */}
        <div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', marginBottom: '16px' }}>
            Pipeline Output
          </div>

          {loading ? (
            // Always show loading animation when analyzing
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '40px 20px', textAlign: 'center',
            }}>
              <img
                src="/images/ai.png" alt="Analysis" width="32" height="32"
                style={{
                  marginBottom: '16px', opacity: 1,
                  filter: 'invert(1)', display: 'block', margin: '0 auto 16px',
                  animation: 'pop 0.6s ease-in-out infinite',
                  transformOrigin: 'center',
                }}
              />
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                Analyzing your event…
              </p>
              <style>{`
                @keyframes pop {
                  0%, 100% { transform: scale(1); }
                  50%       { transform: scale(1.3); }
                }
              `}</style>
            </div>
          ) : result ? (
            // Show results when analysis is complete
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

              {/* Summary */}
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '10px', padding: '20px',
              }}>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.6', margin: '0 0 16px' }}>
                  {result.report?.event_summary || 'Analysis complete.'}
                </p>
                
                {/* Error indicator if present */}
                {result.report?.error && (
                  <div style={{
                    marginBottom: '12px', padding: '10px 12px',
                    background: '#fef2f2', border: '1px solid #fecaca',
                    borderRadius: '6px', fontSize: '11px', color: '#7f1d1d',
                  }}>
                    ⚠️ {result.report.error}
                  </div>
                )}
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Classification */}
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-sub)', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Classification
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: '500' }}>
                      {result.report?.disaster_types && result.report.disaster_types.length > 0 
                        ? result.report.disaster_types[0].replace(/_/g, ' ').toLowerCase().split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                        : 'Unknown'}
                    </div>
                  </div>
                  {/* Severity */}
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-sub)', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Severity
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: '500' }}>
                      {result.report?.severity 
                        ? result.report.severity.charAt(0).toUpperCase() + result.report.severity.slice(1)
                        : 'Unknown'}
                    </div>
                  </div>
                </div>
                {result.report?.historical_context && (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6', margin: '12px 0 0' }}>
                    {result.report.historical_context}
                  </p>
                )}
              </div>

              {/* HHEM Panel ← NEW */}
              <HHEMPanel hhem={hhem} originalSummary={result.report?.hhem_original_summary} />

            </div>
          ) : (
            // Show empty state on initial load
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '40px 20px', textAlign: 'center',
            }}>
              <img
                src="/images/ai.png" alt="Analysis" width="32" height="32"
                style={{
                  marginBottom: '16px', opacity: 0.5,
                  filter: 'invert(1)', display: 'block', margin: '0 auto 16px',
                  transformOrigin: 'center',
                }}
              />
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                Submit an event to run the full analysis pipeline.
              </p>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

export default function Page() {
  return (
    <ApiProvider>
      <ToastProvider>
        <AnalyzeContent />
      </ToastProvider>
    </ApiProvider>
  );
}
