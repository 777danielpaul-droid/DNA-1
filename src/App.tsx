import React, { useEffect, useRef, useState } from 'react';
import LandingHero from './components/LandingHero';
import InfoCircuitNode from './components/InfoCircuitNode';
import BurgerMenu from './components/BurgerMenu';
import BackgroundSplash from './components/BackgroundSplash';
import EndSplash from './components/EndSplash';
import CircuitOverlay from './components/CircuitOverlay';
import GeminiChat from './components/GeminiChat';
import ModelWindow from './components/ModelWindow';
import InjectSoulCard from './components/InjectSoulCard';
import DataStreamSoul from './components/DataStreamSoul';
import SystemStatusPanel from './components/SystemStatusPanel';
import InvoiceScanner from './components/InvoiceScanner';
import RemoteInputPage from './components/RemoteInputPage';
import { initDnaScene } from './three/DnaScene';
import { useScrollProgress } from './hooks/useScrollProgress';
import { useMusicPlayer } from './hooks/useMusicPlayer';
import { smoothScrollToProgress } from './lib/scrollTo';
import { getRoomCodeFromUrl } from './lib/remoteInput';
import { type ProviderId } from './lib/aiProviders';

type MenuKey = 'neural' | 'soul' | 'streams' | 'network' | 'system' | 'diagnostics' | null;

// ScrollProgress-Zielwert für den geheimen Chill-Modus (finales Bild: keine
// Menüs, absolute Leere, tummelnde Partikel, leuchtender Engel + Chatfenster).
const CHILL_SCROLL_PROGRESS = 0.71;
// Toleranzband um CHILL_SCROLL_PROGRESS, nur um den Re-Trigger-Schutz von
// triggerChillMode() wieder freizugeben, sobald man den Zielbereich verlässt.
const CHILL_EXIT_TOLERANCE = 0.06;

export default function App() {
  // JARVIS-Fernbedienung: wird die App mit ?remote=<code> geöffnet (z. B.
  // über den QR-Code aus dem Chat-Header, siehe GeminiChat.tsx), rendern wir
  // NUR die leichte Handy-Eingabeseite — kein Sinn, dafür extra die ganze
  // 3D-DNA-Szene, Musik-Player usw. mitzuladen. Per useState statt einer
  // reinen Konstante ausgewertet, damit React hier sauber early-returnt,
  // ohne dass die Hook-Reihenfolge der restlichen Komponente durcheinanderkommt.
  const [remoteRoomCode] = useState(() => getRoomCodeFromUrl());
  if (remoteRoomCode) {
    return <RemoteInputPage roomCode={remoteRoomCode} />;
  }

  return <MainApp />;
}

function MainApp() {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const landingPageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isDark, setIsDark] = useState(true);
  const [activeMenu, setActiveMenu] = useState<MenuKey>('neural');
  const scrollProgress = useScrollProgress();
  const autoOpenedRef = useRef(false);
  // Einzige, geteilte Musik-Player-Instanz für die ganze App — sowohl
  // SystemStatusPanel (Upload/Playlist-Verwaltung) als auch der Mini-Player
  // im Chat-Header greifen auf denselben State + dasselbe <audio>-Element
  // zu, statt (wie vorher) je eine eigene, unabhängige Instanz zu haben.
  const music = useMusicPlayer();

  // Persona-Modus: standardmäßig LOCK IN (Hauptpersona). Wechselt auf CHILL
  // gezielt dann, wenn SECRETS gedrückt wird und das Video/Audio-Event
  // auslöst (siehe triggerChillMode), oder manuell über den CHILL/LOCK
  // IN-Button im Chat-Header (siehe togglePersonaMode unten). Kein
  // automatischer Wechsel mehr anhand von Scroll-Position/EndSplash-Bereich.
  // null = kein manueller/Event-Override aktiv → LOCK IN.
  const [personaOverride, setPersonaOverride] = useState<'chill' | 'lockin' | null>(null);
  // Reiner Re-Trigger-Schutz für triggerChillMode() (SECRETS-Video), damit
  // audio.onEnded nicht mehrfach hintereinander feuert, solange man noch in
  // der Nähe von CHILL_SCROLL_PROGRESS ist. Hat keinen Einfluss mehr auf die
  // Persona selbst — die ergibt sich rein aus scrollProgress + Override.
  const chillActivatedRef = useRef(false);
  // Fallback-Timer für das SECRETS-Video: manche Browser (v.a. Safari/iOS)
  // feuern das native "ended"-Event bei playbackRate > ~2× unzuverlässig
  // oder gar nicht — das Video bleibt dann einfach am letzten erreichten
  // Frame hängen, statt sichtbar durchzulaufen. Dieser Timer garantiert den
  // Abschluss unabhängig davon (siehe handleMenuClick/finishSecretsVideo).
  const secretsVideoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!canvasContainerRef.current) return;
    const cleanup = initDnaScene(canvasContainerRef.current, landingPageRef, isDark);
    return cleanup;
  }, [isDark]);

  // Aufräumen: Fallback-Timer für das SECRETS-Video beim Unmount canceln.
  useEffect(() => {
    return () => {
      if (secretsVideoTimerRef.current) clearTimeout(secretsVideoTimerRef.current);
    };
  }, []);

  // Chatfenster blendet sich automatisch ein, sobald ans Ende gescrollt wird
  // (statt nur per Klick auf "NEURAL MAPPING"). Manuelles Schließen am Ende
  // bleibt respektiert, bis erneut weg- und wieder zurückgescrollt wird.
  useEffect(() => {
    if (scrollProgress >= 0.98) {
      if (!autoOpenedRef.current) {
        // Originales Verhalten: Am Seitenende öffnet sich der Chat automatisch.
        // Das bleibt unabhängig vom aktuell sichtbaren Menü/Panel.
        setChatOpen(true);
        autoOpenedRef.current = true;
      }
    } else {
      autoOpenedRef.current = false;
    }
  }, [scrollProgress]);

  const handleMenuClick = (id: string) => {
    if (id === 'secrets') {
      const video = videoRef.current;
      const audio = audioRef.current;
      if (!video) return;
      video.currentTime = 0;
      // Video-Tempo an die Tonspur angleichen: die Video-Rate wird so
      // gewählt, dass der (stumme) Ping-Pong-Clip genauso lange läuft wie
      // der Ton (video.duration / audio.duration) — Bild und Ton enden so
      // ungefähr gleichzeitig, statt dass das Video viel schneller
      // durchläuft. Metadaten sind dank preload="auto" normalerweise schon
      // geladen; ohne verfügbare Dauer bleibt es beim normalen Tempo (1×).
      const videoDuration = video.duration && isFinite(video.duration) ? video.duration : null;
      const audioDuration = audio?.duration && isFinite(audio.duration) ? audio.duration : null;
      video.playbackRate = videoDuration && audioDuration ? videoDuration / audioDuration : 1.0;
      video.play().catch(e => console.error('Video play failed:', e));
      if (audio) {
        audio.currentTime = 0;
        audio.playbackRate = 1.0;
      }
      if (audio && video) {
        const onPlaying = () => {
          audio.play().catch(e => console.error('Audio play failed:', e));
          video.removeEventListener('playing', onPlaying);
        };
        if (video.seeking || !video.currentTime) {
          video.addEventListener('playing', onPlaying, { once: true });
        } else {
          audio.play().catch(e => console.error('Audio play failed:', e));
        }
      }

      // Notfall-Timer: fester, großzügiger Wert unabhängig vom tatsächlich
      // angewendeten playbackRate (die reale Video-Länge ist nur 7s — selbst
      // falls der Browser die Rate ignoriert oder deckelt, wäre das Video
      // spätestens hier fertig). Der eigentliche Abschluss läuft normalerweise
      // viel früher über onTimeUpdate/onEnded (siehe finishSecretsVideo) —
      // dieser Timer greift nur, falls beide Events aus irgendeinem Grund
      // gar nicht feuern.
      if (secretsVideoTimerRef.current) clearTimeout(secretsVideoTimerRef.current);
      secretsVideoTimerRef.current = setTimeout(finishSecretsVideo, 9000);
    } else if (id === 'neural') {
      setChatOpen(true);
      setActiveMenu('neural');
    } else if (id === 'soul') {
      setActiveMenu('soul');
    } else if (id === 'network') {
      setActiveMenu('network');
    } else if (id === 'streams') {
      setActiveMenu('streams');
    } else if (id === 'system') {
      setActiveMenu('system');
    } else if (id === 'diag') {
      setActiveMenu('diagnostics');
    }
  };

  const closeMenu = () => setActiveMenu(null);
  const [invoiceScannerOpen, setInvoiceScannerOpen] = useState(false);
  // Sobald eines der rechtsseitigen Vollbild-Menüs offen ist, dockt der Chat
  // links an (siehe GeminiChat "dockLeft"), statt vom Menü verdeckt zu
  // werden — so kann man während der Einstellungen weiterchatten.
  const menuOpen = (activeMenu !== null && activeMenu !== 'neural') || invoiceScannerOpen;
  // Der Chat ist ein dauerhaftes, bildschirmfestes Element und wird nicht mehr
  // an den aktiven Home-Menüpunkt gekoppelt. Nur der explizite Schließen-Button
  // blendet ihn aus; über NEURAL MAPPING kann er wieder geöffnet werden.
  const [chatOpen, setChatOpen] = useState(true);

  // === Geheimer Chill-Modus: Trigger ===
  // Aktiviert sich, sobald das SECRETS-Video komplett durchgelaufen ist: die
  // Seite wird sanft auf ScrollProgress 0.71 zurückgespult, alle offenen
  // Menüs schließen, der Chat öffnet sich mit der geheimen "power behind the
  // throne"-Persona.
  const triggerChillMode = () => {
    if (chillActivatedRef.current) return;
    chillActivatedRef.current = true;
    // Keine Menüs im Chill-Modus — alle offenen Vollbild-Panels schließen.
    setActiveMenu(null);
    setInvoiceScannerOpen(false);
    // SECRETS schaltet gezielt auf CHILL um (fester Override) — die Persona
    // folgt nicht mehr automatisch der Scroll-Position, sondern ausschließlich
    // diesem Event bzw. dem manuellen CHILL/LOCK IN-Button.
    setPersonaOverride('chill');
    smoothScrollToProgress(CHILL_SCROLL_PROGRESS).then(() => {
      setChatOpen(true);
    });
  };

  // Räumt das SECRETS-Video/Audio auf (ausblenden, pausieren, zurückspulen)
  // und löst den Chill-Modus aus. Wird sowohl vom nativen video.onEnded als
  // auch vom Fallback-Timer aufgerufen (siehe secretsVideoTimerRef) — damit
  // der Ablauf auch dann garantiert zu Ende kommt, wenn ein Browser das
  // "ended"-Event bei hohem playbackRate nicht zuverlässig feuert.
  const finishSecretsVideo = () => {
    if (secretsVideoTimerRef.current) {
      clearTimeout(secretsVideoTimerRef.current);
      secretsVideoTimerRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.style.opacity = '0';
      videoRef.current.pause();
    }
    triggerChillMode();
  };

  // Reiner Guard-Reset: sobald man den CHILL_SCROLL_PROGRESS-Bereich wieder
  // verlässt, darf SECRETS erneut ausgelöst werden.
  useEffect(() => {
    if (Math.abs(scrollProgress - CHILL_SCROLL_PROGRESS) > CHILL_EXIT_TOLERANCE) {
      chillActivatedRef.current = false;
    }
  }, [scrollProgress]);

  // Effektiver Persona-Modus: Override (per SECRETS-Event oder manuellem
  // Button) gewinnt, sonst Standard LOCK IN. Kein Bezug mehr zur
  // Scroll-Position/EndSplash-Bereich.
  const personaMode = personaOverride ?? 'lockin';
  const chillMode = personaMode === 'chill';
  const togglePersonaMode = () => {
    // Ein Klick kehrt den GERADE AKTIVEN Modus um und pinnt ihn als manuellen
    // Override — bleibt so lange stehen, bis erneut geklickt wird (oder
    // SECRETS auf CHILL umschaltet, siehe triggerChillMode oben).
    setPersonaOverride(chillMode ? 'lockin' : 'chill');
  };

  // State für Model-Injektion vom ModelWindow → GeminiChat
  const [pendingInjection, setPendingInjection] = useState<{ provider: ProviderId; model: string } | null>(null);
  const clearInjection = () => setPendingInjection(null);

  return (
    <>
      <BurgerMenu onThemeChange={setIsDark} />
      <div id="canvas-container" ref={canvasContainerRef} />
      <EndSplash isDark={isDark} />
      <BackgroundSplash isDark={isDark} />
      <CircuitOverlay onMenuClick={handleMenuClick} />
      <GeminiChat
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        modelInjection={pendingInjection}
        music={music}
        dockLeft={menuOpen}
        chillMode={chillMode}
        onTogglePersonaMode={togglePersonaMode}
      />
      <ModelWindow
        open={activeMenu === 'network'}
        onClose={closeMenu}
        music={music}
        onInject={(selection) => {
          // Setze das Modell als pendingInjection — GeminiChat greift es direkt
          // via modelInjection-Prop ab (kein Timing-Race durch Events).
          setPendingInjection({ provider: selection.provider, model: selection.model });
          setActiveMenu('neural');
          // Reset nach dem nächsten Render, sobald GeminiChat es verarbeitet hat
          setTimeout(() => setPendingInjection(null), 100);
        }}
      />
      <InjectSoulCard open={activeMenu === 'soul'} onClose={closeMenu} />
      <SystemStatusPanel
        open={activeMenu === 'system'}
        defaultTab="status"
        isDark={isDark}
        onClose={closeMenu}
        music={music}
        onOpenInvoiceScanner={() => setInvoiceScannerOpen(true)}
      />
      <SystemStatusPanel
        open={activeMenu === 'diagnostics'}
        defaultTab="diagnostics"
        isDark={isDark}
        onClose={closeMenu}
        music={music}
        onOpenInvoiceScanner={() => setInvoiceScannerOpen(true)}
      />
      <InvoiceScanner open={invoiceScannerOpen} onClose={() => setInvoiceScannerOpen(false)} />
      <DataStreamSoul open={activeMenu === 'streams'} onClose={closeMenu} />
      {/* secrets video — spielt als Vollbild-Hintergrund beim Klick auf "SECRETS"
          im Circuit-Menü. Die Video-Datei ist ein vorgerendertes Ping-Pong
          (3,5s vorwärts + 3,5s rückwärts, ohne Ton) — kein Live-Scrubbing im
          Browser nötig. Die Tonspur läuft als separates <audio>-Element parallel;
          die Video-Rate wird beim Start so berechnet, dass beide etwa
          gleichzeitig enden (siehe handleMenuClick). */}
      <div
        id="secrets-video-wrapper"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: 9997, // über Canvas (0), unter Circuit-Overlay-Dots (9998)
        }}
      >
        <video
          ref={videoRef}
          src="/secrets-video.mp4"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            objectFit: 'cover',
            opacity: 0,
            transition: 'opacity 0.3s ease',
          }}
          playsInline
          preload="auto"
          onPlaying={() => {
            if (videoRef.current) {
              videoRef.current.style.opacity = '1';
            }
          }}
          onTimeUpdate={() => {
            // Primärer Abschluss-Trigger: echter Wiedergabefortschritt statt
            // einer geschätzten Zeit — funktioniert unabhängig davon, ob der
            // Browser die dynamisch gesetzte playbackRate exakt so umsetzt
            // wie erwartet (manche Browser deckeln hohe Raten intern), und
            // unabhängig von Start-Verzögerungen. onEnded bleibt als
            // zusätzliches Signal bestehen, greift aber bei manchen Browsern
            // bei hohem playbackRate unzuverlässig — daher hier die
            // robustere Prüfung.
            const v = videoRef.current;
            if (v && v.duration && isFinite(v.duration) && v.duration - v.currentTime < 0.15) {
              finishSecretsVideo();
            }
          }}
          onEnded={() => {
            // Regulärer Abschluss übers native "ended"-Event — meist kommt
            // finishSecretsVideo aber schon über onTimeUpdate oben zum Zug
            // (idempotent dank chillActivatedRef-Guard in triggerChillMode).
            finishSecretsVideo();
          }}
        />
        <audio
          ref={audioRef}
          src="/secrets-audio.m4a"
          preload="auto"
          onEnded={() => {
            // Wenn der Ton zu Ende ist, das Video ebenfalls stoppen und zurücksetzen.
            if (videoRef.current) {
              videoRef.current.pause();
              videoRef.current.currentTime = 0;
            }
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
            }
            // Der Chill-Modus-Trigger läuft über video.onEnded (siehe oben),
            // nicht hier — hier wird nur noch aufgeräumt.
          }}
        />
      </div>
      {/* Einziges <audio>-Element für den Musik-Player (Radio + lokale MP3s).
          Bewusst hier auf App-Ebene und nicht in MusicHUD/SystemStatusPanel,
          da beide Panels bei geschlossenem Zustand komplett unmounten
          (return null) — läge das <audio>-Element dort, würde Musik beim
          Schließen des Panels abbrechen. So läuft sie unabhängig weiter,
          während im Header nur die Mini-Steuerung sichtbar ist. */}
      <audio
        ref={music.audioRef}
        src={music.activeTrack?.url || music.radioUrl || undefined}
        style={{ display: 'none' }}
        onPause={() => music.setRadioPlaying(false)}
        onError={() => music.setRadioError('Der Stream/Titel konnte nicht geladen werden.')}
        onEnded={music.playNext}
      />
      <div className="scroll-spacer">
        <LandingHero innerRef={landingPageRef} isDark={isDark} />
        <InfoCircuitNode />
      </div>
    </>
  );
}
