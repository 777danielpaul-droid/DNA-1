import { useCallback, useEffect, useState } from 'react';

export type AccentTheme = 'violet' | 'cyan' | 'crimson' | 'emerald' | 'amber' | 'white' | 'black' | 'custom';

export const ACCENT_THEMES: { id: AccentTheme; label: string; swatch: string }[] = [
  { id: 'violet', label: 'Void Violet', swatch: '#a855f7' },
  { id: 'cyan', label: 'Arctic Cyan', swatch: '#22d3ee' },
  { id: 'crimson', label: 'Crimson Pulse', swatch: '#f43f5e' },
  { id: 'emerald', label: 'Toxic Emerald', swatch: '#34d399' },
  { id: 'amber', label: 'Solar Amber', swatch: '#f59e0b' },
  { id: 'white', label: 'Ghost White', swatch: '#f8fafc' },
  { id: 'black', label: 'Obsidian Black', swatch: '#52525b' },
];

const STORAGE_KEY = 'dna-legal-accent-theme';
const CUSTOM_COLOR_KEY = 'dna-legal-accent-custom-color';
const DEFAULT_CUSTOM_COLOR = '#38bdf8';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function normalizeHex(value: string): string | null {
  const v = value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`;
  return HEX_RE.test(v) ? v.toLowerCase() : null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

// Mischt die Basisfarbe mit Weiß, um die helleren Abstufungen
// (--accent-light/-pale/-pale-2) zu erzeugen, die sonst pro Preset-Theme
// von Hand in index.css definiert sind.
function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const mix = (channel: number) => channel + (255 - channel) * amount;
  return rgbToHex(mix(r), mix(g), mix(b));
}

function buildCustomPalette(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return {
    accent: hex,
    accentRgb: `${r}, ${g}, ${b}`,
    accentLight: lighten(hex, 0.3),
    accentPale: lighten(hex, 0.72),
    accentPale2: lighten(hex, 0.88),
  };
}

function loadStoredTheme(): AccentTheme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'custom' || ACCENT_THEMES.some((t) => t.id === stored)) {
    return stored as AccentTheme;
  }
  return 'violet';
}

function loadStoredCustomColor(): string {
  const stored = localStorage.getItem(CUSTOM_COLOR_KEY);
  return (stored && normalizeHex(stored)) || DEFAULT_CUSTOM_COLOR;
}

/**
 * Verwaltet das Akzentfarben-Theme (Rahmen, Glows, Labels im gesamten UI).
 * Setzt data-accent-theme auf <html> — alle Farben in den CSS-Dateien
 * referenzieren --accent/--accent-rgb/--accent-light/--accent-pale(-2),
 * die je nach Theme in index.css umdefiniert werden.
 *
 * Theme "custom": statt einer festen index.css-Regel werden die Variablen
 * hier zur Laufzeit direkt als Inline-Style auf <html> gesetzt — Inline-
 * Styles gewinnen immer gegen Stylesheet-Regeln auf demselben Element,
 * überschreiben also zuverlässig jedes Preset-Theme, ohne dass index.css
 * angefasst werden muss.
 */
export function useUiTheme() {
  const [accentTheme, setAccentThemeState] = useState<AccentTheme>(() => loadStoredTheme());
  const [customColor, setCustomColorState] = useState<string>(() => loadStoredCustomColor());

  useEffect(() => {
    document.documentElement.setAttribute('data-accent-theme', accentTheme);
    const rootStyle = document.documentElement.style;
    if (accentTheme === 'custom') {
      const palette = buildCustomPalette(customColor);
      rootStyle.setProperty('--accent', palette.accent);
      rootStyle.setProperty('--accent-rgb', palette.accentRgb);
      rootStyle.setProperty('--accent-light', palette.accentLight);
      rootStyle.setProperty('--accent-pale', palette.accentPale);
      rootStyle.setProperty('--accent-pale-2', palette.accentPale2);
    } else {
      rootStyle.removeProperty('--accent');
      rootStyle.removeProperty('--accent-rgb');
      rootStyle.removeProperty('--accent-light');
      rootStyle.removeProperty('--accent-pale');
      rootStyle.removeProperty('--accent-pale-2');
    }
  }, [accentTheme, customColor]);

  const setAccentTheme = useCallback((theme: AccentTheme) => {
    localStorage.setItem(STORAGE_KEY, theme);
    setAccentThemeState(theme);
  }, []);

  // Setzt gleichzeitig die eigene Farbe UND aktiviert das custom-Theme —
  // beim Ändern des Farbwählers soll man den Effekt sofort sehen, ohne
  // separat auf einen "Custom"-Swatch klicken zu müssen.
  const setCustomColor = useCallback((value: string) => {
    const hex = normalizeHex(value);
    if (!hex) return;
    localStorage.setItem(CUSTOM_COLOR_KEY, hex);
    localStorage.setItem(STORAGE_KEY, 'custom');
    setCustomColorState(hex);
    setAccentThemeState('custom');
  }, []);

  const cycleAccentTheme = useCallback(() => {
    setAccentThemeState((prev) => {
      const idx = ACCENT_THEMES.findIndex((t) => t.id === prev);
      // Fällt "custom" gerade an (idx === -1), geht's beim Durchklicken
      // wieder vorne bei den Presets los.
      const next = ACCENT_THEMES[(idx + 1) % ACCENT_THEMES.length].id;
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { accentTheme, setAccentTheme, cycleAccentTheme, customColor, setCustomColor };
}
