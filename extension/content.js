// extension/content.js
// Wird automatisch auf unterstützten Browser-KI-Seiten geladen.

(() => {
  if (window.__prisBridgeInstalled) return;
  window.__prisBridgeInstalled = true;

  const log = (...args) => console.info('[Pris-Bridge]', ...args);
  const warn = (...args) => console.warn('[Pris-Bridge]', ...args);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function findComposer() {
    const host = location.hostname;

    // Kimi has a stable, dedicated composer. Prefer it over the generic
    // contenteditable scan so navigation/search editors are not selected.
    if (host === 'kimi.com' || host.endsWith('.kimi.com')) {
      const kimiCandidates = [
        document.querySelector('.chat-input-editor[contenteditable="true"]'),
        document.querySelector('div[contenteditable="true"][data-lexical-editor="true"]'),
        document.querySelector('.chat-input-editor'),
        document.querySelector('#chat-box .chat-input-editor'),
        document.querySelector('#chat-box textarea'),
        document.querySelector('textarea[placeholder*="Ask" i]'),
      ].filter(Boolean);
      const kimiVisible = kimiCandidates.find((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 100 && rect.height > 0 && !el.disabled;
      });
      if (kimiVisible) return kimiVisible;
    }

    const candidates = [
      ...document.querySelectorAll('div[contenteditable="true"]'),
      ...document.querySelectorAll('textarea'),
    ].filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 100 && rect.height > 0 && !el.disabled;
    });

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    });
    return candidates[0];
  }

  function setNativeValue(el, text) {
    el.focus();

    if (el.getAttribute('contenteditable') === 'true') {
      // Moderne React/ProseMirror-Editoren reagieren zuverlässiger auf
      // echten Text-Input als auf ein direktes textContent-Setzen.
      try {
        document.execCommand('selectAll', false);
        document.execCommand('insertText', false, text);
      } catch {
        el.textContent = text;
      }
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: text,
      }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    const proto = window.HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findSendButton(composer) {
    const host = location.hostname;

    if (host === 'kimi.com' || host.endsWith('.kimi.com')) {
      const kimiButtons = [
        document.querySelector('#chat-box .send-button-container button'),
        document.querySelector('#chat-box .send-button-container'),
        document.querySelector('.chat-editor-action .send-button-container button'),
        document.querySelector('.chat-editor-action .send-button-container'),
        document.querySelector('button[aria-label*="Send" i]'),
        document.querySelector('button[data-testid*="send" i]'),
      ].filter(Boolean);
      const kimiButton = kimiButtons.find((b) => {
        const rect = b.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !b.disabled && b.getAttribute('aria-disabled') !== 'true';
      });
      if (kimiButton) return kimiButton;
    }

    const scope = composer.closest('form') || composer.parentElement?.parentElement || document;
    const buttons = [...scope.querySelectorAll('button')];
    return (
      buttons.find((b) => /senden|send/i.test(b.getAttribute('aria-label') || '')) ||
      buttons.find((b) => b.getAttribute('type') === 'submit') ||
      null
    );
  }

  function assistantMessageEls() {
    const host = location.hostname;
    let selectors = [];

    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) {
      selectors = ['[data-message-author-role="assistant"]'];
    } else if (host.includes('claude.ai') || host.includes('claude.com')) {
      selectors = [
        '[data-testid*="assistant"]',
        '[data-is-streaming="true"]',
        'div[class*="font-claude-response"]',
      ];
    } else if (host === 'kimi.com' || host.endsWith('.kimi.com')) {
      selectors = [
        '[data-message-author-role="assistant"]',
        '[data-role="assistant"]',
        '[class*="message-content"]',
        '[class*="markdown"]',
      ];
    } else if (host === 'gemini.google.com') {
      selectors = [
        '[data-message-author-role="model"]',
        '[data-message-author-role="assistant"]',
        'message-content',
        '.model-response-text',
        '[class*="model-response"]',
      ];
    } else if (host === 'grok.com' || host === 'x.com') {
      selectors = [
        '[data-testid*="assistant"]',
        '[data-testid*="message"]',
        '[class*="message-content"]',
      ];
    } else if (host.includes('perplexity.ai')) {
      selectors = [
        '[data-testid="answer"]',
        '[class*="prose"]',
        '[class*="markdown"]',
        '[class*="answer"]',
      ];
    } else if (host.includes('deepseek.com')) {
      selectors = [
        '[data-message-author-role="assistant"]',
        '[class*="ds-markdown"]',
        '[class*="markdown"]',
      ];
    } else if (host.includes('mistral.ai')) {
      selectors = [
        '[data-message-author-role="assistant"]',
        '[class*="markdown"]',
        '[class*="message-content"]',
      ];
    } else if (host === 'qwen.ai' || host.endsWith('.qwen.ai')) {
      selectors = [
        '[data-message-author-role="assistant"]',
        '[class*="markdown"]',
        '[class*="message-content"]',
      ];
    }

    const specific = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
    const unique = [...new Set(specific)].filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (el.textContent?.trim().length || 0) > 0;
    });

    const topLevel = unique.filter((el) => !unique.some((other) => other !== el && other.contains(el)));
    if (topLevel.length) return topLevel;

    return [...document.querySelectorAll('article, [class*="markdown"], [class*="message"], [class*="turn"]')]
      .filter((el) => el.getAttribute('data-message-author-role') !== 'user')
      .filter((el) => (el.textContent?.trim().length || 0) > 0);
  }

  function extractAnswerText(el, prompt = '') {
    const host = location.hostname;
    let source = el;

    // ChatGPT: the assistant turn contains citations, buttons and other UI.
    // Prefer the actual markdown/content node inside the assistant turn.
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) {
      source = el.querySelector('.markdown') ||
        el.querySelector('[class*="markdown"]') ||
        el.querySelector('[data-testid*="message-content"]') || el;
    }

    // Claude: prefer the response body rather than the surrounding turn/UI.
    if (host.includes('claude.ai') || host.includes('claude.com')) {
      source = el.querySelector('[class*="font-claude-response"]') ||
        el.querySelector('.prose') ||
        el.querySelector('[class*="markdown"]') || el;
    }

    // Work on a clone so citation buttons, links and UI labels never become part
    // of the returned answer.
    const clone = source.cloneNode(true);
    clone.querySelectorAll('button, [aria-label*="copy" i], [aria-label*="citation" i], [data-testid*="citation" i], [data-testid*="source" i], a[href], sup').forEach((n) => n.remove());
    let text = (clone.innerText || clone.textContent || '').replace(/\u00a0/g, ' ').trim();

    const normalizedPrompt = String(prompt || '').replace(/\s+/g, ' ').trim();
    if (normalizedPrompt) {
      const normalized = text.replace(/\s+/g, ' ').trim();
      const idx = normalized.lastIndexOf(normalizedPrompt);
      if (idx >= 0) text = normalized.slice(idx + normalizedPrompt.length).trim();
    }

    // Remove prompt remnants even when the DOM inserts line breaks between them.
    text = text
      .replace(/Beantworte diese Fragestellung unabhängig und konkret\.\s*Liefere nur deine inhaltliche Antwort, keine Meta-Erklärung\.?/gi, '')
      .replace(/FRAGE\s*\/\s*ESSENZ\s*:/gi, '')
      .replace(/^\s*(Web durchsucht|Anzeige)\s*$/gim, '')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\b(?:www\.)?bundesregierung\.de\b/gi, '')
      .replace(/\s*\+\d+\s*$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const paragraphs = text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    const seen = new Set();
    text = paragraphs.filter((p) => {
      const key = p.replace(/\s+/g, ' ').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).join('\n\n').trim();
    return text;
  }

  function cleanAssistantText(value, prompt = '') {
    // Kept for compatibility with the waiting logic; raw values are normally
    // passed through extractAnswerText before they reach PRIS.
    if (value && typeof value !== 'string') return '';
    return String(value || '').trim();
  }

  function isGenerating() {
    return [...document.querySelectorAll('button')].some((b) =>
      /stop|anhalten|generating|schreibt/i.test((b.getAttribute('aria-label') || '') + b.textContent)
    );
  }

  async function waitForNewAssistantMessage(baselineEls, { timeoutMs = 90000, quietMs = 1800, prompt = '' } = {}) {
    const start = Date.now();
    const baselineSet = new Set(baselineEls);
    const baselineTexts = new Map(baselineEls.map((el) => [el, extractAnswerText(el, prompt)]));
    let candidate = null;
    let lastText = '';
    let lastChangeAt = Date.now();

    while (Date.now() - start < timeoutMs) {
      await sleep(150);
      const current = assistantMessageEls();

      const clean = (el) => extractAnswerText(el, prompt);

      const newEl = current.find((el) => !baselineSet.has(el) && clean(el.textContent));
      if (newEl && !candidate) {
        candidate = newEl;
        log('Neue Assistant-Antwort erkannt.');
      }

      // Falls der Anbieter den letzten Antwort-Block wiederverwendet, nehmen wir
      // einen Block, dessen Text gegenüber dem Ausgangszustand gewachsen ist.
      if (!candidate) {
        const changed = current.find((el) => {
          const now = clean(el.textContent);
          const before = baselineTexts.get(el) || '';
          return now.length > Math.max(10, before.length + 10);
        });
        if (changed) candidate = changed;
      }

      if (candidate) {
        const text = clean(candidate.textContent);
        if (text !== lastText) {
          lastText = text;
          lastChangeAt = Date.now();
        }
        if (text.length > 10 && !isGenerating() && Date.now() - lastChangeAt >= quietMs) {
          return text;
        }
      }
    }

    if (lastText.length > 10) return cleanAssistantText(lastText, prompt);
    throw new Error('Keine neue Antwort erkannt (Timeout).');
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') {
      sendResponse({ ok: false, error: 'Ungültige Nachricht empfangen.' });
      return true;
    }

    switch (message.type) {
      case 'PRIS_BRIDGE_PING': {
        log('Ping empfangen.');
        sendResponse({ ok: true });
        return true;
      }

      case 'PRIS_BRIDGE_RUN': {
        (async () => {
          try {
            log('Prompt erhalten:', message.prompt.slice(0, 60));

            const composer = findComposer();
            if (!composer) throw new Error('Kein Eingabefeld auf dieser Seite gefunden.');
            log('Eingabefeld gefunden:', composer.tagName, composer.getAttribute('contenteditable'));

            const baselineEls = assistantMessageEls();
            log('Baseline-Events (alt):', baselineEls.length);

            setNativeValue(composer, message.prompt);
            await sleep(100);

            const sendBtn = findSendButton(composer);
            if (sendBtn && !sendBtn.disabled) {
              log('Sende-Button gefunden, klicke.');
              sendBtn.click();
            } else {
              log('Kein Sende-Button gefunden, simuliere Enter.');
              composer.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })
              );
            }

            const text = await waitForNewAssistantMessage(baselineEls, { prompt: message.prompt });
            log('Antwort ausgelesen (Länge):', text.length);
            sendResponse({ ok: true, text });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            warn('Fehler:', msg);
            sendResponse({ ok: false, error: msg });
          }
        })();
        return true;
      }

      default:
        sendResponse({ ok: false, error: 'Unbekannter Nachrichtentyp.' });
        return true;
    }
  });

  log('Content-Script bereit auf', location.hostname);
})();
