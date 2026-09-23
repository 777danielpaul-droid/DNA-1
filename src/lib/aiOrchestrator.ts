import { PROVIDERS, sendChatMessage, type ProviderId } from './aiProviders';

export interface AiSourceResult {
  provider: string;
  model?: string;
  answer: string;
}

export interface AiSourceAdapter {
  id: string;
  label: string;
  canRun: () => boolean;
  run: (prompt: string) => Promise<AiSourceResult>;
}

export function createApiAdapter(provider: ProviderId, credential: string, model: string): AiSourceAdapter {
  return {
    id: provider,
    label: PROVIDERS[provider].label,
    canRun: () => Boolean(credential || provider === 'ollama' || PROVIDERS[provider].allowNoCredential),
    run: async (prompt) => ({
      provider: PROVIDERS[provider].label,
      model,
      answer: await sendChatMessage(
        provider,
        credential,
        model,
        'Beantworte die Fragestellung unabhängig und konkret. Liefere nur die inhaltliche Antwort.',
        [{ role: 'user', text: prompt }]
      ),
    }),
  };
}
