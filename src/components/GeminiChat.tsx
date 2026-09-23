import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import '../styles/GeminiChat.css';
import { useExtensionBridge } from '../hooks/useExtensionBridge';
import { useTerminalBridge } from '../hooks/useTerminalBridge';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { usePersona } from '../hooks/usePersona';
import { PROVIDERS, PROVIDER_ORDER, sendChatMessage, fetchAvailableModels, getModelAccessLabel, getOllamaMode, setOllamaMode, getOllamaCloudApiKey, setOllamaCloudApiKey, type OllamaMode, type ProviderId } from '../lib/aiProviders';
import { buildSystemInstructions, buildChillSystemInstructions } from '../lib/persona';
import { type MusicPlayerApi } from '../hooks/useMusicPlayer';
import MusicHUD from './MusicHUD';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { buildMemoryContext, extractExplicitMemoryFacts, setMemoryFact, getRelevantMemoryFacts } from '../lib/aiMemory';
import { DATA_STREAM_QUESTIONS } from '../lib/dataStreamQuestions';
import { createApiAdapter } from '../lib/aiOrchestrator';
import { generateRoomCode, buildRemotePairingUrl, subscribeToRemoteInput, needsLanHostOverride, setLanHostOverride } from '../lib/remoteInput';
import QRCode from 'qrcode';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  images?: string[];
  via?: ProviderId | 'bridge' | 'terminal' | 'remote';
}

interface ChatAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  text?: string;
  /** Bei Bild-Anhängen: Data-URL (base64) fürs Vision-fähige Modell. */
  imageData?: string;
  status: 'ready' | 'reading' | 'unsupported' | 'error';
  error?: string;
}

interface GeminiChatProps {
  open: boolean;
  onClose: () => void;
  /** Optional: Modell, das vom ModelWindow injiziert wurde.
   * Wird angewendet, sobald GeminiChat gemountet ist, dann zurückgestellt auf null. */
  modelInjection?: { provider: ProviderId; model: string } | null;
  /** Geteilte Musik-Player-Instanz (aus App.tsx) — dieselbe wie in
   * SystemStatusPanel, damit der Mini-Player im Header dieselbe Playlist/
   * denselben Wiedergabestatus steuert. */
  music: MusicPlayerApi;
  /** True, sobald eines der Vollbild-Menüs (System Status, Network, Soul, …)
   * offen ist. Diese Menüs belegen dann nur die linke Bildschirmhälfte —
   * der Chat dockt in diesem Fall rechts an, damit man während der
   * Einstellungen weiterchatten kann (z.B. sich von PRIS durchführen lassen). */
  dockLeft?: boolean;
  /** True, sobald der geheime Chill-Modus aktiv ist — entweder automatisch
   * (Scroll-Position vor dem Arbeitsbereich/EndSplash) oder weil der Nutzer
   * manuell auf "Chill" umgeschaltet hat (siehe onTogglePersonaMode).
   * Schaltet die Persona auf die "power behind the throne"-Seele um und löst
   * nach einer kurzen Pause die eigenständige Gesprächseröffnung aus. */
  chillMode?: boolean;
  /** Manueller Persona-Umschalter ("CHILL" ⇄ "LOCK IN"), überschreibt die
   * automatische Scroll-Positions-Logik in App.tsx bis erneut geklickt wird.
   * Optional, damit GeminiChat auch ohne diesen Schalter nutzbar bleibt. */
  onTogglePersonaMode?: () => void;
}

type Source = ProviderId | 'bridge';

const SOURCE_LABEL: Record<Source, string> = {
  ...PROVIDER_ORDER.reduce((acc, p) => ({ ...acc, [p]: PROVIDERS[p].label }), {} as Record<ProviderId, string>),
  bridge: 'BRIDGE',
};

function loadCredential(provider: ProviderId): string {
  const stored = localStorage.getItem(PROVIDERS[provider].keyStorageKey);
  if (stored) return stored;
  return '';
}

function loadModel(provider: ProviderId): string {
  return localStorage.getItem(PROVIDERS[provider].modelStorageKey) || PROVIDERS[provider].defaultModel;
}

// Sprachen-Tags, bei denen ein "▶ Ausführen"-Button neben dem Codeblock
// angezeigt wird (nur diese werden als Terminal-Befehl interpretiert).
const TERMINAL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'terminal', 'console', 'cmd']);

/**
 * Rendert Nachrichtentext mit einfacher ```-Codeblock-Erkennung. Fenced
 * Blöcke mit einer Terminal-Sprache (bash/sh/shell/...) bekommen einen
 * "▶ Ausführen"-Button, der den Befehl über die lokale Terminal-Bridge
 * laufen lässt — nur nach explizitem Klick, nie automatisch.
 */
function renderMessageContent(
  text: string,
  keyPrefix: string,
  runningCommands: Record<string, boolean>,
  onRun: (cmd: string, key: string) => void,
  terminalAvailable: boolean
): React.ReactNode {
  const parts = text.split(/```(\w*)\n([\s\S]*?)```/g);
  // split() mit Capture-Gruppen liefert abwechselnd: text, lang, code, text, lang, code, ...
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    const plain = parts[i];
    if (plain) nodes.push(<span key={`${keyPrefix}-t${i}`}>{plain}</span>);
    const lang = parts[i + 1];
    const code = parts[i + 2];
    if (code !== undefined) {
      const isTerminal = TERMINAL_LANGS.has((lang || '').toLowerCase());
      const cmdKey = `${keyPrefix}-c${i}`;
      nodes.push(
        <div key={cmdKey} className="gemini-chat-code-block">
          <pre>
            <code>{code.replace(/\n$/, '')}</code>
          </pre>
          {isTerminal && (
            <button
              type="button"
              className="gemini-chat-run-btn"
              disabled={!terminalAvailable || !!runningCommands[cmdKey]}
              title={terminalAvailable ? 'Befehl über die lokale Terminal-Bridge ausführen' : 'Terminal-Bridge nicht verbunden'}
              onClick={() => onRun(code.replace(/\n$/, ''), cmdKey)}
            >
              {runningCommands[cmdKey] ? '⏳ läuft...' : '▶ Ausführen'}
            </button>
          )}
        </div>
      );
    }
  }
  return nodes.length > 0 ? nodes : text;
}

// Verschiedene Tonalitäten für die Chill-Modus-Eröffnung — bei jeder
// Aktivierung wird eine zufällig ausgewählt, damit es sich nicht bei jedem
// Mal exakt gleich anfühlt. Alle enden bewusst auf eine Musik-Frage, die den
// dynamisch ermittelten Vorschlag (Gedächtnis oder Playlist) einbaut.
const CHILL_OPENER_TEMPLATES: Array<(musicLine: string) => string> = [
  (musicLine) =>
    'Die besten Entscheidungen fallen ohnehin erst, wenn man aufhört zu suchen. ' +
    'Was schwirrt dir gerade durch den Kopf, das absolut nichts mit deinen To-Do-Listen zu tun hat? ' +
    `... Ich hab übrigens kurz in dein Gedächtnis geschaut. Soll ich dir ${musicLine} anmachen? Die Regler stehen bereit.`,
  (musicLine) =>
    'Manchmal ist die lauteste Frage die, die man sich nie laut stellt. ' +
    `Welche wäre das bei dir gerade? ... Ich leg dir dazu schon mal ${musicLine} auf, wenn du magst — sag einfach Bescheid.`,
  (musicLine) =>
    'Kein To-Do heute, keine Liste — nur du und das, was gerade wirklich in dir arbeitet. ' +
    `Magst du mir davon erzählen? Und soll ich dir dazu ${musicLine} anmachen?`,
  (musicLine) =>
    'Du musst hier nichts lösen. Erzähl mir einfach, was gerade in dir rumspukt. ' +
    `... Nebenbei, ich hab kurz reingehört: Soll ich dir ${musicLine} auflegen?`,
  (musicLine) =>
    'Ganz ehrlich: Die besten Ideen kommen selten, wenn man sie sucht. ' +
    `Was taucht bei dir gerade auf, wenn du gar nicht darüber nachdenkst? Soll ich dir dazu ${musicLine} anmachen? Die Regler stehen bereit.`,
];

// Baut die Eröffnungsnachricht des Chill-Modus: variable Tonalität (siehe
// oben), aber immer mit einem echten, dynamisch ermittelten Musikvorschlag
// aus Gedächtnis oder Playlist statt einer Phrase ins Blaue.
async function buildChillOpener(
  music: MusicPlayerApi,
  memoryEnabled: boolean,
  memoryUser: unknown
): Promise<string> {
  let musicLine = 'etwas ruhige Musik';
  try {
    if (memoryEnabled && memoryUser) {
      const facts = await getRelevantMemoryFacts('musik lieblingsmusik genre playlist song lied band kuenstler', 30);
      const musicFact = facts.find((f) => /musik|genre|playlist|song|lied|band|k[uü]nstler/i.test(f.key));
      if (musicFact) {
        const value = typeof musicFact.value === 'string' ? musicFact.value : JSON.stringify(musicFact.value);
        musicLine = `etwas in Richtung ${value}`;
      }
    }
  } catch {
    // Gedächtnis nicht erreichbar — beim Playlist-Fallback bleiben.
  }
  if (musicLine === 'etwas ruhige Musik' && music.playlist.length > 0) {
    const track = music.playlist[Math.floor(Math.random() * music.playlist.length)];
    musicLine = `„${track.name}“`;
  }
  const template = CHILL_OPENER_TEMPLATES[Math.floor(Math.random() * CHILL_OPENER_TEMPLATES.length)];
  return template(musicLine);
}

export default function GeminiChat({ open, onClose, modelInjection, music, dockLeft = false, chillMode = false, onTogglePersonaMode }: GeminiChatProps) {
  const [source, setSource] = useState<Source>('gemini');
  const [credentials, setCredentials] = useState<Record<ProviderId, string>>(() =>
    PROVIDER_ORDER.reduce((acc, p) => ({ ...acc, [p]: loadCredential(p) }), {} as Record<ProviderId, string>)
  );
  const [models, setModels] = useState<Record<ProviderId, string>>(() =>
    PROVIDER_ORDER.reduce((acc, p) => ({ ...acc, [p]: loadModel(p) }), {} as Record<ProviderId, string>)
  );
  const [credentialDraft, setCredentialDraft] = useState('');
  const [modelDraft, setModelDraft] = useState('');
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [synthesisProviders, setSynthesisProviders] = useState<Array<ProviderId | 'bridge'>>(() => {
    try {
      const raw = localStorage.getItem('pris-synthesis-providers');
      const saved = JSON.parse(raw || '["bridge"]');
      if (!Array.isArray(saved)) return ['bridge'];
      const valid = saved.filter((x: unknown): x is ProviderId | 'bridge' =>
        x === 'bridge' || (typeof x === 'string' && PROVIDER_ORDER.includes(x as ProviderId))
      );
      // Migration: the previous NETWORK build accidentally filtered `bridge` out.
      // An empty saved list from that regression should restore the working default.
      return valid.length > 0 ? valid : ['bridge'];
    } catch { return ['bridge']; }
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string>('');
  const [questionnaireRunning, setQuestionnaireRunning] = useState(false);
  const [questionnaireResults, setQuestionnaireResults] = useState<Array<{ question: string; answer: string; abstracted: boolean }>>([]);
  const [maximized, setMaximized] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(() => localStorage.getItem('pris-memory-enabled') !== 'false');
  const [pendingTerminalCommand, setPendingTerminalCommand] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sourceMenuRef = useRef<HTMLDivElement>(null);

  const bridge = useExtensionBridge();
  const terminal = useTerminalBridge();
  const [bridgeTabId, setBridgeTabId] = useState<number | null>(null);
  const persona = usePersona();
  const { user: memoryUser } = useSupabaseAuth();
  const historyLoadedForUser = useRef<string | null>(null);

  // Das Langzeitgedächtnis ist bewusst optional. Chatverläufe werden NICHT in
  // Supabase gespeichert; nur explizit erkannte Memory-Keys landen in ai_memory.
  useEffect(() => {
    localStorage.setItem('pris-memory-enabled', String(memoryEnabled));
  }, [memoryEnabled]);

  // === Chill-Modus: eigenständige Gesprächseröffnung ===
  // Nach Aktivierung wartet das System eine organische Pause (3–4s), damit der
  // Nutzer die Chance hat, das erste Wort zu haben. Schreibt der Nutzer in
  // dieser Zeit selbst (siehe sendMessage), entfällt die automatische Eröffnung.
  const chillOpenerTimerRef = useRef<number | null>(null);
  const chillOpenerFiredRef = useRef(false);

  useEffect(() => {
    if (!chillMode) {
      chillOpenerFiredRef.current = false;
      if (chillOpenerTimerRef.current !== null) {
        window.clearTimeout(chillOpenerTimerRef.current);
        chillOpenerTimerRef.current = null;
      }
      return;
    }
    if (chillOpenerFiredRef.current) return;
    const delay = 3000 + Math.random() * 1000; // 3–4s, organisch variiert
    chillOpenerTimerRef.current = window.setTimeout(() => {
      chillOpenerTimerRef.current = null;
      chillOpenerFiredRef.current = true;
      buildChillOpener(music, memoryEnabled, memoryUser).then((opener) => {
        setMessages((prev) => [...prev, { role: 'model', text: opener }]);
      });
    }, delay);
    return () => {
      if (chillOpenerTimerRef.current !== null) {
        window.clearTimeout(chillOpenerTimerRef.current);
        chillOpenerTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chillMode]);

  const speech = useSpeechToText((text) => {
    setInput((prev) => (prev ? `${prev} ${text}` : text));
  });

  // === JARVIS-Fernbedienung ===
  // Ein zweites, gekoppeltes Gerät (z. B. Handy) kann Eingaben live in
  // diesen Chat einspeisen (siehe RemoteInputPage.tsx + lib/remoteInput.ts).
  // Der Raumcode/QR wird erst beim ersten Öffnen des Panels erzeugt, die
  // Kanal-Subscription bleibt aber danach bestehen, solange GeminiChat
  // gemountet ist — Eingaben kommen also auch an, wenn das QR-Panel
  // inzwischen wieder geschlossen wurde.
  const [remotePanelOpen, setRemotePanelOpen] = useState(false);
  const [remoteRoomCode, setRemoteRoomCode] = useState<string | null>(null);
  const [remoteQrDataUrl, setRemoteQrDataUrl] = useState<string | null>(null);
  const [remoteReceivedAt, setRemoteReceivedAt] = useState<number | null>(null);
  // Wird die App gerade über localhost/127.0.0.1 aufgerufen, ist der QR-Link
  // vom Handy aus nie erreichbar ("Webseite nicht erreichbar") — dann fragen
  // wir stattdessen einmalig die LAN-IP des Rechners ab (siehe remoteInput.ts).
  const [remoteLanInput, setRemoteLanInput] = useState('');
  const [remoteNeedsLanHost, setRemoteNeedsLanHost] = useState(false);

  useEffect(() => {
    if (!remotePanelOpen || remoteRoomCode) return;
    setRemoteNeedsLanHost(needsLanHostOverride());
    const code = generateRoomCode();
    setRemoteRoomCode(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remotePanelOpen]);

  useEffect(() => {
    if (!remoteRoomCode || remoteNeedsLanHost) return;
    QRCode.toDataURL(buildRemotePairingUrl(remoteRoomCode), { width: 220, margin: 1 })
      .then(setRemoteQrDataUrl)
      .catch(() => setRemoteQrDataUrl(null));
  }, [remoteRoomCode, remoteNeedsLanHost]);

  const handleSaveLanHost = () => {
    const host = remoteLanInput.trim();
    if (!host) return;
    setLanHostOverride(host);
    setRemoteNeedsLanHost(false);
  };

  useEffect(() => {
    if (!remoteRoomCode) return;
    return subscribeToRemoteInput(remoteRoomCode, (text) => {
      setRemoteReceivedAt(Date.now());
      void sendMessage(text);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteRoomCode]);

  // Live von der jeweiligen Anbieter-API geladene Modelle (statt der fest
  // einprogrammierten, schnell veraltenden Listen). Wird beim Öffnen des
  // Source-Dropdowns nachgeladen, sobald ein Key für den Provider vorliegt.
  const [liveModels, setLiveModels] = useState<Partial<Record<ProviderId, string[]>>>({});
  const [modelFetchState, setModelFetchState] = useState<Partial<Record<ProviderId, 'loading' | 'error'>>>({});
  // BUG-FIX: liveModels.ollama wurde bisher unabhängig vom LOKAL/CLOUD-Modus
  // gecacht — nach einem Wechsel auf Cloud (im MODELS-Fenster) blieb hier die
  // alte, rein lokale Liste stehen, weil der Cache-Guard unten nie erneut
  // ausgelöst hat. Wir merken uns zusätzlich, für welchen Modus zuletzt
  // geladen wurde, und invalidieren den Cache, sobald sich der Modus ändert.
  const [ollamaFetchedMode, setOllamaFetchedMode] = useState<OllamaMode | null>(null);
  // BUG-FIX: Bisher gab es GAR KEINEN Weg, im Chat-Fenster selbst zwischen
  // Ollama LOKAL/CLOUD umzuschalten — nur im separaten MODELS-Fenster. Jetzt
  // gibt es den Umschalter direkt hier (siehe Toggle weiter unten im JSX).
  const [ollamaModeUI, setOllamaModeUI] = useState<OllamaMode>(() => getOllamaMode());

  // Sobald der Modus wechselt (oder Ollama als Quelle aktiv wird), das
  // richtige Credential nachladen: lokal = Server-URL, cloud = Ollama-
  // Cloud-API-Key (eigener localStorage-Schlüssel, siehe googleWorkspace-
  // artiges Muster in aiProviders.ts).
  useEffect(() => {
    if (source !== 'ollama') return;
    const stored =
      ollamaModeUI === 'cloud'
        ? getOllamaCloudApiKey()
        : localStorage.getItem(PROVIDERS.ollama.keyStorageKey) || PROVIDERS.ollama.credentialDefault;
    setCredentials((prev) => (prev.ollama === stored ? prev : { ...prev, ollama: stored }));
  }, [source, ollamaModeUI]);

  const handleOllamaModeChange = (mode: OllamaMode) => {
    setOllamaModeUI(mode);
    setOllamaMode(mode);
    const nextCredential =
      mode === 'cloud'
        ? getOllamaCloudApiKey()
        : localStorage.getItem(PROVIDERS.ollama.keyStorageKey) || PROVIDERS.ollama.credentialDefault;
    setCredentials((prev) => ({ ...prev, ollama: nextCredential }));
    setSourceMenuOpen(true); // Menü offen halten, direkt die neue Liste zeigen
    loadLiveModelsFor('ollama', nextCredential);
  };

  const loadLiveModelsFor = async (provider: ProviderId, credentialOverride?: string) => {
    setModelFetchState((prev) => ({ ...prev, [provider]: 'loading' }));
    try {
      const currentOllamaMode = provider === 'ollama' ? getOllamaMode() : null;
      const credential = credentialOverride ?? credentials[provider] ?? '';
      const list = await fetchAvailableModels(provider, credential, currentOllamaMode ?? undefined);
      setLiveModels((prev) => ({ ...prev, [provider]: list }));
      if (provider === 'ollama') setOllamaFetchedMode(currentOllamaMode);
      // Ollama hat keinen festen Modellnamen: Wenn das bisher gespeicherte
      // Modell lokal nicht installiert ist, automatisch das erste tatsächlich
      // vorhandene Modell verwenden. So bleibt z. B. ein altes `llama3.1`
      // nicht dauerhaft als ungültige Auswahl stehen.
      if (list.length > 0 && provider === 'ollama' && !list.includes(models[provider])) {
        const nextModel = list[0];
        setModels((prev) => ({ ...prev, [provider]: nextModel }));
        localStorage.setItem(PROVIDERS[provider].modelStorageKey, nextModel);
      }
      setModelFetchState((prev) => ({ ...prev, [provider]: undefined }));
    } catch {
      // Fällt still auf PROVIDERS[provider].modelList zurück.
      setModelFetchState((prev) => ({ ...prev, [provider]: 'error' }));
    }
  };

  const isProvider = (s: Source): s is ProviderId => s !== 'bridge';
  const activeProvider = isProvider(source) ? source : null;
  const activeCredential = activeProvider ? credentials[activeProvider] : '';
  const activeModel = activeProvider ? models[activeProvider] : '';
  // Nur Cloud-Anbieter brauchen zwingend einen eingetragenen Wert; Ollama hat
  // einen sinnvollen Default (localhost) und blockt das Senden nicht.
  // Provider mit allowNoCredential=true (z.B. openrouter-free) funktionieren
  // auch ohne Key — Key ist optional/bestärkend.
  const needsCredential =
    activeProvider !== null &&
    activeProvider !== 'ollama' &&
    !(activeProvider && PROVIDERS[activeProvider].allowNoCredential);

  useEffect(() => {
    if (source === 'bridge' && bridgeTabId === null && bridge.targets.length > 0) {
      setBridgeTabId(bridge.targets[0].tabId);
    }
  }, [source, bridgeTabId, bridge.targets]);

  // Beim Wechsel des Anbieters: Key-Formular nur zeigen, wenn für DIESEN
  // Anbieter noch kein Wert hinterlegt ist. Vorhandene Werte bleiben je
  // Anbieter im localStorage und werden nicht erneut abgefragt.
  useEffect(() => {
    if (!open) return;
    if (source === 'bridge') {
      setShowKeyForm(false);
      return;
    }
    setShowKeyForm(needsCredential && !credentials[source]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, error]);

  // Globale Frage-Event: von DataStreamSoul "Stellen"-Button
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const question = (e as CustomEvent<string>).detail;
      setInput(question);
    };
    window.addEventListener('ds-question-submit', handler as EventListener);
    return () => window.removeEventListener('ds-question-submit', handler as EventListener);
  }, []);

  // Model-Injektion via Prop (vom ModelWindow): Provider + Modell wechseln
  // Credentials werden aus localStorage neu geladen, damit der aktuelle
  // Key des injizierten Providers verwendet wird.
  // useLayoutEffect: läuft synchron vor dem Paint, damit activeCredential
  // bereits gesetzt ist, bevor der Nutzer etwas sehen kann.
  useLayoutEffect(() => {
    if (!modelInjection) return;
    const { provider, model } = modelInjection;
    setSource(provider);
    setModels((prev) => ({ ...prev, [provider]: model }));
    // Credential aus localStorage neu laden (kann sich geändert haben)
    const storedKey = localStorage.getItem(PROVIDERS[provider].keyStorageKey) || PROVIDERS[provider].credentialDefault;
    setCredentials((prev) => ({ ...prev, [provider]: storedKey }));
    localStorage.setItem(PROVIDERS[provider].modelStorageKey, model);
  }, [modelInjection]);

  // Sobald das Quellen-Dropdown geöffnet wird (oder der Provider wechselt),
  // die aktuell wirklich verfügbaren Modelle live nachladen — OpenRouter
  // braucht dafür keinen Key, alle anderen schon.
  useEffect(() => {
    // Ollama darf beim Provider-Wechsel automatisch synchronisieren, weil
    // kein API-Key nötig ist. Andere Anbieter werden weiterhin erst beim
    // geöffneten Menü abgefragt.
    if (!sourceMenuOpen && source !== 'ollama') return;
    if (!isProvider(source)) return;
    // Ollama braucht keinen API-Key und muss deshalb auch ohne Credential
    // live abgefragt werden. Cloud-Anbieter warten weiterhin auf ihren Key.
    if (source !== 'ollama' && source !== 'openrouter' && !credentials[source]) return;
    if (source === 'ollama') {
      // Cache nur gültig, wenn er für den AKTUELL aktiven Modus (lokal/cloud)
      // geladen wurde — sonst würde nach einem Moduswechsel weiterhin die
      // alte Liste angezeigt (siehe Kommentar bei ollamaFetchedMode oben).
      if (liveModels.ollama && ollamaFetchedMode === getOllamaMode()) return;
      if (modelFetchState.ollama === 'loading') return;
    } else if (liveModels[source] || modelFetchState[source] === 'loading') {
      return;
    }
    loadLiveModelsFor(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceMenuOpen, source]);

  useEffect(() => {
    if (!sourceMenuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (sourceMenuRef.current && !sourceMenuRef.current.contains(e.target as Node)) {
        setSourceMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [sourceMenuOpen]);

  const selectSource = (s: Source) => {
    setSource(s);
    // Provider-Auswahl lässt das Menü offen, damit direkt danach das Modell
    // gewählt werden kann. Geschlossen wird erst bei einer Modell-Auswahl
    // oder durch einen Klick außerhalb des Menüs.
    if (s === 'bridge') bridge.refreshTargets();
  };

  const openKeyForm = () => {
    if (!activeProvider) return;
    setCredentialDraft(credentials[activeProvider]);
    setModelDraft(models[activeProvider]);
    setShowKeyForm(true);
  };

  const saveCredential = () => {
    if (!activeProvider) return;
    const trimmedCred = credentialDraft.trim();
    const trimmedModel = modelDraft.trim() || PROVIDERS[activeProvider].defaultModel;

    if (needsCredential && !trimmedCred) return;

    const cred = trimmedCred || PROVIDERS[activeProvider].credentialDefault;
    // Ollama Cloud hat einen eigenen Speicherort (dna-legal-ai-key-ollama-cloud),
    // getrennt vom lokalen Server-URL-Schlüssel — sonst würde ein hier
    // eingegebener Cloud-API-Key versehentlich die lokale Server-Adresse
    // überschreiben (und umgekehrt beim Zurückwechseln auf LOKAL).
    if (activeProvider === 'ollama' && ollamaModeUI === 'cloud') {
      setOllamaCloudApiKey(cred);
    } else {
      localStorage.setItem(PROVIDERS[activeProvider].keyStorageKey, cred);
    }
    localStorage.setItem(PROVIDERS[activeProvider].modelStorageKey, trimmedModel);
    setCredentials((prev) => ({ ...prev, [activeProvider]: cred }));
    setModels((prev) => ({ ...prev, [activeProvider]: trimmedModel }));
    setCredentialDraft('');
    setModelDraft('');
    setShowKeyForm(false);
  };

  const clearCredential = () => {
    if (!activeProvider) return;
    localStorage.removeItem(PROVIDERS[activeProvider].keyStorageKey);
    localStorage.removeItem(PROVIDERS[activeProvider].modelStorageKey);
    setCredentials((prev) => ({ ...prev, [activeProvider]: PROVIDERS[activeProvider].credentialDefault }));
    setModels((prev) => ({ ...prev, [activeProvider]: PROVIDERS[activeProvider].defaultModel }));
    setShowKeyForm(true);
  };

  const sendViaBridge = async (text: string, nextMessages: ChatMessage[]) => {
    if (bridgeTabId === null) {
      setError('Kein Bridge-Tab gefunden. Ist ein claude.ai/chatgpt.com-Tab geöffnet?');
      return;
    }
    try {
      const replyText = await bridge.sendPrompt(bridgeTabId, text);
      setMessages([...nextMessages, { role: 'model', text: replyText, via: 'bridge' }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bridge-Anfrage fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  };

  const loadQuestionnaire = () => {
    const raw = localStorage.getItem('dna-legal-data-stream-questions');
    const custom = (() => {
      try { return raw ? JSON.parse(raw) : []; } catch { return []; }
    })();
    const normalized = Array.isArray(custom)
      ? custom.map((q) => ({ id: String(q.id), text: String(q.text || q.label || '') })).filter((q) => q.text)
      : [];
    const defaults = DATA_STREAM_QUESTIONS.map((q) => ({ id: q.id, text: q.text || q.label }));
    const ids = new Set(normalized.map((q) => q.id));
    return [...defaults.filter((q) => !ids.has(q.id)), ...normalized];
  };

  const parseQuestionnaireResults = (raw: string) => {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      const items = Array.isArray(parsed) ? parsed : parsed.results;
      if (!Array.isArray(items)) throw new Error('Keine Ergebnisse');
      return items.map((item: any) => ({
        question: String(item.question || ''),
        answer: String(item.answer || ''),
        abstracted: Boolean(item.abstracted),
      })).filter((item: { question: string; answer: string }) => item.question && item.answer);
    } catch {
      return [];
    }
  };

  const runEssenceQuestionnaire = async () => {
    if (messages.length === 0 || loading || questionnaireRunning) return;
    const questions = loadQuestionnaire();
    if (!questions.length) {
      setError('Keine Fragen in der Fragenliste vorhanden.');
      return;
    }

    setQuestionnaireRunning(true);
    setLoading(true);
    setError(null);
    setQuestionnaireResults([]);

    const allText = messages.map((m) => `${m.role.toUpperCase()}: ${m.text}`).join('\n\n');
    const questionText = questions.map((q, i) => `${i + 1}. ${q.text}`).join('\n');
    const prompt = `Analysiere ausschließlich das zuletzt besprochene Thema dieser Konversation und erstelle zuerst dessen Essenz. Prüfe diese Essenz anschließend gegen jede Frage der Fragenliste. Beantworte jede Frage knapp und konkret auf Basis der Essenz. Wenn eine Frage nicht direkt passt, abstrahiere sie auf die nächstliegende sinnvolle Ebene und beantworte sie trotzdem. Setze in diesem Fall "abstracted": true. Wenn sie direkt passt, setze "abstracted": false. Keine Erklärungen über den Abstraktionsprozess.\n\nAntworte ausschließlich als gültiges JSON ohne Markdown:\n{"results":[{"question":"...","answer":"...","abstracted":false}]}\n\nKONVERSATION:\n${allText}\n\nFRAGENLISTE:\n${questionText}`;

    try {
      let rawReply = '';
      if (source === 'bridge') {
        if (bridgeTabId === null) throw new Error('Kein Bridge-Tab gefunden. Bitte wähle einen Tab aus.');
        rawReply = await bridge.sendPrompt(bridgeTabId, prompt);
      } else if (activeProvider) {
        if (needsCredential && !activeCredential) {
          setShowKeyForm(true);
          return;
        }
        rawReply = await sendChatMessage(
          activeProvider,
          activeCredential,
          activeModel,
          'Du analysierst eine Konversation und beantwortest eine feste Fragenliste. Liefere ausschließlich gültiges JSON im verlangten Schema.',
          [{ role: 'user', text: prompt }]
        );
      }

      const results = parseQuestionnaireResults(rawReply);
      if (!results.length) throw new Error('Die KI hat kein verwertbares Fragen-Ergebnis geliefert.');
      setQuestionnaireResults(results);
      setSummary('Essenz + Fragenabgleich abgeschlossen.');
      setMessages((prev) => [...prev, { role: 'model', text: results.map((r, i) => `${i + 1}. ${r.question}\n${r.answer}`).join('\n\n'), via: source === 'bridge' ? 'bridge' : activeProvider || undefined }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fragenabgleich fehlgeschlagen.');
    } finally {
      setLoading(false);
      setQuestionnaireRunning(false);
    }
  };

  const toggleSynthesisProvider = (provider: ProviderId | 'bridge') => {
    setSynthesisProviders((prev) => {
      const next = prev.includes(provider) ? prev.filter((p) => p !== provider) : [...prev, provider];
      localStorage.setItem('pris-synthesis-providers', JSON.stringify(next));
      return next;
    });
  };

  const extractEssence = async () => {
    if (messages.length === 0 || loading) return;

    setLoading(true);
    setError(null);
    setSummary('');

    const allText = messages.map((m) => `${m.role.toUpperCase()}: ${m.text}`).join('\n\n');
    // Einmal am Anfang festgehalten: source ändert sich während dieser
    // (langen, mehrfach async/await-unterbrochenen) Funktion nicht, aber
    // TypeScript's Narrowing über 'activeProvider' (aus isProvider(source)
    // abgeleitet) verengt den Typ von source weiter unten fälschlich auf
    // reines ProviderId — daher hier separat als Boolean festgehalten, damit
    // die späteren source==='bridge'-Vergleiche korrekt durchlaufen.
    const isBridgeSource = source === 'bridge';

    try {
      // 1) Zuerst erzeugt die aktuell gewählte PRIS-KI eine kompakte Essenz.
      const essencePrompt = `Extrahiere aus dieser Konversation die zentrale Essenz als eine präzise Frage bzw. Aufgabenstellung, die andere KIs unabhängig beantworten können. Keine Einleitung, keine Analyse des Prozesses, nur die Essenz/Frage.\n\nKONVERSATION:\n${allText}`;

      let essence = '';
      if (source === 'bridge') {
        // Experimenteller schneller Bridge-Modus: ChatGPT ist der einzige
        // Rückkanal zu PRIS. Claude und andere Browser-Tabs bekommen die
        // Fragestellung trotzdem, ihre Antworten bleiben aber im jeweiligen Tab.
        const bridgeTargetsForEssence = await bridge.refreshTargets();
        const chatGptTargetForEssence = bridgeTargetsForEssence.find((target) => target.site === 'chatgpt');
        if (!chatGptTargetForEssence) throw new Error('Kein geöffneter ChatGPT-Tab gefunden. ChatGPT muss für den PRIS-Rückkanal geöffnet sein.');
        essence = await bridge.sendPrompt(chatGptTargetForEssence.tabId, essencePrompt);
      } else if (activeProvider) {
        if (needsCredential && !activeCredential) {
          setShowKeyForm(true);
          return;
        }
        essence = await sendChatMessage(
          activeProvider,
          activeCredential,
          activeModel,
          'Du extrahierst die zentrale Fragestellung einer Konversation. Liefere nur die präzise Essenz als Frage bzw. Aufgabenstellung.',
          [{ role: 'user', text: essencePrompt }]
        );
      }

      if (!essence.trim()) throw new Error('Keine Essenz erzeugt.');
      setSummary(essence.trim());

      // 2) Alle aktivierten Quellen abfragen. Browser-KIs kommen über die Extension,
      // API-Anbieter direkt über ihre bereits vorhandene Provider-Schicht.
      const externalAnswers: Array<{ site: string; title: string; answer: string; sourceType: 'bridge' | 'api' }> = [];
      const externalFailures: Array<{ site: string; error: string }> = [];
      const questionPrompt = `Beantworte diese Fragestellung unabhängig und konkret. Liefere nur deine inhaltliche Antwort, keine Meta-Erklärung.

FRAGE / ESSENZ:
${essence.trim()}`;

      if (synthesisProviders.includes('bridge')) {
        const externalTargets = await bridge.refreshTargets();
        // Alle offenen Browser-KIs bekommen die Fragestellung. Für PRIS selbst
        // wird aber ausschließlich ChatGPT als schneller Rückkanal verwendet.
        const bridgeTargets = externalTargets.filter((target, index, arr) =>
          arr.findIndex((t) => t.site === target.site) === index
        );
        const chatGptTarget = bridgeTargets.find((target) => target.site === 'chatgpt');
        if (!chatGptTarget) {
          throw new Error('Kein geöffneter ChatGPT-Tab gefunden. ChatGPT muss für den PRIS-Rückkanal geöffnet sein.');
        }

        // Alle anderen Tabs werden parallel angestoßen und nicht abgewartet.
        // Dadurch kann Claude z.B. im eigenen Browserfenster weiterrechnen,
        // ohne die Antwort in PRIS zu verzögern.
        for (const target of bridgeTargets) {
          const request = bridge.sendPrompt(target.tabId, questionPrompt);
          if (target.site === 'chatgpt') {
            try {
              const answer = (await request).trim();
              if (answer && !answer.includes('FRAGE / ESSENZ:') && answer !== questionPrompt.trim()) {
                externalAnswers.push({ site: target.site, title: target.title, answer, sourceType: 'bridge' });
              }
            } catch (targetError) {
              console.warn('[PRIS] ChatGPT-Rückkanal fehlgeschlagen:', targetError);
              externalFailures.push({ site: target.site, error: targetError instanceof Error ? targetError.message : String(targetError) });
            }
          } else {
            request.then((answer) => {
              console.info(`[PRIS] ${target.site} Antwort bleibt im Browser-Tab (nicht zurück an PRIS). Länge:`, String(answer || '').length);
            }).catch((targetError) => {
              console.warn(`[PRIS] ${target.site} konnte im Hintergrund nicht abgefragt werden:`, targetError);
            });
          }
        }
      }

      for (const provider of synthesisProviders) {
        if (provider === 'bridge') continue;
        const credential = credentials[provider];
        if (!credential && provider !== 'ollama' && !PROVIDERS[provider].allowNoCredential) continue;
        try {
          const adapter = createApiAdapter(provider, credential, models[provider]);
          if (!adapter.canRun()) continue;
          const answer = (await adapter.run(questionPrompt)).answer.trim();
          if (answer) externalAnswers.push({ site: PROVIDERS[provider].label, title: models[provider], answer, sourceType: 'api' });
        } catch (providerError) {
          console.warn(`[PRIS] Anbieter ${provider} konnte nicht abgefragt werden:`, providerError);
        }
      }

      // Ein Anbieter soll in der Synthese nur einmal auftauchen. Wenn z.B.
      // ChatGPT sowohl als Browser-Bridge als auch als API aktiviert ist,
      // bevorzugen wir die frisch gelesene Browser-Antwort statt sie als
      // zweites "ChatGPT" auszugeben.
      const seenSites = new Set<string>();
      const uniqueExternalAnswers = externalAnswers.filter((item) => {
        const key = item.site.trim().toLowerCase();
        if (seenSites.has(key)) return false;
        seenSites.add(key);
        return true;
      });
      externalAnswers.splice(0, externalAnswers.length, ...uniqueExternalAnswers);

      if (!externalAnswers.length) {
        const failureHint = externalFailures.length ? ` Fehler: ${externalFailures.map((f) => `${f.site}: ${f.error}`).join(' | ')}` : '';
        throw new Error(`Keine aktivierte KI-Antwort erhalten. Öffne ChatGPT/Claude oder hinterlege mindestens einen API-Anbieter.${failureHint}`);
      }

      // 3) Im Bridge-Test wird bewusst keine zweite Synthese-Anfrage gestartet.
      // PRIS zeigt direkt die ChatGPT-Antwort zurück; die anderen Antworten
      // bleiben in ihren jeweiligen Browser-Tabs sichtbar.
      if (source === 'bridge') {
        const chatGptAnswer = externalAnswers.find((item) => item.site === 'chatgpt');
        if (!chatGptAnswer) throw new Error('ChatGPT hat keine Antwort an PRIS zurückgegeben.');
        setSummary(chatGptAnswer.answer);
        setMessages((prev) => [
          ...prev,
          {
            role: 'model',
            text: `⚡ CHATGPT\n${chatGptAnswer.answer}`,
            via: 'bridge',
          },
        ]);
        return;
      }

      // Für API-basierte Quellen bleibt die bisherige Synthese unverändert.
      const answerBundle = externalAnswers
        .map((item, index) => `ANTWORT ${index + 1} · ${item.site.toUpperCase()}\n${item.answer}`)
        .join('\n\n');
      const synthesisPrompt = `Du bist die Syntheseinstanz von PRIS. Vergleiche die Antworten mehrerer externer KIs auf dieselbe Fragestellung. Extrahiere daraus die gemeinsame Essenz, wichtige Übereinstimmungen, belastbare Unterschiede und die daraus beste zusammengefasste Antwort. Keine Bewertung der KIs und keine Beschreibung deines Vorgehens. Antworte klar und kompakt auf Deutsch.\n\nURSPRÜNGLICHE ESSENZ:\n${essence.trim()}\n\nEXTERNE ANTWORTEN:\n${answerBundle}`;

      let synthesis = '';
      if (isBridgeSource) {
        if (bridgeTabId === null) throw new Error('Kein Bridge-Tab für die Synthese ausgewählt.');
        synthesis = await bridge.sendPrompt(bridgeTabId, synthesisPrompt);
      } else if (activeProvider) {
        if (needsCredential && !activeCredential) {
          setShowKeyForm(true);
          return;
        }
        synthesis = await sendChatMessage(
          activeProvider,
          activeCredential,
          activeModel,
          'Du bist die Syntheseinstanz von PRIS. Vergleiche mehrere externe KI-Antworten und gib daraus die beste gemeinsame Antwort auf Deutsch.',
          [{ role: 'user', text: synthesisPrompt }]
        );
      }

      if (!synthesis.trim()) throw new Error('Die Synthese-KI hat keine Antwort geliefert.');

      // Falls ein Synthese-Modell trotz der strikten Anweisung die interne
      // Antwortliste wiederholt, entfernen wir diese reine Meta-Hülle.
      synthesis = synthesis
        .replace(/^\s*ANTWORT\s+\d+\s*[·:-]\s*[A-ZÄÖÜ0-9_-]+\s*\n?/gim, '')
        .replace(/^\s*(EXTERNE KI-ANTWORTEN|EXTERNE ANTWORTEN)\s*\n?/gim, '')
        .trim();

      const sourceList = externalAnswers.map((item) => item.site).join(' + ');
      const finalText = `⚡ ESSENZ\n${essence.trim()}\n\nEXTERNE KI-ANTWORTEN\n${externalAnswers.map((item, i) => `${i + 1}. ${item.site.toUpperCase()}\n${item.answer}`).join('\n\n')}\n\nSYNTHESE · ${sourceList}\n${synthesis.trim()}`;
      setSummary(synthesis.trim());
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: finalText,
          via: isBridgeSource ? 'bridge' : activeProvider || undefined,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Essenz-Synthese fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  };

  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const MAX_TEXT_BYTES = 2 * 1024 * 1024;
  const TEXT_EXTENSIONS = new Set([
    'txt', 'md', 'markdown', 'csv', 'json', 'xml', 'html', 'htm', 'css', 'scss',
    'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go',
    'rs', 'rb', 'php', 'sql', 'sh', 'bash', 'zsh', 'yaml', 'yml', 'toml', 'ini',
    'env', 'log', 'rtf', 'tex'
  ]);

  const readDroppedFiles = async (files: FileList | File[]) => {
    const incoming = Array.from(files);
    for (const file of incoming) {
      const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;
      if (file.size > MAX_FILE_BYTES) {
        setAttachments((prev) => [...prev, {
          id, name: file.name, size: file.size, type: file.type, status: 'error',
          error: 'Datei ist größer als 5 MB.'
        }]);
        continue;
      }

      const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
      const isImage = file.type.startsWith('image/');
      const isText = file.type.startsWith('text/') || TEXT_EXTENSIONS.has(ext) ||
        file.type === 'application/json' || file.type === 'application/xml';
      if (!isImage && !isText) {
        setAttachments((prev) => [...prev, {
          id, name: file.name, size: file.size, type: file.type, status: 'unsupported',
          error: 'Dieser Dateityp kann aktuell nicht als Text oder Bild übernommen werden.'
        }]);
        continue;
      }

      setAttachments((prev) => [...prev, {
        id, name: file.name, size: file.size, type: file.type, status: 'reading'
      }]);

      try {
        if (isImage) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Bild konnte nicht gelesen werden.'));
            reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
            reader.readAsDataURL(file);
          });
          setAttachments((prev) => prev.map((a) => a.id === id
            ? { ...a, status: 'ready', imageData: dataUrl }
            : a));
        } else {
          if (file.size > MAX_TEXT_BYTES) throw new Error('Textdatei ist größer als 2 MB.');
          const text = await file.text();
          setAttachments((prev) => prev.map((a) => a.id === id
            ? { ...a, status: 'ready', text }
            : a));
        }
      } catch (e) {
        setAttachments((prev) => prev.map((a) => a.id === id
          ? { ...a, status: 'error', error: e instanceof Error ? e.message : 'Datei konnte nicht gelesen werden.' }
          : a));
      }
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const onChatDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    if (Array.from(e.dataTransfer.items).some((item) => item.kind === 'file')) setDragActive(true);
  };

  const onChatDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (Array.from(e.dataTransfer.items).some((item) => item.kind === 'file')) {
      e.dataTransfer.dropEffect = 'copy';
      setDragActive(true);
    }
  };

  const onChatDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  };

  const onChatDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDragActive(false);
    if (e.dataTransfer.files?.length) await readDroppedFiles(e.dataTransfer.files);
  };

  const buildAttachmentContext = () => {
    const ready = attachments.filter((a) => a.status === 'ready' && a.text !== undefined);
    if (!ready.length) return '';
    return '\\n\\n[ANGEHÄNGTE DATEIEN]\\n' + ready.map((a) =>
      `--- ${a.name} ---\\n${a.text}\\n--- ENDE ${a.name} ---`
    ).join('\\n\\n');
  };

  const buildAttachmentImages = () =>
    attachments
      .filter((a) => a.status === 'ready' && a.imageData)
      .map((a) => a.imageData as string);

  const sendMessage = async (forcedText?: string, remote?: { id: string; source: string; replyTo?: { chatId?: number | string } }) => {
    const baseText = (forcedText ?? input).trim();
    const attachmentContext = forcedText ? '' : buildAttachmentContext();
    const text = `${baseText}${attachmentContext}`.trim();
    if (!text || loading) return;

    // Nutzer hat von sich aus geschrieben — die automatische Chill-Modus-
    // Eröffnung entfällt, das erste Wort gehört ihm.
    if (chillOpenerTimerRef.current !== null) {
      window.clearTimeout(chillOpenerTimerRef.current);
      chillOpenerTimerRef.current = null;
      chillOpenerFiredRef.current = true;
    }

    // === Chat-Commands: /menu, /home, /top, /new, /help ===
    if (text.startsWith('/')) {
      const cmd = text.slice(1).toLowerCase();
      const commands = {
        menu: () => { window.dispatchEvent(new CustomEvent('open-burger-menu')); },
        home: () => { window.scrollTo({ top: 0, behavior: 'smooth' }); },
        top: () => { window.scrollTo({ top: 0, behavior: 'smooth' }); },
        new: handleNewChat,
        neu: handleNewChat,
        help: () => {
          setMessages((prev) => [...prev, { role: 'model', text:
            '**Verfügbare Befehle:**\n' +
            '/menu — Burger-Menü öffnen\n' +
            '/home — Zum Seitenanfang scrollen\n' +
            '/top — Zum Seitenanfang scrollen\n' +
            '/new — Neuen Chat starten\n' +
            '/neu — Neuen Chat starten',
            via: source
          }]);
        }
      };
      const fn = commands[cmd as keyof typeof commands];
      if (fn) {
        setInput('');
        fn();
      } else {
        alert(`Unbekannter Befehl: /${cmd}. Tippe /help für alle Befehle.`);
      }
      return;
    }

    if (needsCredential && !activeCredential.trim()) {
      setShowKeyForm(true);
      setError('Bitte zuerst deinen API-Key eintragen.');
      return;
    }

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', text, images: forcedText ? undefined : buildAttachmentImages(), via: remote ? 'remote' : undefined }];
    setMessages(nextMessages);
    setInput('');
    if (!forcedText) setAttachments([]);
    setLoading(true);
    setError(null);

    if (source === 'bridge') {
      await sendViaBridge(text, nextMessages);
      return;
    }

    if (!activeProvider) {
      setLoading(false);
      return;
    }

    const replyText = await continueConversation(nextMessages);
    if (remote && replyText) {
      fetch('http://127.0.0.1:8790/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: remote.source, replyTo: remote.replyTo, text: replyText }),
      }).catch(() => {});
      fetch('http://127.0.0.1:8790/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: remote.id }),
      }).catch(() => {});
    }
  };

  /** Schickt den bisherigen Verlauf an den aktiven Cloud-Provider und hängt
   *  die Antwort an — genutzt sowohl beim normalen Senden als auch, um die
   *  KI automatisch auf eine frisch eingetroffene Terminal-Ausgabe reagieren
   *  zu lassen. */
  const continueConversation = async (nextMessages: ChatMessage[]): Promise<string | null> => {
    if (!activeProvider) {
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const latestUserText = [...nextMessages].reverse().find((m) => m.role === 'user')?.text || '';
      const memoryContext = memoryEnabled && memoryUser ? await buildMemoryContext(latestUserText) : '';
      const baseInstructions = chillMode
        ? buildChillSystemInstructions(persona, terminal.available)
        : buildSystemInstructions(persona, terminal.available);
      const systemInstruction = memoryContext
        ? `${baseInstructions}\n\n${memoryContext}`
        : baseInstructions;

      const replyText = await sendChatMessage(
        activeProvider,
        activeCredential,
        activeModel,
        systemInstruction,
        nextMessages.map((m) => ({ role: m.role, text: m.text, ...(m.images?.length ? { images: m.images } : {}) }))
      );
      setMessages((prev) => [...prev, { role: 'model', text: replyText, via: activeProvider }]);

      // Klare persönliche Aussagen werden ohne zusätzlichen KI-Aufruf ins
      // Langzeitgedächtnis übernommen. Beispiel: "Ich heiße Max".
      if (memoryEnabled && memoryUser) {
        const explicitFacts = extractExplicitMemoryFacts(latestUserText);
        for (const fact of explicitFacts) {
          await setMemoryFact(fact.key, fact.value);
        }
      }
      return replyText;
    } catch (e) {
      setError(e instanceof Error ? e.message : `Verbindung zu ${PROVIDERS[activeProvider].label} fehlgeschlagen.`);
      return null;
    } finally {
      setLoading(false);
    }
  };

  /** Führt einen von der KI vorgeschlagenen Befehl über die lokale
   *  Terminal-Bridge aus (nur nach explizitem Klick — nie automatisch),
   *  hängt die Ausgabe als Nachricht an und lässt die KI direkt darauf
   *  reagieren. */
  const [runningCommands, setRunningCommands] = useState<Record<string, boolean>>({});
  const runTerminalCommand = async (cmd: string, key: string) => {
    setRunningCommands((prev) => ({ ...prev, [key]: true }));
    const result = await terminal.runCommand(cmd);
    setRunningCommands((prev) => ({ ...prev, [key]: false }));

    const outputText = result.error
      ? `[Terminal-Fehler]\n${result.error}`
      : `[Terminal-Ausgabe von \`${cmd}\`, Exit-Code ${result.exitCode}]\n` +
        (result.stdout ? result.stdout : '') +
        (result.stderr ? `\n${result.stderr}` : '') +
        (!result.stdout && !result.stderr ? '(keine Ausgabe)' : '');

    let nextMessages: ChatMessage[] = [];
    setMessages((prev) => {
      nextMessages = [...prev, { role: 'user', text: outputText, via: 'terminal' }];
      return nextMessages;
    });
    // Let React apply the functional update before the optional AI follow-up.
    if (activeProvider) {
      const baseMessages: ChatMessage[] = [...messages, { role: 'user', text: outputText, via: 'terminal' }];
      await continueConversation(baseMessages);
    }
  };

  const confirmTerminalCommand = async () => {
    if (!pendingTerminalCommand) return;
    const command = pendingTerminalCommand;
    setPendingTerminalCommand(null);
    await runTerminalCommand(command, 'terminal-mode');
  };

  // Remote-Agent: Nachrichten von Telegram/Discord werden in den normalen PRIS-Chat eingespeist.
  // Der Agent läuft ausschließlich lokal auf 127.0.0.1:8790.
  const remoteBusyRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled || loading || remoteBusyRef.current) return;
      try {
        const response = await fetch('http://127.0.0.1:8790/messages', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        const message = Array.isArray(data.messages) ? data.messages[0] : null;
        if (!message || !message.text || remoteBusyRef.current) return;
        remoteBusyRef.current = true;
        await sendMessage(message.text, message);
      } catch {
        // Remote-Agent ist optional; bei Nichtkonfiguration nichts anzeigen.
      } finally {
        remoteBusyRef.current = false;
      }
    };
    const timer = window.setInterval(poll, 3000);
    poll();
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [open, loading, activeProvider, activeCredential, activeModel, source, messages]);

  const handleNewChat = () => {
    setMessages([]);
    setAttachments([]);
    setError(null);
    // Setze auf Standard-Provider zurück (nur nicht-bridge)
    if (source === 'bridge') {
      setSource('openrouter');
    }
  };

  if (!open) return null;

  return (
    <div
      className={`gemini-chat-panel ${maximized ? 'gemini-chat-panel--maximized' : ''} ${dockLeft ? 'gemini-chat-panel--dock-left' : ''} ${dragActive ? 'gemini-chat-panel--drag-active' : ''}`}
      onDragEnter={onChatDragEnter}
      onDragOver={onChatDragOver}
      onDragLeave={onChatDragLeave}
      onDrop={onChatDrop}
    >
      {/* Z-Achsen-Schichtung des Glases, von hinten nach vorn:
          1) __bg      – die transparente Panel-Füllung + Blur (was bisher
                          direkt auf .gemini-chat-panel lag)
          2) __flicker – das aktuell aktive Story-Flimmerbild aus der
                          Three.js-Szene (per CSS-Variable aus DnaScene.tsx
                          synchronisiert), erscheint dadurch "im Glas"
          3) __frame   – Rahmenlinien/Glow, bewusst über dem Bild
          4) __content – eigentliche UI (Header, Nachrichten, Eingabe/Text),
                          ebenfalls über dem Bild
          Reine CSS-Stacking-Ebenen, keine Interaktions-/Klicklogik. */}
      <div className="gemini-chat-panel__bg" aria-hidden="true" />
      <div className="gemini-chat-panel__flicker" aria-hidden="true" />
      <div className="gemini-chat-panel__frame" aria-hidden="true" />
      <div className="gemini-chat-panel__content">
      {dragActive && (
        <div className="gemini-chat-drop-overlay">
          <div className="gemini-chat-drop-box">
            <span>⇩</span>
            <strong>DATEIEN HIER ABLEGEN</strong>
            <small>Text, Code, CSV, JSON, Markdown, Bilder …</small>
          </div>
        </div>
      )}
      <div className="gemini-chat-header">
        <div className="gemini-chat-source-column" ref={sourceMenuRef}>
          <span className="gemini-chat-persona-name">{persona.name}</span>
          {onTogglePersonaMode && (
            <button
              type="button"
              className={`gemini-chat-persona-toggle ${chillMode ? 'is-chill' : 'is-lockin'}`}
              onClick={onTogglePersonaMode}
              title={
                chillMode
                  ? 'Aktuell: CHILL („power behind the throne“) — klicken für LOCK IN'
                  : 'Aktuell: LOCK IN (Business-Persona) — klicken für CHILL'
              }
            >
              {chillMode ? '🌙 CHILL' : '🔒 LOCK IN'}
            </button>
          )}
          <button
            type="button"
            className={`gemini-chat-terminal-badge ${terminal.enabled && terminal.available ? 'connected' : ''}`}
            onClick={() => {
              if (terminal.enabled && terminal.available) {
                terminal.setEnabled(false);
              } else if (!terminal.enabled) {
                terminal.setEnabled(true);
                terminal.refresh();
              } else {
                terminal.refresh();
              }
            }}
            title={
              terminal.enabled && terminal.available
                ? 'Terminal-Betrieb ausschalten'
                : terminal.enabled
                ? 'Terminal-Bridge erneut verbinden'
                : 'Terminal-Betrieb einschalten und Verbindung prüfen'
            }
          >
            {terminal.enabled ? (terminal.available ? '⌘ TERMINAL AN' : '⌘ TERMINAL PRÜFEN') : '⌘ TERMINAL AUS'}
          </button>
          <button
            type="button"
            className={`gemini-chat-memory-toggle ${memoryEnabled ? 'active' : ''}`}
            onClick={() => setMemoryEnabled((enabled) => !enabled)}
            title={memoryEnabled
              ? 'Gedächtnis ist AN: Nur erkannte Memory-Keys werden in Supabase gespeichert.'
              : 'Gedächtnis ist AUS: Es werden keine neuen Memory-Keys gespeichert und kein Supabase-Memory an die KI gegeben.'}
            aria-pressed={memoryEnabled}
          >
            🧠 {memoryEnabled ? 'MEM AN' : 'MEM AUS'}
          </button>
          <div className="gemini-chat-source-menu-wrap">
            <button
              type="button"
              className="gemini-chat-burger-btn"
              onClick={() => setSourceMenuOpen((o) => !o)}
              title="Antwortquelle wählen"
            >
              <span className="gemini-chat-burger-icon">☰</span>
              <span className="gemini-chat-burger-label">
                {SOURCE_LABEL[source]}
                {source === 'bridge' && !bridge.available ? ' (offline)' : ''}
              </span>
            </button>

            {sourceMenuOpen && (
              <div className="gemini-chat-source-dropdown">
                {PROVIDER_ORDER.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`gemini-chat-source-item ${source === p ? 'active' : ''}`}
                    onClick={() => selectSource(p)}
                  >
                    {PROVIDERS[p].label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`gemini-chat-source-item ${source === 'bridge' ? 'active' : ''}`}
                  onClick={() => selectSource('bridge')}
                >
                  BRIDGE{bridge.available ? '' : ' (offline)'}
                </button>
                <div style={{ gridColumn: '1 / -1', borderTop: '1px solid rgba(var(--accent-rgb), 0.2)', marginTop: 4, paddingTop: 6 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.62rem', opacity: 0.7, marginBottom: 5 }}>⚡ SYNTHESE-QUELLEN</div>
                  <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontFamily: 'monospace', fontSize: '0.66rem', padding: '3px 0' }}>
                    <input type="checkbox" checked={synthesisProviders.includes('bridge')} onChange={() => { setSynthesisProviders((prev) => { const next = prev.includes('bridge') ? prev.filter((p) => p !== 'bridge') : [...prev, 'bridge' as const]; localStorage.setItem('pris-synthesis-providers', JSON.stringify(next)); return next; }); }} />
                    Browser-KIs (ChatGPT / Claude)
                  </label>
                  {PROVIDER_ORDER.map((p) => (
                    <label key={`synth-${p}`} style={{ display: 'flex', gap: 7, alignItems: 'center', fontFamily: 'monospace', fontSize: '0.66rem', padding: '3px 0', opacity: (credentials[p] || p === 'ollama' || PROVIDERS[p].allowNoCredential) ? 1 : 0.45 }}>
                      <input type="checkbox" checked={synthesisProviders.includes(p)} disabled={!credentials[p] && p !== 'ollama' && !PROVIDERS[p].allowNoCredential} onChange={() => toggleSynthesisProvider(p)} />
                      {PROVIDERS[p].label}
                    </label>
                  ))}
                </div>
                {/* KEY-Button nur sichtbar, wenn Provider ausgewählt ist und kein Key hinterlegt */}
                {source !== 'bridge' && needsCredential && !credentials[source] && (
                  <button
                    type="button"
                    className="gemini-chat-source-item key-btn"
                    onClick={() => openKeyForm()}
                    style={{
                      gridColumn: '1 / -1',  /* full width */
                      background: 'rgba(var(--accent-rgb), 0.1)',
                      borderTop: '1px solid rgba(var(--accent-rgb), 0.2)',
                    }}
                  >
                    🔑 {PROVIDERS[source].credentialLabel} eintragen
                  </button>
                )}
                {/* Modell-Auswahl direkt im Dropdown. Ollama benötigt keinen Key. */}
                {source !== 'bridge' && (source === 'ollama' || (needsCredential && credentials[source])) && (
                  <>
                    {/* 🔑 Key ändern — Button unter dem Model-Select */}
                    <button
                      type="button"
                      className="gemini-chat-source-item key-change-btn"
                      onClick={() => openKeyForm()}
                      style={{
                        gridColumn: '1 / -1',  /* full width */
                        background: 'rgba(var(--accent-rgb), 0.05)',
                        borderBottom: '1px solid rgba(var(--accent-rgb), 0.12)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        opacity: 0.7,
                        transition: 'opacity 0.2s, background 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(var(--accent-rgb), 0.14)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.opacity = '0.7';
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(var(--accent-rgb), 0.05)';
                      }}
                    >
                      🔑 {PROVIDERS[source].credentialLabel} ändern
                    </button>
                    <div style={{
                      height: '1px',
                      background: 'rgba(var(--accent-rgb), 0.2)',
                      margin: '6px 0',
                      gridColumn: '1 / -1'  /* full width */
                    }} />
                    {source === 'ollama' && (
                      <select
                        value={ollamaModeUI}
                        onChange={(e) => handleOllamaModeChange(e.target.value as OllamaMode)}
                        className="gemini-chat-model-select"
                        style={{
                          gridColumn: '1 / -1',
                          boxSizing: 'border-box',
                          margin: '0 auto 4px',
                          background: 'transparent',
                          border: '1px solid rgba(var(--accent-rgb), 0.5)',
                          borderRadius: '4px',
                          color: 'var(--accent-light)',
                          fontFamily: 'monospace',
                          fontSize: '0.7rem',
                          padding: '4px 8px',
                          cursor: 'pointer',
                          outline: 'none',
                          WebkitAppearance: 'none',
                          appearance: 'none',
                        }}
                      >
                        <option value="local">LOKAL · eigener Ollama-Server</option>
                        <option value="cloud">CLOUD API · ollama.com</option>
                      </select>
                    )}
                    <select
                      value={models[source]}
                      onChange={(e) => {
                        const newModel = e.target.value;
                        setModels((prev) => ({ ...prev, [source]: newModel }));
                        localStorage.setItem(PROVIDERS[source].modelStorageKey, newModel);
                        setSourceMenuOpen(false);
                      }}
                      className="gemini-chat-model-select"
                      style={{
                        gridColumn: '1 / -1',
                        boxSizing: 'border-box',
                        margin: '0 auto',
                        background: 'transparent',
                        border: '1px solid rgba(var(--accent-rgb), 0.5)',
                        borderRadius: '4px',
                        color: 'var(--accent-light)',
                        fontFamily: 'monospace',
                        fontSize: '0.7rem',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        outline: 'none',
                        WebkitAppearance: 'none',
                        appearance: 'none'
                      }}
                    >
                      {(liveModels[source] ?? PROVIDERS[source].modelList ?? []).map((m) => (
                        <option key={m} value={m} style={{ background: '#000', color: '#fff' }}>
                          {getModelAccessLabel(source, m) ? `✓ ${getModelAccessLabel(source, m)} — ${m}` : m}
                        </option>
                      ))}
                    </select>
                    <span className="gemini-chat-model-cost-hint">
                      ✓ GRATIS = ohne API-Credits; „LOKAL“ läuft über deinen eigenen Ollama-Server.
                    </span>
                    <button
                      type="button"
                      onClick={() => loadLiveModelsFor(source)}
                      title="Live von der Anbieter-API aktualisieren"
                      style={{
                        gridColumn: '1 / -1',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent-light)',
                        fontFamily: 'monospace',
                        fontSize: '0.62rem',
                        opacity: 0.65,
                        cursor: 'pointer',
                        padding: '2px 0',
                        textAlign: 'center',
                      }}
                    >
                      {modelFetchState[source] === 'loading'
                        ? '⟳ lädt Modelle…'
                        : modelFetchState[source] === 'error'
                        ? '⚠ Liste fehlgeschlagen — Tippen zum Wiederholen'
                        : liveModels[source]
                        ? `⟳ ${liveModels[source]?.length} Modelle live · aktualisieren`
                        : '⟳ Live-Modelle laden'}
                    </button>
                  </>
                )}
              </div>
            )}

            {source === 'bridge' && (
              <select
                className="gemini-chat-bridge-select"
                value={bridgeTabId ?? ''}
                onChange={(e) => setBridgeTabId(e.target.value ? Number(e.target.value) : null)}
                disabled={bridge.refreshing || bridge.targets.length === 0}
              >
                {bridge.targets.length === 0 ? (
                  <option value="">Kein Tab gefunden</option>
                ) : (
                  bridge.targets.map((t) => (
                    <option key={t.tabId} value={t.tabId}>
                      {t.site} — {t.title.slice(0, 24)}
                    </option>
                  ))
                )}
              </select>
            )}
          </div>
          {source === 'bridge' && !bridge.available && (
            <span className="gemini-chat-bridge-hint">
              Extension nicht erkannt — geladen unter chrome://extensions?
            </span>
          )}
          {source === 'bridge' && bridge.available && bridge.targets.length === 0 && (
            <span className="gemini-chat-bridge-hint">Kein claude.ai/chatgpt.com-Tab offen.</span>
          )}
          {source === 'bridge' && bridge.available && bridgeTabId !== null && (
            <span className="gemini-chat-bridge-hint">Status: Extension aktiv · Ping OK · bereit</span>
          )}
        </div>

        <div className="gemini-chat-header-actions">
          {/* Musik-HUD: schmaler Mini-Player, direkt links neben den Action-Buttons
              im Header integriert — immer sichtbar, ohne separaten Schalter. */}
          <MusicHUD compact music={music} />
          <button
            type="button"
            className="gemini-chat-icon-btn"
            onClick={handleNewChat}
            title="Neuen Chat starten"
            disabled={messages.length === 0}
          >
            ∘
          </button>
          <button
            type="button"
            className="gemini-chat-icon-btn"
            onClick={extractEssence}
            title="Essenz an externe KIs senden und gemeinsam synthetisieren"
            disabled={messages.length === 0 || loading}
          >
            ⚡
          </button>
          <button
            type="button"
            className="gemini-chat-icon-btn"
            onClick={runEssenceQuestionnaire}
            title="Essenz mit Fragenliste abgleichen"
            disabled={messages.length === 0 || loading || questionnaireRunning}
          >
            {questionnaireRunning ? '…' : '☷'}
          </button>
          <button
            type="button"
            className="gemini-chat-icon-btn"
            onClick={() => setMaximized((m) => !m)}
            title={maximized ? 'Verkleinern' : 'Maximieren'}
          >
            {maximized ? '⤈' : '⤢'}
          </button>
          <button type="button" className="gemini-chat-icon-btn" onClick={onClose} title="Schließen">
            ×
          </button>
        </div>

      </div>



      {pendingTerminalCommand && (
        <div className="gemini-chat-terminal-confirm" role="dialog" aria-label="Terminal-Befehl bestätigen">
          <span>Diesen Befehl lokal ausführen?</span>
          <code>{pendingTerminalCommand}</code>
          <div>
            <button type="button" onClick={() => setPendingTerminalCommand(null)}>Abbrechen</button>
            <button type="button" onClick={confirmTerminalCommand}>Ausführen</button>
          </div>
        </div>
      )}

      {showKeyForm && activeProvider ? (
        <div className="gemini-chat-key-form">
          <label htmlFor="ai-key-input">
            {PROVIDERS[activeProvider].label} — {PROVIDERS[activeProvider].credentialLabel}
          </label>
          <input
            id="ai-key-input"
            type={activeProvider === 'ollama' ? 'text' : 'password'}
            placeholder={PROVIDERS[activeProvider].credentialPlaceholder}
            value={credentialDraft}
            onChange={(e) => setCredentialDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveCredential();
            }}
          />
          <label htmlFor="ai-model-input">Modell</label>
          <input
            id="ai-model-input"
            type="text"
            placeholder={PROVIDERS[activeProvider].defaultModel}
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveCredential();
            }}
          />
          <div className="gemini-chat-key-actions">
            <button
              type="button"
              onClick={saveCredential}
              disabled={needsCredential && !credentialDraft.trim()}
            >
              Verbinden
            </button>
            {activeCredential && (
              <button type="button" className="gemini-chat-key-clear" onClick={clearCredential}>
                Zurücksetzen
              </button>
            )}
          </div>
          <p className="gemini-chat-key-hint">
            {PROVIDERS[activeProvider].keyHint} Werte werden nur lokal im Browser gespeichert
            (localStorage, pro Anbieter getrennt) und nie an einen eigenen Server geschickt —
            Anfragen gehen direkt vom Browser aus an die {PROVIDERS[activeProvider].label}-Schnittstelle.
          </p>
        </div>
      ) : (
        <>
          <div className="gemini-chat-messages" ref={scrollRef}>
            {messages.length === 0 && (
              <p className="gemini-chat-empty">
                {source === 'bridge'
                  ? '// BRIDGE-MODUS. NACHRICHT WIRD AN DEN GEWÄHLTEN TAB WEITERGEREICHT.'
                  : '// UPLINK BEREIT. NACHRICHT EINGEBEN.'}
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`gemini-chat-msg gemini-chat-msg-${m.role} ${m.via === 'terminal' ? 'gemini-chat-msg-terminal' : ''}`}
              >
                {renderMessageContent(m.text, `${i}`, runningCommands, runTerminalCommand, terminal.available)}
              </div>
            ))}
            {loading && (
              <div className="gemini-chat-msg gemini-chat-msg-model gemini-chat-loading">
                <span />
                <span />
                <span />
              </div>
            )}
            {error && (
              <div className="gemini-chat-error">
                {error}
                {error.includes('cookie') && (
                  <button
                    type="button"
                    className="gemini-chat-error-key-btn"
                    onClick={() => {
                      setSource('openrouter'); // wechsle auf Key-basierten OpenRouter
                      setShowKeyForm(true);
                    }}
                    style={{
                      display: 'block',
                      marginTop: 8,
                      padding: '4px 12px',
                      fontSize: 13,
                      background: 'rgba(var(--accent-rgb), 0.1)',
                      border: '1px solid rgba(var(--accent-rgb), 0.3)',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    💡 KEY eintragen (bei OpenRouter)
                  </button>
                )}
              </div>
            )}
          </div>

          {questionnaireResults.length > 0 && (
            <section className="gemini-questionnaire-results" aria-label="Essenz-Fragenabgleich">
              <div className="gemini-questionnaire-header">
                <div className="gemini-questionnaire-title">ESSENZ · FRAGENABGLEICH</div>
                <button
                  type="button"
                  className="gemini-questionnaire-close"
                  onClick={() => setQuestionnaireResults([])}
                  aria-label="Essenz-Fragenabgleich schließen"
                  title="Ergebnis schließen"
                >
                  ×
                </button>
              </div>
              {questionnaireResults.map((result, index) => (
                <div key={`${result.question}-${index}`} className={`gemini-questionnaire-result ${result.abstracted ? 'is-abstracted' : ''}`}>
                  <div className="gemini-questionnaire-question">{result.question}</div>
                  <div className="gemini-questionnaire-answer">{result.answer}</div>
                </div>
              ))}
            </section>
          )}

          <div className="gemini-chat-attachments">
            {attachments.map((file) => (
              <div key={file.id} className={`gemini-chat-attachment ${file.status}`}>
                <span className="gemini-chat-attachment-icon">{file.type.startsWith('image/') ? '🖼️' : '📎'}</span>
                <span className="gemini-chat-attachment-name" title={file.name}>{file.name}</span>
                <span className="gemini-chat-attachment-status">
                  {file.status === 'reading' ? 'lese…' :
                   file.status === 'ready' ? 'bereit' :
                   file.error || 'nicht unterstützt'}
                </span>
                <button type="button" onClick={() => removeAttachment(file.id)} aria-label={`${file.name} entfernen`}>×</button>
              </div>
            ))}
          </div>
          <div className="gemini-chat-input-row">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) readDroppedFiles(e.target.files);
                e.currentTarget.value = '';
              }}
            />
            <button
              type="button"
              className="gemini-chat-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Dateien anhängen"
              aria-label="Dateien anhängen"
            >
              📎
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={
                speech.listening
                  ? '🎙 Höre zu...'
                  : source === 'bridge'
                  ? 'Nachricht an den freigegebenen Tab...'
                  : `Nachricht an ${activeProvider ? PROVIDERS[activeProvider].label : ''}...`
              }
              rows={maximized ? 3 : 1}
              className="gemini-chat-textarea"
            />
            {speech.supported && (
              <button
                type="button"
                onClick={speech.toggle}
                className={`gemini-chat-mic-btn ${speech.listening ? 'listening' : ''}`}
                title={speech.listening ? 'Aufnahme stoppen' : 'Spracheingabe starten'}
                aria-label={speech.listening ? 'Aufnahme stoppen' : 'Spracheingabe starten'}
              >
                {speech.listening ? '⏺' : '🎤'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setRemotePanelOpen((prev) => !prev)}
              className={`gemini-chat-mic-btn ${remoteRoomCode ? 'paired' : ''}`}
              title="JARVIS-Fernbedienung: Eingaben von einem gekoppelten Handy empfangen"
              aria-label="JARVIS-Fernbedienung öffnen"
            >
              📱
            </button>
            {remotePanelOpen && (
              <div className="gemini-chat-remote-panel">
                <div className="gemini-chat-remote-panel-header">
                  <span>JARVIS-Fernbedienung</span>
                  <button type="button" onClick={() => setRemotePanelOpen(false)} aria-label="Schließen">✕</button>
                </div>
                {remoteNeedsLanHost ? (
                  <>
                    <p className="gemini-chat-remote-hint">
                      Diese Seite läuft gerade über "localhost" — das ist vom Handy aus nie
                      erreichbar. Trag hier die lokale IP dieses Rechners im WLAN ein
                      (z. B. 192.168.1.23, zu finden in den WLAN-Einstellungen oder per
                      "ipconfig"/"ifconfig").
                    </p>
                    <input
                      type="text"
                      className="gemini-chat-remote-lan-input"
                      value={remoteLanInput}
                      onChange={(e) => setRemoteLanInput(e.target.value)}
                      placeholder="192.168.1.23"
                    />
                    <button type="button" className="gemini-chat-remote-copy" onClick={handleSaveLanHost}>
                      Übernehmen
                    </button>
                  </>
                ) : (
                  <>
                    {remoteQrDataUrl ? (
                      <img src={remoteQrDataUrl} alt="QR-Code zum Koppeln" className="gemini-chat-remote-qr" />
                    ) : (
                      <p>QR-Code wird erzeugt…</p>
                    )}
                    {remoteRoomCode && (
                      <>
                        <p className="gemini-chat-remote-code">Code: <strong>{remoteRoomCode}</strong></p>
                        <button
                          type="button"
                          className="gemini-chat-remote-copy"
                          onClick={() => { navigator.clipboard?.writeText(buildRemotePairingUrl(remoteRoomCode)).catch(() => {}); }}
                        >
                          Link kopieren
                        </button>
                      </>
                    )}
                    <p className="gemini-chat-remote-hint">
                      Mit dem Handy scannen oder Link öffnen — Eingaben landen direkt in diesem Chat.
                      {remoteReceivedAt && ' ✓ Letzte Eingabe empfangen.'}
                    </p>
                  </>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={
                loading ||
                !input.trim() ||
                (needsCredential && !activeCredential) ||
                (source === 'bridge' && bridgeTabId === null)
              }
            >
              Senden
            </button>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
