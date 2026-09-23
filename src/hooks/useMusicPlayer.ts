import { useCallback, useEffect, useRef, useState } from 'react';

export interface MusicTrack {
  id: string;
  name: string;
  url: string;
}

export interface MusicPlaylist {
  id: string;
  name: string;
  tracks: MusicTrack[];
}

const RADIO_URL_STORAGE_KEY = 'dna-legal-radio-url';
const PLAYLISTS_STORAGE_KEY = 'dna-legal-mp3-playlists';
// Default-Radio-Stream, der beim ersten Öffnen sofort was zum Hören liefert.
// Wird nur verwendet, wenn keine URL im localStorage hinterlegt ist — über
// System Status → Music lässt sich jederzeit eine andere URL eintragen.
const DEFAULT_RADIO_URL = 'https://icecast.somafm.com/groovesalad-128-mp3';

function loadStoredRadioUrl() {
  const stored = localStorage.getItem(RADIO_URL_STORAGE_KEY);
  // Früher war der SomaFM-Stream automatisch vorbelegt. Diese alte
  // Voreinstellung darf nicht weiter als aktive Audio-Quelle gelten.
  if (!stored || stored === DEFAULT_RADIO_URL) {
    if (stored === DEFAULT_RADIO_URL) localStorage.removeItem(RADIO_URL_STORAGE_KEY);
    return '';
  }
  return stored;
}

function loadStoredPlaylists(): MusicPlaylist[] {
  const raw = localStorage.getItem(PLAYLISTS_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // fall through
    }
  }
  return [{ id: 'default', name: 'Meine Playlist', tracks: [] }];
}

/**
 * Wiederverwendbarer Musik-Player-Hook.
 * Verwaltet Radio-Stream-URL, lokale MP3-Playlist und Playback-Status.
 * Alle Werte werden in localStorage persistiert.
 */
export function useMusicPlayer() {
  const [radioUrl, setRadioUrlState] = useState(loadStoredRadioUrl);
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>(() => loadStoredPlaylists());
  const [activePlaylistId, setActivePlaylistId] = useState(() => playlists[0]?.id ?? 'default');
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [radioError, setRadioError] = useState<string | null>(null);
  const [playlistName, setPlaylistName] = useState('');
  const [volume, setVolumeState] = useState(() => {
    const stored = localStorage.getItem('dna-legal-volume');
    const v = stored ? parseFloat(stored) : NaN;
    return isNaN(v) ? 0.8 : Math.max(0, Math.min(1, v));
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Volume wird auf das <audio>-Element und ins localStorage gesynct
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = volume === 0;
    }
    localStorage.setItem('dna-legal-volume', String(volume));
  }, [volume]);

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? playlists[0];
  const playlist = activePlaylist?.tracks ?? [];
  const activeTrack = playlist.find((t) => t.id === activeTrackId);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onError = () => {
      setRadioError('Stream/Titel konnte nicht geladen werden.');
    };
    audio.addEventListener('error', onError);
    return () => audio.removeEventListener('error', onError);
  }, []);

  const setRadioUrl = useCallback((url: string) => {
    setRadioUrlState(url);
    localStorage.setItem(RADIO_URL_STORAGE_KEY, url);
    setRadioError(null);
  }, []);

  const addTracks = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const tracks: MusicTrack[] = Array.from(files)
        .filter((f) => f.type === 'audio/mpeg' || f.name.toLowerCase().endsWith('.mp3'))
        .map((f) => ({
          id: `${f.name}-${f.lastModified}-${crypto.randomUUID()}`,
          name: f.name.replace(/\.mp3$/i, ''),
          url: URL.createObjectURL(f),
        }));
      if (!tracks.length) {
        setRadioError('Bitte nur MP3-Dateien auswählen.');
        return;
      }
      setPlaylists((current) =>
        current.map((item) =>
          item.id === activePlaylistId ? { ...item, tracks: [...item.tracks, ...tracks] } : item
        )
      );
      setRadioError(null);
    },
    [activePlaylistId]
  );

  const playTrack = useCallback(
    async (track: MusicTrack) => {
      if (!audioRef.current) return;
      setRadioError(null);
      audioRef.current.src = track.url;
      audioRef.current.load();
      audioRef.current.muted = volume === 0;
      audioRef.current.volume = volume;
      try {
        await audioRef.current.play();
        setActiveTrackId(track.id);
        setRadioPlaying(true);
      } catch {
        setRadioError('Die MP3 konnte nicht abgespielt werden.');
      }
    },
    [activePlaylistId]
  );

  const removeTrack = useCallback(
    (track: MusicTrack) => {
      if (activeTrackId === track.id) {
        audioRef.current?.pause();
        setActiveTrackId(null);
        setRadioPlaying(false);
      }
      URL.revokeObjectURL(track.url);
      setPlaylists((current) =>
        current.map((item) =>
          item.id === activePlaylistId
            ? { ...item, tracks: item.tracks.filter((t) => t.id !== track.id) }
            : item
        )
      );
    },
    [activePlaylistId, activeTrackId]
  );

  const createPlaylist = useCallback(() => {
    const name = playlistName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    const newPlaylist: MusicPlaylist = { id, name, tracks: [] };
    setPlaylists((current) => [...current, newPlaylist]);
    setActivePlaylistId(id);
    setPlaylistName('');
    setActiveTrackId(null);
  }, [playlistName]);

  const playNext = useCallback(() => {
    if (!playlist.length) return;
    const currentIndex = playlist.findIndex((t) => t.id === activeTrackId);
    const next = playlist[currentIndex + 1] ?? playlist[0];
    void playTrack(next);
  }, [playlist, activeTrackId, playTrack]);

  const playPrev = useCallback(() => {
    if (!playlist.length) return;
    const currentIndex = playlist.findIndex((t) => t.id === activeTrackId);
    if (currentIndex <= 0) {
      void playTrack(playlist[playlist.length - 1]);
    } else {
      void playTrack(playlist[currentIndex - 1]);
    }
  }, [playlist, activeTrackId, playTrack]);

  const toggleRadio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !radioUrl.trim()) {
      setRadioError('Bitte zuerst eine Radio-Stream-URL eintragen.');
      return;
    }
    if (radioPlaying) {
      audio.pause();
      setRadioPlaying(false);
      return;
    }
    setRadioError(null);
    audio.muted = volume === 0;
    audio.volume = volume;
    try {
      await audio.play();
      setRadioPlaying(true);
    } catch {
      setRadioError('Der Stream konnte nicht abgespielt werden. URL bitte prüfen.');
    }
  }, [radioUrl, radioPlaying]);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setRadioPlaying(false);
    setActiveTrackId(null);
  }, []);

  const persistPlaylists = useCallback(() => {
    localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists));
  }, [playlists]);

  useEffect(() => {
    persistPlaylists();
  }, [persistPlaylists]);

  return {
    // refs / element
    audioRef,
    // radio
    radioUrl,
    setRadioUrl,
    radioPlaying,
    toggleRadio,
    // playlist
    playlists,
    activePlaylistId,
    setActivePlaylistId,
    playlistName,
    setPlaylistName,
    createPlaylist,
    addTracks,
    playlist,
    activeTrack,
    activeTrackId,
    playTrack,
    removeTrack,
    playNext,
    playPrev,
    // volume
    volume,
    setVolume: setVolumeState,
    radioError,
    setRadioError,
    setRadioPlaying,
    setActiveTrackId,
    // misc
    stop,
  };
}

export type MusicPlayerApi = ReturnType<typeof useMusicPlayer>;
