'use client';
import React from 'react';
import { CrisisEvent } from '@/lib/types';

function escHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatType(t: string) {
  return t.replace('NATURAL_DISASTER_', '').replace('MANMADE_DISASTER_', '');
}

interface EventRowProps {
  event: CrisisEvent;
  onClick?: (e: CrisisEvent) => void;
  showSimilarity?: boolean;
}

export default function EventRow({ event, onClick, showSimilarity }: EventRowProps) {
  const sev = event.severity || 'unknown';

  return (
    <div className="event-row" onClick={() => onClick?.(event)}>
      <div className={`event-sev sev-${sev}`} />
      <div className="event-content">
        <div className="event-meta">
          <span className="event-type">{formatType(event.disaster_type || 'UNKNOWN')}</span>
          {event.source && <span className="event-source">{event.source}</span>}
          <span className={`badge badge-${sev}`}>{sev.toUpperCase()}</span>
          {event.timestamp && (
            <span className="event-time">{event.timestamp}</span>
          )}
          {showSimilarity && event.similarity != null && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', marginLeft: 'auto' }}>
              sim: {(+event.similarity).toFixed(3)}
            </span>
          )}
        </div>
        <div className="event-text">{event.text}</div>
        {event.locations && event.locations.length > 0 && (
          <div className="event-locs">
            {event.locations.map((loc, i) => (
              <span key={i} className="loc-tag">📍 {loc}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
