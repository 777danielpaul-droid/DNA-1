# PR1S 4.4 – Memory Fix

Diese Version behebt einen wichtigen Fehler der bisherigen Memory-Implementierung:
Das System konnte zwar `ai_memory` speichern, hat aber bei natürlichen Fragen teilweise nur die exakte Key/Wert-Übereinstimmung berücksichtigt und alte Chatstellen nicht zuverlässig als Gedächtnis verwendet.

## Jetzt

- `ai_memory` wird vor jedem Provider-Aufruf geladen.
- Bis zu 50 gespeicherte Fakten werden vollständig als Memory-Kontext berücksichtigt.
- Zusätzlich werden relevante Stellen aus `chat_history` geladen.
- `Wie heißt mein Hund?` findet nun auch `hund_name` / `haustier_name`.
- Aussagen wie `Mein Hund heißt Balu`, `Der Name meines Hundes ist Balu` und `Ich habe einen Hund namens Balu` werden als `hund_name = Balu` gespeichert.
- Supabase-Fehler werden mit `[PRIS Memory]` in der Browser-Konsole protokolliert.
- Die Supabase-Policies sind jetzt idempotent und können über die SQL-Datei erneut angelegt werden.

## Test

1. Einmal `supabase-schema.sql` im Supabase SQL Editor ausführen.
2. In PR1S mit Google/Supabase anmelden.
3. Schreiben: `Mein Hund heißt Balu`.
4. Unter Konto & Gedächtnis muss `hund_name = Balu` erscheinen.
5. Seite neu laden oder neuen Chat öffnen.
6. Fragen: `Wie heißt mein Hund?`

Die Antwort sollte `Balu` enthalten.
