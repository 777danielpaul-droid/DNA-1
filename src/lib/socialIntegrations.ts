export type SocialProvider = 'telegram' | 'discord';

export interface SocialConfig {
  telegramToken: string;
  telegramAllowedUserIds: string;
  discordBotToken: string;
  discordAllowedUserIds: string;
  discordChannelId: string;
}

const STORAGE_KEY = 'pris-social-integrations';
const REMOTE_URL = 'http://127.0.0.1:8790';

export const DEFAULT_SOCIAL_CONFIG: SocialConfig = {
  telegramToken: '',
  telegramAllowedUserIds: '',
  discordBotToken: '',
  discordAllowedUserIds: '',
  discordChannelId: '',
};

export function loadSocialConfig(): SocialConfig {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULT_SOCIAL_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_SOCIAL_CONFIG };
  }
}

export function saveSocialConfig(config: SocialConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export async function syncSocialConfig(config: SocialConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${REMOTE_URL}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) return { ok: false, error: data.error || `Remote-Agent HTTP ${response.status}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function loadRemoteStatus(): Promise<{
  ok: boolean;
  telegram: boolean;
  discord: boolean;
  pending: number;
  error?: string;
}> {
  try {
    const response = await fetch(`${REMOTE_URL}/ping`, { cache: 'no-store' });
    const data = await response.json();
    return { ok: Boolean(data.ok), telegram: Boolean(data.telegram), discord: Boolean(data.discord), pending: Number(data.pending || 0) };
  } catch (error) {
    return { ok: false, telegram: false, discord: false, pending: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function testSocialConnection(provider: SocialProvider, config: SocialConfig): Promise<string> {
  const response = await fetch(`${REMOTE_URL}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, ...config }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || `Verbindungstest fehlgeschlagen (${response.status})`);
  return data.message || 'Verbindung erfolgreich.';
}
