import React, { CSSProperties, useEffect, useState } from 'react';
import { useScrollProgress } from '../hooks/useScrollProgress';
import { useBackgroundCycle } from '../hooks/useBackgroundCycle';
import { useCustomBackgroundImage } from '../hooks/useCustomBackgroundImage';

/**
 * BackgroundSplash — dezenter Fullscreen-Hintergrund für den
 * Home-Startbildschirm. Sichtbar 0–10% Scroll, dann ausblenden.
 *
 * Bewusst OHNE die Hintergrund-Farbregler (Farbton/Duoton/Invertieren) aus
 * System Status → Styling — die wirken nur auf den End-Splash. Der
 * Startbildschirm soll unabhängig davon immer unverfälscht bleiben, auch
 * wenn dort ein eigenes hochgeladenes Bild verwendet wird.
 */
interface BackgroundSplashProps {
  isDark?: boolean;
}

export default function BackgroundSplash({ isDark = true }: BackgroundSplashProps) {
  const progress = useScrollProgress();
  const [isMobile, setIsMobile] = useState(false);
  const { currentImage: cycleImage } = useBackgroundCycle('intro', isDark);
  const { customImage } = useCustomBackgroundImage('intro', isDark);
  const currentImage = customImage || cycleImage;

  useEffect(() => {
    const checkViewport = () => setIsMobile(window.innerWidth <= 768);
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  // 0–10% sichtbar, dann ausblenden
  const bgOpacity = progress < 0.10 ? 0.35 : 0;
  // Der Start-Hintergrund fährt beim ersten Scrollen sanft in das Motiv.
  // Nach dem Ausblenden wird wieder die neutrale Ausgangsgröße verwendet.
  const zoom = 1 + Math.min(progress, 0.10) * 1.8;

  const containerStyle: CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    zIndex: 1,
    opacity: bgOpacity,
    transition: 'opacity 0.6s ease-out',
    pointerEvents: 'none',
    overflow: 'hidden',
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
          backgroundPosition: isMobile ? '30% center' : 'center',
          backgroundRepeat: 'no-repeat',
          transform: `scale(${zoom})`,
          transformOrigin: isMobile ? '30% center' : 'center',
          willChange: 'transform',
          transition: 'background-image 0.5s ease',
        }}
        aria-hidden="true"
      />
    </div>
  );
}
