'use client';

import { useState, useEffect } from 'react';
import { ApiProvider } from '@/context/ApiContext';
import { ToastProvider, useToast } from '@/components/Toast';
import Shell from '@/components/Shell';
import { useApi } from '@/context/ApiContext';
import { CrisisEvent } from '@/lib/types';

function SearchContent() {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('');
  const [source, setSource] = useState('');
  const [results, setResults] = useState<CrisisEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const { apiBase, online } = useApi();
  const { showToast } = useToast();

  const runSearch = async () => {
    if (!query.trim()) {
      showToast('Please enter a search query', 'err');
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('q', query);
      if (severity) params.append('severity', severity);
      if (source) params.append('source', source);

      const res = await fetch(`${apiBase}/events/search?${params.toString()}`);
      if (!res.ok) throw new Error('Search failed');

      const data = await res.json();
      setResults(data.results || []);
      setTotalResults(data.count || 0);
      showToast(`Found ${data.count || 0} results`);
    } catch (err) {
      showToast('Search failed. Check API connection.', 'err');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell title="Event Search" sub="semantic query">
      <div style={{ marginBottom: '32px' }}>
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            display: 'flex',
            gap: '12px',
            marginBottom: '16px'
          }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              placeholder="e.g. earthquake building collapse rescue…"
              style={{
                flex: 1,
                padding: '10px 14px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text)',
                fontFamily: 'var(--sans)',
                fontSize: '14px'
              }}
            />
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              style={{
                width: '140px',
                padding: '10px 14px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text)',
                fontFamily: 'var(--sans)',
                fontSize: '14px'
              }}
            >
              <option value="">All Severity</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              style={{
                width: '140px',
                padding: '10px 14px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text)',
                fontFamily: 'var(--sans)',
                fontSize: '14px'
              }}
            >
              <option value="">All Sources</option>
              <option value="gdelt">GDELT</option>
              <option value="crisismmd">CrisisMMD</option>
            </select>
            <button
              onClick={runSearch}
              disabled={loading || !online}
              style={{
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
                gap: '6px'
              }}
            >
              {loading ? (
                <div style={{ width: '14px', height: '14px', border: '2px solid var(--bg)', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
              ) : (
                <img src="/images/search.png" alt="Search" width="14" height="14" />
              )}
              Search
            </button>
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </div>

        {results.length > 0 ? (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              fontSize: '13px',
              color: 'var(--text-muted)'
            }}>
              {totalResults} result{totalResults !== 1 ? 's' : ''} found
            </div>
            <div>
              {results.map((event, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    padding: '16px 20px',
                    borderBottom: idx < results.length - 1 ? '1px solid var(--border)' : 'none'
                  }}
                >
                  <div
                    style={{
                      width: '4px',
                      height: '16px',
                      marginTop: '4px',
                      borderRadius: '4px',
                      background:
                        event.severity === 'high'
                          ? 'var(--danger)'
                          : event.severity === 'medium'
                          ? 'var(--warn)'
                          : event.severity === 'low'
                          ? 'var(--accent)'
                          : 'var(--text-sub)'
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ marginBottom: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: '500', color: 'var(--text)' }}>
                        {event.disaster_type || 'UNKNOWN'}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 6px' }}>
                        {event.source || 'UNKNOWN'}
                      </span>
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text)', marginBottom: '6px', lineHeight: '1.5' }}>
                      {event.text}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-sub)' }}>
                      {event.locations?.join(', ') || 'Unknown'} • {event.timestamp ? new Date(event.timestamp).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '64px 20px' }}>
            <img src="/images/search.png" alt="Search" width="32" height="32" style={{ marginBottom: '16px', opacity: 0.5, filter: 'invert(1)' }} />
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
              {loading ? 'Searching…' : 'Enter a query to search across the indexed disaster event corpus.'}
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}

export default function Page() {
  return (
    <ApiProvider>
      <ToastProvider>
        <SearchContent />
      </ToastProvider>
    </ApiProvider>
  );
}
