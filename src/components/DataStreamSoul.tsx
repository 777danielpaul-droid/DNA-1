import React, { useEffect } from 'react';
import '../styles/DataStreamSoul.css';
import PanelCircuitGlow from './PanelCircuitGlow';

interface DataStreamSoulProps {
  open: boolean;
  onClose: () => void;
  onAskViaBridge?: (question: string) => void;
}

export default function DataStreamSoul({ open, onClose }: DataStreamSoulProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="model-window-overlay data-stream-soul" onClick={onClose}>
      <div className="model-window-panel data-stream-card" onClick={(e) => e.stopPropagation()}>
        <PanelCircuitGlow />
        <div className="model-window-header">
          <span className="model-window-title">DATA STREAMS</span>
          <button type="button" className="model-window-close" onClick={onClose} aria-label="Schließen">×</button>
        </div>
        <div className="model-window-body data-stream-empty-body">
          <div className="data-stream-empty">
            <div className="data-stream-empty-mark">◈</div>
            <div className="data-stream-empty-title">DATA STREAMS</div>
            <div className="data-stream-empty-text">Dieser Bereich ist vorerst leer.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
