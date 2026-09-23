import React, { useEffect, useState } from 'react';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseConfigured,
  setSupabaseAnonKey,
  setSupabaseUrl,
} from '../lib/supabaseClient';
import { deleteMemoryFact, listMemoryFacts, setMemoryFact, type MemoryFact } from '../lib/aiMemory';

export default function AccountSection() {
  const [url, setUrl] = useState(() => getSupabaseUrl());
  const [anonKey, setAnonKey] = useState(() => getSupabaseAnonKey());
  const [configured, setConfigured] = useState(() => isSupabaseConfigured());
  const { user, loading, signInWithGoogle, signOut } = useSupabaseAuth();
  const [authError, setAuthError] = useState('');
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showAllFacts, setShowAllFacts] = useState(false);
  const FACTS_PREVIEW_COUNT = 3;

  useEffect(() => {
    if (user) {
      listMemoryFacts().then(setFacts);
    } else {
      setFacts([]);
    }
  }, [user]);

  function saveUrl(value: string) {
    setUrl(value);
    setSupabaseUrl(value);
    setConfigured(isSupabaseConfigured());
  }
  function saveAnonKey(value: string) {
    setAnonKey(value);
    setSupabaseAnonKey(value);
    setConfigured(isSupabaseConfigured());
  }

  async function handleLogin() {
    setAuthError('');
    try {
      await signInWithGoogle();
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.');
    }
  }

  async function handleAddFact() {
    if (!newKey.trim()) return;
    await setMemoryFact(newKey.trim(), newValue);
    setNewKey('');
    setNewValue('');
    setFacts(await listMemoryFacts());
  }

  async function handleDeleteFact(key: string) {
    await deleteMemoryFact(key);
    setFacts(await listMemoryFacts());
  }

  return (
    <div className="system-status-section">
      <span className="system-status-section-title">Konto & Gedächtnis (Supabase)</span>

      <div className="system-status-row">
        <span className="system-status-row-label">Projekt-URL</span>
      </div>
      <input
        type="text"
        className="invoice-scanner-input"
        placeholder="https://xxxxxxxx.supabase.co"
        value={url}
        onChange={(e) => saveUrl(e.target.value)}
      />
      <div className="system-status-row">
        <span className="system-status-row-label">Publishable (Anon) Key</span>
      </div>
      <input
        type="text"
        className="invoice-scanner-input"
        value={anonKey}
        onChange={(e) => saveAnonKey(e.target.value)}
      />

      {!configured && (
        <span className="invoice-scanner-hint">
          Projekt-URL fehlt noch (Supabase Dashboard → Project Settings → API → "Project URL").
        </span>
      )}

      {configured && !loading && (
        <div className="system-status-row" style={{ marginTop: 8 }}>
          {user ? (
            <>
              <span className="system-status-row-value ok">
                Angemeldet als {user.email ?? user.id}
              </span>
              <button type="button" className="system-status-refresh-btn" onClick={() => void signOut()}>
                Abmelden
              </button>
            </>
          ) : (
            <button type="button" className="system-status-refresh-btn" onClick={() => void handleLogin()}>
              Mit Google anmelden
            </button>
          )}
        </div>
      )}
      {authError && <div className="invoice-scanner-error">{authError}</div>}

      {user && (
        <div style={{ marginTop: 10 }}>
          <span className="system-status-row-label">Gespeicherte Fakten (Gedächtnis)</span>
          {facts.length === 0 && <p className="invoice-scanner-hint">Noch keine Fakten gespeichert.</p>}
          {(showAllFacts ? facts : facts.slice(0, FACTS_PREVIEW_COUNT)).map((f) => (
            <div key={f.key} className="system-status-row">
              <span className="system-status-row-value">{f.key}: {JSON.stringify(f.value)}</span>
              <button type="button" className="system-status-refresh-btn" onClick={() => void handleDeleteFact(f.key)}>
                Löschen
              </button>
            </div>
          ))}
          {facts.length > FACTS_PREVIEW_COUNT && (
            <button
              type="button"
              className="system-status-refresh-btn"
              style={{ marginTop: 6 }}
              onClick={() => setShowAllFacts((v) => !v)}
            >
              {showAllFacts ? `▲ Weniger anzeigen` : `▼ Alle ${facts.length} anzeigen`}
            </button>
          )}
          <div className="invoice-scanner-row" style={{ marginTop: 8 }}>
            <input
              type="text"
              className="invoice-scanner-input"
              placeholder="Schlüssel (z.B. lieblingsfarbe)"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              style={{ flex: 1 }}
            />
            <input
              type="text"
              className="invoice-scanner-input"
              placeholder="Wert"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="button" className="invoice-scanner-btn" onClick={() => void handleAddFact()}>
              Speichern
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
