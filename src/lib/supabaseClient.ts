// src/lib/supabaseClient.ts
// Supabase dient hier zwei Zwecken: (1) Google-Login (Supabase Auth), (2)
// Datenbank als persistentes "Gedächtnis" für die agentic AI (Chat-Verlauf +
// freie Key/Value-Fakten), user-gebunden per Row-Level-Security.
//
// Projekt-URL + Publishable(Anon)-Key werden — wie die anderen API-Keys in
// diesem Projekt (aiProviders.ts, googleWorkspace.ts) — im localStorage
// gehalten und über eine kleine UI (SystemStatusPanel → Status-Tab)
// eingegeben. Der Anon-Key ist bewusst öffentlich nutzbar (dafür gemacht),
// der eigentliche Schutz läuft über Row-Level-Security-Policies in Supabase.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL_KEY = 'dna-legal-supabase-url';
export const SUPABASE_ANON_KEY_KEY = 'dna-legal-supabase-anon-key';

// Vorbelegter Publishable Key + Projekt-URL — ein gemeinsames Supabase-
// Projekt für alle Nutzer der App (siehe Absprache: Kontingent reicht in
// dieser Größenordnung locker, Schutz läuft über Row-Level-Security, nicht
// über Geheimhaltung von URL/Anon-Key). Beide Felder bleiben trotzdem über
// die UI änderbar/überschreibbar, falls später doch mal ein eigenes Projekt
// angebunden werden soll.
const DEFAULT_SUPABASE_URL = 'https://fqarrnszpezjfviqncqo.supabase.co';
const DEFAULT_ANON_KEY = 'sb_publishable_ONN8d8PFiWx97-tJbwUHwg_Fi1_rSGZ';

export function getSupabaseUrl(): string {
  return localStorage.getItem(SUPABASE_URL_KEY) || DEFAULT_SUPABASE_URL;
}
export function getSupabaseAnonKey(): string {
  return localStorage.getItem(SUPABASE_ANON_KEY_KEY) || DEFAULT_ANON_KEY;
}
export function setSupabaseUrl(url: string): void {
  localStorage.setItem(SUPABASE_URL_KEY, url.trim());
  client = null; // beim nächsten Zugriff mit neuer Config neu erstellen
}
export function setSupabaseAnonKey(key: string): void {
  localStorage.setItem(SUPABASE_ANON_KEY_KEY, key.trim());
  client = null;
}

let client: SupabaseClient | null = null;

/** Gibt den Supabase-Client zurück, oder null, wenn URL/Key noch fehlen. */
export function getSupabaseClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

export function isSupabaseConfigured(): boolean {
  return !!getSupabaseUrl() && !!getSupabaseAnonKey();
}
