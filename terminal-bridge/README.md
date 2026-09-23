# Terminal-Bridge

Die Terminal-Bridge erlaubt der PRIS-Weboberfläche, Shell-Befehle nach deiner Bestätigung lokal auf deinem Rechner auszuführen.

## Automatischer Start

Du musst die Bridge **nicht mehr separat** mit `node terminal-bridge/server.cjs` starten.

Einfach den PRIS-Dev-Server starten:

```bash
npm run dev
```

Das neue Dev-Script prüft zuerst, ob `127.0.0.1:8787` bereits läuft. Falls nicht, startet es die Terminal-Bridge automatisch und danach Vite.

Für einen Start ohne VS Code gibt es außerdem:

- **Windows:** `START-PRIS-WINDOWS.bat` doppelklicken
- **macOS:** `START-PRIS-MAC.command` doppelklicken

PRIS läuft standardmäßig auf `http://localhost:3000`, passend zur üblichen lokalen Supabase-Redirect-Konfiguration. Einen anderen Port kannst du mit `PRIS_PORT=3001 npm run dev` setzen.

## Bridge

Die Bridge läuft auf `http://127.0.0.1:8787` und ist nur lokal erreichbar.

- Befehle werden weiterhin erst nach deiner Bestätigung ausgeführt.
- Die Bridge benötigt keine separate Terminal-Eingabe mehr.
- Timeout: 30 Sekunden pro Befehl.
- Output: maximal 2 MB.
- Befehle laufen mit den Rechten deines lokalen Benutzerkontos.

## Sicherheit

Die Bridge ist bewusst nur an `127.0.0.1` gebunden. Trotzdem sollte die Terminal-Funktion nur aktiviert sein, wenn du sie benötigst, da bestätigte Befehle mit deinen lokalen Benutzerrechten ausgeführt werden.
