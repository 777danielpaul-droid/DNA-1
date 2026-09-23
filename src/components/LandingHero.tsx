import React, { CSSProperties, Ref } from 'react';
import EncryptedText from './EncryptedText';

interface LandingHeroProps {
  innerRef: Ref<HTMLDivElement>;
  isDark?: boolean;
}

export default function LandingHero({ innerRef, isDark = true }: LandingHeroProps) {
  const sectionStyle: CSSProperties = {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    zIndex: 5,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '20px',
    boxSizing: 'border-box',
    pointerEvents: 'auto',
    background: 'transparent',
    transition: 'opacity 0.8s ease'
  };

  const h1Style: CSSProperties = {
    fontSize: '5rem',
    fontWeight: 800,
    margin: 0,
    color: isDark ? 'hsl(0, 0%, 100%)' : 'hsl(220, 20%, 12%)',
    textShadow: isDark
      ? '0 0 5px hsla(0, 0%, 100%, 0.9), 0 0 15px hsl(210, 100%, 70%), 0 0 30px hsl(210, 100%, 65%), 0 0 50px hsl(210, 100%, 60%)'
      : '0 0 5px hsla(220, 20%, 12%, 0.4), 0 0 10px hsla(255, 100%, 70%, 0.3)',
    letterSpacing: '-1px',
    fontFamily: "'Space Grotesk', sans-serif"
  };

  // SCROLL TO COMPILE SYSTEM direkt unter der H1, weiße Schrift
  const subheadingStyle: CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.8rem',
    letterSpacing: '4px',
    color: isDark ? 'hsl(0, 0%, 100%)' : 'hsl(220, 20%, 40%)',
    textTransform: 'uppercase',
    marginTop: '24px',
    opacity: 0.9
  };

  return (
    <section ref={innerRef} style={sectionStyle}>
      {/* H1 with EncryptedText reveal effect */}
      <h1 style={h1Style}>
        <EncryptedText
          text="DNA1"
          encryptedClassName="opacity-60"
          revealedClassName=""
          revealDelayMs={300}
        />
      </h1>
      {/* SCROLL TO COMPILE SYSTEM direkt unter H1 */}
      <div style={subheadingStyle}>
        // SCROLL TO COMPILE SYSTEM
      </div>
    </section>
  );
}
