// Bestenliste: eine kleine JSON-Datei, erreichbar über denselben HTTP-Server wie Colyseus.
//
//   GET  /highscores?map=much&mode=zombies[&limit=10]  → { map, mode, top: [{ name, score, kills, wave, date }] }
//   POST /highscores  { name, score, kills, wave, map, mode, idToken }  → { ok, rank, top }
//
// Hinter nginx: https://<domain>/api/highscores (siehe README). Lokal: http://localhost:2567/highscores.
// Eintragen nur mit Google-Anmeldung (idToken, geprüft in google-auth.ts). In der Liste steht der selbst gewählte
// Spielname; vom Konto bleibt nur eine pseudonyme Kennung (uid), damit jedes Konto je Liste nur einmal vorkommt
// (sein bestes Ergebnis). HS_NO_AUTH=1 erlaubt Einträge ohne Anmeldung (nur zum Testen).
// Grenzen: Namen bis 16 Zeichen, plausible Zahlen, pro Adresse höchstens ein Eintrag alle 10 Sekunden.
import * as fs from 'fs';
import * as path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { verifyGoogleIdToken } from './google-auth';

const NO_AUTH = process.env.HS_NO_AUTH === '1';

const MAPS = new Set(['much', 'sunset', 'atrium', 'osm', 'warehouse', 'desert', 'night']);
const MODES = new Set(['classic', 'zombies', 'explore']);   // explore: Erkundungsflug, wave = entdeckte Orte
const KEEP = 100;                    // Einträge je Liste (Karte × Modus)
const FILE = process.env.HS_FILE || path.join(__dirname, '..', 'data', 'highscores.json');

type Entry = { name: string; score: number; kills: number; wave: number; date: string; uid?: string };
let boards: Record<string, Entry[]> = {};
try { boards = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { boards = {}; }

let saving: Promise<void> = Promise.resolve();
function save() {
  saving = saving.then(async () => {
    await fs.promises.mkdir(path.dirname(FILE), { recursive: true });
    const tmp = FILE + '.tmp';
    await fs.promises.writeFile(tmp, JSON.stringify(boards));
    await fs.promises.rename(tmp, FILE);                    // erst komplett schreiben, dann tauschen
  }).catch((err) => console.error('[Bestenliste] Speichern fehlgeschlagen:', err));
}

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};
function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, HEADERS);
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

const int = (v: unknown, max: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
};
function cleanName(v: unknown) {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f<>"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return s || 'Flieger';
}
/** Beste Einträge ohne die Konto-Kennung (die bleibt auf dem Server). */
const top = (key: string, limit: number) => (boards[key] || []).slice(0, limit).map(({ uid: _uid, ...e }) => e);

const lastPost = new Map<string, number>();      // Adresse → Zeitpunkt des letzten Eintrags
function tooSoon(ip: string) {
  const now = Date.now();
  if (lastPost.size > 500) for (const [k, t] of lastPost) if (now - t > 60_000) lastPost.delete(k);
  const t = lastPost.get(ip);
  if (t && now - t < 10_000) return true;
  lastPost.set(ip, now);
  return false;
}

/** Beantwortet Anfragen an /highscores. Gibt false zurück, wenn die Anfrage nicht hierher gehört. */
export function handleHighscores(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname !== '/highscores') return false;
  if (req.method === 'OPTIONS') { send(res, 204); return true; }

  if (req.method === 'GET') {
    const map = url.searchParams.get('map') || '', mode = url.searchParams.get('mode') || '';
    if (!MAPS.has(map) || !MODES.has(mode)) { send(res, 400, { error: 'unbekannte Karte oder Modus' }); return true; }
    const limit = Math.max(1, Math.min(50, int(url.searchParams.get('limit'), 50) || 10));
    send(res, 200, { map, mode, top: top(`${map}|${mode}`, limit) });
    return true;
  }

  if (req.method === 'POST') {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; if (raw.length > 8192) req.destroy(); });   // ID-Token ≈ 1,2 kB
    req.on('end', async () => {
      let b: Record<string, unknown>;
      try { b = JSON.parse(raw); } catch { send(res, 400, { error: 'kein JSON' }); return; }
      const map = String(b.map), mode = String(b.mode);
      const score = int(b.score, 5_000_000);
      if (!MAPS.has(map) || !MODES.has(mode) || score <= 0) { send(res, 400, { error: 'ungültiger Eintrag' }); return; }
      const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '?');
      if (tooSoon(ip)) { send(res, 429, { error: 'zu schnell' }); return; }
      let uid: string | undefined;
      if (!NO_AUTH) {
        try { ({ uid } = await verifyGoogleIdToken(String(b.idToken || ''))); }
        catch (err) { send(res, 401, { error: 'anmeldung', detail: (err as Error).message }); return; }
      }
      const key = `${map}|${mode}`;
      const entry: Entry = { name: cleanName(b.name), score, kills: int(b.kills, 100_000), wave: int(b.wave, 999), date: new Date().toISOString().slice(0, 10), uid };
      const list = (boards[key] ||= []);
      const old = uid ? list.findIndex((e) => e.uid === uid) : -1;
      if (old >= 0 && list[old].score >= score) {          // schon besser eingetragen: alten Eintrag behalten
        list[old].name = entry.name;
        save();
        send(res, 200, { ok: true, rank: old + 1, kept: true, top: top(key, 10) });
        return;
      }
      if (old >= 0) list.splice(old, 1);
      list.push(entry);
      list.sort((a, c) => c.score - a.score);               // gleiche Punkte: wer zuerst da war, bleibt vorne
      list.length = Math.min(list.length, KEEP);
      const at = list.indexOf(entry);
      save();
      send(res, 200, { ok: true, rank: at >= 0 ? at + 1 : null, top: top(key, 10) });
    });
    return true;
  }

  send(res, 405, { error: 'nur GET und POST' });
  return true;
}
