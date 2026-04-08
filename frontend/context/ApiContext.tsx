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
    return ok;
  }, []);

  useEffect(() => {
    setBase(getApiBase());
    ping();
  }, [ping]);

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
