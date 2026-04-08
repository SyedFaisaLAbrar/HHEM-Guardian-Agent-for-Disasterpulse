'use client';
import React, { useState } from 'react';
import { useApi } from '@/context/ApiContext';
import { useToast } from './Toast';

interface TopbarProps {
  title: string;
  sub: string;
}

export default function Topbar({ title, sub }: TopbarProps) {
  const { apiBase, online, updateApiBase } = useApi();
  const { showToast } = useToast();
  const [open, setOpen]      = useState(false);
  const [inputUrl, setInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  function openModal() {
    setInput(apiBase);
    setTestMsg('');
    setOpen(true);
  }

  async function save() {
    if (!inputUrl.trim()) return;
    setTesting(true);
    setTestMsg('');
    const ok = await updateApiBase(inputUrl.trim());
    setTesting(false);
    if (ok) {
      setTestMsg('Connection established successfully');
      showToast('API connected');
      setTimeout(() => setOpen(false), 1000);
    } else {
      setTestMsg('Connection failed. Verify host and port.');
    }
  }

  const hostLabel = (() => {
    try { return new URL(apiBase).host; } catch { return apiBase || 'localhost:8000'; }
  })();

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">{title}</div>
        <div className="topbar-path">
          <span>disasterpulse</span> / <span>{sub}</span>
        </div>
        <button className="api-indicator" onClick={openModal}>
          <div className={`dot ${online ? '' : 'offline'}`} />
          <span>{hostLabel}</span>
        </button>
      </div>

      {open && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal">
            <button className="modal-close" onClick={() => setOpen(false)}>✕</button>
            <div className="modal-title">API Configuration</div>
            <div className="modal-desc">Set the backend URL. The system will verify connectivity before saving.</div>

            <div className="form-group">
              <label>Backend URL</label>
              <input
                className="input"
                type="text"
                value={inputUrl}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()}
                placeholder="http://localhost:8000"
              />
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={save} disabled={testing}>
                <div className={`spinner ${testing ? 'active' : ''}`} />
                {testing ? 'Testing…' : 'Save & Connect'}
              </button>
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            </div>

            {testMsg && (
              <div style={{
                marginTop: 16, fontSize: 13,
                color: testMsg.includes('failed') ? 'var(--danger)' : 'var(--success)',
              }}>
                {testMsg}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
