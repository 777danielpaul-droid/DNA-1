import React, { useEffect, useState } from 'react';
import { DATA_STREAM_QUESTIONS } from '../lib/dataStreamQuestions';
import '../styles/InjectSoulCard.css';
import PanelCircuitGlow from './PanelCircuitGlow';
import {
  DEFAULT_PERSONA_NAME,
  DEFAULT_PERSONA_TEXT,
  getPersona,
  resetPersona,
  setPersona,
} from '../lib/persona';

interface InjectSoulCardProps {
  open: boolean;
  onClose: () => void;
}

export default function InjectSoulCard({ open, onClose }: InjectSoulCardProps) {
  const [name, setName] = useState(DEFAULT_PERSONA_NAME);
  const [text, setText] = useState(DEFAULT_PERSONA_TEXT);
  const [saved, setSaved] = useState(false);
  const [questions, setQuestions] = useState<{ id: string; text: string }[]>([]);
  const [questionInput, setQuestionInput] = useState('');

  // Aktuelle Persona laden, sobald die Karte geöffnet wird
  useEffect(() => {
    if (!open) return;
    const current = getPersona();
    setName(current.name);
    setText(current.text);
    setSaved(false);
    const raw = localStorage.getItem('dna-legal-data-stream-questions');
    try {
      const custom = raw ? JSON.parse(raw) : [];
      const normalized = Array.isArray(custom) ? custom.map((q) => ({ id: String(q.id), text: String(q.text || q.label || '') })).filter((q) => q.text) : [];
      const defaults = DATA_STREAM_QUESTIONS.map((q) => ({ id: q.id, text: q.text || q.label }));
      const ids = new Set(normalized.map((q) => q.id));
      setQuestions([...defaults.filter((q) => !ids.has(q.id)), ...normalized]);
    } catch {
      setQuestions(DATA_STREAM_QUESTIONS.map((q) => ({ id: q.id, text: q.text || q.label })));
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = () => {
    setPersona(name, text);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  };

  const handleReset = () => {
    const defaults = resetPersona();
    setName(defaults.name);
    setText(defaults.text);
  };

  return (
    <div className="model-window-overlay soul-overlay" onClick={onClose}>
      <div className="model-window-panel soul-card" onClick={(e) => e.stopPropagation()}>
        <PanelCircuitGlow />
        <div className="model-window-header soul-menu-header">
          <span className="model-window-title">INJECT SOUL</span>
          <button type="button" className="model-window-close soul-close" onClick={onClose} aria-label="Schließen">×</button>
        </div>

        <div className="model-window-body soul-menu-body">
        <p className="soul-subtitle">
          Persona-Kern von {name || DEFAULT_PERSONA_NAME} — Name und Charakter wirken überall,
          wo sie auftritt.
        </p>

        <label className="soul-label" htmlFor="soul-name">
          Name
        </label>
        <input
          id="soul-name"
          className="soul-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={DEFAULT_PERSONA_NAME}
          maxLength={40}
        />

        <label className="soul-label" htmlFor="soul-text">
          Seele / Persona
        </label>
        <textarea
          id="soul-text"
          className="soul-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={DEFAULT_PERSONA_TEXT}
          rows={8}
        />

        <div className="soul-actions">
          <button type="button" className="soul-btn soul-btn-reset" onClick={handleReset}>
            Zurücksetzen
          </button>
          <button type="button" className="soul-btn soul-btn-save" onClick={handleSave}>
            {saved ? 'Injiziert ✓' : 'Injizieren'}
          </button>
        </div>

        <section className="soul-questions">
          <div className="soul-section-title">FRAGEN</div>
          <div className="soul-question-input-row">
            <input
              className="soul-input"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const text = questionInput.trim();
                  if (!text) return;
                  const updated = [...questions, { id: `custom-${Date.now()}`, text }];
                  setQuestions(updated);
                  localStorage.setItem('dna-legal-data-stream-questions', JSON.stringify(updated));
                  setQuestionInput('');
                }
              }}
              placeholder="Frage hinzufügen …"
            />
            <button type="button" className="soul-btn soul-btn-save soul-question-add" onClick={() => {
              const text = questionInput.trim();
              if (!text) return;
              const updated = [...questions, { id: `custom-${Date.now()}`, text }];
              setQuestions(updated);
              localStorage.setItem('dna-legal-data-stream-questions', JSON.stringify(updated));
              setQuestionInput('');
            }}>Hinzufügen</button>
          </div>
          <div className="soul-question-list">
            {questions.map((q) => (
              <div key={q.id} className="soul-question-item">
                <span>{q.text}</span>
                <div className="soul-question-actions">
                  <button type="button" className="soul-question-ask" onClick={() => window.dispatchEvent(new CustomEvent('ds-question-submit', { detail: q.text }))}>Stellen</button>
                  {!DATA_STREAM_QUESTIONS.some((d) => d.id === q.id) && (
                    <button type="button" className="soul-question-remove" onClick={() => {
                      const updated = questions.filter((item) => item.id !== q.id);
                      setQuestions(updated);
                      localStorage.setItem('dna-legal-data-stream-questions', JSON.stringify(updated));
                    }}>×</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <p className="soul-hint">
          Wird nur lokal im Browser gespeichert (localStorage) und in den System-Prompt des
          Chats eingespeist.
        </p>
        </div>
      </div>
    </div>
  );
}
