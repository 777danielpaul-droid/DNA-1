import React from 'react';
import { type ReturnTypeUseYouTube } from '../types/youtube';

export default function YouTubePanel({ youtube }: { youtube: ReturnTypeUseYouTube }) {
  return (
    <div className="youtube-panel">
      <div className="youtube-head">
        <div>
          <span className="system-status-section-title">YouTube</span>
          <div className="youtube-subtitle">Videos suchen &amp; im PR1S Media Interface abspielen</div>
        </div>
        {youtube.connected ? (
          <button type="button" className="system-status-refresh-btn" onClick={youtube.disconnect}>Trennen</button>
        ) : null}
      </div>

      {!youtube.connected ? (
        <>
          <label className="youtube-label">YouTube Data API Key</label>
          <input
            className="system-status-radio-input"
            value={youtube.apiKey}
            onChange={(e) => youtube.setApiKey(e.target.value)}
            placeholder="z. B. AIzaSy…"
          />
          <div className="youtube-help">Key eintragen genügt – die Suche wird sofort freigeschaltet, kein separater „Verbinden“-Schritt nötig.</div>
          <div className="youtube-help">
            API Key in der{' '}
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
              Google Cloud Console
            </a>{' '}
            erstellen (YouTube Data API v3 aktivieren, dann „Anmeldedaten → API-Schlüssel“).
          </div>
          <div className="youtube-help">Der Key wird nur lokal im Browser gespeichert und ist öffentlich lesbar – kein OAuth-Secret hier eintragen.</div>
        </>
      ) : (
        <>
          <div className="youtube-search-row">
            <input
              value={youtube.search}
              onChange={(e) => youtube.setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void youtube.searchVideos(); }}
              placeholder="Video, Kanal oder Thema suchen…"
            />
            <button type="button" onClick={() => void youtube.searchVideos()} disabled={youtube.busy}>Suchen</button>
          </div>

          {youtube.current && (
            <div className="youtube-now-playing">
              <div className="youtube-player-wrap">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${youtube.current.id}?autoplay=1`}
                  title={youtube.current.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="youtube-now-playing-meta">
                <strong>{youtube.current.title}</strong>
                <span>{youtube.current.channelTitle}</span>
                <button type="button" onClick={youtube.stop}>■ Stopp</button>
              </div>
            </div>
          )}

          {youtube.results.length > 0 && (
            <div className="youtube-results">
              {youtube.results.map((video) => (
                <div className="youtube-video" key={video.id}>
                  {video.thumbnail && <img src={video.thumbnail} alt="" />}
                  <div className="youtube-video-meta">
                    <strong>{video.title}</strong>
                    <span>{video.channelTitle}</span>
                  </div>
                  <button type="button" onClick={() => youtube.play(video)}>▶</button>
                </div>
              ))}
            </div>
          )}

          <div className="youtube-help">Suche &amp; Wiedergabe laufen direkt über die YouTube Data API bzw. den eingebetteten Player – kein Login nötig.</div>
        </>
      )}
      {youtube.error && <div className="youtube-error">{youtube.error}</div>}
    </div>
  );
}
