'use client';

import React, { useState, useEffect } from 'react';
import { ApiProvider } from '@/context/ApiContext';
import { ToastProvider, useToast } from '@/components/Toast';
import Shell from '@/components/Shell';
import { useApi } from '@/context/ApiContext';
import { CrisisEvent } from '@/lib/types';

function FeedContent() {
  const [allEvents, setAllEvents] = useState<CrisisEvent[]>([]);
  const [displayedEvents, setDisplayedEvents] = useState<CrisisEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CrisisEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentFilter, setCurrentFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [stats, setStats] = useState({
    total: 0,
    high: 0,
    high_pct: '—'
  });

  const { apiBase, online } = useApi();
  const { showToast } = useToast();
  const itemsPerPage = 20;

  // Load events from API matching HTML structure
  const loadFeed = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/events/feed?page=1&per_page=50000`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      const events = data.results || [];
      
      setAllEvents(events);
      setCurrentPage(1);
      setCurrentFilter('all');
      
      // Update stats
      const highCount = events.filter((e: CrisisEvent) => e.severity === 'high').length;
      setStats({
        total: events.length,
        high: highCount,
        high_pct: events.length > 0 ? `${Math.round((highCount / events.length) * 100)}%` : '—'
      });
      
      // Apply filter
      applyFilter('all', events);
    } catch (err) {
      console.error(err);
      showToast('Failed to load events', 'err');
    } finally {
      setLoading(false);
    }
  };

  // Filter logic matching HTML
  const applyFilter = (filterType: string, events: CrisisEvent[] = allEvents) => {
    setCurrentFilter(filterType);
    setCurrentPage(1);
    
    let filtered = events;
    
    if (filterType === 'high') {
      filtered = events.filter(e => e.severity === 'high');
    } else if (filterType === 'medium') {
      filtered = events.filter(e => e.severity === 'medium');
    } else if (filterType === 'low') {
      filtered = events.filter(e => e.severity === 'low');
    } else if (filterType === 'gdelt') {
      filtered = events.filter(e => e.source?.toLowerCase() === 'gdelt');
    } else if (filterType === 'crisismmd') {
      filtered = events.filter(e => e.source?.toLowerCase() === 'crisismmd');
    }
    
    setDisplayedEvents(filtered);
  };

  // Pagination
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginatedEvents = displayedEvents.slice(startIdx, startIdx + itemsPerPage);
  const hasNextPage = startIdx + itemsPerPage < displayedEvents.length;
  const hasPrevPage = currentPage > 1;
  const totalPages = Math.ceil(displayedEvents.length / itemsPerPage) || 1;

  const changePage = (direction: number) => {
    if (direction === 1 && hasNextPage) {
      setCurrentPage(p => p + 1);
    } else if (direction === -1 && hasPrevPage) {
      setCurrentPage(p => p - 1);
    }
  };

  useEffect(() => {
    const initLoad = async () => {
      if (apiBase) {
        await loadFeed();
      }
    };
    initLoad();
  }, [apiBase]);

  return (
    <Shell title="Live Feed" sub="feed">
      <div style={{ marginBottom: '32px' }}>
        <div style={{ fontSize: '28px', fontWeight: '600', color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: '8px' }}>Live Event Feed</div>
        <div style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: '1.5', maxWidth: '600px' }}>
          Real-time disaster events from GDELT GKG + CrisisMMD index — ordered by severity.
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-sub)', marginBottom: '8px' }}>Total Indexed</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '32px', fontWeight: '500', color: 'var(--text)', marginBottom: '8px' }}>{stats.total}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ChromaDB events</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-sub)', marginBottom: '8px' }}>High Severity</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '32px', fontWeight: '500', color: 'var(--danger)', marginBottom: '8px' }}>{stats.high}</div>
          <div style={{ fontSize: '12px', color: 'var(--warn)' }}>{stats.high_pct}</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-sub)', marginBottom: '8px' }}>Data Sources</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '32px', fontWeight: '500', color: 'var(--text)', marginBottom: '8px' }}>2</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>GDELT + CrisisMMD</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-sub)', marginBottom: '8px' }}>Embed Model</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '20px', fontWeight: '500', color: 'var(--text)', marginBottom: '8px', paddingTop: '10px' }}>MiniLM</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>all-MiniLM-L6-v2</div>
        </div>
      </div>

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '24px' }}>
        {/* Event List */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)' }}>Recent Events</div>
            <button onClick={loadFeed} disabled={loading} style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '500', cursor: loading ? 'not-allowed' : 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', opacity: loading ? 0.5 : 1 }}>
              Refresh
            </button>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {['all', 'high', 'medium', 'low', 'gdelt', 'crisismmd'].map(f => (
              <div key={f} onClick={() => applyFilter(f)} style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', background: currentFilter === f ? 'var(--text)' : 'transparent', border: `1px solid ${currentFilter === f ? 'var(--text)' : 'var(--border)'}`, color: currentFilter === f ? 'var(--bg)' : 'var(--text-muted)', transition: 'all 0.2s' }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </div>
            ))}
          </div>

          {/* Event list panel */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '64px 20px' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid var(--border)', borderTop: '3px solid var(--text)', borderRadius: '50%', animation: 'spin 0.6s linear infinite', margin: '0 auto 16px' }} />
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                  Loading events from ChromaDB…<br/>Make sure <code style={{ color: 'var(--text)' }}>data_loader.py</code> has run.
                </p>
                <style>{`
                  @keyframes spin {
                    to { transform: rotate(360deg); }
                  }
                `}</style>
              </div>
            ) : paginatedEvents.length > 0 ? (
              <div>
                {paginatedEvents.map((event, idx) => (
                  <div key={idx} onClick={() => setSelectedEvent(event)} style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', padding: '16px 20px', borderBottom: idx < paginatedEvents.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', background: selectedEvent?.id === event.id ? 'rgba(255,255,255,0.04)' : 'transparent' }}>
                    <div style={{ width: '4px', height: '16px', marginTop: '4px', borderRadius: '4px', flexShrink: 0, background: event.severity === 'high' ? 'var(--danger)' : event.severity === 'medium' ? 'var(--warn)' : event.severity === 'low' ? 'var(--accent)' : 'var(--text-sub)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ marginBottom: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: '500', color: 'var(--text)' }}>{event.disaster_type}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 6px' }}>{(event.source || 'UNKNOWN').toUpperCase()}</span>
                      </div>
                      <div style={{ fontSize: '14px', color: 'var(--text)', marginBottom: '6px', lineHeight: '1.5' }}>{event.text}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-sub)' }}>
                        {event.locations?.join(', ') || 'Unknown'} • {event.timestamp ? new Date(event.timestamp).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '64px 20px' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.6' }}>No events found with the current filter.</p>
              </div>
            )}
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px', alignItems: 'center' }}>
            <button onClick={() => changePage(-1)} disabled={!hasPrevPage} style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '500', cursor: hasPrevPage ? 'pointer' : 'not-allowed', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', opacity: hasPrevPage ? 1 : 0.5 }}>
              Previous
            </button>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Page {currentPage} of {totalPages}</span>
            <button onClick={() => changePage(1)} disabled={!hasNextPage} style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '500', cursor: hasNextPage ? 'pointer' : 'not-allowed', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', opacity: hasNextPage ? 1 : 0.5 }}>
              Next
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', marginBottom: '16px' }}>Event Detail</div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
            <div style={{ padding: '20px' }}>
              {selectedEvent ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-sub)', textTransform: 'uppercase', marginBottom: '6px' }}>Classification</div>
                    <div style={{ fontSize: '14px', color: 'var(--text)' }}>{selectedEvent.disaster_type}</div>
                  </div>
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-sub)', textTransform: 'uppercase', marginBottom: '6px' }}>Severity</div>
                    <div style={{ fontSize: '14px', color: 'var(--text)', textTransform: 'capitalize' }}>{selectedEvent.severity}</div>
                  </div>
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-sub)', textTransform: 'uppercase', marginBottom: '6px' }}>Source</div>
                    <div style={{ fontSize: '14px', color: 'var(--text)', textTransform: 'uppercase' }}>{(selectedEvent.source || 'UNKNOWN').toUpperCase()}</div>
                  </div>
                  {selectedEvent.locations && selectedEvent.locations.length > 0 && (
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px 16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-sub)', textTransform: 'uppercase', marginBottom: '6px' }}>Locations</div>
                      <div style={{ fontSize: '14px', color: 'var(--text)', lineHeight: '1.4' }}>{selectedEvent.locations.join(', ')}</div>
                    </div>
                  )}
                  {selectedEvent.timestamp && (
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px 16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-sub)', textTransform: 'uppercase', marginBottom: '6px' }}>Timestamp</div>
                      <div style={{ fontSize: '14px', color: 'var(--text)' }}>{new Date(selectedEvent.timestamp).toLocaleString()}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                    Select an event from the feed to view deeper context and run pipeline analysis.
                  </p>
                </div>
              )}
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
        <FeedContent />
      </ToastProvider>
    </ApiProvider>
  );
}
