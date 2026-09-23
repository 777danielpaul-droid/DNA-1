# Pris Bridge (Chrome Extension)

Verknüpft den Pris-Chat auf der dna-legal-Seite mit anderen offenen KI-Chat-Tabs
(claude.ai, chatgpt.com), damit Pris Befehle dorthin weiterreichen und die
Antwort zurücklesen kann.

## Installation (unpacked / Entwicklermodus)

1. `chrome://extensions` öffnen.
2. Oben rechts **Entwicklermodus** aktivieren.
3. **Entpackte Erweiterung laden** → diesen `extension/`-Ordner auswählen.
4. Chrome zeigt beim Laden eine Berechtigungsübersicht: *"Kann deine Daten
   auf claude.ai und chatgpt.com lesen und ändern"*. Das ist beabsichtigt —
   die Extension braucht das, um dort automatisch Prompts einzutragen.
5. Das Icon der Extension in der Toolbar anpinnen (praktisch, nicht zwingend).

## Domain anpassen

In `manifest.json` steht unter `externally_connectable.matches`, von welchen
Web-Origins aus die Extension überhaupt Nachrichten annimmt. Standardmäßig ist
das `http://localhost:5173` (Vite-Dev-Server) sowie ein Platzhalter
`https://dna-legal.example`. **Bitte den Platzhalter durch eure echte
Produktions-Domain ersetzen**, sonst funktioniert die Bridge nach dem Deploy
nicht.

## Nutzung

Seit v2 läuft die Bridge automatisch — kein Klick auf ein Icon mehr nötig:

1. Öffnet einen Tab mit claude.ai oder chatgpt.com und meldet euch dort
   normal an. Sobald die Seite fertig geladen ist, zeigt das Extension-Icon
   ein grünes "ON"-Badge — der Tab ist automatisch als Bridge-Ziel verfügbar.
2. Wechselt zur dna-legal-Seite, öffnet Pris und wählt oben im Panel als
   Antwortquelle **BRIDGE** statt **GEMINI**.
3. Im Dropdown erscheinen alle passenden offenen Tabs — den gewünschten
   auswählen.
4. Eure Nachrichten werden jetzt in das Eingabefeld des gewählten Tabs
   geschrieben, abgesendet, und die Antwort erscheint im Pris-Fenster.

Da die Berechtigung jetzt dauerhaft ist, bleibt ein Tab so lange als Ziel
verfügbar, wie er geöffnet ist — auch nach Reload/Navigation innerhalb der
Seite.

## Grenzen & Hinweise

- Die Extension hat dauerhaften Lese-/Schreibzugriff auf alle claude.ai- und
  chatgpt.com-Tabs (nicht mehr auf einzelne, bewusst freigegebene Tabs
  beschränkt wie in v1). Das ist der bewusste Trade-off für einen
  reibungslosen Workflow.
- claude.ai und chatgpt.com sind React-Anwendungen ohne offizielle
  Automatisierungs-Schnittstelle; die Selektoren in `content.js` sind
  bewusst allgemein gehalten, können aber brechen, wenn sich das jeweilige
  UI ändert. Prüft in diesem Fall zuerst `findComposer()` /
  `findSendButton()` / `lastAssistantMessageEl()`.
- Automatisiertes Ausfüllen und Absenden über die Web-UI kann je nach
  Nutzungsbedingungen des jeweiligen Anbieters eingeschränkt sein — bitte
  vorher die AGB/ToS von claude.ai bzw. chatgpt.com prüfen, bevor ihr das
  produktiv einsetzt.
- Wollt ihr die Extension je über den Chrome Web Store veröffentlichen,
  verlangt Google für so breite `host_permissions` eine Begründung im
  Review. Für den Eigengebrauch (unpacked) ist das irrelevant.

## Unterstützte Browser-KIs (v2.1)
ChatGPT, Claude, Kimi, Gemini, Grok, Perplexity, DeepSeek, Mistral Le Chat und Qwen.
PRIS sendet parallel an offene Tabs. Der Rückkanal für PRIS bleibt in diesem Test ausschließlich ChatGPT.
