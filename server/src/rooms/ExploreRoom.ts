import { Room, Client } from 'colyseus';
import { Schema, MapSchema, type } from '@colyseus/schema';

/**
 * Ein Flieger im Erkundungsflug: Name und Position (Augenhöhe y, Blickrichtung ry), dazu für die Figur der anderen:
 * aktuelle Animation, Lenkeinschlag (-1 … 1, positiv = links), Schild an/aus und Schildenergie (0 … 1).
 */
export class Flyer extends Schema {
  @type('string') name = 'Flieger';
  /** Spielfigur: 'soldat' oder 'hexe' (Modell und Maße legt jeder Client selbst fest). */
  @type('string') char = 'soldat';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
  @type('number') ry = 0;
  @type('string') anim = 'Ride';
  @type('number') lean = 0;
  @type('boolean') sh = false;
  @type('number') she = 1;
  /** Minigun: Abzug gedrückt (die anderen lassen die Läufe drehen und sehen das Mündungsfeuer), Blick auf/ab. */
  @type('boolean') mg = false;
  @type('number') pt = 0;
}

const ANIMS = new Set(['Ride', 'Hover', 'LeanLeft', 'LeanRight', 'HoldTight', 'Roll', 'Boost', 'Trick', 'Spit',
  'FidgetStretch', 'FidgetYawn', 'FidgetTap', 'Wave', 'Handstand', 'LieDown', 'Dance']);
const MOVES: Record<string, string[]> = { looping: ['fwd', 'back'], roll: ['left', 'right'], spiral: ['left', 'right', 'fwd', 'back'], trick: [''],
  wave: [''], handstand: [''], liedown: [''], dance: [''] };
const num = (v: unknown, lim = 1e6) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);
const vec = (v: unknown) => (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))
  ? (v as number[]).map((n) => Math.round(Math.max(-1e5, Math.min(1e5, n)) * 100) / 100) : null);

export class ExploreState extends Schema {
  @type({ map: Flyer }) players = new MapSchema<Flyer>();
  /** Entdeckte Orte des Teams: Ort-Kennung → Name des Finders. Gilt für alle im Raum. */
  @type({ map: 'string' }) found = new MapSchema<string>();
}

/**
 * Erkundungsflug im Team (ohne Gegner): Bis zu 8 Spieler fliegen zusammen über die Karte, sehen sich gegenseitig
 * und teilen ihre Funde. Die Position meldet jeder Client selbst (~20x/s).
 * Ereignisse ('fx': Manöver, Energieball, Treffer) reicht der Server nur geprüft an die anderen weiter. Ein Treffer
 * bremst den Getroffenen kurz aus oder trifft seinen Schild, Lebenspunkte gibt es nicht.
 * Ein Raum gilt für eine Karte; leert er sich, schließt Colyseus ihn und die Funde beginnen von vorn.
 */
export class ExploreRoom extends Room<ExploreState> {
  maxClients = 8;
  /** Ereignisse je Spieler begrenzen (Eimer mit 16 Marken, 12 pro Sekunde nachgefüllt; Minigun meldet gebündelt). */
  private fxBucket = new Map<string, { n: number; t: number }>();

  onCreate(options?: { map?: string }): void {
    this.setState(new ExploreState());
    this.setMetadata({ map: String(options?.map || 'much').slice(0, 24) });

    this.onMessage('move', (client, d: Partial<Flyer>) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      for (const k of ['x', 'y', 'z', 'ry'] as const) {
        const v = d?.[k];
        if (typeof v === 'number' && Number.isFinite(v)) p[k] = v;
      }
      if (typeof d?.anim === 'string' && ANIMS.has(d.anim)) p.anim = d.anim;
      if (typeof d?.lean === 'number' && Number.isFinite(d.lean)) p.lean = Math.max(-1, Math.min(1, d.lean));
      if (typeof d?.sh === 'boolean') p.sh = d.sh;
      if (typeof d?.she === 'number' && Number.isFinite(d.she)) p.she = Math.max(0, Math.min(1, d.she));
      if (typeof d?.mg === 'boolean') p.mg = d.mg;
      if (typeof d?.pt === 'number' && Number.isFinite(d.pt)) p.pt = Math.max(-1.6, Math.min(1.6, d.pt));
    });

    // Ereignisse an die anderen weiterreichen (nur bekannte Felder, Zahlen begrenzt)
    this.onMessage('fx', (client, d: any) => {
      if (!this.state.players.has(client.sessionId) || !d || typeof d.type !== 'string') return;
      const now = Date.now(), b = this.fxBucket.get(client.sessionId) || { n: 16, t: now };
      b.n = Math.min(16, b.n + ((now - b.t) / 1000) * 12); b.t = now;
      if (b.n < 1) return;
      b.n -= 1; this.fxBucket.set(client.sessionId, b);
      const from = client.sessionId;
      let out: Record<string, unknown> | null = null;
      if (d.type === 'move') {
        const dirs = MOVES[String(d.move)], dir = String(d.dir ?? '');
        if (dirs && dirs.includes(dir)) out = { type: 'move', move: String(d.move), dir, startTime: num(d.startTime, 1e15), pitch: num(d.pitch, 2) };
      } else if (d.type === 'spit') {
        const pos = vec(d.pos), dir = vec(d.dir);
        if (pos && dir) out = { type: 'spit', id: Math.trunc(num(d.id)), pos, dir };
      } else if (d.type === 'hit' || d.type === 'shieldHit') {
        const point = vec(d.point), target = String(d.target ?? '').slice(0, 32);
        if (point && this.state.players.has(target)) {
          out = { type: d.type, target, point, ball: Math.trunc(num(d.ball)) };
          if (typeof d.dmg === 'number' && Number.isFinite(d.dmg)) out.dmg = Math.max(0, Math.min(1, d.dmg));   // Schildtreffer
          if (d.w === 'mg' || d.w === 'ball') out.w = d.w;                                                        // Minigun oder Energieball
        }
      }
      if (out) this.broadcast('fx', { ...out, from }, { except: client });
    });

    // Ort entdeckt: der erste Finder zählt, alle im Raum bekommen ihn über den Zustand
    this.onMessage('found', (client, d: { id?: string }) => {
      const p = this.state.players.get(client.sessionId);
      const id = typeof d?.id === 'string' ? d.id.slice(0, 32) : '';
      if (!p || !id || this.state.found.has(id) || this.state.found.size >= 200) return;
      this.state.found.set(id, p.name);
    });
  }

  onJoin(client: Client, options?: { name?: string; char?: string }): void {
    const p = new Flyer();
    p.char = options?.char === 'hexe' ? 'hexe' : 'soldat';
    p.name = String(options?.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || `Flieger-${this.clients.length}`;
    this.state.players.set(client.sessionId, p);
    console.log(`[explore +] ${p.name} (${client.sessionId}) – Spieler: ${this.state.players.size}`);
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.fxBucket.delete(client.sessionId);
    console.log(`[explore -] ${client.sessionId} – Spieler: ${this.state.players.size}`);
  }
}
