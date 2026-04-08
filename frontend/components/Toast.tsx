'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';

interface ToastContextValue {
  showToast: (msg: string, type?: 'ok' | 'err') => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; type: string; visible: boolean }>({
    msg: '', type: 'ok', visible: false,
  });

  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type, visible: true });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className={`toast ${toast.type === 'err' ? 'err' : ''} ${toast.visible ? 'show' : ''}`}>
        {toast.msg}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
