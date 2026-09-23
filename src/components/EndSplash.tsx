import React, { CSSProperties, useEffect, useState } from 'react';
import { useScrollProgress } from '../hooks/useScrollProgress';
import { useBackgroundCycle } from '../hooks/useBackgroundCycle';
import { useCustomBackgroundImage } from '../hooks/useCustomBackgroundImage';

/**
 * EndSplash — zeigt ein Fullscreen-Hintergrundsbild an,
 * wenn der Benutzer >85% des Scrollbereichs erreicht hat.
 * Das Bild ist theme-abhängig (dark/light) und per localStorage
 * persistiert — wechselt man zwischen Dark/Light, bleibt jedes
 * Theme auf dem zuletzt gewählten Bild.
 */
interface EndSplashProps {
  isDark?: boolean;
}

export default function EndSplash({ isDark = true }: EndSplashProps) {
  const showSplash = useScrollProgress() > 0.85;
  const [isMobile, setIsMobile] = useState(false);
  const { currentImage: cycleImage } = useBackgroundCycle('splash', isDark);
  const { customImage } = useCustomBackgroundImage('splash', isDark);
  const currentImage = customImage || cycleImage;

  useEffect(() => {
    const checkViewport = () => setIsMobile(window.innerWidth <= 768);
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  const containerStyle: CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    zIndex: 999,
    opacity: showSplash ? 1 : 0,
    transition: 'opacity 0.8s ease-out',
    pointerEvents: 'none',
  };

  return (
    <div style={containerStyle} aria-hidden="true">
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundImage: `url(${currentImage})`,
          backgroundSize: 'cover',
          // Nur auf Mobile um 15% nach rechts verschoben (Desktop bleibt zentriert)
          backgroundPosition: isMobile ? '30% center' : 'center',
          backgroundRepeat: 'no-repeat',
          transition: 'background-image 0.5s ease',
          filter: 'var(--bg-filter, none)',
        }}
        aria-hidden="true"
      />
      {/* Duoton-Überblendung Richtung Akzentfarbe — Stärke kommt aus dem
          Hintergrund-Farbregler (System Status → Hintergründe). */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, var(--accent), #05010a)',
          mixBlendMode: 'color',
          opacity: 'var(--bg-duotone-opacity, 0)',
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      />
    </div>
  );
}
