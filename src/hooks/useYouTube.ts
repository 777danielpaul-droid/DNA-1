import { useCallback, useMemo, useState } from 'react';

const API_KEY_STORAGE = 'pris-youtube-api-key';
const API_BASE = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeVideo {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail?: string;
  publishedAt?: string;
}

function loadApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) || '';
}

export function useYouTube() {
  const [apiKey, setApiKeyState] = useState(() => loadApiKey());
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<YouTubeVideo[]>([]);
  const [current, setCurrent] = useState<YouTubeVideo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = !!apiKey.trim();

  const setApiKey = useCallback((value: string) => {
    setApiKeyState(value);
    localStorage.setItem(API_KEY_STORAGE, value.trim());
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(API_KEY_STORAGE);
    setApiKeyState('');
    setResults([]);
    setCurrent(null);
    setError(null);
  }, []);

  const api = useCallback(async (path: string): Promise<Response> => {
    if (!apiKey.trim()) throw new Error('YouTube ist nicht verbunden.');
    const separator = path.includes('?') ? '&' : '?';
    const response = await fetch(`${API_BASE}${path}${separator}key=${encodeURIComponent(apiKey.trim())}`);
    if (!response.ok) {
      let message = `YouTube API Fehler (${response.status})`;
      try {
        const body = await response.json();
        message = body?.error?.message || message;
      } catch {
        /* no body */
      }
      throw new Error(message);
    }
    return response;
  }, [apiKey]);

  const searchVideos = useCallback(async () => {
    if (!search.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const data = await (
        await api(`/search?part=snippet&type=video&maxResults=12&q=${encodeURIComponent(search.trim())}`)
      ).json();
      setResults(
        (data.items || []).map((item: any) => ({
          id: item.id?.videoId,
          title: item.snippet?.title || '',
          channelTitle: item.snippet?.channelTitle || '',
          thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
          publishedAt: item.snippet?.publishedAt,
        })).filter((v: YouTubeVideo) => !!v.id)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suche fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }, [api, search]);

  const play = useCallback((video: YouTubeVideo) => {
    setCurrent(video);
  }, []);

  const stop = useCallback(() => {
    setCurrent(null);
  }, []);

  return useMemo(
    () => ({
      apiKey,
      setApiKey,
      connected,
      search,
      setSearch,
      results,
      current,
      busy,
      error,
      disconnect,
      searchVideos,
      play,
      stop,
    }),
    [apiKey, setApiKey, connected, search, results, current, busy, error, disconnect, searchVideos, play, stop]
  );
}
