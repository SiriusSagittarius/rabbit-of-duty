import { Room, Client } from 'colyseus';
import { Schema, MapSchema, type } from '@colyseus/schema';
import type { IncomingMessage } from 'http';
import { countVisit, visitorsToday, visitorsTotal } from '../visitors';

export class LobbyState extends Schema {
  /** Wer gerade online ist: Sitzung → Spielname ('' = noch ohne Namen). */
  @type({ map: 'string' }) players = new MapSchema<string>();
  @type('number') today = 0;
  @type('number') total = 0;
}

const clean = (v: unknown) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);

/**
 * Lobby: Jeder, der das Spiel geöffnet hat, ist hier (auch ohne Namen, dann zählt er nur als „online“).
 * Mit Namen bekommen alle anderen „<Name> ist dem Spiel beigetreten“ bzw. „… hat das Spiel verlassen“.
 * Beim Beitritt zählt der Besucherzähler (visitors.ts, ohne Cookies).
 */
export class LobbyRoom extends Room<LobbyState> {
  maxClients = 1000;
  private lastName = new Map<string, number>();

  onCreate(): void {
    this.setState(new LobbyState());
    this.syncStats();
    this.clock.setInterval(() => this.syncStats(), 60_000);   // neuer Tag → „heute“ springt auf 0

    // Name gesetzt oder geändert (z. B. erster Flug): wer vorher namenlos war, wird jetzt angekündigt
    this.onMessage('name', (client, d: { name?: string }) => {
      const now = Date.now();
      if (now - (this.lastName.get(client.sessionId) || 0) < 3000) return;   // nicht fluten
      this.lastName.set(client.sessionId, now);
      const old = this.state.players.get(client.sessionId) ?? '';
      const name = clean(d?.name);
      if (!this.state.players.has(client.sessionId) || name === old) return;
      this.state.players.set(client.sessionId, name);
      if (!old && name) this.broadcast('presence', { t: 'join', name }, { except: client });
    });
  }

  onAuth(_client: Client, _options: unknown, request?: IncomingMessage): boolean {
    const ip = String(request?.headers['x-real-ip'] || request?.socket?.remoteAddress || '');
    countVisit(ip, String(request?.headers['user-agent'] || ''));
    this.syncStats();
    return true;
  }

  onJoin(client: Client, options?: { name?: string }): void {
    const name = clean(options?.name);
    this.state.players.set(client.sessionId, name);
    if (name) this.broadcast('presence', { t: 'join', name }, { except: client });
  }

  onLeave(client: Client): void {
    const name = this.state.players.get(client.sessionId) ?? '';
    this.state.players.delete(client.sessionId);
    this.lastName.delete(client.sessionId);
    if (name) this.broadcast('presence', { t: 'leave', name });
  }

  private syncStats() {
    this.state.today = visitorsToday();
    this.state.total = visitorsTotal();
  }
}
