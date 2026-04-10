'use client';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getApiBase, setApiBase, checkHealth } from '@/lib/api';

interface ApiContextValue {
  apiBase: string;
  online: boolean;
  statusText: string;
  updateApiBase: (url: string) => Promise<boolean>;
  refresh: () => void;
}

const ApiContext = createContext<ApiContextValue>({
  apiBase: '',
  online: false,
  statusText: 'Connecting…',
  updateApiBase: async () => false,
  refresh: () => {},
});

export function ApiProvider({ children }: { children: React.ReactNode }) {
  const [apiBase, setBase]    = useState('');
  const [online, setOnline]   = useState(false);
  const [statusText, setStatus] = useState('Connecting…');

  const ping = useCallback(async (base?: string) => {
    const target = base || getApiBase();
    const ok = await checkHealth();
    setOnline(ok);
    setStatus(ok ? 'System Online' : 'System Offline');
    
    // If connection succeeds and URL came from env var, persist it to localStorage
    if (ok && target) {
      setApiBase(target);
    }
    return ok;
  }, []);

  const retryPing = useCallback(async (base?: string, retries = 3) => {
    let lastError;
    for (let i = 0; i < retries; i++) {
      try {
        const ok = await ping(base);
        if (ok) return ok;
      } catch (err) {
        lastError = err;
      }
      // Wait before retrying (exponential backoff: 1s, 2s, 4s)
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
      }
    }
    return false;
  }, [ping]);

  useEffect(() => {
    const initApi = async () => {
      const base = getApiBase();
      setBase(base);
      await retryPing(base);
    };
    initApi();
  }, [retryPing]);

  const updateApiBase = useCallback(async (url: string) => {
    const clean = url.replace(/\/$/, '');
    setApiBase(clean);
    setBase(clean);
    return ping(clean);
  }, [ping]);

  return (
    <ApiContext.Provider value={{ apiBase, online, statusText, updateApiBase, refresh: () => ping() }}>
      {children}
    </ApiContext.Provider>
  );
}

export const useApi = () => useContext(ApiContext);
