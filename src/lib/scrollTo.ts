// src/lib/scrollTo.ts
// Sanftes, programmatisches Scrollen zu einem bestimmten ScrollProgress-Wert
// (0..1), passend zur Berechnung in useScrollProgress (progress = scrollY / maxScroll).
// Wird für den Chill-Modus-Trigger gebraucht, um die Seite nach Ende des
// Secrets-Videos ruhig auf ScrollProgress 0.71 zurückzuspulen/anzusteuern.

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Scrollt sanft zum übergebenen ScrollProgress (0..1) und löst das
 * zurückgegebene Promise auf, sobald die Animation abgeschlossen ist.
 * Läuft komplett über requestAnimationFrame (kein CSS-`scroll-behavior`),
 * damit die Dauer exakt steuerbar ist und useScrollProgress währenddessen
 * ganz normal live mitläuft.
 */
export function smoothScrollToProgress(progress: number, duration = 1800): Promise<void> {
  return new Promise((resolve) => {
    const doc = document.documentElement;
    const maxScroll = doc.scrollHeight - window.innerHeight;
    if (maxScroll <= 0) {
      resolve();
      return;
    }
    const target = Math.max(0, Math.min(maxScroll, progress * maxScroll));
    const start = window.scrollY;
    const distance = target - start;
    if (Math.abs(distance) < 1) {
      resolve();
      return;
    }
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      window.scrollTo(0, start + distance * easeInOutCubic(t));
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}
