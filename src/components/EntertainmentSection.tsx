import React from 'react';
import '../styles/SystemStatus.css';
import { type MusicPlayerApi } from '../hooks/useMusicPlayer';
import { useSpotify } from '../hooks/useSpotify';
import SpotifyPanel from './SpotifyPanel';
import { useYouTube } from '../hooks/useYouTube';
import YouTubePanel from './YouTubePanel';
import SocialIntegrationsSection from './SocialIntegrationsSection';
import { SOCIAL_LINKS } from '../lib/socialLinks';

export interface EntertainmentSectionProps {
  /** Geteilte Musik-Player-Instanz (aus App.tsx) — dieselbe wie im
   * Mini-Player im Chat-Header und im SystemStatusPanel. */
  music: MusicPlayerApi;
}

export default function EntertainmentSection({ music }: EntertainmentSectionProps) {
  const spotify = useSpotify();
  const youtube = useYouTube();
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

  return (
    <div className="network-entertainment">
      <div className="system-status-section system-status-media">
        <span className="system-status-section-title">Radio &amp; Playlist</span>
        <div className="system-status-row">
          <span className="system-status-row-label">Stream</span>
          <input
            className="system-status-radio-input"
            type="url"
            value={radioUrl}
            placeholder="https://…/stream.mp3"
            onChange={(event) => setRadioUrl(event.target.value)}
          />
        </div>
        <button type="button" className="system-status-refresh-btn" onClick={toggleRadio} aria-pressed={radioPlaying}>
          {radioPlaying ? '■ Radio stoppen' : '▶ Radio starten'}
        </button>
        <div className="system-status-playlist-header">
          <label className="system-status-upload-btn">
            + MP3s hinzufügen
            <input type="file" accept="audio/mpeg,.mp3" multiple onChange={(event) => addTracks(event.target.files)} />
          </label>
          <span className="bg-cycle-label">{playlist.length} Titel lokal</span>
        </div>
        <div className="system-status-playlist-controls">
          <select value={activePlaylistId} onChange={(event) => { setActivePlaylistId(event.target.value); setActiveTrackId(null); }}>
            {playlists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <input value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} placeholder="Neue Liste" onKeyDown={(event) => { if (event.key === 'Enter') createPlaylist(); }} />
          <button type="button" onClick={createPlaylist} disabled={!playlistName.trim()}>+ Liste</button>
        </div>
        {playlist.length > 0 && (
          <div className="system-status-playlist" aria-label="Lokale MP3-Playlist">
            {playlist.map((track) => (
              <div key={track.id} className={`system-status-playlist-item ${activeTrackId === track.id ? 'active' : ''}`}>
                <button type="button" onClick={() => void playTrack(track)} title={`${track.name} abspielen`}>
                  {activeTrackId === track.id && radioPlaying ? '❚❚' : '▶'}
                </button>
                <span title={track.name}>{track.name}</span>
                <button type="button" onClick={() => removeTrack(track)} aria-label={`${track.name} entfernen`}>×</button>
              </div>
            ))}
          </div>
        )}
        {radioError && <span className="bg-cycle-label">{radioError}</span>}
      </div>

      <div className="system-status-section system-status-media">
        <SpotifyPanel spotify={spotify} />
      </div>

      <div className="system-status-section system-status-media">
        <YouTubePanel youtube={youtube} />
      </div>

      <section className="network-remote-section">
        <div className="network-section-title">MESSAGING · TOKEN-SCHNITTSTELLEN</div>
        <SocialIntegrationsSection />
      </section>

      <section className="network-remote-section">
        <div className="network-section-title">SOCIAL MEDIA</div>
        <div className="network-social-grid">
          {SOCIAL_LINKS.map((social) => (
            <button
              key={social.name}
              type="button"
              className="network-social-link"
              onClick={() => window.open(social.url, '_blank', 'noopener,noreferrer')}
              title={`${social.name} öffnen`}
            >
              <span className="network-social-icon" aria-hidden="true">{social.icon}</span>
              <span className="network-social-name">{social.name}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
