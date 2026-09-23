# PRIS Remote Agent

Der Remote Agent läuft lokal auf dem Mac und verbindet PRIS mit externen Nachrichtenkanälen.

## Telegram zuerst

1. Über `@BotFather` einen privaten Telegram-Bot erstellen.
2. `.env` aus `.env.example` anlegen und `TELEGRAM_BOT_TOKEN` eintragen.
3. `TELEGRAM_ALLOWED_USER_IDS` mit deiner Telegram User-ID setzen.
4. `npm run dev` startet den Agenten automatisch, sobald `TELEGRAM_BOT_TOKEN` gesetzt ist.

Der Agent lauscht nur auf `127.0.0.1:8790`; Telegram spricht ausschließlich mit der Telegram API.

## Discord

Discord ist bidirektional vorbereitet: mit `DISCORD_BOT_TOKEN` empfängt der Agent DMs und Server-Nachrichten und kann in den jeweiligen Kanal antworten. `DISCORD_ALLOWED_USER_IDS` kann den Zugriff auf bestimmte Nutzer beschränken. Der Webhook bleibt optional für reine Benachrichtigungen.

Die Architektur hat bereits einen getrennten Discord-Kanal vor. `DISCORD_WEBHOOK_URL` ermöglicht zunächst Antworten/Benachrichtigungen. Der vollständige Discord-Bot-Adapter für Gruppen, Rollen und Kanäle bleibt bewusst getrennt und kann danach ergänzt werden.

## Sicherheitsmodell

Remote-Nachrichten werden als normale PRIS-Anweisungen behandelt. Terminal-Befehle werden nicht automatisch aus einer Remote-Nachricht ausgeführt; die bestehende PRIS-Bestätigung bleibt maßgeblich.

## Tokens direkt in PRIS hinterlegen

PRIS kann Telegram- und Discord-Bot-Tokens direkt über **SYSTEM STATUS → Messaging · Telegram / Discord** konfigurieren.
Die Werte werden im Browser lokal gespeichert und beim Speichern nur an den lokalen Remote-Agent (`127.0.0.1:8790`) übertragen. Der Agent hält die aktiven Tokens im Prozessspeicher und nutzt sie für Polling/Gateway-Verbindung und Antworten.

- Telegram: Bot Token + optional erlaubte User-IDs
- Discord: Bot Token + optional erlaubte User-IDs + optional Standard-Channel-ID
- Beide Kanäle besitzen einen eigenen Verbindungstest.
