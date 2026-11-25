// Besucherzähler ohne Cookies: Wer das Spiel öffnet, verbindet sich mit der Lobby (rooms/LobbyRoom.ts); dabei
// zählt der Server Besucher je Tag. Damit niemand an einem Tag doppelt zählt, merkt er sich einen Hash aus IP-Adresse,
// Browserkennung und einem täglich neu gewürfelten Zufallswert – nur im Arbeitsspeicher, um Mitternacht (Berlin) weg.
// Gespeichert werden nur die Zahlen: data/stats.json { days: { 'JJJJ-MM-TT': n }, total }.
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const FILE = process.env.STATS_FILE || path.join(__dirname, '..', 'data', 'stats.json');
const KEEP_DAYS = 400;

type Stats = { days: Record<string, number>; total: number };
let data: Stats = { days: {}, total: 0 };
try { data = { days: {}, total: 0, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* erster Start */ }

const berlinDay = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });   // JJJJ-MM-TT
let day = berlinDay(), salt = crypto.randomBytes(16), seen = new Set<string>();

function roll() {
  const d = berlinDay();
  if (d === day) return;
  day = d; salt = crypto.randomBytes(16); seen = new Set();
  const keys = Object.keys(data.days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete data.days[k];
}

let timer: NodeJS.Timeout | null = null;
function save() {
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    try {
      await fs.promises.mkdir(path.dirname(FILE), { recursive: true });
      await fs.promises.writeFile(FILE + '.tmp', JSON.stringify(data));
      await fs.promises.rename(FILE + '.tmp', FILE);
    } catch (err) { console.error('[Besucher] Speichern fehlgeschlagen:', err); }
  }, 5000);
}

// Beim Beenden (z. B. Neustart nach dem Hochladen; Colyseus ruft dann process.exit) die Zahlen sofort schreiben,
// damit Besuche aus den letzten 5 Sekunden nicht verloren gehen. Eigene .tmp-Datei, falls gerade save() schreibt.
process.on('exit', () => {
  if (timer) clearTimeout(timer);
  try {
    fs.writeFileSync(FILE + '.exit.tmp', JSON.stringify(data));
    fs.renameSync(FILE + '.exit.tmp', FILE);
  } catch { /* beim Beenden nichts mehr zu machen */ }
});

/** Einen Besuch zählen (einmal je Besucher und Tag). */
export function countVisit(ip: string, ua: string) {
  roll();
  const h = crypto.createHash('sha256').update(salt).update(ip).update('|').update(ua).digest('base64url').slice(0, 16);
  if (seen.has(h)) return;
  seen.add(h);
  data.days[day] = (data.days[day] || 0) + 1;
  data.total += 1;
  save();
}

export const visitorsToday = () => { roll(); return data.days[day] || 0; };
export const visitorsTotal = () => data.total;
