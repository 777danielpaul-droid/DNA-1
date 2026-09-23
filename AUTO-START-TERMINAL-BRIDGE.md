# Auto-Start der Terminal-Bridge

PRIS startet die lokale Terminal-Bridge jetzt automatisch zusammen mit dem Vite-Dev-Server.

## Normaler Start

```bash
npm run dev
```

Das startet:

1. Terminal-Bridge auf `http://127.0.0.1:8787`
2. PRIS auf `http://localhost:3000`

Wenn die Bridge bereits läuft, wird kein zweiter Prozess gestartet.

## Ohne VS Code

### Windows

`START-PRIS-WINDOWS.bat` doppelklicken.

### macOS

`START-PRIS-MAC.command` doppelklicken.

## Wichtig

Ein Browser darf aus Sicherheitsgründen nicht selbstständig einen beliebigen Node-Prozess auf dem Rechner starten. Deshalb wird die Bridge von einem lokalen Startprozess gemeinsam mit PRIS gestartet.
