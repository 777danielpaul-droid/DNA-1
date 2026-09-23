import React, { useEffect, useRef, useState } from 'react';
import '../styles/ModelWindow.css';
import '../styles/SystemStatus.css';
import '../styles/InvoiceScanner.css';
import { useScrollProgress } from '../hooks/useScrollProgress';
import { useExtensionBridge } from '../hooks/useExtensionBridge';
import { useTerminalBridge } from '../hooks/useTerminalBridge';
import { usePersona } from '../hooks/usePersona';
import { PROVIDERS, PROVIDER_ORDER, type ProviderId } from '../lib/aiProviders';
import { ACCENT_THEMES, useUiTheme } from '../hooks/useUiTheme';
import { useBackgroundFilter } from '../hooks/useBackgroundFilter';
import { useBackgroundCycle } from '../hooks/useBackgroundCycle';
import { useCustomBackgroundImage } from '../hooks/useCustomBackgroundImage';
import { type MusicPlayerApi } from '../hooks/useMusicPlayer';
import AccountSection from './AccountSection';
import PanelCircuitGlow from './PanelCircuitGlow';

export type SystemStatusTab = 'status' | 'diagnostics';

interface PlaylistTrack {
  id: string;
  name: string;
  url: string;
}

interface Playlist {
  id: string;
  name: string;
  tracks: PlaylistTrack[];
}

export interface SystemStatusPanelProps {
  open: boolean;
  defaultTab?: SystemStatusTab;
  isDark: boolean;
  onClose: () => void;
  /** Geteilte Musik-Player-Instanz (aus App.tsx) — dieselbe wie im
   * Mini-Player im Chat-Header. */
  music: MusicPlayerApi;
  /** Öffnet die Buchhaltungsfunktion (Rechnungen aus Gmail → Google Sheets). */
  onOpenInvoiceScanner: () => void;
}

function loadCredential(provider: ProviderId): string {
  return localStorage.getItem(PROVIDERS[provider].keyStorageKey) || '';
}

/** Simpler rAF-basierter FPS-Zähler, läuft nur während das Panel offen ist. */
function useFps(active: boolean): number {
  const [fps, setFps] = useState(0);
  const frameRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const tick = (t: number) => {
      const frames = frameRef.current;
      frames.push(t);
      while (frames.length > 0 && frames[0] <= t - 1000) frames.shift();
      setFps(frames.length);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      frameRef.current = [];
    };
  }, [active]);

  return fps;
}

type StatusSubTab = 'overview' | 'styling' | 'memory';

export default function SystemStatusPanel({ open, defaultTab = 'status', isDark, onClose, music, onOpenInvoiceScanner }: SystemStatusPanelProps) {
  const tab = defaultTab;
  const [statusSubTab, setStatusSubTab] = useState<StatusSubTab>('overview');
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollProgress = useScrollProgress();
  const persona = usePersona();
  const bridge = useExtensionBridge();
  const terminal = useTerminalBridge();
  const { accentTheme, setAccentTheme, customColor, setCustomColor } = useUiTheme();
  const [customColorDraft, setCustomColorDraft] = useState(customColor);
  useEffect(() => { setCustomColorDraft(customColor); }, [customColor]);
  const bgFilter = useBackgroundFilter();
  const intro = useBackgroundCycle('intro', isDark);
  const splash = useBackgroundCycle('splash', isDark);
  const introCustom = useCustomBackgroundImage('intro', isDark);
  const splashCustom = useCustomBackgroundImage('splash', isDark);
  const fps = useFps(open && tab === 'diagnostics');
  const [now, setNow] = useState(() => new Date());
  const [remoteStatus, setRemoteStatus] = useState<{ telegram: boolean; discord: boolean } | null>(null);

  // Musik-Player: geteilte Instanz aus App.tsx (identisch zur GeminiChat-
  // Integration) — kein eigener useMusicPlayer()-Aufruf mehr, sonst hätte
  // dieses Panel einen komplett unabhängigen Zustand samt eigenem
  // <audio>-Element gegenüber dem Mini-Player im Chat-Header.
  const {
    radioUrl,
    setRadioUrl,
    radioPlaying,
    toggleRadio,
    playlists,
    activePlaylistId,
    setActivePlaylistId,
    playlistName,
    setPlaylistName,
    createPlaylist,
    addTracks,
    playlist,
    activeTrackId,
    playTrack,
    removeTrack,
    radioError,
    setActiveTrackId,
  } = music;

  const activeTrack = playlist.find((t) => t.id === activeTrackId);


  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const checkRemote = async () => {
      try {
        const response = await fetch('http://127.0.0.1:8790/ping', { cache: 'no-store' });
        if (!response.ok) throw new Error('offline');
        const data = await response.json();
        if (!cancelled) setRemoteStatus({ telegram: Boolean(data.telegram), discord: Boolean(data.discord) });
      } catch {
        if (!cancelled) setRemoteStatus(null);
      }
    };
    checkRemote();
    const id = window.setInterval(checkRemote, 5000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Kein "Klick außerhalb schließt"-Handler mehr: das Panel nimmt nur noch
  // die linke Bildschirmhälfte ein, damit rechts (Chat/Hintergrund) frei
  // bedienbar bleibt, ohne das Menü versehentlich zu schließen. Schließen
  // erfolgt über den ×-Button oder Escape (siehe oben).

  // Kein Cleanup-Effekt mehr, der audio pausiert oder Track-URLs revoked:
  // der Player-State/das <audio>-Element gehören jetzt App.tsx und leben
  // unabhängig davon, ob dieses Panel gerade offen ist — Musik soll ja
  // genau dann weiterlaufen, wenn man dieses Panel schließt.

  if (!open) return null;

  const configuredProviders = PROVIDER_ORDER.filter(
    (p) => p === 'ollama' || !!loadCredential(p)
  );

  return (
    <div className="model-window-overlay" data-testid="system-status">
      <div className="model-window-panel" ref={panelRef}>
        <PanelCircuitGlow />
        <div className="model-window-header">
          <span className="model-window-title">{tab === 'diagnostics' ? 'DIAGNOSTICS' : 'SYSTEM STATUS'}</span>
          <button type="button" className="model-window-close" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>

        <div className="model-window-body">
          {tab === 'status' && (
            <>
              <div className="system-status-tabs">
                <button
                  type="button"
                  className={`system-status-tab ${statusSubTab === 'overview' ? 'active' : ''}`}
                  onClick={() => setStatusSubTab('overview')}
                >
                  Übersicht
                </button>
                <button
                  type="button"
                  className={`system-status-tab ${statusSubTab === 'styling' ? 'active' : ''}`}
                  onClick={() => setStatusSubTab('styling')}
                >
                  Styling
                </button>
                <button
                  type="button"
                  className={`system-status-tab ${statusSubTab === 'memory' ? 'active' : ''}`}
                  onClick={() => setStatusSubTab('memory')}
                >
                  Gedächtnis
                </button>
              </div>

              {statusSubTab === 'overview' && (
                <div className="system-status-section">
                  <span className="system-status-section-title">Live</span>
                  <div className="system-status-row">
                    <span className="system-status-row-label">Uhrzeit</span>
                    <span className="system-status-row-value">{now.toLocaleTimeString('de-DE')}</span>
                  </div>
                  <div className="system-status-row">
                    <span className="system-status-row-label">Scroll-Fortschritt</span>
                    <span className="system-status-row-value">{Math.round(scrollProgress * 100)}%</span>
                  </div>
                  <div className="system-status-row">
                    <span className="system-status-row-label">Viewport</span>
                    <span className="system-status-row-value">
                      {window.innerWidth}×{window.innerHeight}
                    </span>
                  </div>
                  <div className="system-status-row">
                    <span className="system-status-row-label">Persona</span>
                    <span className="system-status-row-value">{persona.name}</span>
                  </div>
                </div>
              )}

              {statusSubTab === 'styling' && (
                <>
                  <div className="system-status-section">
                    <span className="system-status-section-title">Darstellung</span>
                    <div className="system-status-row">
                      <span className="system-status-row-label">Modus</span>
                      <span className="system-status-row-value">{isDark ? 'Dark' : 'Light'}</span>
                    </div>
                    <div className="system-status-row">
                      <span className="system-status-row-label">Akzent-Theme</span>
                      <span className="system-status-row-value">
                        {ACCENT_THEMES.find((t) => t.id === accentTheme)?.label}
                      </span>
                    </div>
                    <div className="ui-theme-swatches">
                      {ACCENT_THEMES.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className={`ui-theme-swatch ${accentTheme === t.id ? 'active' : ''}`}
                          style={{ background: t.swatch }}
                          title={t.label}
                          onClick={() => setAccentTheme(t.id)}
                          aria-label={t.label}
                        />
                      ))}
                      <label
                        className={`ui-theme-swatch ui-theme-swatch-custom ${accentTheme === 'custom' ? 'active' : ''}`}
                        style={{ background: customColor }}
                        title="Eigene Farbe"
                      >
                        <input
                          type="color"
                          value={customColor}
                          onChange={(e) => setCustomColor(e.target.value)}
                          aria-label="Eigene Akzentfarbe wählen"
                        />
                      </label>
                    </div>
                    <div className="ui-theme-custom-row">
                      <span className="ui-theme-custom-hash">#</span>
                      <input
                        type="text"
                        className="ui-theme-hex-input"
                        value={customColorDraft.replace('#', '')}
                        onChange={(e) => setCustomColorDraft(e.target.value)}
                        onBlur={() => setCustomColor(customColorDraft)}
                        onKeyDown={(e) => { if (e.key === 'Enter') setCustomColor(customColorDraft); }}
                        placeholder="38bdf8"
                        maxLength={6}
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="system-status-refresh-btn"
                        onClick={() => setCustomColor(customColorDraft)}
                      >
                        Anwenden
                      </button>
                    </div>
                  </div>

                  <div className="system-status-section">
                    <span className="system-status-section-title">Hintergründe</span>
                    <div className="bg-cycle-row">
                      <span className="bg-cycle-label">
                        {introCustom.customImage
                          ? 'Intro-Bild: eigenes Foto'
                          : `Intro-Bild ${intro.index + 1}/${intro.count}`}
                      </span>
                      {introCustom.customImage ? (
                        <button
                          type="button"
                          className="system-status-refresh-btn"
                          onClick={introCustom.clearCustomImage}
                        >
                          Entfernen
                        </button>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" className="bg-cycle-btn" onClick={intro.prev} disabled={intro.count <= 1}>
                            ◀
                          </button>
                          <button type="button" className="bg-cycle-btn" onClick={intro.next} disabled={intro.count <= 1}>
                            ▶
                          </button>
                        </div>
                      )}
                    </div>
                    <label className="system-status-upload-btn bg-upload-btn">
                      + Eigenes Bild hochladen
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) introCustom.setCustomImage(file);
                          e.target.value = '';
                        }}
                      />
                    </label>

                    <div className="bg-cycle-row">
                      <span className="bg-cycle-label">
                        {splashCustom.customImage
                          ? 'End-Splash: eigenes Foto'
                          : `End-Splash ${splash.index + 1}/${splash.count}`}
                      </span>
                      {splashCustom.customImage ? (
                        <button
                          type="button"
                          className="system-status-refresh-btn"
                          onClick={splashCustom.clearCustomImage}
                        >
                          Entfernen
                        </button>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" className="bg-cycle-btn" onClick={splash.prev} disabled={splash.count <= 1}>
                            ◀
                          </button>
                          <button type="button" className="bg-cycle-btn" onClick={splash.next} disabled={splash.count <= 1}>
                            ▶
                          </button>
                        </div>
                      )}
                    </div>
                    <label className="system-status-upload-btn bg-upload-btn">
                      + Eigenes Bild hochladen
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) splashCustom.setCustomImage(file);
                          e.target.value = '';
                        }}
                      />
                    </label>

                    <div className="bg-filter-hint">
                      Die Regler unten wirken nur auf den End-Splash — der Start-Hintergrund bleibt immer unverändert.
                    </div>
                    <div className="bg-filter-row">
                      <span className="bg-cycle-label">Farbton {Math.round(bgFilter.hue)}°</span>
                      <input
                        type="range"
                        className="bg-filter-slider"
                        min={0}
                        max={360}
                        step={1}
                        value={bgFilter.hue}
                        onChange={(e) => bgFilter.setHue(Number(e.target.value))}
                        aria-label="Hintergrundbild Farbton drehen"
                      />
                    </div>
                    <div className="bg-filter-row">
                      <span className="bg-cycle-label">Duoton {Math.round(bgFilter.duotone)}%</span>
                      <input
                        type="range"
                        className="bg-filter-slider"
                        min={0}
                        max={100}
                        step={1}
                        value={bgFilter.duotone}
                        onChange={(e) => bgFilter.setDuotone(Number(e.target.value))}
                        aria-label="Hintergrundbild Duoton-Stärke"
                      />
                    </div>
                    <div className="bg-filter-row bg-filter-row-toggle">
                      <label className="bg-filter-checkbox-label">
                        <input
                          type="checkbox"
                          checked={bgFilter.invert}
                          onChange={(e) => bgFilter.setInvert(e.target.checked)}
                        />
                        Invertieren
                      </label>
                      <button type="button" className="system-status-refresh-btn" onClick={bgFilter.reset}>
                        Zurücksetzen
                      </button>
                    </div>
                  </div>
                </>
              )}

              {statusSubTab === 'memory' && <AccountSection />}
            </>
          )}

          {tab === 'diagnostics' && (
            <>
              <div className="system-status-section">
                <span className="system-status-section-title">Buchhaltung</span>
                <div className="system-status-row">
                  <span className="system-status-row-label">Rechnungen aus Gmail → Google Sheets</span>
                </div>
                <button type="button" className="system-status-refresh-btn" onClick={onOpenInvoiceScanner}>
                  📊 Buchhaltung öffnen
                </button>
              </div>

              <div className="system-status-section">
                <span className="system-status-section-title">Performance</span>
                <div className="system-status-row">
                  <span className="system-status-row-label">FPS (Canvas-Frame-Rate)</span>
                  <span className={`system-status-row-value ${fps >= 45 ? 'ok' : fps >= 24 ? 'warn' : 'bad'}`}>
                    {fps}
                  </span>
                </div>
              </div>

              <div className="system-status-section">
                <span className="system-status-section-title">Browser-Bridge (Extension)</span>
                <div className="system-status-row">
                  <span className="system-status-row-label">Erkannt</span>
                  <span className={`system-status-row-value ${bridge.available ? 'ok' : 'bad'}`}>
                    {bridge.available ? 'JA' : 'NEIN'}
                  </span>
                </div>
                <div className="system-status-row">
                  <span className="system-status-row-label">Offene Tabs (claude.ai / chatgpt.com)</span>
                  <span className="system-status-row-value">{bridge.targets.length}</span>
                </div>
                <button type="button" className="system-status-refresh-btn" onClick={() => bridge.refreshTargets()}>
                  ⟳ Bridge neu prüfen
                </button>
              </div>

              <div className="system-status-section">
                <span className="system-status-section-title">Terminal-Bridge (lokaler Server)</span>
                <div className="system-status-row">
                  <span className="system-status-row-label">Betrieb</span>
                  <button
                    type="button"
                    className="system-status-refresh-btn"
                    onClick={() => {
                      terminal.setEnabled(!terminal.enabled);
                      if (!terminal.enabled) terminal.refresh();
                    }}
                    aria-pressed={terminal.enabled}
                  >
                    {terminal.enabled ? '● AN — ausschalten' : '○ AUS — einschalten'}
                  </button>
                </div>
                <div className="system-status-row">
                  <span className="system-status-row-label">Verbunden</span>
                  <span className={`system-status-row-value ${terminal.available ? 'ok' : 'bad'}`}>
                    {!terminal.enabled ? 'AUS' : terminal.checking ? '...' : terminal.available ? 'JA' : 'NEIN'}
                  </span>
                </div>
                <div className="system-status-row">
                  <span className="system-status-row-label">Bridge-URL</span>
                  <span className="system-status-row-value">{terminal.bridgeUrl}</span>
                </div>
                {!terminal.available && (
                  <span className="bg-cycle-label">
                    Die Bridge wird beim Start von PRIS automatisch gestartet.
                  </span>
                )}
                <button type="button" className="system-status-refresh-btn" onClick={() => terminal.refresh()}>
                  ⟳ Terminal-Bridge neu prüfen
                </button>
              </div>

              <div className="system-status-section">
                <span className="system-status-section-title">KI-Anbieter (Key hinterlegt)</span>
                <div className="system-status-provider-list">
                  {PROVIDER_ORDER.map((p) => {
                    const configured = configuredProviders.includes(p);
                    return (
                      <div key={p} className={`system-status-provider-chip ${configured ? 'configured' : ''}`}>
                        <span>{PROVIDERS[p].label}</span>
                        <span className={configured ? 'ok' : 'bad'} style={{ color: configured ? '#4ade80' : '#f87171' }}>
                          {configured ? '✓' : '✕'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="model-window-footer">
          <span>System Status &amp; Diagnostics — lokal im Browser ausgewertet, keine Serverdaten.</span>
        </div>
      </div>
    </div>
  );
}
