// Wer ist online? Beim Öffnen verbindet sich das Spiel mit der Lobby des eigenen Spielservers (rooms/LobbyRoom.ts).
// Mit Spielnamen bekommen alle anderen „<Name> ist dem Spiel beigetreten“ bzw. „… hat das Spiel verlassen“.
// Die Lobby liefert außerdem „online“, „heute“ und „gesamt“ (Besucherzähler ohne Cookies, server/src/visitors.ts).
// Läuft kein Server (z. B. lokal ohne npm start), bleibt alles still; bei Abbruch neuer Versuch mit wachsender Pause.

export function createPresence({ url, onToast, onStats }) {
  let room = null, name = '', tries = 0, stopped = false, timer = null;

  function stats() {
    const s = room && room.state;
    if (!s || !s.players) return;
    let online = 0;
    s.players.forEach(() => { online++; });
    onStats?.({ online, today: s.today || 0, total: s.total || 0 });
  }

  async function connect() {
    if (stopped || room) return;
    try {
      const { Client } = await import('colyseus.js');
      room = await new Client(url).joinOrCreate('lobby', { name });
      tries = 0;
      room.onMessage('presence', (m) => {
        if (!m || !m.name) return;
        onToast?.(m.t === 'join' ? `${m.name} ist dem Spiel beigetreten` : `${m.name} hat das Spiel verlassen`, m.t);
      });
      room.onStateChange(() => stats());
      room.onLeave(() => { room = null; retry(); });
      stats();
    } catch {
      room = null; retry();
    }
  }
  function retry() {
    if (stopped) return;
    clearTimeout(timer);
    const wait = Math.min(60, 5 * 2 ** Math.min(tries++, 4)) * 1000;   // 5, 10, 20, 40, 60 s …
    timer = setTimeout(connect, wait);
  }

  return {
    /** Verbinden (mit dem gespeicherten Namen, falls es einen gibt). */
    start(initialName = '') { name = initialName; connect(); },
    /** Spielname gesetzt oder geändert: wer bisher ohne Namen online war, wird jetzt angekündigt. */
    setName(n) {
      if (!n || n === name) return;
      name = n;
      if (room) room.send('name', { name });
    },
    stop() { stopped = true; clearTimeout(timer); room?.leave(); room = null; },
  };
}
