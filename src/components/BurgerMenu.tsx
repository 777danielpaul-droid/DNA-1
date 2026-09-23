import React, { useState, useEffect, CSSProperties, ReactNode } from 'react';
import './BurgerMenu.css';
import { usePersona } from '../hooks/usePersona';

interface BurgerMenuProps {
  onThemeChange?: (isDark: boolean) => void;
}

export default function BurgerMenu({ onThemeChange }: BurgerMenuProps) {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(true);
  const persona = usePersona();

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    // Chat-Command: /menu öffnet das Burger-Menü
    const handleOpenMenu = () => setOpen(true);
    window.addEventListener('open-burger-menu', handleOpenMenu);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('open-burger-menu', handleOpenMenu);
    };
  }, [open]);

  // Theme toggle — directly set body styles
  useEffect(() => {
    document.body.classList.toggle('light-theme', !dark);
    document.body.classList.toggle('dark-theme', dark);
    if (dark) {
      document.body.style.setProperty('--bg-color', '#000002');
      document.body.style.setProperty('--text-color', '#ffffff');
      document.body.style.setProperty('--canvas-filter', 'none');
      document.body.style.setProperty('--canvas-opacity', '1');
    } else {
      document.body.style.setProperty('--bg-color', '#f8fafc');
      document.body.style.setProperty('--text-color', '#0f172a');
      // Three.js renders theme-aware directly — no CSS filter invert needed
      document.body.style.setProperty('--canvas-filter', 'none');
      document.body.style.setProperty('--canvas-opacity', '1');
    }
    onThemeChange?.(dark);
  }, [dark, onThemeChange]);

  const toggleTheme = () => setDark(!dark);

  return (
    <>
      {/* Left: Burger Menu + Theme Toggle (side by side) */}
      <div className="burger-wrapper">
        <button
          className="burger-btn"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          <span className="burger-bar"></span>
          <span className="burger-bar"></span>
          <span className="burger-bar"></span>
        </button>
        <button
          className="theme-btn"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          <span className={`theme-icon sun ${dark ? '' : 'hidden'}`}>☀️</span>
          <span className={`theme-icon moon ${dark ? 'hidden' : ''}`}>🌙</span>
        </button>
      </div>

      {/* Slide-in Panel */}
      <div className={`slide-panel ${open ? 'open' : ''}`}>
        <div className="panel-overlay" onClick={() => setOpen(false)} />
        <nav className="panel-nav">
          <a href="#home" onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setOpen(false);
            }}>Home</a>
          <a href="#profile" onClick={() => setOpen(false)}>Profile</a>
          <a href="#contact" onClick={() => setOpen(false)}>Contact</a>
          <a href="#end" onClick={() => {
              const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
              window.scrollTo({ top: maxScroll, behavior: 'smooth' });
              setOpen(false);
            }}>{persona.name.toUpperCase()}</a>
        </nav>
      </div>
    </>
  );
}
