// Minimaler Ausschnitt der chrome.runtime-API, wie ihn Chrome für Web-Seiten
// bereitstellt, die in `externally_connectable` einer Extension gelistet
// sind. Kein vollständiges @types/chrome nötig, nur was useExtensionBridge.ts
// tatsächlich verwendet.
interface ChromeRuntime {
  sendMessage(
    extensionId: string,
    message: unknown,
    responseCallback?: (response: any) => void
  ): void;
  lastError?: { message: string };
}

interface Chrome {
  runtime?: ChromeRuntime;
}

declare const chrome: Chrome;
