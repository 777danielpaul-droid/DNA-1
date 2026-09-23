import React from 'react';
import '../styles/PanelCircuitGlow.css';

/**
 * Wiederverwendbares Leucht-Circuit-Muster für Untermenü-Panels
 * (ModelWindow, SystemStatusPanel, InjectSoulCard, DataStreamSoul,
 * InvoiceScanner). Nutzt dieselben pcb-track/pcb-track-sub/pcb-pad/
 * pcb-chip-Klassen und denselben pulseGlow-Effekt wie das Haupt-
 * Circuit-Menü (CircuitOverlay.css) — dadurch strahlen alle Panels
 * im selben auffälligen Leuchtdesign wie der Hauptmenü-Splash.
 *
 * Wird als erstes Kind direkt in den Panel-Container gerendert und
 * liegt dank normaler DOM-Stacking-Reihenfolge automatisch hinter
 * dem restlichen (später im DOM stehenden) Inhalt.
 */
export default function PanelCircuitGlow() {
  return (
    <svg
      className="panel-circuit-glow"
      viewBox="0 0 1000 600"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g className="pulsing-group">
        {/* oben links */}
        <path className="pcb-track" d="M 0,64 L 92,64 L 122,94 L 224,94 L 254,124 L 254,190" />
        <path className="pcb-track-sub" d="M 92,64 L 92,32 L 150,32" />
        <path className="pcb-track-sub" d="M 224,94 L 256,62 L 312,62" />
        <rect x="8" y="10" width="48" height="28" rx="2" className="pcb-chip" />
        <circle cx="8" cy="64" r="2.6" className="pcb-pad" />
        <circle cx="150" cy="32" r="2.6" className="pcb-pad" />
        <circle cx="312" cy="62" r="2.6" className="pcb-pad" />

        {/* oben rechts */}
        <path className="pcb-track" d="M 1000,64 L 908,64 L 878,94 L 776,94 L 746,124 L 746,190" />
        <path className="pcb-track-sub" d="M 908,64 L 908,32 L 850,32" />
        <path className="pcb-track-sub" d="M 776,94 L 744,62 L 688,62" />
        <rect x="944" y="10" width="48" height="28" rx="2" className="pcb-chip" />
        <circle cx="992" cy="64" r="2.6" className="pcb-pad" />
        <circle cx="850" cy="32" r="2.6" className="pcb-pad" />
        <circle cx="688" cy="62" r="2.6" className="pcb-pad" />

        {/* unten links */}
        <path className="pcb-track" d="M 0,536 L 92,536 L 122,506 L 224,506 L 254,476 L 254,410" />
        <path className="pcb-track-sub" d="M 92,536 L 92,568 L 150,568" />
        <circle cx="8" cy="536" r="2.6" className="pcb-pad" />
        <circle cx="150" cy="568" r="2.6" className="pcb-pad" />

        {/* unten rechts */}
        <path className="pcb-track" d="M 1000,536 L 908,536 L 878,506 L 776,506 L 746,476 L 746,410" />
        <path className="pcb-track-sub" d="M 908,536 L 908,568 L 850,568" />
        <rect x="944" y="562" width="48" height="28" rx="2" className="pcb-chip" />
        <circle cx="992" cy="536" r="2.6" className="pcb-pad" />
        <circle cx="850" cy="568" r="2.6" className="pcb-pad" />
      </g>
    </svg>
  );
}
