// Netzwerk-Schicht (Colyseus) — portiert aus dem 3d-shooter (network.service.ts).
// Client-Lib kommt browser-fertig (Buffer/ws polyfillt) über die Importmap ('colyseus.js'),
// DYNAMISCH erst beim Verbinden geladen → Solo bleibt unabhängig von der Netz-Lib.
// Server: derselbe ArenaRoom (server/) — 1-gegen-1-Deathmatch auf Port 2567.

export class Net {
  constructor(){
    this.client = null; this.room = null;
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

  async connect(url, name){
    const { Client } = await import('colyseus.js');   // dynamisch (Importmap → esm.sh)
    this.client = new Client(url);
    this.room = await this.client.joinOrCreate('arena', { name });
    this.sessionId = this.room.sessionId;
    this.connected = true;

    this.room.onMessage('shot',   d => this._emit('shot', d));
    this.room.onMessage('killed', d => this._emit('killed', d));

    const players = this.room.state && this.room.state.players;
    players && players.onAdd && players.onAdd((p, id) => { if(id !== this.sessionId) this._emit('join', id, p); });
    players && players.onRemove && players.onRemove((_p, id) => { if(id !== this.sessionId) this._emit('leave', id); });

    this.room.onLeave(() => { this.connected = false; this._emit('left'); });
    this.room.onError((code, msg) => console.error('[net] room error', code, msg));
  }

  get players(){ return this.room && this.room.state ? this.room.state.players : undefined; }
  getPlayer(id){ return this.players ? this.players.get(id) : undefined; }

  sendMove(x,y,z,ry,moving){ this.room && this.room.send('move', { x,y,z,ry,moving }); }
  sendShoot(x,y,z,dx,dy,dz){ this.room && this.room.send('shoot', { x,y,z,dx,dy,dz }); }
  sendHit(target, damage){ this.room && this.room.send('hit', { target, damage }); }

  disconnect(){ this.room && this.room.leave(); this.room = null; this.connected = false; this.sessionId = ''; }
}
