// src/lib/aiMemory.ts
// Persistentes, user-gebundenes Gedächtnis über Supabase.
//
// Es wird ausschließlich ai_memory für langlebige, explizit erkannte Keys verwendet.
// Chatverläufe werden NICHT in Supabase gespeichert.
//
// Wichtig: Memory muss VOR dem Provider-Aufruf gelesen und in den
// System-Kontext injiziert werden. Dieses Modul übernimmt genau das.

import { getSupabaseClient } from './supabaseClient';

export interface StoredChatMessage {
  role: 'user' | 'model';
  text: string;
  via?: string;
}


async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[PRIS Memory] Supabase-Session konnte nicht gelesen werden:', error);
    return null;
  }
  return data.session?.user.id ?? null;
}

export interface MemoryFact {
  key: string;
  value: unknown;
  updated_at?: string;
}

export async function listMemoryFacts(): Promise<MemoryFact[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const userId = await getAuthenticatedUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('ai_memory')
    .select('key, value, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('[PRIS Memory] Fakten konnten nicht geladen werden:', error);
    return [];
  }
  return (data ?? []) as MemoryFact[];
}

export async function setMemoryFact(key: string, value: unknown): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const userId = await getAuthenticatedUserId();
  if (!userId) return;

  const cleanKey = key.trim().toLowerCase();
  if (!cleanKey) return;
  const { error } = await supabase
    .from('ai_memory')
    .upsert({ user_id: userId, key: cleanKey, value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
  if (error) console.error('[PRIS Memory] Fakt konnte nicht gespeichert werden:', error);
}

export async function deleteMemoryFact(key: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const userId = await getAuthenticatedUserId();
  if (!userId) return;

  const { error } = await supabase.from('ai_memory').delete().eq('user_id', userId).eq('key', key);
  if (error) console.error('[PRIS Memory] Fakt konnte nicht gelöscht werden:', error);
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('de-DE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9äöüß]+/gi, ' ')
    .trim();
}

function tokens(value: string): string[] {
  return normalize(value).split(/\s+/).filter((t) => t.length >= 3);
}

// Kleine lokale Synonymliste: damit z.B. "Wie heißt mein Hund?" auch
// einen gespeicherten Fakt "mein_hund" / "hund_name" findet.
const MEMORY_ALIASES: Record<string, string[]> = {
  hund: ['hund', 'haustier', 'pet', 'dog'],
  katze: ['katze', 'haustier', 'pet', 'cat'],
  name: ['name', 'heiss', 'heisst', 'heiße', 'heisse'],
  wohnort: ['wohnort', 'wohne', 'wohnen', 'lebe', 'stadt', 'ort'],
  projekt: ['projekt', 'app', 'website', 'software'],
  arbeit: ['arbeit', 'job', 'beruf', 'firma'],
};

function expandedQueryTokens(query: string): Set<string> {
  const result = new Set(tokens(query));
  for (const token of [...result]) {
    for (const aliases of Object.values(MEMORY_ALIASES)) {
      if (aliases.includes(token)) aliases.forEach((a) => result.add(normalize(a)));
    }
  }
  return result;
}

/** Liefert relevante Langzeit-Fakten. Bei bis zu 50 Fakten werden alle
 * mitgegeben; so kann ein Fakt wie "hund_name" auch dann gefunden werden,
 * wenn die konkrete Frage den exakten Key nicht kennt. */
export async function getRelevantMemoryFacts(query: string, limit = 50): Promise<MemoryFact[]> {
  const facts = await listMemoryFacts();
  if (facts.length <= limit) return facts;

  const queryTokens = expandedQueryTokens(query);
  return facts
    .map((fact, index) => {
      const haystack = normalize(`${fact.key} ${typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value)}`);
      const score = [...queryTokens].reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
      return { fact, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ fact }) => fact);
}

export async function buildMemoryContext(query: string): Promise<string> {
  const facts = await getRelevantMemoryFacts(query, 100);
  if (!facts.length) return '';

  return [
    'PERSISTENTES LANGZEITGEDÄCHTNIS DES NUTZERS (nur explizit gespeicherte Keys):',
    ...facts.map((fact) => `- ${fact.key}: ${typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value)}`),
    '',
    'MEMORY-REGELN:',
    'Diese Informationen stammen aus dem persönlichen Gedächtnis des Nutzers.',
    'Nutze sie, wenn sie zur aktuellen Frage passen.',
    'Wenn Gedächtnis und aktuelle Aussage widersprechen, hat die aktuelle Aussage Vorrang.',
    'Erfinde keine persönlichen Fakten.',
  ].join('\n');
}

/**
 * Erkennt frei definierbare Memory-Keys ohne fest verdrahtete Objektliste.
 * Beispiele:
 *   ratte_name = Luba
 *   ratte_name: Luba
 *   Mein Hund heißt Balu
 *   Meine Ratte heißt Luba
 *   Der Name meiner Ratte ist Luba
 *   Speichere ratte_name = Luba
 */
export function extractExplicitMemoryFacts(text: string): Array<{ key: string; value: string }> {
  const input = text.trim();
  if (!input || input.length > 1000) return [];
  const found: Array<{ key: string; value: string }> = [];

  const cleanKey = (raw: string) => raw
    .trim()
    .toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);

  const cleanValue = (raw: string) => raw.trim().replace(/[.!?]+$/, '').trim().slice(0, 500);
  const add = (key: string, value: string) => {
    const k = cleanKey(key);
    const v = cleanValue(value);
    if (k && v && k.length >= 2) found.push({ key: k, value: v });
  };

  // Explizite technische Schreibweise: key = value / key: value
  const assignments = input.matchAll(/(?:^|[\n;,])\s*(?:speichere|merke(?: dir)?|memory)?\s*([a-zA-Z0-9äöüÄÖÜß][\wäöüÄÖÜß -]{1,80})\s*[:=]\s*([^\n;,]{1,500})/giu);
  for (const m of assignments) add(m[1], m[2]);

  // Natürliche Sprache: "Mein(e) X heißt Y" / "Der Name meiner X ist Y"
  const namePatterns = [
    /\bmein(?:e|en)?\s+(.{2,80}?)\s+(?:heißt|heisst|hat den namen|name ist)\s+([^.!?\n]{1,300})/iu,
    /\bder name meines\s+(.{2,80}?)\s+ist\s+([^.!?\n]{1,300})/iu,
    /\bder name meiner\s+(.{2,80}?)\s+ist\s+([^.!?\n]{1,300})/iu,
    /\bich habe (?:einen|eine)\s+(.{2,80}?)\s+(?:namens|mit dem namen)\s+([^.!?\n]{1,300})/iu,
  ];
  for (const pattern of namePatterns) {
    const m = input.match(pattern);
    if (m) {
      const subject = cleanKey(m[1]).replace(/^mein_/, '').replace(/^meine_/, '');
      add(`${subject}_name`, m[2]);
      break;
    }
  }

  // Allgemeine persönliche Zuordnung: "Mein X ist Y" / "Meine X ist Y"
  const generic = input.match(/^\s*mein(?:e|en)?\s+([a-zA-Z0-9äöüÄÖÜß][\wäöüÄÖÜß -]{1,80}?)\s+ist\s+([^.!?\n]{1,300})[.!?]?\s*$/iu);
  if (generic) add(cleanKey(generic[1]), generic[2]);

  return found.filter((fact, index, arr) => arr.findIndex((x) => x.key === fact.key) === index);
}
