import { useCallback, useEffect, useState } from 'react';

export interface TerminalRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
}

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:8787';
const STORAGE_KEY = 'dna-legal-terminal-bridge-url';
const ENABLED_STORAGE_KEY = 'dna-legal-terminal-bridge-enabled';
const TERMINAL_ENABLED_EVENT = 'dna-legal-terminal-bridge-enabled-changed';
const TERMINAL_URL_EVENT = 'dna-legal-terminal-bridge-url-changed';
const REQUEST_TIMEOUT_MS = 35_000;

function loadBridgeUrl(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored?.replace(/^http:\/\/localhost(?=[:/]|$)/, 'http://127.0.0.1') || DEFAULT_BRIDGE_URL;
}

function loadEnabled(): boolean {
  return localStorage.getItem(ENABLED_STORAGE_KEY) !== 'false';
}

async function request(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

/** Verbindung zum lokalen Terminal-Bridge-Server. */
export function useTerminalBridge() {
  const [bridgeUrl, setBridgeUrlState] = useState(() => loadBridgeUrl());
  const [enabled, setEnabledState] = useState(() => loadEnabled());
  const [available, setAvailable] = useState(false);
  const [checking, setChecking] = useState(false);

  const setBridgeUrl = useCallback((url: string) => {
    const clean = (url.trim().replace(/\/+$/, '') || DEFAULT_BRIDGE_URL)
      .replace(/^http:\/\/localhost(?=[:/]|$)/, 'http://127.0.0.1');
    localStorage.setItem(STORAGE_KEY, clean);
    setBridgeUrlState(clean);
    window.dispatchEvent(new CustomEvent(TERMINAL_URL_EVENT, { detail: clean }));
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    localStorage.setItem(ENABLED_STORAGE_KEY, String(next));
    setEnabledState(next);
    window.dispatchEvent(new CustomEvent(TERMINAL_ENABLED_EVENT, { detail: next }));
    if (!next) setAvailable(false);
  }, []);

  useEffect(() => {
    const syncEnabled = (event: Event) => {
      const next = (event as CustomEvent<boolean>).detail;
      setEnabledState(next);
      if (!next) setAvailable(false);
    };
    const syncUrl = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (typeof next === 'string' && next) setBridgeUrlState(next);
    };
    window.addEventListener(TERMINAL_ENABLED_EVENT, syncEnabled);
    window.addEventListener(TERMINAL_URL_EVENT, syncUrl);
    return () => {
      window.removeEventListener(TERMINAL_ENABLED_EVENT, syncEnabled);
      window.removeEventListener(TERMINAL_URL_EVENT, syncUrl);
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setAvailable(false);
      setChecking(false);
      return false;
    }
    setChecking(true);
    try {
      const res = await request(`${bridgeUrl}/ping`, { method: 'GET' }, 5_000);
      const data = await res.json().catch(() => null);
      const ok = !!res.ok && !!data?.ok;
      setAvailable(ok);
      return ok;
    } catch {
      setAvailable(false);
      return false;
    } finally {
      setChecking(false);
    }
  }, [bridgeUrl, enabled]);

  useEffect(() => { void refresh(); }, [refresh]);

  const runCommand = useCallback(async (cmd: string, cwd?: string): Promise<TerminalRunResult> => {
    if (!enabled) {
      return { ok: false, stdout: '', stderr: '', exitCode: null, error: 'Terminal-Betrieb ist ausgeschaltet.' };
    }
    if (!cmd.trim()) {
      return { ok: false, stdout: '', stderr: '', exitCode: null, error: 'Leerer Terminal-Befehl.' };
    }

    try {
      const res = await request(`${bridgeUrl}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd, cwd }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setAvailable(false);
        return { ok: false, stdout: '', stderr: '', exitCode: null, error: data?.error || `Terminal-Bridge-Fehler (Status ${res.status})` };
      }
      setAvailable(true);
      return {
        ok: data.ok ?? data.exitCode === 0,
        stdout: data.stdout || '',
        stderr: data.stderr || '',
        exitCode: data.exitCode ?? null,
        error: data.error,
      };
    } catch (e) {
      setAvailable(false);
      const detail = e instanceof DOMException && e.name === 'AbortError'
        ? 'Zeitüberschreitung: Der lokale Befehl oder die Bridge antwortet nicht.'
        : e instanceof Error ? e.message : String(e);
      return {
        ok: false, stdout: '', stderr: '', exitCode: null,
        error: `Terminal-Bridge nicht erreichbar unter ${bridgeUrl}. Läuft der lokale Server? ${detail}`,
      };
    }
  }, [bridgeUrl, enabled]);

  return { bridgeUrl, setBridgeUrl, enabled, setEnabled, available, checking, refresh, runCommand };
}
