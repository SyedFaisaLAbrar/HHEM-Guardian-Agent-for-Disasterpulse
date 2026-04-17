'use client';
import React, { useImperativeHandle, forwardRef, useState } from 'react';

const NODES = [
  { id: 1, icon: 'data-classification.png', label: 'Classify' },
  { id: 2, icon: 'location-pin.png', label: 'Location' },
  { id: 3, icon: 'database.png', label: 'RAG' },
  { id: 4, icon: 'arrows.png', label: 'Router' },
  { id: 5, icon: 'ai.png', label: 'MULTIMODAL' },
  { id: 6, icon: 'shield-check.png', label: 'HHEM' },
  { id: 7, icon: 'file.png', label: 'Report' },
];

export interface PipelineHandle {
  animate: () => Promise<void>;
  reset: () => void;
  completeReport: () => Promise<void>;
}

const Pipeline = forwardRef<PipelineHandle>((_, ref) => {
  const [activeNode, setActiveNode]  = useState<number | null>(null);
  const [doneNodes, setDoneNodes]    = useState<Set<number>>(new Set());

  async function animate() {
    setActiveNode(null);
    setDoneNodes(new Set());
    // Animate through nodes 1-6 (stops at HHEM node 6) and PAUSE there
    for (let i = 1; i <= 6; i++) {
      setActiveNode(i);
      if (i > 1) setDoneNodes(prev => new Set([...prev, i - 1]));
      await new Promise(r => setTimeout(r, 400));
    }
    // Stop at HHEM (node 6) - keep it active until report arrives
    setActiveNode(6);
  }

  async function completeReport() {
    // Called after report API returns - complete nodes 1-6 and move to final Report (node 7)
    setDoneNodes(new Set([1, 2, 3, 4, 5, 6]));
    setActiveNode(7);
    await new Promise(r => setTimeout(r, 400));
    setDoneNodes(new Set([1, 2, 3, 4, 5, 6, 7]));
    setActiveNode(null);
  }

  function reset() {
    setActiveNode(null);
    setDoneNodes(new Set());
  }

  useImperativeHandle(ref, () => ({ animate, reset, completeReport }));

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
