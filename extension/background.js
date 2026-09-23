// extension/background.js
// Service Worker der Pris-Bridge.

const TARGET_ORIGINS = [
  'https://chatgpt.com',
  'https://www.chatgpt.com',
  'https://chat.openai.com',
  'https://claude.ai',
  'https://claude.com',
  'https://kimi.com',
  'https://www.kimi.com',
  'https://gemini.google.com',
  'https://grok.com',
  'https://x.com',
  'https://www.perplexity.ai',
  'https://perplexity.ai',
  'https://chat.deepseek.com',
  'https://deepseek.com',
  'https://chat.mistral.ai',
  'https://qwen.ai',
  'https://chat.qwen.ai',
];

function siteNameFromUrl(url) {
  try {
    const host = new URL(url).hostname;
    if (host.includes('claude.ai') || host.includes('claude.com')) return 'claude';
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt';
    if (host === 'kimi.com' || host.endsWith('.kimi.com')) return 'kimi';
    if (host === 'gemini.google.com') return 'gemini';
    if (host === 'grok.com' || host === 'x.com') return 'grok';
    if (host.includes('perplexity.ai')) return 'perplexity';
    if (host.includes('deepseek.com')) return 'deepseek';
    if (host.includes('mistral.ai')) return 'mistral';
    if (host === 'qwen.ai' || host.endsWith('.qwen.ai')) return 'qwen';
    return host;
  } catch {
    return 'unbekannt';
  }
}

async function listMatchingTabs() {
  const tabs = await chrome.tabs.query({});
  const matches = tabs
    .filter((t) => typeof t.id === 'number' && TARGET_ORIGINS.some((origin) => t.url?.startsWith(origin)))
    .map((t) => ({
      tabId: t.id, url: t.url || '', title: t.title || t.url || '',
      site: siteNameFromUrl(t.url || ''), active: Boolean(t.active),
    }));
  const bySite = new Map();
  for (const target of matches) {
    const existing = bySite.get(target.site);
    if (!existing || (!existing.active && target.active)) bySite.set(target.site, target);
  }
  return [...bySite.values()].sort((a, b) => Number(b.active) - Number(a.active));
}

async function refreshBadge(tabId) {
  try {
    const tabs = await listMatchingTabs();
    const isTarget = tabs.some((t) => t.tabId === tabId);
    await chrome.action.setBadgeText({ tabId, text: isTarget ? 'ON' : '' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#a855f7' });
  } catch (err) {
    console.warn('[Pris-Bridge Background] refreshBadge Fehler:', err);
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab?.url) {
    const isTarget = TARGET_ORIGINS.some((origin) => tab.url.startsWith(origin));
    if (isTarget) {
      refreshBadge(tabId);
      // Content Script explizit injizieren
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js'],
        });
        console.info('[Pris-Bridge Background] Content Script erzwungen injiziert auf:', tab.url);
      } catch (err) {
        // Falls bereits injiziert oder Fehler: ignorieren
        if (!(err instanceof Error && err.message.includes('Already injected'))) {
          console.warn('[Pris-Bridge Background] Injektion fehlgeschlagen:', err.message || err);
        }
      }
    }
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => refreshBadge(tabId));

// Prüft, ob Content Script aktiv ist
async function isContentScriptActive(tabId) {
  try {
    const result = await chrome.tabs.sendMessage(tabId, { type: 'PRIS_BRIDGE_PING' }, { frameId: 0 });
    return result !== undefined;
  } catch {
    return false;
  }
}

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'PRIS_BRIDGE_PING': {
        sendResponse({ ok: true });
        break;
      }

      case 'PRIS_BRIDGE_LIST_TARGETS': {
        const targets = await listMatchingTabs();
        sendResponse({ ok: true, targets });
        break;
      }

      case 'PRIS_BRIDGE_SEND': {
        const { tabId, prompt } = message;

        if (typeof tabId !== 'number' || typeof prompt !== 'string' || !prompt.trim()) {
          sendResponse({ ok: false, error: 'tabId und prompt sind erforderlich.' });
          return;
        }

        try {
          const tab = await chrome.tabs.get(tabId);

          // Erzwinge Injektion, falls noch nicht aktiv
          let active = await isContentScriptActive(tabId);
          if (!active) {
            await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
            await new Promise((r) => setTimeout(r, 200));
            active = await isContentScriptActive(tabId);
          }

          if (!active) {
            sendResponse({
              ok: false,
              error:
                `Content Script im Ziel-Tab (${tab.url}) ist nicht aktiv. ` +
                'Stelle sicher, dass claude.ai/chatgpt.com vollständig geladen ist ' +
                'und die Pris-Bridge-Extension unter chrome://extensions neu geladen wurde.',
            });
            return;
          }

          const result = await chrome.tabs.sendMessage(
            tabId,
            { type: 'PRIS_BRIDGE_RUN', prompt },
            { frameId: 0 }
          );

          if (result && typeof result === 'object' && 'ok' in result) {
            sendResponse(result);
          } else {
            sendResponse({ ok: false, error: 'Keine gültige Antwort vom Content Script.' });
          }
        } catch (err) {
          const innerMsg = err instanceof Error ? err.message : String(err);
          sendResponse({
            ok: false,
            error:
              `Kommunikation mit Tab fehlgeschlagen: ${innerMsg}. ` +
              'Möglicherweise wurde das Tab geschlossen oder die Seite neu geladen.',
          });
        }
        break;
      }

      default:
        sendResponse({ ok: false, error: 'Unbekannter Nachrichtentyp.' });
    }
  })();

  return true;
});
