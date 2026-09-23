import React, { useState, useEffect, useRef } from 'react';
import '../styles/ModelWindow.css';
import '../styles/SystemStatus.css';
import { PROVIDERS, PROVIDER_ORDER, fetchAvailableModels, getOllamaCloudApiKey, getOllamaMode, setOllamaCloudApiKey, setOllamaMode, type OllamaMode, type ProviderId } from '../lib/aiProviders';
import PanelCircuitGlow from './PanelCircuitGlow';
import EntertainmentSection from './EntertainmentSection';
import { type MusicPlayerApi } from '../hooks/useMusicPlayer';

export interface ModelSelection {
  provider: ProviderId;
  model: string;
}

export interface ModelWindowProps {
  open: boolean;
  onClose: () => void;
  onInject?: (selection: ModelSelection) => void;
  /** Geteilte Musik-Player-Instanz (aus App.tsx) — für die Entertainment-
   * Unterkategorie (Radio/Playlist) innerhalb von NETWORK. */
  music: MusicPlayerApi;
}

/** Lädt Credential aus localStorage (oder Default für Ollama) */
function loadCredential(provider: ProviderId): string {
  const stored = localStorage.getItem(PROVIDERS[provider].keyStorageKey);
  if (stored) return stored;
  return PROVIDERS[provider].credentialDefault;
}

/** Lädt Modell aus localStorage (oder Default) */
function loadModel(provider: ProviderId): string {
  return localStorage.getItem(PROVIDERS[provider].modelStorageKey) || PROVIDERS[provider].defaultModel;
}

type FetchState = 'idle' | 'loading' | 'loaded' | 'error';




export default function ModelWindow({ open, onClose, onInject, music }: ModelWindowProps) {
  const [subTab, setSubTab] = useState<'providers' | 'entertainment'>('providers');
  const [credentials, setCredentials] = useState<Record<ProviderId, string>>(() =>
    PROVIDER_ORDER.reduce(
      (acc, p) => ({ ...acc, [p]: loadCredential(p) }),
      {} as Record<ProviderId, string>
    )
  );
  const [models, setModels] = useState<Record<ProviderId, string>>(() =>
    PROVIDER_ORDER.reduce(
      (acc, p) => ({ ...acc, [p]: loadModel(p) }),
      {} as Record<ProviderId, string>
    )
  );
  const [customDraft, setCustomDraft] = useState<Partial<Record<ProviderId, string>>>({});
  // Live von der Anbieter-API geladene Modelle, pro Provider getrennt.
  const [liveModels, setLiveModels] = useState<Partial<Record<ProviderId, string[]>>>({});
  const [ollamaLocalModels, setOllamaLocalModels] = useState<string[]>([]);
  const [ollamaCloudModels, setOllamaCloudModels] = useState<string[]>([]);
  const [ollamaLocalState, setOllamaLocalState] = useState<FetchState>('idle');
  const [ollamaCloudState, setOllamaCloudState] = useState<FetchState>('idle');
  const [ollamaLocalError, setOllamaLocalError] = useState('');
  const [ollamaCloudError, setOllamaCloudError] = useState('');
  const [fetchState, setFetchState] = useState<Record<ProviderId, FetchState>>(() =>
    PROVIDER_ORDER.reduce((acc, p) => ({ ...acc, [p]: 'idle' }), {} as Record<ProviderId, FetchState>)
  );
  const [fetchError, setFetchError] = useState<Partial<Record<ProviderId, string>>>({});
  const [justInjected, setJustInjected] = useState<ProviderId | null>(null);
  const [ollamaMode, setOllamaModeState] = useState<OllamaMode>(() => getOllamaMode());
  const [ollamaCloudKey, setOllamaCloudKeyState] = useState(() => getOllamaCloudApiKey());
  const panelRef = useRef<HTMLDivElement>(null);

  // Aktiviere Tastenkombination ESC zum Schließen
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

  const needsCredential = (p: ProviderId) => p !== 'ollama' && !credentials[p];
  const hasCredential = (p: ProviderId) => p === 'ollama' ? (ollamaMode === 'local' || !!ollamaCloudKey) : (p === 'openrouter' || PROVIDERS[p].allowNoCredential || !!credentials[p]);

  const loadOllamaModels = async (mode: OllamaMode) => {
    const isCloud = mode === 'cloud';
    const credential = isCloud ? ollamaCloudKey : (credentials.ollama || PROVIDERS.ollama.credentialDefault);
    const setState = isCloud ? setOllamaCloudState : setOllamaLocalState;
    const setError = isCloud ? setOllamaCloudError : setOllamaLocalError;
    setState('loading');
    setError('');
    if (isCloud) setOllamaCloudApiKey(ollamaCloudKey);
    try {
      const list = await fetchAvailableModels('ollama', credential, mode);
      if (isCloud) setOllamaCloudModels(list); else setOllamaLocalModels(list);
      setState('loaded');
      if (mode === ollamaMode && list.length) {
        setModels((prev) => ({ ...prev, ollama: list.includes(prev.ollama) ? prev.ollama : list[0] }));
      }
    } catch (e) {
      setState('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const loadLiveModels = async (provider: ProviderId) => {
    if (provider === 'ollama') return loadOllamaModels(ollamaMode);
    const credential = credentials[provider] || '';
    setFetchState((prev) => ({ ...prev, [provider]: 'loading' }));
    setFetchError((prev) => ({ ...prev, [provider]: undefined }));
    try {
      const list = await fetchAvailableModels(provider, credential);
      setLiveModels((prev) => ({ ...prev, [provider]: list }));
      setFetchState((prev) => ({ ...prev, [provider]: 'loaded' }));
      setModels((prev) => (list.includes(prev[provider]) ? prev : { ...prev, [provider]: list[0] }));
    } catch (e) {
      setFetchState((prev) => ({ ...prev, [provider]: 'error' }));
      setFetchError((prev) => ({ ...prev, [provider]: e instanceof Error ? e.message : String(e) }));
    }
  };

  // Netzwerkfenster darf beim Öffnen keine externen Modell-Requests starten.
  // Das war für das stabile Öffnen des Fullscreen-Panels unnötig und konnte
  // je nach Browser/WebGL-Zustand den sichtbaren Hintergrund blockieren.
  // Modelle werden ausschließlich auf Klick auf „Modelle laden“ geladen.

  if (!open) return null;

  const applyModel = (provider: ProviderId, model: string) => {
    setModels((prev) => ({ ...prev, [provider]: model }));
    localStorage.setItem(PROVIDERS[provider].modelStorageKey, model);
  };

  const handleUse = (provider: ProviderId) => {
    const model = (models[provider] || '').trim() || PROVIDERS[provider].defaultModel;
    if (provider === 'ollama') {
      setOllamaMode(ollamaMode);
      setOllamaCloudApiKey(ollamaCloudKey);
      if (ollamaMode === 'local') localStorage.setItem(PROVIDERS[provider].keyStorageKey, credentials[provider] || '');
    } else if (needsCredential(provider)) {
      localStorage.setItem(PROVIDERS[provider].keyStorageKey, credentials[provider] || '');
    }
    applyModel(provider, model);
    onInject?.({ provider, model });
    setJustInjected(provider);
    window.setTimeout(() => setJustInjected(null), 1600);
  };

  return (
    <div className="model-window-overlay" data-testid="model-window" role="dialog" aria-modal="true">
      <div className="model-window-panel" ref={panelRef} onMouseDown={(e) => e.stopPropagation()}>
        <PanelCircuitGlow />
        <div className="model-window-header">
          <span className="model-window-title">NETWORK</span>
          <button
            type="button"
            className="model-window-close"
            onClick={onClose}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        <div className="system-status-tabs">
          <button
            type="button"
            className={`system-status-tab ${subTab === 'providers' ? 'active' : ''}`}
            onClick={() => setSubTab('providers')}
          >
            KI-Provider
          </button>
          <button
            type="button"
            className={`system-status-tab ${subTab === 'entertainment' ? 'active' : ''}`}
            onClick={() => setSubTab('entertainment')}
          >
            Entertainment
          </button>
        </div>

        <div className="model-window-body">
          {subTab === 'entertainment' ? (
            <EntertainmentSection music={music} />
          ) : (
            <>
          <p className="model-inject-hint" style={{ margin: 0 }}>
            Key eintragen (falls nötig) → „Modelle laden" holt die aktuell tatsächlich
            verfügbaren Modelle direkt von der Anbieter-API → Modell wählen → „Verwenden".
          </p>

          {/* Provider-Tiles: alle Anbieter mit Keys + Live-Modellauswahl */}
          <div className="model-provider-grid">
            {PROVIDER_ORDER.map((provider) => {
              const hasCred = hasCredential(provider);
              const currentModel = models[provider] || PROVIDERS[provider].defaultModel;
              const state = fetchState[provider];
              const options = provider === 'ollama' ? (ollamaMode === 'cloud' ? ollamaCloudModels : ollamaLocalModels) : (liveModels[provider] ?? PROVIDERS[provider].modelList ?? []);
              const isCustomSelected = options.length > 0 && !options.includes(currentModel);

              return (
                <div
                  key={provider}
                  className={`model-provider-tile ${hasCred ? 'configured' : 'unconfigured'}`}
                >
                  <div className="model-provider-header">
                    <span className="model-provider-name">{provider === 'ollama' ? `OLLAMA · ${ollamaMode === 'cloud' ? 'CLOUD' : 'LOCAL'}` : PROVIDERS[provider].label}</span>
                    {hasCred ? (
                      <span className="model-provider-status">✓</span>
                    ) : (
                      <span className="model-provider-status missing">✕</span>
                    )}
                  </div>

                  {/* Credential-Anzeige/Input */}
                  {provider === 'ollama' ? (
                    <div className="model-provider-credential">
                      <label className="model-credential-label">Betriebsart</label>
                      <select className="model-select" value={ollamaMode} onChange={(e) => { const mode = e.target.value as OllamaMode; setOllamaModeState(mode); setOllamaMode(mode); setCredentials((prev) => ({ ...prev, ollama: mode === 'cloud' ? ollamaCloudKey : (localStorage.getItem(PROVIDERS.ollama.keyStorageKey) || PROVIDERS.ollama.credentialDefault) })); setFetchState((prev) => ({ ...prev, ollama: 'idle' })); setModels((prev) => ({ ...prev, ollama: (mode === 'cloud' ? ollamaCloudModels[0] : ollamaLocalModels[0]) || prev.ollama })); }}>
                        <option value="local">LOKAL · eigener Ollama-Server</option>
                        <option value="cloud">CLOUD API · ollama.com</option>
                      </select>
                      {ollamaMode === 'local' ? (
                        <input type="text" className="model-credential-input" placeholder="http://localhost:11434" value={credentials.ollama || ''} onChange={(e) => setCredentials((prev) => ({ ...prev, ollama: e.target.value }))} />
                      ) : (
                        <input type="password" className="model-credential-input" placeholder="Ollama API-Key" value={ollamaCloudKey} onChange={(e) => { setOllamaCloudKeyState(e.target.value); setOllamaCloudApiKey(e.target.value); }} onBlur={() => { if (ollamaCloudKey.trim()) loadOllamaModels('cloud'); }} />
                      )}
                    </div>
                  ) : provider !== 'openrouter' ? (
                    <div className="model-provider-credential">
                      <label className="model-credential-label">{PROVIDERS[provider].credentialLabel}</label>
                      <input type="password" className="model-credential-input" placeholder={PROVIDERS[provider].credentialPlaceholder} value={credentials[provider] || ''} onChange={(e) => setCredentials((prev) => ({ ...prev, [provider]: e.target.value }))} />
                    </div>
                  ) : null}

                  {/* Modelle laden */}
                  {provider === 'ollama' ? (
                    <div style={{ display: 'grid', gap: '0.45rem' }}>
                      <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button type="button" className="model-save-btn" style={{ marginTop: 0 }} disabled={ollamaLocalState === 'loading'} onClick={() => loadOllamaModels('local')}>
                          {ollamaLocalState === 'loading' ? 'Lokal lädt…' : '⟳ LOCAL laden'}
                        </button>
                        <span className="model-provider-status" style={{ fontSize: '0.62rem' }}>{ollamaLocalModels.length} LOCAL</span>
                      </div>
                      {ollamaLocalError && <div className="model-inject-error">{ollamaLocalError}</div>}
                      <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button type="button" className="model-save-btn" style={{ marginTop: 0 }} disabled={!ollamaCloudKey || ollamaCloudState === 'loading'} onClick={() => loadOllamaModels('cloud')}>
                          {ollamaCloudState === 'loading' ? 'Cloud lädt…' : '☁ CLOUD laden'}
                        </button>
                        <span className="model-provider-status" style={{ fontSize: '0.62rem' }}>{ollamaCloudModels.length} CLOUD</span>
                      </div>
                      {ollamaCloudError && <div className="model-inject-error">{ollamaCloudError}</div>}
                    </div>
                  ) : (
                    <>
                      <button type="button" className="model-save-btn" style={{ marginTop: 0 }} disabled={!hasCred || state === 'loading'} onClick={() => loadLiveModels(provider)}>
                        {state === 'loading' ? 'Lädt…' : '⟳ Modelle laden'}
                      </button>
                      {state === 'loaded' && <span className="model-provider-status" style={{ fontSize: '0.62rem' }}>{options.length} Modelle live geladen</span>}
                      {state === 'error' && fetchError[provider] && <div className="model-inject-error">{fetchError[provider]}</div>}
                    </>
                  )}

                  {/* Modell-Auswahl */}
                  <div className="model-provider-model">
                    <label className="model-credential-label">Modell</label>
                    {options.length > 0 ? (
                      <select
                        className="model-select"
                        value={isCustomSelected ? '__custom__' : currentModel}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') return;
                          applyModel(provider, e.target.value);
                        }}
                        disabled={!hasCred}
                      >
                        {options.map((m) => (
                          <option key={m} value={m}>
                            {provider === 'ollama' ? `${ollamaMode === 'cloud' ? '☁ CLOUD · ' : '▣ LOCAL · '}${m}` : m}
                          </option>
                        ))}
                        <option value="__custom__">…eigenen Namen eingeben</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="model-input"
                        placeholder={PROVIDERS[provider].defaultModel}
                        value={currentModel}
                        onChange={(e) => applyModel(provider, e.target.value)}
                        disabled={!hasCred}
                      />
                    )}
                    {options.length > 0 && (
                      <input
                        type="text"
                        className="model-custom-input"
                        placeholder="Eigenes Modell"
                        value={customDraft[provider] ?? (isCustomSelected ? currentModel : '')}
                        onChange={(e) => {
                          setCustomDraft((prev) => ({ ...prev, [provider]: e.target.value }));
                          applyModel(provider, e.target.value);
                        }}
                      />
                    )}
                  </div>

                  <button
                    type="button"
                    className="model-save-btn"
                    disabled={!hasCred || !currentModel}
                    onClick={() => handleUse(provider)}
                  >
                    {justInjected === provider ? '✓ Aktiv' : 'Verwenden'}
                  </button>
                </div>
              );
            })}
          </div>
            </>
          )}
        </div>

        <div className="model-window-footer">
          <span>Änderungen werden in localStorage gespeichert — nur lokal im Browser.</span>
        </div>
      </div>
    </div>
  );
}
