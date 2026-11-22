import * as http from 'http';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ArenaRoom } from './rooms/ArenaRoom';
import { handleHighscores } from './highscores';

const port = Number(process.env.PORT ?? 2567);

// Ein HTTP-Server für alles: Colyseus beantwortet /matchmake und die WebSockets, der Rest landet hier (Bestenliste).
const httpServer = http.createServer((req, res) => {
  if (handleHighscores(req, res)) return;
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Nicht gefunden');
});

const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define('arena', ArenaRoom);

gameServer.listen(port).then(() => {
  console.log(`🎮 Deathmatch-Server laeuft auf  ws://localhost:${port}  (Bestenliste: http://localhost:${port}/highscores)`);
  console.log('   Im LAN verbinden sich Mitspieler ueber die lokale IP dieses PCs.');
}).catch((err) => {
  console.error('Server konnte nicht starten:', err);
  process.exit(1);
});
