'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApi } from '@/context/ApiContext';

const NAV = [
  {
    section: 'Monitor',
    items: [
      { href: '/', label: 'Live Feed', badgeId: 'feed', icon: (
        <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
      )},
      { href: '/search', label: 'Event Search', icon: (
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398l3.85 3.85.708-.707-3.85-3.85zm-6.242.656a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z"/></svg>
      )},
    ],
  },
  {
    section: 'Analyze',
    items: [
      { href: '/analyze', label: 'Submit Event', icon: (
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/></svg>
      )},
    ],
  },
  {
    section: 'Evaluate',
    items: [
      { href: '/metrics', label: 'Evaluation', icon: (
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 0h1v15h15v1H0V0zm14.854 5.854l-4-4-.708.707L13.293 5H8.5A4.5 4.5 0 0 0 4 9.5v2.5h1V9.5A3.5 3.5 0 0 1 8.5 6h4.793l-3.147 3.146.708.708 4-4z"/></svg>
      )},
    ],
  },
  {
    section: 'System',
    items: [
      { href: '/pipeline', label: 'Pipeline', icon: (
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 5.5A.5.5 0 0 1 5.5 5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm2 2A.5.5 0 0 1 7.5 7h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5zm2 2a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zM3 8.5a.5.5 0 0 0-1 0v5.793l-1.146-1.147a.5.5 0 0 0-.708.708l2 2a.5.5 0 0 0 .708 0l2-2a.5.5 0 0 0-.708-.708L3 14.293V8.5z"/></svg>
      )},
    ],
  },
];

export default function Sidebar({ feedCount }: { feedCount?: number }) {
  const pathname = usePathname();
  const { online, statusText, apiBase } = useApi();

  return (
    <aside className="sidebar">
      <div className="logo-block">
        <div className="logo-mark">
          <div className="logo-icon">
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style={{ width: 14, height: 14, fill: 'var(--bg)' }}>
              <path d="M8 1L1 14h14L8 1zm0 3l4.5 8h-9L8 4z"/>
            </svg>
          </div>
          <div className="logo-text">DisasterPulse</div>
        </div>
        <div className="logo-sub">Crisis Intelligence</div>
      </div>

      <nav className="nav">
        {NAV.map(group => (
          <React.Fragment key={group.section}>
            <div className="nav-section-label">{group.section}</div>
            {group.items.map(item => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${active ? 'active' : ''}`}
                >
                  {item.icon}
                  {item.label}
                  {item.href === '/' && feedCount !== undefined && (
                    <span className="nav-badge">{feedCount}</span>
                  )}
                </Link>
              );
            })}
          </React.Fragment>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="status-dot">
          <div className={`dot ${online ? '' : 'offline'}`} />
          <span>{statusText}</span>
        </div>
      </div>
    </aside>
  );
}
