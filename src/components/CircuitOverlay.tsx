import React, { useState, useEffect, useRef } from 'react';
import { useScrollProgress } from '../hooks/useScrollProgress';
import '../styles/CircuitOverlay.css';

interface CircuitOverlayProps {
  onMenuClick?: (id: string) => void;
}

// Koordinaten im SVG-viewBox (0 0 1920 1080) — jeweils der innere Endpunkt
// (näher zur Bildschirmmitte) des zugehörigen pcb-track-Pfades.
const menuItems = [
  { id: 'system', label: 'SYSTEM STATUS', vx: 614, vy: 238 },   // oben links
  { id: 'neural', label: 'NEURAL MAPPING', vx: 1306, vy: 238 }, // oben rechts
  { id: 'network', label: 'NETWORK', vx: 580, vy: 780 },       // bisherige DIAGNOSTICS-Position
  { id: 'soul', label: 'INJECT SOUL', vx: 960, vy: 440 },       // höher als Mitte, Label darüber
  { id: 'streams', label: 'DATA STREAMS', vx: 1550, vy: 518 },  // mitte rechts
  { id: 'diag', label: 'DIAGNOSTICS', vx: 370, vy: 518 },         // bisherige MODULE-A/B-Position
  { id: 'secrets', label: 'SECRETS', vx: 1340, vy: 780 },       // unten rechts
];

const VIEWBOX_W = 1920;
const VIEWBOX_H = 1080;

// Zeit, die nach dem Erreichen der Trigger-Schwelle gewartet wird,
// bevor das Circuit-Menü einblendet — sorgt für spürbaren Verzögerungseffekt
// gegenüber dem EndSplash (der bei derselben Schwelle triggert).
const REVEAL_DELAY_MS = 1100;

export default function CircuitOverlay({ onMenuClick }: CircuitOverlayProps) {
  const scrollProgress = useScrollProgress();
  const [isMobile, setIsMobile] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const checkViewport = () => {
      setIsMobile(window.innerWidth <= 768);
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  const triggerThreshold = 0.85;
  const inZone = scrollProgress >= triggerThreshold;

  useEffect(() => {
    if (inZone) {
      if (timerRef.current === null) {
        timerRef.current = window.setTimeout(() => {
          setReady(true);
          timerRef.current = null;
        }, REVEAL_DELAY_MS);
      }
    } else {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setReady(false);
    }
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [inZone]);

  if (!inZone) return null;

  // Rechnet einen viewBox-Punkt in eine Bildschirm-Pixelposition um, unter
  // Berücksichtigung des SVG-Letterboxings (preserveAspectRatio "xMidYMid meet"),
  // damit der Dot exakt am inneren Ende des jeweiligen PCB-Tracks landet.
  const getNodeStyle = (index: number): React.CSSProperties => {
    if (isMobile) {
      return { width: '100%', padding: '8px 12px', boxSizing: 'border-box' };
    }
    const { width, height } = viewport;
    if (!width || !height) return { top: '-9999px', left: '-9999px' };

    const scale = Math.min(width / VIEWBOX_W, height / VIEWBOX_H);
    const offsetX = (width - VIEWBOX_W * scale) / 2;
    const offsetY = (height - VIEWBOX_H * scale) / 2;
    const item = menuItems[index];
    return {
      left: `${offsetX + item.vx * scale}px`,
      top: `${offsetY + item.vy * scale}px`,
    };
  };

  const isHexLeft = (index: number): boolean => menuItems[index].vx < VIEWBOX_W / 2;

  return (
    <div
      className={`circuit-container ${ready ? 'visible' : ''}`}
      style={
        {
          '--scroll-light': 0.15 + scrollProgress * 0.85,
        } as React.CSSProperties
      }
    >
      <svg
        className="circuit-svg"
        style={{ opacity: 0.15 + scrollProgress * 0.85 }}
        viewBox="0 0 1920 1080"
      >
        <g className="pulsing-group">
          <rect x="120" y="150" width="100" height="60" className="pcb-chip" />
          <rect x="1700" y="150" width="100" height="60" className="pcb-chip" />
          <rect x="80" y="700" width="80" height="80" className="pcb-chip" />
          <rect x="1760" y="700" width="80" height="80" className="pcb-chip" />

          <circle cx="100" cy="250" r="3" className="pcb-pad" />
          <circle cx="115" cy="250" r="3" className="pcb-pad" />
          <circle cx="130" cy="250" r="3" className="pcb-pad" />
          <circle cx="1820" cy="250" r="3" className="pcb-pad" />
          <circle cx="1805" cy="250" r="3" className="pcb-pad" />
          <circle cx="1790" cy="250" r="3" className="pcb-pad" />

          <path className="pcb-track-sub" d="M 50,100 L 200,100 L 250,150 L 400,150 L 450,200" />
          <path className="pcb-track-sub" d="M 1870,100 L 1720,100 L 1670,150 L 1520,150 L 1470,200" />
          <path className="pcb-track-sub" d="M 80,350 L 150,350 L 180,320 L 300,320" />
          <path className="pcb-track-sub" d="M 1840,350 L 1770,350 L 1740,320 L 1620,320" />
          <path className="pcb-track-sub" d="M 100,850 L 250,850 L 300,900 L 500,900" />
          <path className="pcb-track-sub" d="M 1820,850 L 1670,850 L 1620,900 L 1420,900" />
        </g>

        <g className="pulsing-group">
          <path className="pcb-track" d="M 614,238 L 540,238 L 500,190 L 380,190 L 320,250 L 220,250" />
          <path className="pcb-track-sub" d="M 540,238 L 520,260 L 480,260" />
          <path className="pcb-track" d="M 1306,238 L 1380,238 L 1420,190 L 1540,190 L 1600,250 L 1700,250" />
          <path className="pcb-track-sub" d="M 1380,238 L 1400,260 L 1440,260" />
          <path className="pcb-track" d="M 370,518 L 300,518 L 260,460 L 180,460 L 140,500" />
          <path className="pcb-track-sub" d="M 300,518 L 270,550 L 200,550" />
          <path className="pcb-track" d="M 1550,518 L 1620,518 L 1660,460 L 1740,460 L 1780,500" />
          <path className="pcb-track-sub" d="M 1620,518 L 1650,550 L 1720,550" />
          <path className="pcb-track" d="M 580,780 L 500,780 L 440,840 L 320,840 L 260,780" />
          <path className="pcb-track-sub" d="M 500,780 L 470,750 L 380,750" />
          <path className="pcb-track" d="M 1340,780 L 1420,780 L 1480,840 L 1600,840 L 1660,780" />
          <path className="pcb-track-sub" d="M 1420,780 L 1450,750 L 1540,750" />

          {/* INJECT SOUL — dezente, symmetrische Zuleitung zur Bildschirmmitte */}
          <path className="pcb-track-soul" d="M 960,540 L 960,460 L 900,410 L 820,410" />
          <path className="pcb-track-soul" d="M 960,540 L 960,460 L 1020,410 L 1100,410" />
          <path className="pcb-track-soul" d="M 960,540 L 960,620 L 900,670 L 820,670" />
          <path className="pcb-track-soul" d="M 960,540 L 960,620 L 1020,670 L 1100,670" />
          <circle cx="820" cy="410" r="2.5" className="pcb-pad-soul" />
          <circle cx="1100" cy="410" r="2.5" className="pcb-pad-soul" />
          <circle cx="820" cy="670" r="2.5" className="pcb-pad-soul" />
          <circle cx="1100" cy="670" r="2.5" className="pcb-pad-soul" />
          <circle cx="960" cy="540" r="46" className="pcb-vignette-soul" />
          <circle cx="960" cy="540" r="64" className="pcb-vignette-soul" />
        </g>
      </svg>

      {isMobile && (
        <button
          type="button"
          className={`circuit-mobile-toggle ${mobileMenuOpen ? 'open' : ''}`}
          onClick={() => setMobileMenuOpen((o) => !o)}
          aria-label={mobileMenuOpen ? 'Menü schließen' : 'Menü öffnen'}
        >
          <span />
          <span />
          <span />
        </button>
      )}

      <div
        className={`menu-nodes-container ${isMobile ? 'mobile' : ''} ${
          isMobile && mobileMenuOpen ? 'open' : ''
        }`}
      >
        {menuItems.map((item, index) => (
          <div
            key={item.id}
            data-soul={item.id === 'soul' ? 'true' : undefined}
            className={`menu-node ${!isMobile && isHexLeft(index) ? 'hex-left' : ''}`}
            style={getNodeStyle(index)}
            onClick={() => {
              onMenuClick?.(item.id);
              if (isMobile) setMobileMenuOpen(false);
            }}
          >
            <div className="node-dot" />
            <span className="node-label">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
