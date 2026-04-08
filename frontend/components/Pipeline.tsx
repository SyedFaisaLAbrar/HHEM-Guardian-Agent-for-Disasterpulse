'use client';
import React, { useImperativeHandle, forwardRef, useState } from 'react';

const NODES = [
  { id: 1, icon: 'data-classification.png', label: 'Classify' },
  { id: 2, icon: 'location-pin.png', label: 'Location' },
  { id: 3, icon: 'database.png', label: 'RAG' },
  { id: 4, icon: 'arrows.png', label: 'Router' },
  { id: 5, icon: 'ai.png', label: 'VLM' },
  { id: 6, icon: 'file.png', label: 'Report' },
];

export interface PipelineHandle {
  animate: () => Promise<void>;
  reset: () => void;
}

const Pipeline = forwardRef<PipelineHandle>((_, ref) => {
  const [activeNode, setActiveNode]  = useState<number | null>(null);
  const [doneNodes, setDoneNodes]    = useState<Set<number>>(new Set());

  async function animate() {
    setActiveNode(null);
    setDoneNodes(new Set());
    for (let i = 1; i <= 6; i++) {
      setActiveNode(i);
      if (i > 1) setDoneNodes(prev => new Set([...prev, i - 1]));
      await new Promise(r => setTimeout(r, 400));
    }
    setActiveNode(null);
    setDoneNodes(new Set([1, 2, 3, 4, 5, 6]));
  }

  function reset() {
    setActiveNode(null);
    setDoneNodes(new Set());
  }

  useImperativeHandle(ref, () => ({ animate, reset }));

  return (
    <div className="pipeline">
      {NODES.map((node, idx) => (
        <React.Fragment key={node.id}>
          <div className="p-node">
            <div className={`p-node-box ${activeNode === node.id ? 'active-node' : ''} ${doneNodes.has(node.id) ? 'done-node' : ''}`}>
              <div className="p-node-icon">
              <img src={`/images/${node.icon}`} alt={node.label} width="20" height="20" style={{ filter: 'invert(1)' }} />
            </div>
              <div className="p-node-label">{node.label}</div>
            </div>
          </div>
          {idx < NODES.length - 1 && <div className="p-arrow" />}
        </React.Fragment>
      ))}
    </div>
  );
});

Pipeline.displayName = 'Pipeline';
export default Pipeline;
