import React from 'react';
import { type ReturnTypeUseSpotify } from '../types/spotify';

export default function SpotifyPanel({ spotify }: { spotify: ReturnTypeUseSpotify }) {
  return (
    <div className="spotify-panel">
      <div className="spotify-head">
        <div>
          <span className="system-status-section-title">Spotify</span>
          <div className="spotify-subtitle">Deine Spotify-Bibliothek im PR1S Music Interface</div>
        </div>
        {spotify.connected ? (
          <button type="button" className="system-status-refresh-btn" onClick={spotify.disconnect}>Trennen</button>
        ) : null}
      </div>

      {!spotify.connected ? (
        <>
          <label className="spotify-label">Spotify Client-ID</label>
          <input className="system-status-radio-input" value={spotify.clientId} onChange={(e) => spotify.setClientId(e.target.value)} placeholder="z. B. 1234abcd…" />
          <button type="button" className="system-status-refresh-btn spotify-connect" onClick={() => void spotify.connect()} disabled={!spotify.clientId.trim()}>
            ● Mit Spotify verbinden
          </button>
          <div className="spotify-help">Redirect URI: <code>{spotify.redirectUri}</code></div>
          <div className="spotify-help">Die Client-ID ist öffentlich. Kein Spotify Client Secret in den Browser eintragen.</div>
        </>
      ) : (
        <>
          <div className="spotify-account">
            {spotify.profile?.images?.[0]?.url && <img src={spotify.profile.images[0].url} alt="" />}
            <span>{spotify.profile?.display_name || 'Spotify verbunden'}</span>
            <span className="spotify-online">ONLINE</span>
          </div>
          {spotify.current && (
            <div className="spotify-now-playing">
              {spotify.current.image && <img src={spotify.current.image} alt="" />}
              <div><strong>{spotify.current.name}</strong><span>{spotify.current.artists.join(', ')}</span></div>
              <div className="spotify-controls">
                <button type="button" onClick={() => void spotify.previous()}>↶</button>
                <button type="button" onClick={() => void (spotify.playing ? spotify.pause() : spotify.play(spotify.current!.uri))}>{spotify.playing ? '❚❚' : '▶'}</button>
                <button type="button" onClick={() => void spotify.next()}>↷</button>
              </div>
            </div>
          )}
          <div className="spotify-search-row">
            <input value={spotify.search} onChange={(e) => spotify.setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void spotify.searchTracks(); }} placeholder="Titel, Artist oder Album suchen…" />
            <button type="button" onClick={() => void spotify.searchTracks()} disabled={spotify.busy}>Suchen</button>
          </div>
          {spotify.results.length > 0 && <div className="spotify-results">
            {spotify.results.map((track) => <div className="spotify-track" key={track.id}>
              {track.image && <img src={track.image} alt="" />}
              <div className="spotify-track-meta"><strong>{track.name}</strong><span>{track.artists.join(', ')} · {track.album}</span></div>
              <button type="button" onClick={() => void spotify.play(track.uri)}>▶</button>
            </div>)}
          </div>}
          <div className="spotify-section-title">Meine Playlists</div>
          <div className="spotify-playlists">
            {spotify.playlists.map((p) => <button key={p.id} type="button" title={p.name} onClick={() => void spotify.play(`spotify:playlist:${p.id}`)}>
              {p.image ? <img src={p.image} alt="" /> : <span>♫</span>}<span>{p.name}</span>
            </button>)}
          </div>
          <div className="spotify-help">Die Wiedergabe läuft über dein aktives Spotify-Gerät. Spotify-Premium ist für Playback-Steuerung erforderlich.</div>
        </>
      )}
      {spotify.error && <div className="spotify-error">{spotify.error}</div>}
    </div>
  );
}
