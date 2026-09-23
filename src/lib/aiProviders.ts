// src/lib/aiProviders.ts
// Kleine Abstraktionsschicht, damit Pris mit einem beliebigen eigenen
// API-Key (OpenRouter, Gemini, OpenAI, Ollama) direkt aus dem Browser
// reden kann. Alle Keys werden per UI eingegeben und im localStorage gespeichert.

export type ProviderId = 'anthropic' | 'gemini' | 'openai' | 'ollama' | 'openrouter' | 'openrouter-free' | 'groq' | 'huggingface' | 'deepseek';

export type OllamaMode = 'local' | 'cloud';
const OLLAMA_MODE_STORAGE_KEY = 'pris-ollama-mode';
const OLLAMA_CLOUD_API_KEY_STORAGE_KEY = 'dna-legal-ai-key-ollama-cloud';
const OLLAMA_CLOUD_BASE_URL = 'https://ollama.com';
const OLLAMA_BRIDGE_URL = 'http://127.0.0.1:8787/ollama';
export function getOllamaMode(): OllamaMode { return localStorage.getItem(OLLAMA_MODE_STORAGE_KEY) === 'cloud' ? 'cloud' : 'local'; }
export function setOllamaMode(mode: OllamaMode): void { localStorage.setItem(OLLAMA_MODE_STORAGE_KEY, mode); }
export function getOllamaCloudApiKey(): string { return localStorage.getItem(OLLAMA_CLOUD_API_KEY_STORAGE_KEY) || ''; }
export function setOllamaCloudApiKey(key: string): void { localStorage.setItem(OLLAMA_CLOUD_API_KEY_STORAGE_KEY, key); }
// EMERGENCY-Fallback nur, falls sowohl der Live-Katalog (ollama.com/v1/models)
// als auch /api/tags nicht erreichbar sind. Wird NICHT mehr als primäre
// Quelle genutzt — genau so eine Liste ist uns schon einmal veraltet: das
// zuvor enthaltene "deepseek-v3.1:671b-cloud" wurde am 15.07.2026 von Ollama
// retired und dann fälschlich weiter angeboten. Modellnamen ändern sich zu
// häufig, um sie zuverlässig zu pflegen — deshalb jetzt der Live-Katalog als
// Hauptquelle (siehe fetchAvailableModels weiter unten).
export const OLLAMA_CLOUD_MODELS: string[] = [
  'gpt-oss:20b-cloud',
  'gpt-oss:120b-cloud',
  'qwen3-coder:480b-cloud',
  'glm-4.6:cloud',
  'minimax-m2:cloud',
];
// Ollama veröffentlicht (Stand jetzt) keine offizielle, stabile Tabelle
// "dieses Modell ist dauerhaft gratis" — nur grobe Nutzungsstufen pro Plan
// (Free/Pro/Max) und modellabhängige "Usage"-Einstufungen (low/medium/high).
// Diese Liste enthält die Modelle, die aktuell nachweislich mit $0 pro
// Token-Nutzung laufen bzw. offiziell als für den Free-Plan geeignet
// beworben werden — im Gegensatz zu OpenRouters ":free"-Suffix ist das kein
// Namenskonvention-Flag der API, sondern eine gepflegte Liste, die bei
// Preisänderungen von Ollama aktualisiert werden muss.
// Free-Status wird gegen kanonische Modellnamen abgeglichen.
// Ollama kann im Cloud-Katalog (z. B. /v1/models) `gpt-oss:20b`
// liefern, während lokale/CLI-Darstellungen auch `gpt-oss:20b-cloud`
// verwenden. Beide Formen müssen als dasselbe Cloud-Modell erkannt werden.
export const OLLAMA_CLOUD_FREE_MODELS: string[] = ['gpt-oss:20b', 'gpt-oss:120b'];

function normalizeOllamaCloudModelName(model: string): string {
  return model
    .trim()
    .toLowerCase()
    .replace(/:cloud$/i, '')
    .replace(/-cloud$/i, '');
}

export interface ChatMsg {
  role: 'user' | 'model';
  text: string;
  images?: string[];
}

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  defaultModel: string;
  /** Ob überhaupt ein Credential/URL-Feld nötig ist (bei Ollama optional, da Default vorbelegt). */
  credentialLabel: string;
  credentialPlaceholder: string;
  credentialDefault: string;
  keyHint: string;
  keyStorageKey: string;
  modelStorageKey: string;
  /** Optionale Liste von vordefinierten Modellen (für Dropdown). */
  modelList?: string[];
  credentialLabelModel?: string;
  /** Wenn true: funktioniert auch ohne Key (Key ist optional/bestärkend). */
  allowNoCredential?: boolean;
}

/**
 * Liefert nur dann eine Gratis-Markierung, wenn die Nutzung ohne API-Credits
 * vorgesehen ist. Zeitlich begrenzte Test- oder Free-Tier-Kontingente werden
 * bewusst nicht als "gratis" ausgegeben, damit die Auswahl nicht irreführt.
 */
export function getModelAccessLabel(provider: ProviderId, model: string): string | null {
  if (provider === 'ollama') {
    if (getOllamaMode() === 'cloud') {
      return OLLAMA_CLOUD_FREE_MODELS.includes(normalizeOllamaCloudModelName(model)) ? 'CLOUD · GRATIS' : 'CLOUD API';
    }
    return 'LOKAL · GRATIS';
  }
  if (provider === 'openrouter-free' || model.endsWith(':free') || model === 'openrouter/free') {
    return 'GRATIS';
  }
  return null;
}

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  anthropic: {
    id: 'anthropic',
    label: 'ANTHROPIC',
    defaultModel: 'claude-sonnet-4-5',
    credentialLabel: 'API-Key',
    credentialPlaceholder: 'sk-ant-...',
    credentialDefault: '',
    keyHint:
      'Erstellen unter console.anthropic.com/settings/keys. Erfordert Guthaben. ' +
      'Ruft die API direkt aus dem Browser auf (anthropic-dangerous-direct-browser-access) — ' +
      'der Key liegt daher offen im Browser, nur für eigene/vertrauenswürdige Nutzung gedacht.',
    keyStorageKey: 'dna-legal-ai-key-anthropic',
    modelStorageKey: 'dna-legal-ai-model-anthropic',
    // Offline-Fallback — die Live-Liste kommt von GET /v1/models.
    modelList: [
      'claude-sonnet-4-5',
      'claude-opus-4-1',
      'claude-haiku-4-5',
    ],
  },
  gemini: {
    id: 'gemini',
    label: 'GEMINI',
    defaultModel: 'gemini-3.5-flash',
    credentialLabel: 'API-Key',
    credentialPlaceholder: 'AIza...',
    credentialDefault: '',
    keyHint:
      'Kostenlos unter aistudio.google.com/apikey erstellen. Kostenloses Kontingent ohne Zahlungsmittel verfügbar.',
    keyStorageKey: 'dna-legal-ai-key-gemini',
    modelStorageKey: 'dna-legal-ai-model-gemini',
    // Nur ein Offline-Fallback, falls die Live-Abfrage (fetchAvailableModels)
    // fehlschlägt (z. B. kein Key eingegeben). Die eigentliche Liste kommt
    // dynamisch von der API, da Google-Modellnamen sich häufig ändern.
    modelList: [
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-3-flash-preview',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
    ],
  },
  openai: {
    id: 'openai',
    label: 'OPENAI',
    defaultModel: 'gpt-4o-mini',
    credentialLabel: 'API-Key',
    credentialPlaceholder: 'sk-...',
    credentialDefault: '',
    keyHint: 'Erstellen unter platform.openai.com/api-keys. Erfordert Guthaben mit Karte.',
    keyStorageKey: 'dna-legal-ai-key-openai',
    modelStorageKey: 'dna-legal-ai-model-openai',
    // Offline-Fallback — die Live-Liste kommt von /v1/models.
    modelList: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-3.5-turbo',
    ],
  },
  ollama: {
    id: 'ollama', label: 'OLLAMA', defaultModel: 'llama3.1',
    credentialLabel: 'Server-URL / API-Key', credentialPlaceholder: 'http://localhost:11434', credentialDefault: 'http://localhost:11434',
    keyHint: 'LOKAL: eigener Ollama-Server ohne Key. CLOUD: Ollama API-Key von ollama.com; Cloud nutzt https://ollama.com/api.',
    keyStorageKey: 'dna-legal-ai-key-ollama', modelStorageKey: 'dna-legal-ai-model-ollama', modelList: [],
  },
  openrouter: {
    id: 'openrouter',
    label: 'OPENROUTER',
    defaultModel: 'meta-llama/llama-3.2-3b-instruct:free',
    credentialLabel: 'API-Key',
    credentialPlaceholder: 'sk-or-v1-...',
    credentialDefault: '',
    keyHint:
      'OpenRouter Key (sk-or-v1-...). Kostenlos unter https://openrouter.ai/keys erstellbar. ' +
      'OpenRouter hat eine breitere Modellauswahl und keine Kreditkarte nötig. ' +
      '🔑 Klicke auf den KEY-Button im Chat-Header, um deinen Key einzugeben! ' +
      'Die Modellliste wird live von openrouter.ai/api/v1/models geladen (kein Key nötig, um sie zu sehen).',
    keyStorageKey: 'dna-legal-ai-key-openrouter',
    modelStorageKey: 'dna-legal-ai-model-openrouter',
    // Offline-Fallback — die Live-Liste kommt von /api/v1/models (öffentlich, ohne Key).
    modelList: [
      'meta-llama/llama-3.2-3b-instruct:free',
      'meta-llama/llama-3.1-8b-instruct:free',
      'liquid/lfm-2.5-2.6b:free',
      'qwen/qwen3-8b:free',
    ],
  },
  'openrouter-free': {
    id: 'openrouter-free',
    label: 'OPENROUTER /free',
    defaultModel: 'openrouter/free',
    // Kein Key zwingend nötig — OpenRouter leitet ohne Key automatisch
    // an das beste verfügbare kostenlose Modell weiter. Mit Key weniger Rate-Limits.
    credentialLabel: 'API-Key (optional)',
    credentialPlaceholder: 'sk-or-v1-... (oder leer lassen)',
    credentialDefault: '',
    keyHint:
      'OpenRouter Key ist optional. Ohne Key leitet OpenRouter automatisch ' +
      'an das aktuell beste verfügbare kostenlose Modell weiter (Rate-Limits ohne Key). ' +
      'Key kostenlos unter https://openrouter.ai/keys. ' +
      'Modell: "openrouter/free" = auto-routing zum besten Gratis-Modell.',
    keyStorageKey: 'dna-legal-ai-key-openrouter-free',
    modelStorageKey: 'dna-legal-ai-model-openrouter-free',
    allowNoCredential: true,
    // Fallback, solange noch nichts live geladen wurde (oder der Live-Abruf
    // fehlschlägt) — sonst stünde das Dropdown ohne jede Option leer da.
    modelList: ['openrouter/free'],
  },
  groq: {
    id: 'groq',
    label: 'GROQ',
    defaultModel: 'openai/gpt-oss-20b',
    credentialLabel: 'API-Key',
    credentialPlaceholder: 'gsk_...',
    credentialDefault: '',
    keyHint:
      'Groq Key (gsk_...). Kostenlos unter console.groq.com/keys erstellbar. ' +
      'Groq ist extrem schnell — perfekt für Live-Chat. Achtung: Groq schaltet Modelle ' +
      'öfter ab (z. B. wurde llama-3.1-8b-instant im kostenlosen Tarif abgeschaltet) — ' +
      'die Modellliste wird deshalb live von der Groq-API geladen.',
    keyStorageKey: 'dna-legal-ai-key-groq',
    modelStorageKey: 'dna-legal-ai-model-groq',
    // Offline-Fallback — die Live-Liste kommt von /openai/v1/models.
    modelList: [
      'openai/gpt-oss-20b',
      'openai/gpt-oss-120b',
      'llama-3.3-70b-versatile',
      'qwen/qwen3-32b',
      'moonshotai/kimi-k2-instruct',
    ],
  },
  huggingface: {
    id: 'huggingface',
    label: 'HUGGINGFACE',
    defaultModel: 'meta-llama/Llama-3.1-8b-instruct',
    credentialLabel: 'API-Key',
    credentialPlaceholder: 'hf_...',
    credentialDefault: '',
    keyHint:
      'HuggingFace Key (hf_...). Kostenlos unter https://huggingface.co/settings/tokens erstellen. ' +
      'Inferenz über die Chat-Anfrage-API (https://api-inference.huggingface.co/models/{model}). ' +
      'Verfügbare Modelle: https://huggingface.co/models',
    keyStorageKey: 'dna-legal-ai-key-huggingface',
    modelStorageKey: 'dna-legal-ai-model-huggingface',
    modelList: [
      'meta-llama/Llama-3.1-8b-instruct',
      'meta-llama/Llama-3.1-70b-instruct',
      'mistralai/Mistral-7B-Instruct-v0.3',
      'google/gemma-2-9b-it',
      'deepseek-ai/DeepSeek-V2.5-Chat',
    ],
  },
  deepseek: {
    id: 'deepseek',
    label: 'DEEPSEEK',
    defaultModel: 'deepseek-chat',
    credentialLabel: 'API-Key',
    credentialPlaceholder: 'sk-...',
    credentialDefault: '',
    keyHint:
      'DeepSeek Key (sk-...). Erstellen unter platform.deepseek.com/api_keys. ' +
      'OpenAI-kompatible API — sehr günstig, "deepseek-chat" (V3) für normale ' +
      'Antworten, "deepseek-reasoner" (R1) für Reasoning mit sichtbarer ' +
      'Denk-Kette. Erfordert eigenes Guthaben (Prepaid).',
    keyStorageKey: 'dna-legal-ai-key-deepseek',
    modelStorageKey: 'dna-legal-ai-model-deepseek',
    // Offline-Fallback — die Live-Liste kommt von /v1/models.
    modelList: ['deepseek-chat', 'deepseek-reasoner'],
  },
};

export const PROVIDER_ORDER: ProviderId[] = ['anthropic', 'gemini', 'openai', 'deepseek', 'huggingface', 'ollama', 'openrouter', 'openrouter-free', 'groq'] as const;

/**
 * Fragt die tatsächlich verfügbaren Modelle direkt bei der jeweiligen Anbieter-API ab,
 * statt sich auf eine fest einprogrammierte (und schnell veraltende) Liste zu verlassen.
 * Wirft einen Error mit verständlichem Text, wenn die Abfrage nicht möglich ist —
 * der Aufrufer sollte dann auf PROVIDERS[provider].modelList zurückfallen.
 */
export async function fetchAvailableModels(
  provider: ProviderId,
  credential: string,
  ollamaModeOverride?: OllamaMode
): Promise<string[]> {
  switch (provider) {
    case 'anthropic': {
      if (!credential) {
        throw new Error('API-Key erforderlich, um die Modell-Liste zu laden.');
      }
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': credential,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error?.message || `Anthropic: Modelle konnten nicht geladen werden (Status ${res.status})`);
      }
      const data = await res.json();
      const list: string[] = (data?.data || []).map((m: { id: string }) => m.id);
      if (list.length === 0) throw new Error('Anthropic: Keine Modelle gefunden.');
      return list.sort();
    }

    case 'gemini': {
      if (!credential) {
        throw new Error('API-Key erforderlich, um die Modell-Liste zu laden.');
      }
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(credential)}`
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error?.message || `Gemini: Modelle konnten nicht geladen werden (Status ${res.status})`);
      }
      const data = await res.json();
      const list: string[] = (data?.models || [])
        .filter((m: { supportedGenerationMethods?: string[] }) =>
          m.supportedGenerationMethods?.includes('generateContent')
        )
        .map((m: { name: string }) => m.name.replace(/^models\//, ''));
      if (list.length === 0) throw new Error('Gemini: Keine passenden Modelle gefunden.');
      return list.sort();
    }

    case 'openai': {
      if (!credential) {
        throw new Error('API-Key erforderlich, um die Modell-Liste zu laden.');
      }
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${credential}` },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error?.message || `OpenAI: Modelle konnten nicht geladen werden (Status ${res.status})`);
      }
      const data = await res.json();
      const list: string[] = (data?.data || [])
        .map((m: { id: string }) => m.id)
        .filter((id: string) => /^(gpt|o1|o3|o4|chatgpt)/i.test(id));
      if (list.length === 0) throw new Error('OpenAI: Keine passenden Chat-Modelle gefunden.');
      return list.sort();
    }

    case 'groq': {
      if (!credential) {
        throw new Error('API-Key erforderlich, um die Modell-Liste zu laden.');
      }
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${credential}` },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error?.message || `Groq: Modelle konnten nicht geladen werden (Status ${res.status})`);
      }
      const data = await res.json();
      const list: string[] = (data?.data || []).map((m: { id: string }) => m.id);
      if (list.length === 0) throw new Error('Groq: Keine Modelle gefunden.');
      return list.sort();
    }

    case 'deepseek': {
      if (!credential) {
        throw new Error('API-Key erforderlich, um die Modell-Liste zu laden.');
      }
      const res = await fetch('https://api.deepseek.com/v1/models', {
        headers: { Authorization: `Bearer ${credential}` },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error?.message || `DeepSeek: Modelle konnten nicht geladen werden (Status ${res.status})`);
      }
      const data = await res.json();
      const list: string[] = (data?.data || []).map((m: { id: string }) => m.id);
      if (list.length === 0) throw new Error('DeepSeek: Keine Modelle gefunden.');
      return list.sort();
    }

    case 'openrouter': {
      // Öffentlicher Endpunkt, kein Key nötig, um die Liste zu sehen.
      const res = await fetch('https://openrouter.ai/api/v1/models');
      if (!res.ok) {
        throw new Error(`OpenRouter: Modelle konnten nicht geladen werden (Status ${res.status})`);
      }
      const data = await res.json();
      const list: string[] = (data?.data || []).map((m: { id: string }) => m.id);
      if (list.length === 0) throw new Error('OpenRouter: Keine Modelle gefunden.');
      return list.sort();
    }

    case 'openrouter-free': {
      // Derselbe öffentliche Endpunkt wie 'openrouter' (kein Key nötig) —
      // hier aber auf die tatsächlichen ":free"-Modelle gefiltert, plus die
      // Auto-Routing-Pseudo-Option "openrouter/free" oben angepinnt (früher
      // fehlte dieser Case komplett, wodurch nie Modelle geladen wurden und
      // nur der leere modelList-Fallback übrig blieb).
      const res = await fetch('https://openrouter.ai/api/v1/models');
      if (!res.ok) {
        throw new Error(`OpenRouter: Modelle konnten nicht geladen werden (Status ${res.status})`);
      }
      const data = await res.json();
      const freeList: string[] = (data?.data || [])
        .map((m: { id: string }) => m.id)
        .filter((id: string) => id.endsWith(':free'));
      return ['openrouter/free', ...[...new Set(freeList)].sort()];
    }

    case 'ollama': {
      const cloud = (ollamaModeOverride ?? getOllamaMode()) === 'cloud';

      if (cloud) {
        // Primäre Quelle: der volle, live gepflegte Cloud-Katalog über den
        // OpenAI-kompatiblen Endpunkt (ollama.com/v1/models) — im Gegensatz
        // zu /api/tags liefert der nicht nur die im Account bereits
        // genutzten/gepullten Modelle, sondern den kompletten aktuellen
        // Katalog. Damit tauchen neue Modelle sofort auf und retired
        // Modelle verschwinden von selbst, ohne dass wir eine Liste pflegen
        // müssen (siehe OLLAMA_CLOUD_MODELS-Kommentar: genau das ist uns mit
        // deepseek-v3.1:671b-cloud am 15.07.2026 passiert).
        try {
          const res = await fetch(`${OLLAMA_BRIDGE_URL}/v1/models`, {
            headers: { 'X-PRIS-Ollama-Target': OLLAMA_CLOUD_BASE_URL, Authorization: `Bearer ${credential}`, Accept: 'application/json' },
          });
          if (res.ok) {
            const data = await res.json();
            const list: string[] = (data?.data || []).map((m: { id: string }) => m.id).filter(Boolean);
            if (list.length > 0) return [...new Set(list)].sort();
          }
        } catch {
          // fällt unten auf /api/tags bzw. den Notfall-Katalog zurück
        }
      }

      const baseUrl = cloud ? OLLAMA_CLOUD_BASE_URL : (credential || PROVIDERS.ollama.credentialDefault).replace(/\/+$/, '');
      let res: Response;
      try {
        res = await fetch(`${OLLAMA_BRIDGE_URL}/api/tags`, {
          headers: {
            ...(cloud ? { 'X-PRIS-Ollama-Target': baseUrl, Authorization: `Bearer ${credential}` } : {}),
            Accept: 'application/json',
          },
        });
      } catch (e) {
        // Im Cloud-Modus können wir trotz Netzwerkfehler noch auf den
        // Notfall-Katalog zurückfallen, statt komplett zu scheitern.
        if (cloud && OLLAMA_CLOUD_MODELS.length > 0) return [...OLLAMA_CLOUD_MODELS].sort();
        throw new Error(`Ollama ${cloud ? 'Cloud API' : 'lokal'} nicht erreichbar (${e instanceof Error ? e.message : String(e)}).`);
      }
      if (!res.ok) {
        if (cloud && OLLAMA_CLOUD_MODELS.length > 0) return [...OLLAMA_CLOUD_MODELS].sort();
        const body = await res.json().catch(() => null);
        const detail = body?.error?.message || body?.error || '';
        if (cloud) throw new Error(`Ollama Cloud API: Modelle konnten nicht geladen werden (HTTP ${res.status})${detail ? ` — ${detail}` : ''}. API-Key prüfen.`);
        throw new Error(`Ollama lokal: Modelle konnten nicht geladen werden (Status ${res.status})`);
      }
      const data = await res.json();
      const list: string[] = (data?.models || []).map((m: { name?: string; model?: string }) => m.name || m.model).filter(Boolean);
      // /api/tags liefert im Cloud-Modus nur die im Account bereits
      // genutzten/gepullten Modelle — der Notfall-Katalog wird nur dazu-
      // gemischt, falls der Live-Katalog oben fehlgeschlagen ist.
      const combined = cloud ? [...list, ...OLLAMA_CLOUD_MODELS] : list;
      if (combined.length === 0) {
        if (cloud) throw new Error('Ollama Cloud: Die API hat keine Cloud-Modelle für diesen API-Key zurückgegeben. Bitte API-Key und Ollama-Cloud-Zugriff prüfen.');
        throw new Error('Ollama: Keine lokal installierten Modelle gefunden (ollama pull ...).');
      }
      return [...new Set(combined)].sort();
    }

    case 'huggingface':
      // Es gibt keinen einfachen, verlässlichen "meine nutzbaren Chat-Modelle"-Endpunkt —
      // der Modell-Katalog ist riesig und nicht nach Kompatibilität filterbar.
      throw new Error(
        'HuggingFace bietet keine einfache Live-Modell-Liste für Chat-Modelle an — bitte den Modellnamen manuell eintragen (z. B. von huggingface.co/models).'
      );

    default:
      throw new Error('Unbekannter Provider.');
  }
}

async function sendAnthropic(
  apiKey: string,
  model: string,
  systemInstruction: string,
  messages: ChatMsg[]
): Promise<string> {
  if (!apiKey) {
    throw new Error(
      'Kein Anthropic API-Key gefunden. Erstelle einen unter ' +
      'https://console.anthropic.com/settings/keys und trage ihn über den ' +
      'KEY-Button im Chat-Header ein.'
    );
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemInstruction,
      messages: messages.map((m) => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: [
          ...(m.text ? [{ type: 'text', text: m.text }] : []),
          ...(m.images || []).map((dataUrl) => {
            const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            return match ? { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } } : null;
          }).filter(Boolean),
        ],
      })),
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(errBody?.error?.message || `Anthropic-API-Fehler (Status ${res.status})`);
  }

  const data = await res.json();
  return (
    data?.content?.map((b: { type: string; text?: string }) => (b.type === 'text' ? b.text || '' : '')).join('') ||
    '(keine Antwort erhalten)'
  );
}

async function sendGemini(
  apiKey: string,
  model: string,
  systemInstruction: string,
  messages: ChatMsg[]
): Promise<string> {
  if (!apiKey) {
    throw new Error(
      'Kein Gemini API-Key gefunden. Erstelle einen unter ' +
      'https://aistudio.google.com/apikey und trage ihn über den ' +
      'KEY-Button im Chat-Header ein.'
    );
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: messages.map((m) => ({
          role: m.role,
          parts: [
            ...(m.text ? [{ text: m.text }] : []),
            ...(m.images || []).map((dataUrl) => {
              const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
              return match ? { inline_data: { mime_type: match[1], data: match[2] } } : null;
            }).filter(Boolean),
          ],
        })),
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(errBody?.error?.message || `Gemini-API-Fehler (Status ${res.status})`);
  }

  const data = await res.json();
  return (
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') ||
    '(keine Antwort erhalten)'
  );
}

async function sendOpenAi(
  apiKey: string,
  model: string,
  systemInstruction: string,
  messages: ChatMsg[]
): Promise<string> {
  if (!apiKey) {
    throw new Error(
      'Kein OpenAI API-Key gefunden. Erstelle einen unter ' +
      'https://platform.openai.com/api-keys und trage ihn über den ' +
      'KEY-Button im Chat-Header ein.'
    );
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        ...messages.map((m) => ({
          role: m.role === 'model' ? 'assistant' : 'user',
          content: m.images?.length
            ? [
                ...(m.text ? [{ type: 'text', text: m.text }] : []),
                ...m.images.map((url) => ({ type: 'image_url', image_url: { url } })),
              ]
            : m.text,
        })),
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(errBody?.error?.message || `OpenAI-API-Fehler (Status ${res.status})`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '(keine Antwort erhalten)';
}

/**
 * DeepSeek: OpenAI-kompatible Chat-Completions-API (https://api.deepseek.com/v1).
 * "deepseek-reasoner" (R1) liefert zusätzlich reasoning_content — das nutzen
 * wir hier bewusst nicht, um bei allen Providern eine einheitliche
 * einfache String-Antwort zurückzugeben.
 */
async function sendDeepSeek(
  apiKey: string,
  model: string,
  systemInstruction: string,
  messages: ChatMsg[]
): Promise<string> {
  if (!apiKey) {
    throw new Error(
      'Kein DeepSeek API-Key gefunden. Erstelle einen unter ' +
      'https://platform.deepseek.com/api_keys und trage ihn über den ' +
      'KEY-Button im Chat-Header ein.'
    );
  }
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      // DeepSeek ist reiner Text-Chat (kein image_url-Content-Format) —
      // eventuelle Bilder werden hier daher nicht mitgeschickt.
      messages: [
        { role: 'system', content: systemInstruction },
        ...messages.map((m) => ({
          role: m.role === 'model' ? 'assistant' : 'user',
          content: m.text,
        })),
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const msg = errBody?.error?.message || `DeepSeek-Fehler (Status ${res.status}): ${res.statusText}`;
    if (res.status === 401) throw new Error(`DeepSeek: Ungültiger API-Key. ${msg}`);
    if (res.status === 402) throw new Error(`DeepSeek: Kein Guthaben mehr auf dem Account. ${msg}`);
    if (res.status === 429) throw new Error(`DeepSeek: Rate-Limit erreicht. ${msg}`);
    throw new Error(msg);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '(keine Antwort erhalten)';
}

async function sendGroq(
  apiKey: string,
  model: string,
  systemInstruction: string,
  messages: ChatMsg[]
): Promise<string> {
  if (!apiKey) {
    throw new Error(
      'Kein Groq API-Key gefunden. Erstelle einen unter ' +
      'https://console.groq.com/keys und trage ihn über den ' +
      'KEY-Button im Chat-Header ein.'
    );
  }
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        ...messages.map((m) => ({
          role: m.role === 'model' ? 'assistant' : 'user',
          content: m.images?.length
            ? [
                ...(m.text ? [{ type: 'text', text: m.text }] : []),
                ...m.images.map((url) => ({ type: 'image_url', image_url: { url } })),
              ]
            : m.text,
        })),
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const code = errBody?.error?.code;
    const msg = errBody?.error?.message || `Groq-Fehler (Status ${res.status}): ${res.statusText}`;
    if (res.status === 401 || code === 'invalid_api_key') {
      throw new Error(`Groq: Ungültiger API-Key. ${msg}`);
    }
    if (code === 'model_decommissioned') {
      throw new Error(`Groq: Modell nicht mehr verfügbar. ${msg}`);
    }
    throw new Error(msg);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '(keine Antwort erhalten)';
}

async function sendOllama(
  baseUrlRaw: string,
  model: string,
  systemInstruction: string,
  messages: ChatMsg[]
): Promise<string> {
  const cloud = getOllamaMode() === 'cloud';
  const apiKey = cloud ? (baseUrlRaw || getOllamaCloudApiKey()) : '';
  const baseUrl = cloud ? OLLAMA_CLOUD_BASE_URL : (baseUrlRaw || PROVIDERS.ollama.credentialDefault).replace(/\/+$/, '');
  const chatMessages = [
    { role: 'system', content: systemInstruction },
    ...messages.map((m) => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: m.text,
      ...(m.images?.length ? { images: m.images.map((url) => url.replace(/^data:[^;]+;base64,/, '')) } : {}),
    })),
  ];
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BRIDGE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cloud ? { 'X-PRIS-Ollama-Target': baseUrl, Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, messages: chatMessages, stream: false }),
    });
  } catch (e) {
    throw new Error(`Ollama ${cloud ? 'Cloud API' : 'lokal'} unter ${baseUrl} nicht erreichbar. ${cloud ? 'API-Key prüfen.' : 'Läuft "ollama serve" und ist OLLAMA_ORIGINS freigegeben?'} (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const msg = errBody?.error?.message || errBody?.error || '';
    if (cloud && res.status === 404) {
      throw new Error(`Ollama Cloud: Modell "${model}" wurde nicht gefunden. Bitte ausschließlich ein Modell aus dem geladenen CLOUD-Katalog auswählen (Status 404).`);
    }
    throw new Error(msg || `Ollama-Fehler (Status ${res.status})`);
  }
  const data = await res.json();
  return data?.message?.content || '(keine Antwort erhalten)';
}

async function sendOpenRouter(
  apiKey: string,
  model: string,
  systemInstruction: string,
  messages: ChatMsg[]
): Promise<string> {
  if (!apiKey) {
    throw new Error(
      'Kein OpenRouter API-Key gefunden. Erstelle einen kostenlos unter ' +
      'https://openrouter.ai/keys und trage ihn über den KEY-Button im Chat-Header ein.'
    );
  }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'PRIS',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        ...messages.map((m) => ({
          role: m.role === 'model' ? 'assistant' : 'user',
          content: m.images?.length
            ? [
                ...(m.text ? [{ type: 'text', text: m.text }] : []),
                ...m.images.map((url) => ({ type: 'image_url', image_url: { url } })),
              ]
            : m.text,
        })),
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const msg = errBody?.error?.message || `OpenRouter-Fehler (Status ${res.status}): ${res.statusText}`;
    if (res.status === 401) throw new Error(`OpenRouter: Ungültiger API-Key. ${msg}`);
    if (res.status === 429) throw new Error(`OpenRouter: Rate-Limit erreicht. ${msg}`);
    throw new Error(msg);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '(keine Antwort erhalten)';
}

/**
 * "openrouter-free": derselbe Endpunkt wie OpenRouter, aber ohne Key nutzbar —
 * OpenRouter routet dann automatisch an ein aktuell verfügbares Gratis-Modell.
 * Mit Key gelten großzügigere Rate-Limits (siehe keyHint bei openrouter-free).
 */
async function sendOpenRouterFree(
  apiKey: string,
  model: string,
  systemInstruction: string,
  messages: ChatMsg[]
): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      'HTTP-Referer': window.location.origin,
      'X-Title': 'PRIS',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        ...messages.map((m) => ({
          role: m.role === 'model' ? 'assistant' : 'user',
          content: m.images?.length
            ? [
                ...(m.text ? [{ type: 'text', text: m.text }] : []),
                ...m.images.map((url) => ({ type: 'image_url', image_url: { url } })),
              ]
            : m.text,
        })),
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const msg = errBody?.error?.message || `OpenRouter-Fehler (Status ${res.status}): ${res.statusText}`;
    if (res.status === 429) throw new Error(`OpenRouter: Rate-Limit erreicht (ohne Key strenger begrenzt). ${msg}`);
    throw new Error(msg);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '(keine Antwort erhalten)';
}

/**
 * HuggingFace Inference API (Text-Generation-Task, siehe keyHint bei
 * PROVIDERS.huggingface): Verlauf wird zu einem einzigen Prompt-String
 * zusammengefasst, da der klassische api-inference-Endpunkt kein natives
 * Chat-Message-Format wie OpenAI/Groq/OpenRouter kennt.
 */
async function sendHuggingFace(
  apiKey: string,
  model: string,
  systemInstruction: string,
  messages: ChatMsg[]
): Promise<string> {
  if (!apiKey) {
    throw new Error(
      'Kein HuggingFace API-Key gefunden. Erstelle einen kostenlos unter ' +
      'https://huggingface.co/settings/tokens und trage ihn über den KEY-Button im Chat-Header ein.'
    );
  }
  const historyText = messages
    .map((m) => `${m.role === 'model' ? 'Assistant' : 'User'}: ${m.text}`)
    .join('\n');
  const prompt = `${systemInstruction}\n\n${historyText}\nAssistant:`;

  const res = await fetch(`https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: { max_new_tokens: 1024, return_full_text: false },
      options: { wait_for_model: true },
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const msg = errBody?.error || `HuggingFace-Fehler (Status ${res.status}): ${res.statusText}`;
    if (res.status === 401) throw new Error(`HuggingFace: Ungültiger API-Key. ${msg}`);
    if (res.status === 503) throw new Error(`HuggingFace: Modell lädt gerade (kalter Start) — kurz erneut versuchen. ${msg}`);
    throw new Error(msg);
  }

  const data = await res.json();
  if (Array.isArray(data)) {
    return data[0]?.generated_text?.trim() || '(keine Antwort erhalten)';
  }
  return data?.generated_text?.trim() || '(keine Antwort erhalten)';
}

export async function sendChatMessage(
  provider: ProviderId,
  credential: string,
  model: string,
  systemInstruction: string,
  messages: ChatMsg[]
): Promise<string> {
  switch (provider) {
    case 'anthropic':
      return sendAnthropic(credential, model, systemInstruction, messages);
    case 'gemini':
      return sendGemini(credential, model, systemInstruction, messages);
    case 'openai':
      return sendOpenAi(credential, model, systemInstruction, messages);
    case 'ollama':
      return sendOllama(credential, model, systemInstruction, messages);
    case 'openrouter':
      return sendOpenRouter(credential, model, systemInstruction, messages);
    case 'openrouter-free':
      return sendOpenRouterFree(credential || '', model, systemInstruction, messages);
    case 'groq':
      return sendGroq(credential, model, systemInstruction, messages);
    case 'deepseek':
      return sendDeepSeek(credential, model, systemInstruction, messages);
    case 'huggingface':
      return sendHuggingFace(credential, model, systemInstruction, messages);
    default:
      throw new Error('Unbekannter Provider.');
  }
}
