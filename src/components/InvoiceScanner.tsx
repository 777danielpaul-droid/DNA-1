import React, { useState } from 'react';
import '../styles/ModelWindow.css';
import '../styles/InvoiceScanner.css';
import PanelCircuitGlow from './PanelCircuitGlow';
import { PROVIDERS, PROVIDER_ORDER, sendChatMessage, type ProviderId } from '../lib/aiProviders';
import {
  GOOGLE_CLIENT_ID_KEY,
  GOOGLE_SHEET_ID_KEY,
  ensureGoogleAccessToken,
  gmailGetMessage,
  gmailSearchMessageIds,
  sheetsAppendRows,
  sheetsCreateSpreadsheet,
  sheetUrl,
  type GmailMessageSummary,
} from '../lib/googleWorkspace';

interface InvoiceScannerProps {
  open: boolean;
  onClose: () => void;
}

interface InvoiceRow {
  messageId: string;
  include: boolean;
  isInvoice: boolean;
  rechnungsnummer: string;
  datum: string;
  name: string;
  betrag: string;
  waehrung: string;
  betreff: string;
}

const HEADER_ROW = ['Rechnungsnummer', 'Datum', 'Name/Firma', 'Betrag', 'Währung', 'Betreff', 'Gmail-ID'];

function loadCredential(provider: ProviderId): string {
  return localStorage.getItem(PROVIDERS[provider].keyStorageKey) || '';
}
function loadModel(provider: ProviderId): string {
  return localStorage.getItem(PROVIDERS[provider].modelStorageKey) || PROVIDERS[provider].defaultModel;
}

const EXTRACTION_PROMPT =
  'Du bekommst Betreff, Absender und Text einer E-Mail. Prüfe, ob es sich um eine Rechnung, ' +
  'Quittung oder einen Zahlungsbeleg handelt. Antworte AUSSCHLIESSLICH mit einem JSON-Objekt ' +
  '(keine Erklärung, keine Markdown-Codeblöcke), exakt in diesem Format: ' +
  '{"istRechnung": true|false, "rechnungsnummer": "string oder leer", "datum": "TT.MM.JJJJ oder leer", ' +
  '"name": "Firma/Absender oder leer", "betrag": "Zahl als string, z.B. 129.90, oder leer", ' +
  '"waehrung": "z.B. EUR, USD, oder leer"}. Wenn es keine Rechnung ist, setze istRechnung auf false ' +
  'und lasse die übrigen Felder leer.';

function parseExtraction(raw: string): { istRechnung: boolean; rechnungsnummer: string; datum: string; name: string; betrag: string; waehrung: string } {
  const cleaned = raw.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      istRechnung: !!parsed.istRechnung,
      rechnungsnummer: String(parsed.rechnungsnummer ?? ''),
      datum: String(parsed.datum ?? ''),
      name: String(parsed.name ?? ''),
      betrag: String(parsed.betrag ?? ''),
      waehrung: String(parsed.waehrung ?? ''),
    };
  } catch {
    return { istRechnung: false, rechnungsnummer: '', datum: '', name: '', betrag: '', waehrung: '' };
  }
}

export default function InvoiceScanner({ open, onClose }: InvoiceScannerProps) {
  const [clientId, setClientId] = useState(() => localStorage.getItem(GOOGLE_CLIENT_ID_KEY) || '');
  const [sheetId, setSheetId] = useState(() => localStorage.getItem(GOOGLE_SHEET_ID_KEY) || '');
  const [connected, setConnected] = useState(false);
  const [keywords, setKeywords] = useState('rechnung OR invoice OR beleg OR quittung');
  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const saveClientId = (value: string) => {
    setClientId(value);
    localStorage.setItem(GOOGLE_CLIENT_ID_KEY, value);
  };
  const saveSheetId = (value: string) => {
    setSheetId(value);
    localStorage.setItem(GOOGLE_SHEET_ID_KEY, value);
  };

  async function handleConnect() {
    setError('');
    setBusy(true);
    try {
      await ensureGoogleAccessToken(clientId);
      setConnected(true);
      setStatus('Mit Google verbunden.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verbindung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSheet() {
    setError('');
    setBusy(true);
    try {
      const token = await ensureGoogleAccessToken(clientId);
      setConnected(true);
      const id = await sheetsCreateSpreadsheet(token, 'PRIS Buchhaltung', HEADER_ROW);
      saveSheetId(id);
      setStatus('Neues Sheet erstellt.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sheet konnte nicht erstellt werden.');
    } finally {
      setBusy(false);
    }
  }

  async function handleScan() {
    setError('');
    setRows([]);
    setBusy(true);
    const credential = loadCredential(provider);
    const model = loadModel(provider);
    try {
      const token = await ensureGoogleAccessToken(clientId);
      setConnected(true);
      setStatus('Durchsuche Gmail…');
      const ids = await gmailSearchMessageIds(token, keywords.trim() || 'rechnung OR invoice', 25);
      if (ids.length === 0) {
        setStatus('Keine passenden E-Mails gefunden.');
        setBusy(false);
        return;
      }
      const found: InvoiceRow[] = [];
      for (let i = 0; i < ids.length; i++) {
        setStatus(`Verarbeite Mail ${i + 1} von ${ids.length}…`);
        let msg: GmailMessageSummary;
        try {
          msg = await gmailGetMessage(token, ids[i]);
        } catch (e) {
          console.error(e);
          continue;
        }
        const messageText =
          `Betreff: ${msg.subject}\nVon: ${msg.from}\nDatum: ${msg.date}\n` +
          `Anhänge: ${msg.attachmentNames.join(', ') || 'keine'}\n\n${msg.bodyText}`;
        try {
          const raw = await sendChatMessage(provider, credential, model, EXTRACTION_PROMPT, [
            { role: 'user', text: messageText },
          ]);
          const extracted = parseExtraction(raw);
          if (extracted.istRechnung) {
            found.push({
              messageId: msg.id,
              include: true,
              isInvoice: true,
              rechnungsnummer: extracted.rechnungsnummer,
              datum: extracted.datum,
              name: extracted.name,
              betrag: extracted.betrag,
              waehrung: extracted.waehrung,
              betreff: msg.subject,
            });
            setRows([...found]);
          }
        } catch (e) {
          console.error('Extraktion fehlgeschlagen für', msg.id, e);
        }
      }
      setStatus(`Fertig — ${found.length} Rechnung(en) gefunden von ${ids.length} durchsuchten Mails.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suche fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function handleTransfer() {
    setError('');
    setBusy(true);
    try {
      const token = await ensureGoogleAccessToken(clientId);
      let targetSheetId = sheetId;
      if (!targetSheetId) {
        targetSheetId = await sheetsCreateSpreadsheet(token, 'PRIS Buchhaltung', HEADER_ROW);
        saveSheetId(targetSheetId);
      }
      const selected = rows.filter((r) => r.include);
      const values = selected.map((r) => [r.rechnungsnummer, r.datum, r.name, r.betrag, r.waehrung, r.betreff, r.messageId]);
      await sheetsAppendRows(token, targetSheetId, values);
      setStatus(`${selected.length} Rechnung(en) ins Sheet übertragen.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Übertragung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  function toggleRow(messageId: string) {
    setRows((prev) => prev.map((r) => (r.messageId === messageId ? { ...r, include: !r.include } : r)));
  }

  return (
    <div className="model-window-overlay" data-testid="invoice-scanner">
      <div className="model-window-panel invoice-scanner-panel">
        <PanelCircuitGlow />
        <div className="model-window-header">
          <span className="model-window-title">BUCHHALTUNG</span>
          <button type="button" className="model-window-close" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>

        <div className="model-window-body invoice-scanner-body">
          <div className="invoice-scanner-section">
            <span className="invoice-scanner-label">Google Cloud OAuth Client-ID</span>
            <input
              type="text"
              className="invoice-scanner-input"
              placeholder="xxxxxxxx.apps.googleusercontent.com"
              value={clientId}
              onChange={(e) => saveClientId(e.target.value)}
            />
            <div className="invoice-scanner-row">
              <button type="button" className="invoice-scanner-btn" onClick={handleConnect} disabled={busy || !clientId}>
                {connected ? '✓ Verbunden' : 'Mit Google verbinden'}
              </button>
            </div>
          </div>

          <div className="invoice-scanner-section">
            <span className="invoice-scanner-label">Ziel-Sheet</span>
            <input
              type="text"
              className="invoice-scanner-input"
              placeholder="Spreadsheet-ID (leer lassen für automatische Erstellung)"
              value={sheetId}
              onChange={(e) => saveSheetId(e.target.value)}
            />
            <div className="invoice-scanner-row">
              <button type="button" className="invoice-scanner-btn" onClick={handleCreateSheet} disabled={busy || !clientId}>
                Neues Sheet erstellen
              </button>
              {sheetId && (
                <a href={sheetUrl(sheetId)} target="_blank" rel="noreferrer" className="invoice-scanner-link">
                  Sheet öffnen ↗
                </a>
              )}
            </div>
          </div>

          <div className="invoice-scanner-section">
            <span className="invoice-scanner-label">Schlagwörter / Themen (Gmail-Suche, mit OR verknüpfbar)</span>
            <input
              type="text"
              className="invoice-scanner-input"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
            <div className="invoice-scanner-row">
              <select
                className="invoice-scanner-select"
                value={provider}
                onChange={(e) => setProvider(e.target.value as ProviderId)}
              >
                {PROVIDER_ORDER.map((p) => (
                  <option key={p} value={p}>{PROVIDERS[p].label}</option>
                ))}
              </select>
              <button type="button" className="invoice-scanner-btn" onClick={handleScan} disabled={busy || !clientId}>
                {busy ? 'Läuft…' : 'Mails durchsuchen'}
              </button>
            </div>
          </div>

          {status && <div className="invoice-scanner-status">{status}</div>}
          {error && <div className="invoice-scanner-error">{error}</div>}

          {rows.length > 0 && (
            <div className="invoice-scanner-section">
              <span className="invoice-scanner-label">Gefundene Rechnungen ({rows.length})</span>
              <div className="invoice-scanner-table-wrap">
                <table className="invoice-scanner-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Rechnungsnr.</th>
                      <th>Datum</th>
                      <th>Name</th>
                      <th>Betrag</th>
                      <th>Betreff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.messageId}>
                        <td><input type="checkbox" checked={r.include} onChange={() => toggleRow(r.messageId)} /></td>
                        <td>{r.rechnungsnummer || '—'}</td>
                        <td>{r.datum || '—'}</td>
                        <td>{r.name || '—'}</td>
                        <td>{r.betrag ? `${r.betrag} ${r.waehrung}` : '—'}</td>
                        <td className="invoice-scanner-subject" title={r.betreff}>{r.betreff}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="invoice-scanner-row">
                <button type="button" className="invoice-scanner-btn primary" onClick={handleTransfer} disabled={busy}>
                  In Google Sheet übertragen
                </button>
              </div>
            </div>
          )}

          <p className="invoice-scanner-hint">
            Hinweis: Aktuell werden E-Mail-Text und Betreff ausgewertet, PDF-Anhänge werden noch
            nicht inhaltlich gelesen (nur der Dateiname wird berücksichtigt). Pro Durchlauf werden
            max. 25 Mails geprüft.
          </p>
        </div>
      </div>
    </div>
  );
}
