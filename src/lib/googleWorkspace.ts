// src/lib/googleWorkspace.ts
// Schlanke Anbindung an Gmail + Google Sheets für die Buchhaltungsfunktion.
// Läuft komplett im Browser (kein eigener Server): OAuth über Google Identity
// Services (GIS), danach reine REST-Aufrufe mit dem Access-Token. Der
// Google-Cloud-OAuth-Client (Client-ID) wird vom Nutzer selbst angelegt und
// hier nur per UI eingegeben + im localStorage gespeichert — analog zu den
// KI-API-Keys in aiProviders.ts.

export const GOOGLE_CLIENT_ID_KEY = 'dna-legal-google-client-id';
export const GOOGLE_SHEET_ID_KEY = 'dna-legal-google-sheet-id';

// Nur Lesezugriff auf Gmail (wir wollen nie schreiben/löschen) + Schreibzugriff
// auf Sheets (um die Rechnungstabelle zu befüllen).
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ');

let gisLoaded: Promise<void> | null = null;
let accessToken: string | null = null;
let tokenExpiresAt = 0;

/** Lädt das Google Identity Services Script einmalig nach. */
function loadGis(): Promise<void> {
  if (gisLoaded) return gisLoaded;
  gisLoaded = new Promise((resolve, reject) => {
    if (document.getElementById('gis-script')) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = 'gis-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Identity Services konnte nicht geladen werden.'));
    document.head.appendChild(script);
  });
  return gisLoaded;
}

/**
 * Holt (bei Bedarf) einen frischen Access-Token per OAuth-Popup. Der Token
 * wird nur im Speicher (nicht localStorage) gehalten und läuft nach ca. 1h ab.
 */
export async function ensureGoogleAccessToken(clientId: string): Promise<string> {
  if (!clientId.trim()) {
    throw new Error('Keine Google Client-ID hinterlegt.');
  }
  if (accessToken && Date.now() < tokenExpiresAt - 30_000) {
    return accessToken;
  }
  await loadGis();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const google = (window as any).google;
  if (!google?.accounts?.oauth2) {
    throw new Error('Google Identity Services nicht verfügbar.');
  }
  return new Promise<string>((resolve, reject) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId.trim(),
      scope: SCOPES,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (response: any) => {
        if (response.error) {
          reject(new Error(`Google-Anmeldung fehlgeschlagen: ${response.error}`));
          return;
        }
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + (response.expires_in ?? 3600) * 1000;
        resolve(response.access_token);
      },
      error_callback: (err: unknown) => {
        reject(err instanceof Error ? err : new Error('Google-Anmeldung abgebrochen.'));
      },
    });
    tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
  });
}

export function isGoogleConnected(): boolean {
  return !!accessToken && Date.now() < tokenExpiresAt;
}

export function disconnectGoogle(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const google = (window as any).google;
  if (accessToken && google?.accounts?.oauth2?.revoke) {
    google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  tokenExpiresAt = 0;
}

interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessageSummary {
  id: string;
  subject: string;
  from: string;
  date: string;
  bodyText: string;
  attachmentNames: string[];
}

/** Sucht Nachrichten-IDs per Gmail-Suchsyntax (q-Parameter). */
export async function gmailSearchMessageIds(token: string, query: string, maxResults = 25): Promise<string[]> {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', String(maxResults));
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Gmail-Suche fehlgeschlagen (${res.status}): ${await safeText(res)}`);
  }
  const data = await res.json();
  return (data.messages ?? []).map((m: { id: string }) => m.id);
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    // decodeURIComponent/escape-Trick für korrektes UTF-8-Decoding
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
  } catch {
    try {
      return atob(base64);
    } catch {
      return '';
    }
  }
}

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').replace(/\s+\n/g, '\n').trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBodyAndAttachments(payload: any): { bodyText: string; attachmentNames: string[] } {
  let plain = '';
  let html = '';
  const attachmentNames: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(part: any) {
    if (!part) return;
    if (part.filename) {
      attachmentNames.push(part.filename);
    }
    const data = part.body?.data;
    if (data && part.mimeType === 'text/plain' && !plain) {
      plain = decodeBase64Url(data);
    } else if (data && part.mimeType === 'text/html' && !html) {
      html = decodeBase64Url(data);
    }
    if (part.parts) {
      part.parts.forEach(walk);
    }
  }
  walk(payload);

  const bodyText = plain || (html ? stripHtml(html) : '');
  return { bodyText, attachmentNames };
}

/** Lädt eine einzelne Nachricht inkl. Header, Textkörper und Anhang-Dateinamen. */
export async function gmailGetMessage(token: string, id: string): Promise<GmailMessageSummary> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Mail ${id} konnte nicht geladen werden (${res.status}): ${await safeText(res)}`);
  }
  const data = await res.json();
  const headers: GmailHeader[] = data.payload?.headers ?? [];
  const getHeader = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
  const { bodyText, attachmentNames } = extractBodyAndAttachments(data.payload);
  return {
    id,
    subject: getHeader('Subject'),
    from: getHeader('From'),
    date: getHeader('Date'),
    bodyText: bodyText.slice(0, 6000),
    attachmentNames,
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

/** Erstellt eine neue Google-Sheets-Tabelle mit Kopfzeile und gibt die Spreadsheet-ID zurück. */
export async function sheetsCreateSpreadsheet(token: string, title: string, headerRow: string[]): Promise<string> {
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties: { title } }),
  });
  if (!createRes.ok) {
    throw new Error(`Sheet konnte nicht erstellt werden (${createRes.status}): ${await safeText(createRes)}`);
  }
  const created = await createRes.json();
  const spreadsheetId = created.spreadsheetId as string;
  await sheetsAppendRows(token, spreadsheetId, [headerRow]);
  return spreadsheetId;
}

/** Hängt Zeilen an das Sheet "Tabelle1"/"Sheet1" an (Google legt beide Namen automatisch an). */
export async function sheetsAppendRows(token: string, spreadsheetId: string, rows: string[][]): Promise<void> {
  const range = 'A1';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: rows }),
  });
  if (!res.ok) {
    throw new Error(`Schreiben ins Sheet fehlgeschlagen (${res.status}): ${await safeText(res)}`);
  }
}

export function sheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}
