import React, { useState } from 'react';
import { sendRemoteInput } from '../lib/remoteInput';
import { useSpeechToText } from '../hooks/useSpeechToText';
import '../styles/RemoteInputPage.css';

interface RemoteInputPageProps {
  roomCode: string;
}

/**
 * Wird gerendert, wenn die App mit ?remote=<code> geöffnet wird (siehe
 * App.tsx) — bewusst eine eigene, sehr leichte Seite ohne die 3D-DNA-Szene
 * & Co., damit sie auf dem Handy schnell lädt und einfach zu bedienen ist.
 */
export default function RemoteInputPage({ roomCode }: RemoteInputPageProps) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const speech = useSpeechToText((spoken) => {
    setText((prev) => (prev ? `${prev} ${spoken}` : spoken));
  });

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setStatus('sending');
    const ok = await sendRemoteInput(roomCode, trimmed);
    if (ok) {
      setText('');
      setStatus('sent');
      setTimeout(() => setStatus('idle'), 1500);
    } else {
      setStatus('error');
    }
  };

  return (
    <div className="remote-input-page">
      <div className="remote-input-header">
        <span className="remote-input-title">🎙️ JARVIS-Fernbedienung</span>
        <span className="remote-input-room">Raum {roomCode}</span>
      </div>

      <textarea
        className="remote-input-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Eingabe tippen oder Mikrofon nutzen…"
        autoFocus
      />

      <div className="remote-input-actions">
        {speech.supported && (
          <button
            type="button"
            className={`remote-input-mic ${speech.listening ? 'listening' : ''}`}
            onClick={speech.toggle}
            aria-label={speech.listening ? 'Aufnahme stoppen' : 'Spracheingabe starten'}
          >
            {speech.listening ? '⏺' : '🎤'}
          </button>
        )}
        <button
          type="button"
          className="remote-input-send"
          onClick={() => { void handleSend(); }}
          disabled={!text.trim() || status === 'sending'}
        >
          {status === 'sending' ? 'Sende…' : status === 'sent' ? '✓ Gesendet' : 'An App senden'}
        </button>
      </div>

      {status === 'error' && (
        <p className="remote-input-error">
          Senden fehlgeschlagen — ist die App auf dem anderen Gerät noch geöffnet?
        </p>
      )}

      <p className="remote-input-hint">
        Verbunden mit Raum <strong>{roomCode}</strong>. Die Eingabe erscheint direkt im Chat auf
        dem gekoppelten Gerät.
      </p>
    </div>
  );
}
