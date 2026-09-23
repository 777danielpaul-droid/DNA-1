// src/lib/dataStreamQuestions.ts
// Vordefinierte Fragen für DATA STREAMS.

export interface DataStreamQuestion {
  id: string;
  label: string;            // Anzeigename im Dropdown / Schnellzugriff
  prompt: string;           // Vollständiger System-Prompt, der an die LLM-Instanz gesendet wird
  icon: string;             // Emoji / Symbol für die Schnellzugriff-Leiste
  category: 'wisdom' | 'truth' | 'future' | 'self';  // Farbe / Stichgruppe
  /** Kurztext für Anzeige in Chips/Button — falls abweichend von label */
  text?: string;
}

const BUSINESS_FRAME =
  'Du bist eine strategische, pragmatische Sparringspartnerin. ' +
  'Antworte klar, konkret und kurz mit dem wichtigsten nächsten Gedanken.';

export const DATA_STREAM_QUESTIONS: DataStreamQuestion[] = [
  {
    id: 'benefit', label: 'Wie kann ich davon profitieren?', text: 'Wie kann ich davon profitieren?',
    prompt: `${BUSINESS_FRAME}\n\nWie kann ich davon profitieren?`, icon: '↗', category: 'future',
  },
  {
    id: 'scalability', label: 'Ist das skalierbar?', text: 'Ist das skalierbar?',
    prompt: `${BUSINESS_FRAME}\n\nIst das skalierbar?`, icon: '⤢', category: 'future',
  },
  {
    id: 'architecture', label: 'Welche Architektur brauchen wir?', text: 'Welche Architektur brauchen wir für so ein Projekt?',
    prompt: `${BUSINESS_FRAME}\n\nWelche Architektur brauchen wir für so ein Projekt?`, icon: '⌘', category: 'wisdom',
  },
];

// Schnellzugriff — die 3 wichtigsten Icons immer sichtbar
export const QUICK_QUESTIONS = DATA_STREAM_QUESTIONS;
