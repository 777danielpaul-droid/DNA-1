import { useCallback, useEffect, useRef, useState } from 'react';

// Die Web Speech API liegt in TS-DOM-Typen nicht vollständig vor —
// minimale eigene Typisierung für das, was wir tatsächlich nutzen.
interface SpeechRecognitionResultLike {
  [index: number]: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: { [index: number]: SpeechRecognitionResultLike; length: number };
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/**
 * Diktier-Funktion für das Chat-Eingabefeld, per Browser-eigener
 * Web-Speech-API (kein externer Dienst, keine Server-Rundreise nötig).
 * Nur in Chromium-basierten Browsern verfügbar — `supported` zeigt das an,
 * der Mikrofon-Button wird sonst einfach ausgeblendet.
 */
export function useSpeechToText(onResult: (text: string) => void, lang = 'de-DE') {
  const [supported] = useState(() => !!getSpeechRecognitionCtor());
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Unterscheidet "Nutzer hat selbst gestoppt" von "Browser hat die Session
  // beendet" (z. B. eigener Timeout nach einer Weile Stille) — nur im
  // zweiten Fall wird automatisch neu gestartet, siehe onend unten.
  const manualStopRef = useRef(false);

  useEffect(() => {
    return () => {
      manualStopRef.current = true;
      recognitionRef.current?.stop();
    };
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    manualStopRef.current = false;
    const recognition = new Ctor();
    recognition.lang = lang;
    // continuous=true: die Aufnahme läuft weiter, auch wenn man kurz
    // innehält, statt (wie vorher mit continuous=false) schon nach der
    // ersten kleinen Sprechpause automatisch zu stoppen — sonst kam man
    // nie über einen halben Satz hinaus.
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      // Bei continuous=true können mehrere fertige Ergebnisse seit dem
      // letzten Event dazugekommen sein — alle ab resultIndex einsammeln,
      // nicht nur das letzte, sonst gehen dazwischen gesprochene Wörter verloren.
      let transcript = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result?.isFinal && result[0]?.transcript) {
          transcript += (transcript ? ' ' : '') + result[0].transcript;
        }
      }
      if (transcript) onResult(transcript);
    };
    recognition.onerror = (e) => {
      // 'no-speech' ist nur eine kurze Stille-Meldung, kein echter Fehler —
      // die Session danach trotzdem laufen zu lassen übernimmt onend unten
      // (auto-restart), hier nur bei echten Fehlern (z. B. Mikrofon-Zugriff
      // verweigert) tatsächlich abbrechen.
      const error = (e as unknown as { error?: string })?.error;
      if (error === 'not-allowed' || error === 'audio-capture' || error === 'service-not-allowed') {
        manualStopRef.current = true;
        setListening(false);
      }
    };
    recognition.onend = () => {
      // Manche Browser beenden eine Session nach einer Weile von sich aus,
      // obwohl continuous=true gesetzt ist. Solange der Nutzer nicht selbst
      // gestoppt hat, nahtlos neu starten, statt die Aufnahme einfach
      // sterben zu lassen.
      if (!manualStopRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          // z. B. wenn das Tab inzwischen den Fokus verloren hat — dann
          // wirklich beenden.
        }
      }
      setListening(false);
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [lang, onResult]);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported, listening, start, stop, toggle };
}
