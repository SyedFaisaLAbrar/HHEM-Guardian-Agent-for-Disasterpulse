'use client';

import { useState, useRef } from 'react';
import { ApiProvider } from '@/context/ApiContext';
import { ToastProvider, useToast } from '@/components/Toast';
import Shell from '@/components/Shell';
import Pipeline, { PipelineHandle } from '@/components/Pipeline';
import { useApi } from '@/context/ApiContext';

const SAMPLES = [
  'A devastating 7.2 magnitude earthquake struck off the coast of Fukushima, Japan early this morning, triggering tsunami warnings across the Pacific. Emergency services report significant structural damage in Sendai.',
  'Hurricane Milton strengthens to Category 5 as it approaches Florida coast. Residents are urged to evacuate immediately. Wind speeds exceed 150 mph. Flight path projection indicates landfall near Tampa Bay region.'
];

function AnalyzeContent() {
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const pipelineRef = useRef<PipelineHandle>(null);
  const { apiBase, online } = useApi();
  const { showToast } = useToast();

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
    if (pipelineRef.current) {
      await pipelineRef.current.animate();
    }

    try {
      let res;

      if (image) {
        // Use FormData for multimodal analysis with image
        const formData = new FormData();
        formData.append('text', text);
        if (url) formData.append('source_url', url);
        formData.append('image', image);

        res = await fetch(`${apiBase}/analyze/multimodal`, {
          method: 'POST',
          body: formData
        });
      } else {
        // Use JSON for text-only analysis
        res = await fetch(`${apiBase}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text,
            source_url: url || null
          })
        });
      }

      if (!res.ok) throw new Error('Analysis failed');

      const data = await res.json();
      setResult(data);
      showToast('Analysis complete! Check results below.');
    } catch (err) {
      showToast('Analysis failed. Check API connection.', 'err');
      if (pipelineRef.current) pipelineRef.current.reset();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell title="Submit Event" sub="analysis">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '24px', marginBottom: '32px' }}>
        {/* Main form */}
        <div>
          {/* Pipeline diagram */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              overflow: 'hidden',
              marginBottom: '24px'
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>
              Agentic Pipeline Status
            </div>
            <div style={{ padding: '20px' }}>
              <Pipeline ref={pipelineRef} />
            </div>
          </div>

          {/* Form panel */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              overflow: 'hidden'
            }}
          >
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '13px',
              fontWeight: '600',
              color: 'var(--text)'
            }}>
              Event Input
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => loadSample(0)}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--surface-hover)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}
                >
                  Sample 1
                </button>
                <button
                  onClick={() => loadSample(1)}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--surface-hover)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}
                >
                  Sample 2
                </button>
              </div>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500', color: 'var(--text)' }}>
                  Event Text or Tweet content
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste a tweet, news excerpt, or GDELT article text here…"
                  rows={5}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontFamily: 'var(--sans)',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500', color: 'var(--text)' }}>
                  Source URL <span style={{ color: 'var(--text-sub)', fontWeight: 'normal' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontFamily: 'var(--sans)',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500', color: 'var(--text)' }}>
                  Image <span style={{ color: 'var(--text-sub)', fontWeight: 'normal' }}>(optional)</span>
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImage(e.target.files?.[0] || null)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontFamily: 'var(--sans)',
                    fontSize: '14px'
                  }}
                />
              </div>

              <button
                onClick={runAnalysis}
                disabled={loading || !online}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  background: loading ? 'var(--text-sub)' : 'var(--text)',
                  color: 'var(--bg)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: '500',
                  fontSize: '13px',
                  opacity: loading || !online ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {loading ? (
                  <>
                    <div style={{ width: '12px', height: '12px', border: '2px solid currentColor', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                    Analyzing…
                  </>
                ) : (
                  <>
                    ▶ Execute Pipeline
                    <style>{`
                      @keyframes spin {
                        to { transform: rotate(360deg); }
                      }
                    `}</style>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Results sidebar */}
        <div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', marginBottom: '16px' }}>
            Pipeline Output
          </div>
          {result ? (
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '24px'
            }}>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '16px' }}>
                {(result as any).report?.event_summary || 'Analysis complete. Review the details in the pipeline output.'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px 16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-sub)', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Classification
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text)' }}>
                    {(result as any).report?.disaster_types?.[0] || 'Unknown'}
                  </div>
                </div>
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px 16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-sub)', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Severity
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text)' }}>
                    {(result as any).report?.severity || 'Unknown'}
                  </div>
                </div>
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '16px' }}>
                {(result as any).report?.historical_context || 'Comparison of this event to retrieved past events.'}
              </p>
            </div>
          ) : (
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '40px 20px',
              textAlign: 'center'
            }}>
              <img 
                src="/images/ai.png" 
                alt="Analysis" 
                width="32" 
                height="32" 
                style={{ 
                  marginBottom: '16px', 
                  opacity: loading ? 1 : 0.5, 
                  filter: 'invert(1)', 
                  display: 'block', 
                  margin: '0 auto 16px',
                  animation: loading ? 'pop 0.6s ease-in-out infinite' : 'none',
                  transformOrigin: 'center'
                }} 
              />
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                {loading ? 'Analyzing your event…' : 'Submit an event to run the full analysis pipeline.'}
              </p>
              <style>{`
                @keyframes pop {
                  0%, 100% { transform: scale(1); }
                  50% { transform: scale(1.3); }
                }
              `}</style>
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
