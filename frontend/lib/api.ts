// Central API helper — mirrors the original apiFetch()
// API_BASE is read from localStorage in the browser, or falls back to env var.

const DEFAULT_API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function getApiBase(): string {
  if (typeof window === 'undefined') return DEFAULT_API;
  return localStorage.getItem('dp_api') || DEFAULT_API;
}

export function setApiBase(url: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('dp_api', url);
}

export async function apiFetch(path: string, options?: RequestInit) {
  const base = getApiBase();
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
