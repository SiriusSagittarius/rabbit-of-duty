// Spielmusik
//  - Menü (Start, Kartenauswahl, Game Over): Electro-Trap-Track, gestreamt (4 min, kein großer Decode)
//  - Hauptspiel: hauptspiel.wav als lückenlose Web-Audio-Schleife (48 s)
//  - Pause: Spielmusik leise weiter
// Weiche Überblendung zwischen den Modi; M schaltet die Musik an/aus (wird gespeichert).
const TRACKS = {
  menu: './audio/astronaut12-energy-gaming-electro-trap-with-heavy-drums-and-futuristic-bass-drops-301131.mp3',
  game: './audio/hauptspiel.wav',
};
const FADE_S = 1.2;                 // Überblendzeit
const MIX = { menu: 0.55, game: 0.42, pause: 0.16 };   // Pegel relativ zur Musiklautstärke (WAV ist laut gemastert)

export class Music {
  constructor() {
    this.mode = 'menu';
    this.volume = Math.min(1, Math.max(0, parseFloat(localStorage.getItem('rod.musicVol') ?? '1')));
    this.muted = localStorage.getItem('rod.musicMute') === '1';
    this.level = { menu: 0, game: 0 };
    this.menuEl = new Audio(TRACKS.menu);
    this.menuEl.loop = true;
    this.menuEl.preload = 'auto';
    this.menuEl.volume = 0;
    this.ctx = null; this.gameGain = null; this.gameBuf = null; this.gameSrc = null;
    this._last = performance.now();
    this._tick = this._tick.bind(this);
    requestAnimationFrame(this._tick);
    this._tryMenu();                  // klappt nur, wenn der Browser Autoplay erlaubt – sonst nach dem ersten Klick
  }

  /** Nach einer Nutzer-Geste aufrufen (AudioContext des Spiels mitgeben). */
  unlock(ctx) {
    this._tryMenu();
    if (this.ctx || !ctx) return;
    this.ctx = ctx;
    this.gameGain = ctx.createGain();
    this.gameGain.gain.value = 0;
    this.gameGain.connect(ctx.destination);
    fetch(TRACKS.game)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then(b => ctx.decodeAudioData(b))
      .then(buf => { this.gameBuf = buf; if (this.mode !== 'menu') this._startGame(); })
      .catch(err => console.warn('[music] Hauptspiel-Musik nicht ladbar:', err.message));
  }

  setMode(mode) {
    if (mode === this.mode) return;
    const fromMenu = this.mode === 'menu';
    this.mode = mode;
    if (mode === 'game' && fromMenu) this._startGame();   // neue Runde → Schleife von vorn
    if (mode === 'menu') this._tryMenu();
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('rod.musicMute', this.muted ? '1' : '0');
    if (!this.muted) this._tryMenu();
    return !this.muted;
  }

  _tryMenu() {
    if (this.mode === 'menu' && !this.muted && this.menuEl.paused) this.menuEl.play().catch(() => {});
  }

  _startGame() {
    if (!this.ctx || !this.gameBuf) return;
    if (this.gameSrc) { try { this.gameSrc.stop(); } catch (e) { /* schon gestoppt */ } }
    const src = this.ctx.createBufferSource();
    src.buffer = this.gameBuf;
    src.loop = true;
    src.connect(this.gameGain);
    src.start();
    this.gameSrc = src;
  }

  _target(track) {
    if (this.muted) return 0;
    if (this.mode === 'menu') return track === 'menu' ? MIX.menu * this.volume : 0;
    if (track !== 'game') return 0;
    return (this.mode === 'pause' ? MIX.pause : MIX.game) * this.volume;
  }

  _tick(now) {
    const dt = Math.min(0.1, (now - this._last) / 1000);
    this._last = now;
    for (const track of ['menu', 'game']) {
      const target = this._target(track), cur = this.level[track];
      const step = dt / FADE_S * Math.max(MIX.menu, MIX.game);
      this.level[track] = cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
    }
    if (this.menuEl.paused) this.level.menu = 0;          // noch gesperrt/pausiert → beim Start sauber einblenden
    this.menuEl.volume = this.level.menu;
    if (this.level.menu <= 0 && this._target('menu') <= 0 && !this.menuEl.paused) this.menuEl.pause();
    if (this.gameGain) this.gameGain.gain.value = this.level.game;
    requestAnimationFrame(this._tick);
  }
}
