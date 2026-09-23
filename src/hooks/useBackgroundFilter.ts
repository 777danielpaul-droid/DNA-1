import { useCallback, useEffect, useState } from 'react';

export interface BackgroundFilterState {
  hue: number; // 0–360, Hue-Rotate in Grad
  duotone: number; // 0–100, Mischstärke Richtung Duoton (Akzentfarbe + Schwarz)
  invert: boolean; // zusätzlicher Kombi-Effekt, kein Solo-Regler
}

const STORAGE_KEY = 'dna-legal-bg-filter';
const DEFAULT_STATE: BackgroundFilterState = { hue: 0, duotone: 0, invert: false };

function loadStored(): BackgroundFilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return {
      hue: typeof parsed.hue === 'number' ? ((parsed.hue % 360) + 360) % 360 : 0,
      duotone: typeof parsed.duotone === 'number' ? Math.max(0, Math.min(100, parsed.duotone)) : 0,
      invert: !!parsed.invert,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function buildFilterCss(state: BackgroundFilterState): string {
  return (
    [
      state.invert ? 'invert(1)' : '',
      `hue-rotate(${state.hue}deg)`,
      state.duotone > 0
        ? `grayscale(${state.duotone / 100}) contrast(${1 + (state.duotone / 100) * 0.15})`
        : '',
    ]
      .filter(Boolean)
      .join(' ') || 'none'
  );
}

/**
 * Verwaltet die Hintergrundbild-Farbmanipulation (BackgroundSplash + EndSplash).
 * Drei kombinierbare Regler statt einem stumpfen Invert-Knopf:
 *
 * - hue: dreht alle Farbtöne im Bild kontinuierlich durch (CSS hue-rotate).
 * - duotone: blendet das Bild zu einem Zwei-Ton-Look Richtung aktueller
 *   Akzentfarbe (+ Schwarz) über — Spotify-Poster-Ästhetik, verbindet das
 *   Hintergrundbild direkt mit dem gewählten UI-Theme.
 * - invert: klassische Invertierung als zusätzlicher Kombi-Effekt — erst
 *   zusammen mit Hue-Rotate ergeben sich interessante "Thermal"-Looks statt
 *   der öden reinen Umkehrung.
 *
 * Schreibt die berechneten Werte als CSS-Variablen (--bg-filter,
 * --bg-duotone-opacity) direkt auf <html> — exakt dasselbe Prinzip wie
 * useUiTheme bei den Akzentfarben. Dadurch reicht es, wenn irgendeine
 * gemountete Instanz dieses Hooks (aktuell: beide SystemStatusPanel-Tabs)
 * den Wert schreibt; BackgroundSplash/EndSplash lesen ihn rein über CSS
 * (var(--bg-filter)) und müssen den Hook selbst nicht kennen — kein
 * Prop-Drilling nötig, Änderungen wirken sofort ohne Reload.
 */
export function useBackgroundFilter() {
  const [state, setState] = useState<BackgroundFilterState>(() => loadStored());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const root = document.documentElement.style;
    root.setProperty('--bg-filter', buildFilterCss(state));
    root.setProperty('--bg-duotone-opacity', String(state.duotone / 100));
  }, [state]);

  const setHue = useCallback((hue: number) => {
    setState((prev) => ({ ...prev, hue: ((hue % 360) + 360) % 360 }));
  }, []);

  const setDuotone = useCallback((duotone: number) => {
    setState((prev) => ({ ...prev, duotone: Math.max(0, Math.min(100, duotone)) }));
  }, []);

  const setInvert = useCallback((invert: boolean) => {
    setState((prev) => ({ ...prev, invert }));
  }, []);

  const reset = useCallback(() => setState(DEFAULT_STATE), []);

  return { ...state, setHue, setDuotone, setInvert, reset };
}
