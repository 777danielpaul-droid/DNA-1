import React, { useEffect, useState } from 'react';
import {
  loadRemoteStatus,
  loadSocialConfig,
  saveSocialConfig,
  syncSocialConfig,
  testSocialConnection,
  type SocialConfig,
} from '../lib/socialIntegrations';

export default function SocialIntegrationsSection() {
  const [config, setConfig] = useState<SocialConfig>(() => loadSocialConfig());
  const [status, setStatus] = useState({ telegram: false, discord: false, ok: false });
  const [busy, setBusy] = useState<'telegram' | 'discord' | 'save' | null>(null);
  const [message, setMessage] = useState('');

  const update = (patch: Partial<SocialConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
    setMessage('');
  };

  const save = async () => {
    setBusy('save');
    saveSocialConfig(config);
    const result = await syncSocialConfig(config);
    setMessage(result.ok ? '✓ Einstellungen an den lokalen Remote-Agent übertragen.' : `⚠ ${result.error}`);
    setBusy(null);
    if (result.ok) {
      const next = await loadRemoteStatus();
      setStatus(next);
    }
  };

  const test = async (provider: 'telegram' | 'discord') => {
    setBusy(provider);
    setMessage('');
    try {
      saveSocialConfig(config);
      await syncSocialConfig(config);
      setMessage(`✓ ${await testSocialConnection(provider, config)}`);
      const next = await loadRemoteStatus();
      setStatus(next);
    } catch (e) {
      setMessage(`⚠ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const next = await loadRemoteStatus();
      if (!cancelled) setStatus(next);
      if (!cancelled && (config.telegramToken || config.discordBotToken)) await syncSocialConfig(config);
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="system-status-section">
      <span className="system-status-section-title">Messaging · Telegram / Discord</span>
      <span className="invoice-scanner-hint">
        Tokens werden lokal in PRIS gespeichert und nur an den lokalen Remote-Agent auf 127.0.0.1:8790 übertragen.
      </span>

      <div className="system-status-social-card">
        <div className="system-status-social-title">➤ TELEGRAM</div>
        <input className="invoice-scanner-input" type="password" placeholder="Bot Token" value={config.telegramToken} onChange={(e) => update({ telegramToken: e.target.value })} />
        <input className="invoice-scanner-input" placeholder="Erlaubte User-IDs (optional, Komma getrennt)" value={config.telegramAllowedUserIds} onChange={(e) => update({ telegramAllowedUserIds: e.target.value })} />
        <div className="system-status-row">
          <span className="system-status-row-label">Status</span>
          <span className={`system-status-row-value ${status.telegram ? 'ok' : 'bad'}`}>{status.telegram ? 'VERBUNDEN' : 'NICHT KONFIGURIERT'}</span>
        </div>
        <button type="button" className="system-status-refresh-btn" disabled={busy !== null} onClick={() => void test('telegram')}>{busy === 'telegram' ? '⟳ teste…' : 'Verbindung testen'}</button>
      </div>

      <div className="system-status-social-card">
        <div className="system-status-social-title">◌ DISCORD</div>
        <input className="invoice-scanner-input" type="password" placeholder="Bot Token" value={config.discordBotToken} onChange={(e) => update({ discordBotToken: e.target.value })} />
        <input className="invoice-scanner-input" placeholder="Erlaubte User-IDs (optional, Komma getrennt)" value={config.discordAllowedUserIds} onChange={(e) => update({ discordAllowedUserIds: e.target.value })} />
        <input className="invoice-scanner-input" placeholder="Standard Channel-ID (optional)" value={config.discordChannelId} onChange={(e) => update({ discordChannelId: e.target.value })} />
        <div className="system-status-row">
          <span className="system-status-row-label">Status</span>
          <span className={`system-status-row-value ${status.discord ? 'ok' : 'bad'}`}>{status.discord ? 'VERBUNDEN' : 'NICHT KONFIGURIERT'}</span>
        </div>
        <button type="button" className="system-status-refresh-btn" disabled={busy !== null} onClick={() => void test('discord')}>{busy === 'discord' ? '⟳ teste…' : 'Verbindung testen'}</button>
      </div>

      <button type="button" className="system-status-refresh-btn" disabled={busy !== null} onClick={() => void save()}>
        {busy === 'save' ? '⟳ speichere…' : '⌘ Messaging-Einstellungen speichern'}
      </button>
      {message && <div className="invoice-scanner-hint">{message}</div>}
    </div>
  );
}
