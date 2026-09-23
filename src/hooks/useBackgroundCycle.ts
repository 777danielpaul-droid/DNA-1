import { useCallback, useEffect, useState } from 'react';

/**
 * Hintergrundbilder pro Modus (dark/light) und Einsatzort. Weitere Bilder
 * später einfach hier ergänzen (Datei nach /public legen, Pfad eintragen) —
 * die Durchschalten-Funktion (BurgerMenu) und der Index-Speicher
 * funktionieren dann automatisch mit beliebig vielen Bildern.
 */
export type BackgroundKind = 'intro' | 'splash';

export const BACKGROUND_SETS: Record<BackgroundKind, Record<'dark' | 'light', string[]>> = {
  intro: {
    dark: ['/bg-dark.jpg'],
    light: ['/bg-light.jpg'],
  },
  splash: {
    // Index 0 = original splash, Index 1 = neues Cyber-Brain-End-Splash
    dark: ['/splash-dark.jpg', '/splash-end-dark.jpg'],
    light: ['/splash-light.jpg', '/splash-end-light.jpg'],
  },
};

const STORAGE_KEY_PREFIX = 'dna-legal-bg-index';
const BACKGROUND_CHANGE_EVENT = 'dna-legal-background-changed';

/**
 * Standard-Startindex pro (kind + theme). Dark-Mode-Splash startet auf 1
 * (Cyber-Brain), Light bleibt auf 0, Intro immer auf 0.
 */
const DEFAULT_INDEX: Record<BackgroundKind, Record<'dark' | 'light', number>> = {
  intro: { dark: 0, light: 0 },
  splash: { dark: 1, light: 0 },
};

function loadStoredIndex(kind: BackgroundKind, isDark: boolean): number {
  const theme = isDark ? 'dark' : 'light';
  const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}-${kind}-${theme}`);
  if (stored === null) {
    // Noch nie für dieses Theme gewählt → verwende Default
    return DEFAULT_INDEX[kind][theme] ?? 0;
  }
  const n = parseInt(stored, 10);
  const set = BACKGROUND_SETS[kind][theme];
  return set.length > 0 ? Math.max(0, n % set.length) : 0;
}

/**
 * Verwaltet den aktuell gewählten Hintergrund-Index für einen Bild-Slot
 * (intro-Hintergrund oder End-Splash), getrennt pro dark/light-Theme.
 * Der Index wird pro (kind + theme) im localStorage persistiert, damit
 * ein Theme-Wechsel das andere Theme-Bild nicht überschreibt.
 */
export function useBackgroundCycle(kind: BackgroundKind, isDark: boolean) {
  const [index, setIndex] = useState<number>(() => loadStoredIndex(kind, isDark));

  useEffect(() => {
    // Wenn sich das Theme ändert: Index neu aus localStorage laden
    // (damit dark/light jeweils ihr eigenes persistedes Bild haben)
    setIndex(loadStoredIndex(kind, isDark));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]);

  useEffect(() => {
    const theme = isDark ? 'dark' : 'light';
    localStorage.setItem(`${STORAGE_KEY_PREFIX}-${kind}-${theme}`, String(index));
    window.dispatchEvent(
      new CustomEvent(BACKGROUND_CHANGE_EVENT, { detail: { kind, theme, index } })
    );
  }, [index, kind, isDark]);

  // Mehrere Komponenten zeigen denselben Bild-Slot (z. B. Status-Steuerung
  // und EndSplash). Änderungen müssen daher auch zwischen Hook-Instanzen
  // sofort sichtbar werden, nicht erst nach einem Theme-Wechsel.
  useEffect(() => {
    const theme = isDark ? 'dark' : 'light';
    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: BackgroundKind; theme: string; index: number }>).detail;
      if (detail?.kind === kind && detail.theme === theme) setIndex(detail.index);
    };
    window.addEventListener(BACKGROUND_CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(BACKGROUND_CHANGE_EVENT, handleChange);
  }, [kind, isDark]);

  const set = BACKGROUND_SETS[kind][isDark ? 'dark' : 'light'];
  const safeIndex = set.length > 0 ? index % set.length : 0;
  const currentImage = set[safeIndex] ?? set[0];

  const next = useCallback(() => {
    setIndex((prev) => prev + 1);
  }, []);

  const prev = useCallback(() => {
    setIndex((p) => (p - 1 + set.length) % set.length || 0);
  }, [set.length]);

  return { currentImage, index: safeIndex, count: set.length, next, prev };
}
