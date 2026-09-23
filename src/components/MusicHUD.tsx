import React, { useState } from 'react';
import { type MusicPlayerApi } from '../hooks/useMusicPlayer';

interface MusicHUDProps {
  /** Compact header variant: renders inline buttons, no fixed strip */
  compact?: boolean;
  /** Geteilte Player-Instanz (aus App.tsx) — dasselbe <audio>-Element und
   * derselbe State wie in SystemStatusPanel, damit dieser Mini-Player die
   * dort hochgeladene/verwaltete Playlist tatsächlich bedienen kann. */
  music: MusicPlayerApi;
}

/**
 * Musik-HUD — integriert in den Chat-Header.
 * Rendert bewusst KEIN eigenes <audio>-Element — das lebt zentral in
 * App.tsx, damit Musik weiterläuft, auch wenn dieses Panel unmountet.
 *
 * compact=true:  Schmaler Mini-Player direkt im Chat-Header, immer sichtbar.
 *                Track-Label + Play/Pause, kein Schalter, kein Dropdown.
 *                Playlist & Radio-URLs werden im System Status-Fenster verwaltet.
 */
export default function MusicHUD({ compact = false, music }: MusicHUDProps) {
  const {
    radioUrl,
    setRadioUrl,
    radioPlaying,
    toggleRadio,
    playlist,
    activeTrack,
    activeTrackId,
    playTrack,
    removeTrack,
    radioError,
  } = music;

  const [expanded, setExpanded] = useState(false);

  const currentLabel = activeTrack?.name ?? (radioUrl ? 'Radio-Stream' : 'Musik');
  // Für Skip/Back relevant, wenn eine Playlist mit Tracks aktiv ist.
  // Selbst mit 1 Track macht Skip-Sense (springt zum ersten/zuletzt).
  const canSkipPrev = playlist.length > 0;

  if (compact) {
    return (
      <div className="music-hud-header">
        <span className="music-hud-track" title={currentLabel}>
          ♪ {currentLabel}
        </span>
        <div className="music-hud-header-controls">
          {/* Skip zurück — nur bei lokalen Playlists (nicht Radio) */}
          {activeTrack && canSkipPrev && (
            <button
              type="button"
              className="music-hud-btn music-hud-btn--sm"
              onClick={() => void music.playPrev()}
              title="Vorherigen"
            >
              ↶
            </button>
          )}

          {/* Play/Pause immer sichtbar:
              - Radio-Stream (kein Track aktiv): toggleRadio
              - Aktiver Track: Play/Pause des Tracks
              - Kein Audio aktiv, aber Playlist vorhanden: erster Titel starten */}
          {activeTrack && (
            <button
              type="button"
              className="music-hud-btn music-hud-btn--sm"
              onClick={() => {
                if (radioPlaying) {
                  void toggleRadio();
                } else {
                  void playTrack(activeTrack);
                }
              }}
              title={radioPlaying ? 'Pause' : 'Play'}
            >
              {radioPlaying ? '❚❚' : '▶'}
            </button>
          )}
          {radioUrl && !activeTrack && (
            <button
              type="button"
              className="music-hud-btn music-hud-btn--sm"
              onClick={toggleRadio}
              title={radioPlaying ? 'Stopp' : 'Play'}
            >
              {radioPlaying ? '❚❚' : '▶'}
            </button>
          )}
          {!activeTrack && !radioUrl && playlist.length > 0 && (
            <button
              type="button"
              className="music-hud-btn music-hud-btn--sm"
              onClick={() => void playTrack(playlist[0])}
              title="Ersten Titel abspielen"
            >
              ▶
            </button>
          )}

          {/* Skip nächstes Lied — nur bei lokalen Playlists (nicht Radio) */}
          {activeTrack && canSkipPrev && (
            <button
              type="button"
              className="music-hud-btn music-hud-btn--sm"
              onClick={() => void music.playNext()}
              title="Nächstes"
            >
              ↷
            </button>
          )}

          {/* Lautstärke-Regler */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={music.volume}
            onChange={(e) => music.setVolume(parseFloat(e.target.value))}
            title="Lautstärke"
            className="music-hud-volume"
            aria-label="Lautstärke"
          />
        </div>
        {radioError && <span className="music-hud-error" title={radioError}>{radioError}</span>}
      </div>
    );
  }

  // Full: fixed-bottom strip (standalone) — Fallback-Ansicht, aktuell nicht
  // eingebunden (der Header nutzt ausschließlich compact).
  return (
    <>
      <div className="music-hud-strip">
        <span className="music-hud-title" title={currentLabel}>
          ♪ {currentLabel}
        </span>
        <div className="music-hud-controls">
          {activeTrack && (
            <button
              type="button"
              className="music-hud-btn music-hud-btn--play"
              onClick={() => void playTrack(activeTrack)}
              title="Wiedergeben"
            >
              ▶
            </button>
          )}
          {radioUrl && !activeTrack && (
            <button
              type="button"
              className="music-hud-btn music-hud-btn--play"
              onClick={toggleRadio}
              title={radioPlaying ? 'Radio stoppen' : 'Radio starten'}
            >
              {radioPlaying ? '❚❚' : '▶'}
            </button>
          )}
          <button
            type="button"
            className="music-hud-btn music-hud-btn--expand"
            onClick={() => setExpanded((e) => !e)}
            title={expanded ? 'Player schließen' : 'Player öffnen'}
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="music-hud-expanded">
          <div className="music-hud-section">
            <span className="music-hud-section-title">Radio</span>
            <input
              type="url"
              className="music-hud-radio-input"
              placeholder="https://…/stream.mp3"
              value={radioUrl}
              onChange={(e) => setRadioUrl(e.target.value)}
            />
            <div className="music-hud-row">
              <button
                type="button"
                className="music-hud-btn music-hud-btn--primary"
                onClick={toggleRadio}
                disabled={!radioUrl.trim()}
              >
                {radioPlaying ? '■ Stopp' : '▶ Radio'}
              </button>
            </div>
            {radioError && <span className="music-hud-error">{radioError}</span>}
          </div>

          <div className="music-hud-section">
            <span className="music-hud-section-title">Playlist ({playlist.length})</span>
            {playlist.length > 0 ? (
              <div className="music-hud-playlist">
                {playlist.map((track) => (
                  <div key={track.id} className="music-hud-playlist-item">
                    <button
                      type="button"
                      className="music-hud-btn music-hud-btn--sm"
                      onClick={() => void playTrack(track)}
                      title={`${track.name} abspielen`}
                    >
                      {activeTrackId === track.id && radioPlaying ? '❚❚' : '▶'}
                    </button>
                    <span className="music-hud-track-name" title={track.name}>
                      {track.name}
                    </span>
                    <button
                      type="button"
                      className="music-hud-btn music-hud-btn--sm music-hud-btn--remove"
                      onClick={() => removeTrack(track)}
                      title="Löschen"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <span className="music-hud-empty">Noch keine Titel. Hochladen unter System Status → Music.</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
