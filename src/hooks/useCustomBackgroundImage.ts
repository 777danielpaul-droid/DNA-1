import { useCallback, useEffect, useState } from 'react';
import type { BackgroundKind } from './useBackgroundCycle';

const STORAGE_KEY_PREFIX = 'dna-legal-custom-bg';
const CUSTOM_BG_CHANGE_EVENT = 'dna-legal-custom-background-changed';

function storageKey(kind: BackgroundKind, isDark: boolean): string {
  return `${STORAGE_KEY_PREFIX}-${kind}-${isDark ? 'dark' : 'light'}`;
}

function loadStored(kind: BackgroundKind, isDark: boolean): string | null {
  try {
    return localStorage.getItem(storageKey(kind, isDark));
  } catch {
    return null;
  }
}

/**
 * Eigene, vom Nutzer hochgeladene Hintergrundbilder — pro Slot (intro/splash)
 * und Theme (dark/light) getrennt, genau wie useBackgroundCycle. Liegt als
 * Data-URL im localStorage. Ist ein eigenes Bild gesetzt, hat es in
 * BackgroundSplash/EndSplash Vorrang vor dem eingebauten Bilder-Zyklus.
 *
 * Gleiches Cross-Instanz-Sync-Prinzip wie useBackgroundCycle (CustomEvent),
 * damit z. B. Styling-Panel und der tatsächliche Hintergrund sofort
 * konsistent bleiben, ohne Prop-Drilling.
 */
export function useCustomBackgroundImage(kind: BackgroundKind, isDark: boolean) {
  const [customImage, setCustomImageState] = useState<string | null>(() => loadStored(kind, isDark));

  useEffect(() => {
    setCustomImageState(loadStored(kind, isDark));
  }, [kind, isDark]);

  useEffect(() => {
    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: BackgroundKind; isDark: boolean; image: string | null }>).detail;
      if (detail?.kind === kind && detail.isDark === isDark) setCustomImageState(detail.image);
    };
    window.addEventListener(CUSTOM_BG_CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(CUSTOM_BG_CHANGE_EVENT, handleChange);
  }, [kind, isDark]);

  const setCustomImage = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : null;
        if (!dataUrl) return;
        try {
          localStorage.setItem(storageKey(kind, isDark), dataUrl);
        } catch {
          // Bild zu groß fürs localStorage-Kontingent — Zustand trotzdem
          // für die laufende Sitzung übernehmen, nur ohne Persistenz.
        }
        setCustomImageState(dataUrl);
        window.dispatchEvent(
          new CustomEvent(CUSTOM_BG_CHANGE_EVENT, { detail: { kind, isDark, image: dataUrl } })
        );
      };
      reader.readAsDataURL(file);
    },
    [kind, isDark]
  );

  const clearCustomImage = useCallback(() => {
    try {
      localStorage.removeItem(storageKey(kind, isDark));
    } catch {
      // ignore
    }
    setCustomImageState(null);
    window.dispatchEvent(
      new CustomEvent(CUSTOM_BG_CHANGE_EVENT, { detail: { kind, isDark, image: null } })
    );
  }, [kind, isDark]);

  return { customImage, setCustomImage, clearCustomImage };
}
