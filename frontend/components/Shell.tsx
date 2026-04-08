'use client';
import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

interface ShellProps {
  children: React.ReactNode;
  title: string;
  sub: string;
}

export default function Shell({ children, title, sub }: ShellProps) {
  const [feedCount, setFeedCount] = useState<number | undefined>(undefined);

  return (
    <div className="shell">
      <Sidebar feedCount={feedCount} />
      <main className="main">
        <Topbar title={title} sub={sub} />
        <div className="page fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
