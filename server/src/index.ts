import * as http from 'http';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ArenaRoom } from './rooms/ArenaRoom';
import { ExploreRoom } from './rooms/ExploreRoom';
import { LobbyRoom } from './rooms/LobbyRoom';
import { handleHighscores } from './highscores';

const port = Number(process.env.PORT ?? 2567);
const host = process.env.HOST || undefined;   // z. B. HOST=127.0.0.1 für Tests nur auf diesem Rechner

// Ein HTTP-Server für alles: Colyseus beantwortet /matchmake und die WebSockets, der Rest landet hier (Bestenliste).
const httpServer = http.createServer((req, res) => {
  if (handleHighscores(req, res)) return;
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Nicht gefunden');
});

const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define('arena', ArenaRoom);
gameServer.define('explore', ExploreRoom).filterBy(['map']);   // Erkundungsflug im Team, ein Raum je Karte
gameServer.define('lobby', LobbyRoom);                         // wer online ist, Beitritts-Meldungen, Besucherzähler

gameServer.listen(port, host).then(() => {
  console.log(`🎮 Spielserver laeuft auf  ws://${host || 'localhost'}:${port}  (Bestenliste: http://${host || 'localhost'}:${port}/highscores)`);
  console.log('   Im LAN verbinden sich Mitspieler ueber die lokale IP dieses PCs.');
}).catch((err) => {
  console.error('Server konnte nicht starten:', err);
  process.exit(1);
});
