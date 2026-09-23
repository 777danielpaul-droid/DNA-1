import { useCallback, useEffect, useState } from 'react';

// Muss mit den Nachrichtentypen in extension/background.js übereinstimmen.
type BridgeTarget = { tabId: number; url: string; title: string; site: string; active?: boolean };
type BridgeSendResult = { ok: true; text: string } | { ok: false; error: string };

// Diese ID ergibt sich deterministisch aus dem "key" in extension/manifest.json
// und bleibt daher stabil, egal auf welchem Rechner/wie oft die Extension neu
// "Entpackt geladen" wird — kein manuelles Nachtragen einer ID mehr nötig.
// Nur überschreiben, falls ihr manifest.json einen eigenen "key" gebt (dann
// ändert sich die ID) — dann hier oder per VITE_PRIS_BRIDGE_EXTENSION_ID
// (Vorrang) anpassen.
const DEFAULT_EXTENSION_ID = 'chkimgpljfifijodjcoonekjfbmjcpkh';
const EXTENSION_ID = (import.meta as any).env?.VITE_PRIS_BRIDGE_EXTENSION_ID || DEFAULT_EXTENSION_ID;

function hasExternalRuntime() {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage && !!EXTENSION_ID;
}

function sendToExtension<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!hasExternalRuntime()) {
      reject(new Error('Extension nicht verfügbar.'));
      return;
    }
    chrome.runtime?.sendMessage(EXTENSION_ID, message, (response: T) => {
      const lastError = chrome.runtime?.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

export function useExtensionBridge() {
  const [available, setAvailable] = useState(false);
  const [targets, setTargets] = useState<BridgeTarget[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refreshTargets = useCallback(async (): Promise<BridgeTarget[]> => {
    if (!hasExternalRuntime()) {
      setAvailable(false);
      setTargets([]);
      return [];
    }
    setRefreshing(true);
    try {
      const ping = await sendToExtension<{ ok: boolean }>({ type: 'PRIS_BRIDGE_PING' });
      setAvailable(!!ping?.ok);
      if (ping?.ok) {
        const res = await sendToExtension<{ ok: boolean; targets: BridgeTarget[] }>({
          type: 'PRIS_BRIDGE_LIST_TARGETS',
        });
        const nextTargets = res?.targets || [];
        setTargets(nextTargets);
        return nextTargets;
      }
      setTargets([]);
      return [];
    } catch {
      setAvailable(false);
      setTargets([]);
      return [];
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshTargets();
  }, [refreshTargets]);

  const sendPrompt = useCallback(async (tabId: number, prompt: string): Promise<string> => {
    const res = await sendToExtension<BridgeSendResult>({
      type: 'PRIS_BRIDGE_SEND',
      tabId,
      prompt,
    });
    if (!res?.ok) throw new Error(res?.error || 'Bridge-Anfrage fehlgeschlagen.');
    return res.text;
  }, []);

  return { available, targets, refreshing, refreshTargets, sendPrompt };
}
