// Bestenliste: Anbindung an den Spielserver (server/src/highscores.ts).
// Online (HTTPS): https://<domain>/api/highscores (nginx reicht weiter). Lokal: http://<host>:2567/highscores.
// ?server=ws://host:port (wie beim Mehrspieler) zeigt auf einen anderen Server.

function base() {
  const o = new URLSearchParams(location.search).get('server');
  if (o) return o.replace(/^ws/, 'http').replace(/\/+$/, '');
  if (location.protocol === 'https:') return location.origin + '/api';
  return `http://${location.hostname || 'localhost'}:2567`;
}

async function call(path, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(base() + path, { ...opts, signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/** Beste Einträge einer Liste (Karte × Modus). */
export function fetchTop(map, mode, limit = 10) {
  return call(`/highscores?map=${encodeURIComponent(map)}&mode=${encodeURIComponent(mode)}&limit=${limit}`);
}

/** Eintragen: { name, score, kills, wave, map, mode } → { ok, rank, top } */
export function submitScore(entry) {
  return call('/highscores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
}

/** Liste in ein <ol> schreiben. Namen nur als Text (nie als HTML). `mark` = Platz, der hervorgehoben wird. */
export function renderTop(ol, top, mark = null) {
  ol.replaceChildren(...top.map((e, i) => {
    const li = document.createElement('li');
    if (mark === i + 1) li.className = 'me';
    const rank = document.createElement('span'); rank.className = 'r'; rank.textContent = (i + 1) + '.';
    const name = document.createElement('span'); name.className = 'n'; name.textContent = e.name;
    const pts = document.createElement('span'); pts.className = 's'; pts.textContent = e.score.toLocaleString('de-DE');
    const info = document.createElement('span'); info.className = 'i';
    info.textContent = [e.wave ? 'Welle ' + e.wave : '', e.kills ? e.kills + ' Kills' : ''].filter(Boolean).join(' · ');
    li.append(rank, name, pts, info);
    return li;
  }));
}
