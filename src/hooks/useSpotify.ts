import { useCallback, useEffect, useMemo, useState } from 'react';

const TOKEN_KEY = 'pris-spotify-token';
const VERIFIER_KEY = 'pris-spotify-code-verifier';
const STATE_KEY = 'pris-spotify-oauth-state';
const CLIENT_ID_KEY = 'pris-spotify-client-id';

const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'streaming',
].join(' ');

interface SpotifyToken {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  expires_at: number;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  artists: string[];
  album: string;
  image?: string;
}

interface SpotifyProfile { display_name?: string; images?: { url: string }[] }

const base64Url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

async function sha256(value: string) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
}

function randomString(length = 64) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => alphabet[v % alphabet.length]).join('');
}

function redirectUri() {
  return `${window.location.origin}${window.location.pathname}`;
}

function loadToken(): SpotifyToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function useSpotify() {
  const [clientId, setClientIdState] = useState(() =>
    localStorage.getItem(CLIENT_ID_KEY) || ''
  );
  const [token, setToken] = useState<SpotifyToken | null>(() => loadToken());
  const [profile, setProfile] = useState<SpotifyProfile | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [playlists, setPlaylists] = useState<{ id: string; name: string; image?: string }[]>([]);
  const [current, setCurrent] = useState<SpotifyTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connected = !!token?.access_token;

  const setClientId = useCallback((value: string) => {
    setClientIdState(value);
    localStorage.setItem(CLIENT_ID_KEY, value.trim());
  }, []);

  const saveToken = useCallback((next: SpotifyToken) => {
    setToken(next);
    localStorage.setItem(TOKEN_KEY, JSON.stringify(next));
  }, []);

  const refresh = useCallback(async (existing: SpotifyToken): Promise<SpotifyToken | null> => {
    if (!existing.refresh_token || !clientId) return null;
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: existing.refresh_token,
        client_id: clientId,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const next: SpotifyToken = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || existing.refresh_token,
      expires_in: data.expires_in,
      expires_at: Date.now() + data.expires_in * 1000,
    };
    saveToken(next);
    return next;
  }, [clientId, saveToken]);

  const api = useCallback(async (path: string, init: RequestInit = {}, retry = true): Promise<Response> => {
    let active = token;
    if (!active) throw new Error('Spotify ist nicht verbunden.');
    if (active.expires_at < Date.now() + 30_000) active = await refresh(active);
    if (!active) throw new Error('Spotify-Anmeldung ist abgelaufen.');
    const response = await fetch(`https://api.spotify.com/v1${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${active.access_token}`, ...(init.headers || {}) },
    });
    if (response.status === 401 && retry) {
      const next = await refresh(active);
      if (next) return api(path, init, false);
    }
    if (!response.ok) {
      let message = `Spotify API Fehler (${response.status})`;
      try { const body = await response.json(); message = body?.error?.message || message; } catch { /* no body */ }
      throw new Error(message);
    }
    return response;
  }, [refresh, token]);

  const connect = useCallback(async () => {
    if (!clientId.trim()) {
      setError('Bitte zuerst eine Spotify Client-ID eintragen.');
      return;
    }
    const verifier = randomString(64);
    const challenge = base64Url(await sha256(verifier));
    const state = randomString(32);
    localStorage.setItem(VERIFIER_KEY, verifier);
    localStorage.setItem(STATE_KEY, state);
    const url = new URL('https://accounts.spotify.com/authorize');
    url.search = new URLSearchParams({
      client_id: clientId.trim(), response_type: 'code', redirect_uri: redirectUri(),
      code_challenge_method: 'S256', code_challenge: challenge, state, scope: SCOPES,
    }).toString();
    window.location.assign(url.toString());
  }, [clientId]);

  const disconnect = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(VERIFIER_KEY);
    localStorage.removeItem(STATE_KEY);
    setToken(null); setProfile(null); setResults([]); setPlaylists([]); setCurrent(null); setPlaying(false);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const returnedState = params.get('state');
    if (!code) return;
    const expectedState = localStorage.getItem(STATE_KEY);
    const verifier = localStorage.getItem(VERIFIER_KEY);
    if (!expectedState || expectedState !== returnedState || !verifier || !clientId) {
      setError('Spotify-Anmeldung konnte nicht verifiziert werden.');
      return;
    }
    setBusy(true);
    fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), client_id: clientId, code_verifier: verifier }),
    }).then(async (response) => {
      if (!response.ok) throw new Error('Spotify Token-Austausch fehlgeschlagen.');
      const data = await response.json();
      saveToken({ access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in, expires_at: Date.now() + data.expires_in * 1000 });
      localStorage.removeItem(STATE_KEY); localStorage.removeItem(VERIFIER_KEY);
      window.history.replaceState({}, '', window.location.pathname);
    }).catch((e) => setError(e instanceof Error ? e.message : 'Spotify-Anmeldung fehlgeschlagen.')).finally(() => setBusy(false));
  }, [clientId, saveToken]);

  const loadProfile = useCallback(async () => {
    try { setProfile(await (await api('/me')).json()); } catch (e) { setError(e instanceof Error ? e.message : 'Profil konnte nicht geladen werden.'); }
  }, [api]);

  const loadPlaylists = useCallback(async () => {
    try {
      const data = await (await api('/me/playlists?limit=20')).json();
      setPlaylists((data.items || []).map((p: any) => ({ id: p.id, name: p.name, image: p.images?.[0]?.url })));
    } catch (e) { setError(e instanceof Error ? e.message : 'Playlists konnten nicht geladen werden.'); }
  }, [api]);

  const loadCurrent = useCallback(async () => {
    try {
      const response = await api('/me/player');
      if (response.status === 204) { setCurrent(null); setPlaying(false); return; }
      const data = await response.json();
      const item = data.item;
      if (item?.type === 'track') setCurrent({ id: item.id, name: item.name, uri: item.uri, artists: item.artists.map((a: any) => a.name), album: item.album?.name || '', image: item.album?.images?.[0]?.url });
      setPlaying(!!data.is_playing);
    } catch { /* no active device is normal */ }
  }, [api]);

  useEffect(() => {
    if (!connected) return;
    void loadProfile(); void loadPlaylists(); void loadCurrent();
    const id = window.setInterval(() => void loadCurrent(), 5000);
    return () => window.clearInterval(id);
  }, [connected, loadCurrent, loadPlaylists, loadProfile]);

  const searchTracks = useCallback(async () => {
    if (!search.trim()) return;
    setBusy(true); setError(null);
    try {
      const data = await (await api(`/search?type=track&limit=10&q=${encodeURIComponent(search.trim())}`)).json();
      setResults((data.tracks?.items || []).map((t: any) => ({ id: t.id, name: t.name, uri: t.uri, artists: t.artists.map((a: any) => a.name), album: t.album?.name || '', image: t.album?.images?.[0]?.url })));
    } catch (e) { setError(e instanceof Error ? e.message : 'Suche fehlgeschlagen.'); }
    finally { setBusy(false); }
  }, [api, search]);

  const play = useCallback(async (uri: string) => {
    try {
      await api('/me/player/play', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(uri.startsWith('spotify:playlist:') ? { context_uri: uri } : { uris: [uri] }) });
      await loadCurrent();
    } catch (e) { setError(e instanceof Error ? e.message : 'Wiedergabe konnte nicht gestartet werden.'); }
  }, [api, loadCurrent]);

  const pause = useCallback(async () => { try { await api('/me/player/pause', { method: 'PUT' }); await loadCurrent(); } catch (e) { setError(e instanceof Error ? e.message : 'Pause fehlgeschlagen.'); } }, [api, loadCurrent]);
  const next = useCallback(async () => { try { await api('/me/player/next', { method: 'POST' }); await loadCurrent(); } catch (e) { setError(e instanceof Error ? e.message : 'Nächster Titel fehlgeschlagen.'); } }, [api, loadCurrent]);
  const previous = useCallback(async () => { try { await api('/me/player/previous', { method: 'POST' }); await loadCurrent(); } catch (e) { setError(e instanceof Error ? e.message : 'Vorheriger Titel fehlgeschlagen.'); } }, [api, loadCurrent]);

  return useMemo(() => ({ clientId, setClientId, connected, profile, search, setSearch, results, playlists, current, playing, busy, error, connect, disconnect, searchTracks, play, pause, next, previous, redirectUri: redirectUri() }), [busy, clientId, connect, connected, current, disconnect, error, next, pause, play, previous, profile, playlists, results, search, searchTracks, setClientId, playing]);
}
