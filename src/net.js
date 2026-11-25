// Netzwerk-Schicht (Colyseus) — portiert aus dem 3d-shooter (network.service.ts).
// Client-Lib kommt browser-fertig über die Importmap ('colyseus.js' → vendor/colyseus/colyseus.esm.js, ESM-Build von esm.sh),
// DYNAMISCH erst beim Verbinden geladen → Solo bleibt unabhängig von der Netz-Lib.
// Server: derselbe ArenaRoom (server/) — 1-gegen-1-Deathmatch auf Port 2567.

export class Net {
  constructor(){
    this.client = null; this.room = null; this.roomName = '';
    this.sessionId = ''; this.connected = false;
    this._h = {};                 // Event-Handler
  }
  on(ev, fn){ this._h[ev] = fn; return this; }
  _emit(ev, ...a){ this._h[ev] && this._h[ev](...a); }

  /** Server-URL: ?server=… überschreibt, sonst gleicher Host auf Port 2567 (LAN + gehostet). */
  defaultUrl(){
    const o = new URLSearchParams(location.search).get('server');
    if(o) return o;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.hostname || 'localhost'}:2567`;
  }

  /** room: 'arena' (Deathmatch) oder 'explore' (Erkundungsflug im Team); opts gehen an den Raum (z. B. map). */
  async connect(url, name, room = 'arena', opts = {}){
    const { Client } = await import('colyseus.js');   // dynamisch (Importmap → vendor/colyseus)
    this.client = new Client(url);
    this.room = await this.client.joinOrCreate(room, { ...opts, name });
    this.roomName = room;
    this.sessionId = this.room.sessionId;
    this.connected = true;

    this.room.onMessage('shot',   d => this._emit('shot', d));
    this.room.onMessage('killed', d => this._emit('killed', d));
    // Erkundungsflug: Ereignisse der Mitflieger (Manöver, Energieball, Treffer), siehe ExploreRoom 'fx'
    this.room.onMessage('fx',     d => this._emit('fx', d));

    const players = this.room.state && this.room.state.players;
    players && players.onAdd && players.onAdd((p, id) => { if(id !== this.sessionId) this._emit('join', id, p); });
    players && players.onRemove && players.onRemove((_p, id) => { if(id !== this.sessionId) this._emit('leave', id); });

    // Erkundungsflug: entdeckte Orte des Teams (Ort → Finder), auch die schon vor dem Beitritt gefundenen
    const found = this.room.state && this.room.state.found;
    found && found.onAdd && found.onAdd((by, id) => this._emit('found', id, by));

    this.room.onLeave(() => { this.connected = false; this._emit('left'); });
    this.room.onError((code, msg) => console.error('[net] room error', code, msg));
  }

  get players(){ return this.room && this.room.state ? this.room.state.players : undefined; }
  getPlayer(id){ return this.players ? this.players.get(id) : undefined; }

  /** extra (Erkundungsflug): anim, lean, sh (Schild an), she (Schildenergie) – geht mit in den Zustand. */
  sendMove(x,y,z,ry,moving,extra){ this.room && this.room.send('move', { x,y,z,ry,moving, ...extra }); }
  /** Ereignis an die anderen im Raum: { type: 'move' | 'spit' | 'shieldHit' | 'hit', … } */
  sendFx(d){ this.room && this.room.send('fx', d); }
  sendShoot(x,y,z,dx,dy,dz){ this.room && this.room.send('shoot', { x,y,z,dx,dy,dz }); }
  sendHit(target, damage){ this.room && this.room.send('hit', { target, damage }); }
  sendFound(id){ this.room && this.room.send('found', { id }); }

  disconnect(){ this.room && this.room.leave(); this.room = null; this.connected = false; this.sessionId = ''; }
}
