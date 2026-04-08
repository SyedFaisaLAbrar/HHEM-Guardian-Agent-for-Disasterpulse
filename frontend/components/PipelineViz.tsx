'use client';

import { useEffect, useRef } from 'react';

const NODES = [
  { id: 1, icon: '🏷️',  label: 'CLASSIFY' },
  { id: 2, icon: '📍',  label: 'LOCATION' },
  { id: 3, icon: '🗄️',  label: 'RAG'      },
  { id: 4, icon: '🔀',  label: 'ROUTER'   },
  { id: 5, icon: '👁️',  label: 'VLM'      },
  { id: 6, icon: '📄',  label: 'REPORT'   },
];

interface Props {
  activeNode: number | null;  // 0 = none, 1-6 = active, 7 = all done
}

export default function PipelineViz({ activeNode }: Props) {
  return (
    <div className="pipeline-row">
      {NODES.map((node, i) => {
        const isDone   = activeNode !== null && node.id < (activeNode ?? 0);
        const isActive = activeNode === node.id;
        return (
          <div key={node.id} style={{ display: 'flex', alignItems: 'center' }}>
            <div className="p-node">
              <div
                className={`p-node-box${isActive ? ' active-node' : isDone ? ' done-node' : ''}`}
                style={{ position: 'relative' }}
              >
                {isDone && (
                  <div style={{
                    position: 'absolute', top: 4, right: 4,
                    width: 8, height: 8, borderRadius: '50%',
                    background: 'var(--success)',
                  }} />
                )}
                <div className="p-node-icon">{node.icon}</div>
                <div className="p-node-label">{node.label}</div>
              </div>
            </div>
            {i < NODES.length - 1 && <div className="p-arrow" />}
          </div>
        );
      })}
    </div>
  );
}
