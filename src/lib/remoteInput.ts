// src/lib/remoteInput.ts
// "JARVIS"-Fernbedienung: Eingaben von einem gekoppelten Mobilgerät live in
// die Web-App einspeisen. Läuft komplett über Supabase Realtime Broadcast
// (derselbe, bereits im Projekt konfigurierte Client, siehe supabaseClient.ts)
// — kein eigener Server, keine Datenbank-Tabelle nötig, der Broadcast landet
// nur bei aktuell verbundenen Clients desselben Kanals.
//
// Ablauf:
// 1) Desktop (GeminiChat) erzeugt einen kurzen Raumcode und zeigt ihn als
//    QR-Code/Link an (buildRemotePairingUrl), abonniert den Kanal
//    (subscribeToRemoteInput).
// 2) Handy öffnet den Link (App.tsx erkennt ?remote=<code> und rendert
//    RemoteInputPage statt der normalen App), tippt/spricht Text ein und
//    schickt ihn per sendRemoteInput.
// 3) Desktop empfängt den Broadcast und verarbeitet den Text wie eine ganz
//    normale Chat-Eingabe.

import { getSupabaseClient } from './supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

const BROADCAST_EVENT = 'jarvis-input';
const ROOM_QUERY_PARAM = 'remote';

/** Kurzer, gut abtippbarer Raumcode (falls kein QR-Scan möglich ist). */
export function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne verwechselbare Zeichen (0/O, 1/I)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function channelName(roomCode: string): string {
  return `remote-input-${roomCode}`;
}

/** Die URL, die auf dem Handy geöffnet wird (per QR-Code oder Link-Teilen). */
export function buildRemotePairingUrl(roomCode: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(ROOM_QUERY_PARAM, roomCode);
  const override = getLanHostOverride();
  if (override) {
    // "localhost"/"127.0.0.1" ist von jedem Gerät aus etwas anderes — vom
    // Handy aus nie die App auf dem Desktop. Für diesen Fall lässt sich hier
    // die tatsächliche LAN-IP des Rechners (z. B. 192.168.1.23) hinterlegen,
    // die dann statt "localhost" im QR-Link verwendet wird.
    url.hostname = override;
  }
  return url.toString();
}

const LAN_HOST_KEY = 'dna-legal-remote-lan-host';

/** True, wenn die App gerade über localhost/127.0.0.1 aufgerufen wurde —
 *  dann braucht buildRemotePairingUrl() eine LAN-IP-Angabe, sonst ist der
 *  QR-Link vom Handy aus nie erreichbar. */
export function needsLanHostOverride(): boolean {
  const h = window.location.hostname;
  return (h === 'localhost' || h === '127.0.0.1') && !getLanHostOverride();
}

export function getLanHostOverride(): string | null {
  return localStorage.getItem(LAN_HOST_KEY) || null;
}

export function setLanHostOverride(host: string): void {
  localStorage.setItem(LAN_HOST_KEY, host.trim());
}

/** Liest einen evtl. in der URL vorhandenen Raumcode (Handy-Seite). */
export function getRoomCodeFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get(ROOM_QUERY_PARAM);
}

/**
 * Desktop-Seite: hört auf Eingaben aus dem angegebenen Raum. Gibt eine
 * Cleanup-Funktion zurück, die den Kanal wieder verlässt.
 */
export function subscribeToRemoteInput(
  roomCode: string,
  onInput: (text: string) => void
): () => void {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};

  const channel: RealtimeChannel = supabase.channel(channelName(roomCode));
  channel
    .on('broadcast', { event: BROADCAST_EVENT }, (payload) => {
      const text = (payload?.payload as { text?: string } | undefined)?.text;
      if (text && text.trim()) onInput(text.trim());
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Handy-Seite: verbindet sich kurz mit dem Raum, schickt eine Eingabe und
 * trennt danach wieder — kein dauerhaft offener Kanal auf dem Handy nötig.
 */
export async function sendRemoteInput(roomCode: string, text: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase || !text.trim()) return false;

  const channel = supabase.channel(channelName(roomCode));
  return new Promise((resolve) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel
          .send({ type: 'broadcast', event: BROADCAST_EVENT, payload: { text: text.trim() } })
          .then(() => {
            supabase.removeChannel(channel);
            resolve(true);
          })
          .catch(() => {
            supabase.removeChannel(channel);
            resolve(false);
          });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        resolve(false);
      }
    });
  });
}
