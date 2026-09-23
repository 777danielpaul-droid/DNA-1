# PR1S – Supabase Memory

## Was jetzt funktioniert

Das Chatfenster nutzt Supabase jetzt nicht nur zum Speichern, sondern auch beim KI-Aufruf:

1. Benutzer meldet sich über Supabase Auth an.
2. PR1S lädt die persönlichen `ai_memory`-Fakten.
3. Vor jeder KI-Anfrage werden relevante Fakten lokal ausgewählt und als `PERSISTENTES GEDÄCHTNIS DES NUTZERS` in den Systemkontext eingefügt.
4. Der normale `chat_history` bleibt zusätzlich als Gesprächsverlauf erhalten.
5. Klare persönliche Aussagen wie `Ich heiße Max`, `Ich wohne in Hamburg`, `Ich bevorzuge Deutsch` oder `Mein Projekt ist PR1S` werden ohne zusätzlichen KI-Aufruf als Langzeitfakten gespeichert.

## Supabase einmalig prüfen

Im Supabase SQL Editor muss `supabase-schema.sql` ausgeführt worden sein. Danach sollten diese Tabellen existieren:

- `public.chat_history`
- `public.ai_memory`

Für beide Tabellen muss Row Level Security aktiv sein. Die Policies verwenden `auth.uid() = user_id`, sodass ein Nutzer nur sein eigenes Gedächtnis lesen und ändern kann.

## Schnelltest

1. In PR1S bei **Konto & Gedächtnis (Supabase)** mit Google anmelden.
2. Im Chat schreiben:

   `Ich heiße Max`

3. Im Konto-Bereich sollte danach `name: Max` auftauchen.
4. Neues Chatfenster / Seite neu laden.
5. Fragen:

   `Wie heiße ich?`

Die KI bekommt den gespeicherten Fakt jetzt vor dem eigentlichen Provider-Aufruf in ihren Kontext.

## Wichtig

Der Memory-Kontext wird nur für authentifizierte Nutzer aus Supabase geladen. Ohne Login bleibt das Verhalten wie vorher.

Die AI-Anbieter müssen selbst nichts über Supabase können: Gemini, OpenAI, OpenRouter, Groq, Ollama usw. erhalten den Memory-Kontext ganz normal als Teil ihres System-Prompts.


## Wichtig bei Version 4.4

Das Gedächtnis besteht jetzt aus zwei Retrieval-Quellen:

- `ai_memory`: dauerhaft gespeicherte Fakten
- `chat_history`: relevante Stellen aus alten Chats

Beispiel: `Mein Hund heißt Balu` wird als `hund_name = Balu` gespeichert.
Die spätere Frage `Wie heißt mein Hund?` kann dadurch direkt mit `Balu` beantwortet werden.

Wenn im Supabase-Dashboard schon Tabellen/Policies angelegt waren, die SQL-Datei trotzdem einmal erneut im SQL Editor ausführen. Die Policies werden vorher mit `drop policy if exists` sicher entfernt und anschließend neu angelegt.

### Wenn es weiterhin nicht antwortet

Öffne im Browser die Entwicklerkonsole (F12 → Console) und achte auf Meldungen mit `[PRIS Memory]`. Typische Ursache ist dann eine fehlende Tabelle, eine RLS-Policy oder dass kein Supabase-Login aktiv ist.


## PRIS 4.5 – Memory-only mode

Supabase speichert ab dieser Version ausschließlich `ai_memory`. Die frühere `chat_history`-Tabelle wird durch `supabase-schema.sql` entfernt.

Im Chatheader gibt es `🧠 MEM AN/AUS`.
- **AN:** explizit erkannte Keys werden in `ai_memory` gespeichert und vorhandene Keys als Kontext an die KI übergeben.
- **AUS:** kein neues Memory wird gespeichert und kein Supabase-Memory wird an die KI übergeben.

Unterstützt werden frei definierbare Keys, z. B. `ratte_name = Luba`, sowie natürliche Formulierungen wie `Meine Ratte heißt Luba`.
