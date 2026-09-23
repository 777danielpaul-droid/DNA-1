import React, { useRef } from 'react';
import { useScrollProgress } from '../hooks/useScrollProgress';

interface Sequence {
  num: string;
  title: string;
  text: string;
}

const SEQUENCES: Sequence[] = [
  { num: 'Sequenz//01', title: '', text: '' },
  { num: 'Sequenz//02', title: '', text: '' },
  { num: 'Sequenz//03', title: '', text: '' },
  { num: 'Sequenz//04', title: '', text: '' },
  { num: 'Sequenz//05', title: '', text: '' },
];

// Dieselben Zeitfenster, die zuvor DnaScene.tsx per DOM-Klasse ('.active')
// auf 6 einzelnen Info-Boxen umgeschaltet hat — jetzt direkt aus
// scrollProgress abgeleitet, treibt ein einziges Element an statt sechs.
function getActiveIndex(progress: number): number {
  for (let i = 0; i < SEQUENCES.length; i++) {
    const start = 0.08 + i * 0.11;
    const end = start + 0.1;
    if (progress > start && progress < end) return i;
  }
  return -1;
}

// PCB-Motiv (viewBox 0 0 200 140): ein dichtes Stück Leiterplatte mit
// Traces, Pads und einem Chip — dieselben CSS-Klassen (pcb-track,
// pcb-track-sub, pcb-pad, pcb-chip) wie im echten Circuit-Menü
// (CircuitOverlay.css), damit es optisch identisch wirkt.
const TRACKS = [
  'M0,20 L40,20 L52,32 L100,32',
  'M100,32 L100,10',
  'M0,60 L24,60 L24,100 L60,100',
  'M60,100 L60,130',
  'M200,90 L160,90 L148,78 L110,78',
  'M110,78 L110,50',
  'M200,50 L176,50 L176,20',
];
const TRACKS_SUB = [
  'M40,20 L40,4',
  'M24,60 L4,60',
  'M148,78 L148,110 L120,110',
  'M176,20 L152,20',
];
const PADS = [
  { cx: 0, cy: 20, r: 2.4 }, { cx: 100, cy: 10, r: 2.4 },
  { cx: 0, cy: 60, r: 2.4 }, { cx: 60, cy: 130, r: 2.4 },
  { cx: 200, cy: 90, r: 2.4 }, { cx: 110, cy: 50, r: 2.4 },
  { cx: 200, cy: 50, r: 2.4 }, { cx: 176, cy: 20, r: 2.4 },
];
const CHIPS = [
  { x: 78, y: 55, w: 44, h: 22 },
];

function CircuitArt({ variant }: { variant: 'base' | 'highlight' }) {
  const trackCls = variant === 'base' ? 'pcb-track' : 'pcb-track pcb-track-hl';
  const subCls = variant === 'base' ? 'pcb-track-sub' : 'pcb-track-sub pcb-track-sub-hl';
  const padCls = variant === 'base' ? 'pcb-pad' : 'pcb-pad pcb-pad-hl';
  const chipCls = variant === 'base' ? 'pcb-chip' : 'pcb-chip pcb-chip-hl';
  return (
    <svg
      className={`info-node-circuit ${variant === 'base' ? 'info-node-circuit-base' : 'info-node-circuit-highlight'}`}
      viewBox="0 0 200 140"
      preserveAspectRatio="none"
    >
      <g className="pulsing-group">
        {TRACKS.map((d, i) => (
          <path key={`t${i}`} className={trackCls} d={d} pathLength={100} style={{ animationDelay: `${i * 0.06}s` }} />
        ))}
        {TRACKS_SUB.map((d, i) => (
          <path key={`s${i}`} className={subCls} d={d} pathLength={100} style={{ animationDelay: `${0.3 + i * 0.06}s` }} />
        ))}
        {CHIPS.map((c, i) => (
          <rect key={`c${i}`} className={chipCls} x={c.x} y={c.y} width={c.w} height={c.h} rx={2} pathLength={100} />
        ))}
        {PADS.map((p, i) => (
          <circle key={`p${i}`} className={padCls} cx={p.cx} cy={p.cy} r={p.r} style={{ animationDelay: `${0.5 + i * 0.05}s` }} />
        ))}
      </g>
    </svg>
  );
}

export default function InfoCircuitNode() {
  const scrollProgress = useScrollProgress();
  const activeIndex = getActiveIndex(scrollProgress);
  const seq = activeIndex >= 0 ? SEQUENCES[activeIndex] : null;
  // Wechselt wie vorher bei den Karten: gerade Sequenzen links, ungerade rechts
  const isLeft = activeIndex % 2 === 0;

  // rAF-gedrosseltes Pointer-Tracking für den lokalen Hover-Glow —
  // reine Style-Mutation, kein React-Re-Render.
  const rafPending = useRef(false);
  const pendingPos = useRef({ x: 50, y: 50 });
  const handlePointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    pendingPos.current = {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      el.style.setProperty('--mx', `${pendingPos.current.x}%`);
      el.style.setProperty('--my', `${pendingPos.current.y}%`);
    });
  };

  return (
    <div className={`info-node ${seq ? 'visible' : ''} ${isLeft ? 'info-left' : 'info-right'}`}>
      {seq && (
        <div key={activeIndex} className="info-node-inner" onMouseMove={handlePointerMove}>
          <CircuitArt variant="base" />
          <CircuitArt variant="highlight" />
          <div className="info-node-text">
            <span>{seq.num}</span>
            <h3>{seq.title}</h3>
            <p>{seq.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}
