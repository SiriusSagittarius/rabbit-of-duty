// Audio-Manager fr Flying Much
// Ldt echte High-End-Audiodateien (WAV/MP3) als AudioBuffer vor
// und bietet simultanes Abspielen mit Gain, Pitch-Variation & Fallback.

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.85;
    this.buffers = new Map();
    this.loading = false;
    this.loaded = false;
  }

  ensure() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (!this.loaded && !this.loading) {
      this.preloadAll();
    }
  }

  async loadSound(name, url) {
    if (!this.ctx) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.buffers.set(name, audioBuffer);
      return audioBuffer;
    } catch (err) {
      console.warn(`[audio] Failed to load "${name}" from ${url}:`, err.message);
      return null;
    }
  }

  async preloadAll() {
    this.loading = true;
    const manifest = [
      ['shot_rifle', './audio/sfx/schuss_sturmgewehr_1.wav'],
      ['shot_pistol', './audio/sfx/schuss_pistole_1.wav'],
      ['shot_m27', './audio/sfx/schuss_sturmgewehr_1.wav'],
      ['shot_an94', './audio/sfx/schuss_sturmgewehr_2.wav'],
      ['shot_scar', './audio/sfx/schuss_sturmgewehr_schwer_2.wav'],
      ['shot_fiveseven', './audio/sfx/schuss_pistole_1.wav'],
      ['shot_sa58', './audio/sfx/schuss_sturmgewehr_schwer_1.wav'],
      ['shot_saritch', './audio/sfx/schuss_sturmgewehr_3.wav'],
      ['shot_sig556', './audio/sfx/schuss_sturmgewehr_3.wav'],
      ['shot_type95', './audio/sfx/schuss_sturmgewehr_hell_2.wav'],
      ['shot_xm8', './audio/sfx/schuss_sturmgewehr_hell_1.wav'],
      ['shot_tar21', './audio/sfx/schuss_sturmgewehr_hell_1.wav'],
      ['shot_kard', './audio/sfx/schuss_pistole_3.wav'],
      ['mag_out', './audio/sfx/magazin_raus.wav'],
      ['mag_in', './audio/reload.mp3'],             // Magazin rein (Pixabay, vom User; vorher sfx/magazin_rein.wav)
      ['bolt', './audio/sfx/verschluss_vor.wav'],
      ['dry_fire', './audio/empty1.mp3'],           // leer geschossen (Pixabay, vom User; vorher sfx/leer_klick.wav)
      ['knife', './audio/sfx/messer_ziehen.wav'],
      ['knife_slash', './audio/sfx/messer_schwung_1.wav'],
      ['knife_stab', './audio/sfx/messer_stich_1.wav'],
      ['knife_stab2', './audio/sfx/messer_stich_2.wav'],
      ['step_c_run_0', './audio/sfx/schritte_stein_1.wav'],
      ['step_c_run_1', './audio/sfx/schritte_stein_2.wav'],
      ['step_c_run_2', './audio/sfx/schritte_stein_3.wav'],
      ['step_c_run_3', './audio/sfx/schritte_stein_4.wav'],
      ['step_c_run_4', './audio/sfx/schritte_stein_5.wav'],
      ['step_c_run_5', './audio/sfx/schritte_stein_6.wav'],
      ['step_c_sprint_0', './audio/sfx/schritte_beton_1.wav'],
      ['step_c_sprint_1', './audio/sfx/schritte_beton_2.wav'],
      ['step_c_sprint_2', './audio/sfx/schritte_beton_3.wav'],
      ['step_c_sprint_3', './audio/sfx/schritte_beton_4.wav'],
      ['step_c_sprint_4', './audio/sfx/schritte_beton_5.wav'],
      ['step_s_run_0', './audio/sfx/schritte_kies_1.wav'],
      ['step_s_run_1', './audio/sfx/schritte_kies_2.wav'],
      ['step_s_run_2', './audio/sfx/schritte_kies_3.wav'],
      ['step_s_sprint_0', './audio/sfx/schritte_kies_1.wav'],
      ['step_s_sprint_1', './audio/sfx/schritte_kies_2.wav'],
      ['step_s_sprint_2', './audio/sfx/schritte_kies_3.wav'],
      ['step_s_sprint_3', './audio/sfx/schritte_kies_4.wav'],
      ['step_s_sprint_4', './audio/sfx/schritte_kies_5.wav'],
      ['step_s_sprint_5', './audio/sfx/schritte_kies_6.wav'],
      ['antigrav_hum', './audio/sfx/maschine_loop.wav'],
      ['jump', './audio/sfx/sprung.wav'],
      ['vox_0', './audio/sfx/soldat_tod_1.wav'],
      ['vox_1', './audio/sfx/soldat_tod_2.wav'],
      ['vox_2', './audio/sfx/soldat_tod_3.wav'],
      ['vox_3', './audio/sfx/soldat_tod_4.wav'],
      ['vox_4', './audio/sfx/soldat_tod_5.wav'],
      ['vox_5', './audio/sfx/soldat_tod_6.wav'],
      ['hit_flesh_swing', './audio/sfx/messer_schwung_2.wav'],
      ['flesh_02', './audio/sfx/treffer_koerper_1.wav'],
      ['flesh_03', './audio/sfx/treffer_koerper_2.wav'],
      ['scope_zoom', './audio/sfx/zielfernrohr.wav'],
      // Zombie-Stimmen (aus freien Aufnahmen tiefer gelegt + Knurren, siehe tools/sfx_build.py)
      ['zombie_groan_0', './audio/sfx/zombie_stoehnen_1.wav'],
      ['zombie_groan_1', './audio/sfx/zombie_stoehnen_2.wav'],
      ['zombie_groan_2', './audio/sfx/zombie_stoehnen_3.wav'],
      ['zombie_groan_3', './audio/sfx/zombie_stoehnen_4.wav'],
      ['zombie_attack_0', './audio/sfx/zombie_angriff_1.wav'],
      ['zombie_attack_1', './audio/sfx/zombie_angriff_2.wav'],
      ['zombie_death_0', './audio/sfx/zombie_tod_1.wav'],
      ['zombie_death_1', './audio/sfx/zombie_tod_2.wav'],
    ];

    await Promise.allSettled(
      manifest.map(([name, url]) => this.loadSound(name, url))
    );
    this.loading = false;
    this.loaded = true;
  }

  /**
   * Spielt einen Buffer mit leichter Pitch- & Lautstärke-Variation für natürlichen Klang.
   */
  play(name, options = {}) {
    if (this.muted) return;
    this.ensure();
    if (!this.ctx) return;

    const buffer = this.buffers.get(name);
    if (!buffer) {
      this._fallback(name);
      return;
    }

    const {
      volume = 1.0,
      pitch = 1.0,
      pitchJitter = 0.04,
      volJitter = 0.05,
    } = options;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const finalPitch = pitch * (1.0 + (Math.random() * 2 - 1) * pitchJitter);
    source.playbackRate.setValueAtTime(Math.max(0.2, finalPitch), this.ctx.currentTime);

    const gainNode = this.ctx.createGain();
    const finalVol = this.volume * volume * (1.0 + (Math.random() * 2 - 1) * volJitter);
    gainNode.gain.setValueAtTime(Math.max(0, finalVol), this.ctx.currentTime);

    source.connect(gainNode).connect(this.ctx.destination);
    source.start(this.ctx.currentTime);
  }

  shot(weaponIdOrType = 'rifle') {
    const key = 'shot_' + weaponIdOrType;
    if (this.buffers.has(key)) {
      this.play(key, { volume: 1.0, pitch: 1.0, pitchJitter: 0.03 });
      return;
    }
    if (weaponIdOrType === 'pistol' || weaponIdOrType === 'secondary') {
      this.play('shot_pistol', { volume: 0.9, pitch: 1.0, pitchJitter: 0.05 });
    } else {
      this.play('shot_rifle', { volume: 1.0, pitch: 1.0, pitchJitter: 0.04 });
    }
  }

  dryFire() {
    this.play('dry_fire', { volume: 0.8 });
  }

  reloadStart() {
    this.play('mag_out', { volume: 0.85 });
  }

  reloadMid() {
    this.play('mag_in', { volume: 0.85 });
  }

  reloadBolt() {
    this.play('bolt', { volume: 0.9 });
  }

  hit(isFlesh = true) {
    this.play(isFlesh ? 'hit_flesh' : 'hit_metal', { volume: 0.8, pitchJitter: 0.08 });
  }

  kill() {
    this.blip(660, 0.08, 'triangle', 0.06);
    this.blip(880, 0.12, 'sine', 0.05);
  }

  step(isSprint = false, surface = 'concrete') {
    let key;
    if (surface === 'sand') {
      if (isSprint) {
        const idx = Math.floor(Math.random() * 6);
        key = `step_s_sprint_${idx}`;
      } else {
        const idx = Math.floor(Math.random() * 3);
        key = `step_s_run_${idx}`;
      }
    } else {
      // Marble, concrete, stone (Atrium, City, Warehouse, OSM)
      if (isSprint) {
        const idx = Math.floor(Math.random() * 5);
        key = `step_c_sprint_${idx}`;
      } else {
        const idx = Math.floor(Math.random() * 6);
        key = `step_c_run_${idx}`;
      }
    }
    this.play(key, {
      volume: isSprint ? 0.60 : 0.42,
      pitch: isSprint ? 1.05 : 0.98,
      pitchJitter: 0.05,
      volJitter: 0.05,
    });
  }

  land(surface = 'concrete') {
    const key = (surface === 'sand') ? 'step_s_sprint_0' : 'step_c_sprint_2';
    this.play(key, { volume: 0.72, pitch: 0.88, pitchJitter: 0.04 });
  }

  antigrav() {
    this.play('antigrav_hum', { volume: 0.35, pitch: 1.35, pitchJitter: 0.02 });
  }

  knife(isHit = false) {
    if (isHit) {
      const key = Math.random() < 0.5 ? 'knife_stab' : 'knife_stab2';
      this.play(key, { volume: 0.95, pitch: 1.0, pitchJitter: 0.06 });
    } else {
      this.play('knife_slash', { volume: 0.85, pitch: 1.0, pitchJitter: 0.05 });
    }
  }

  explode() {
    this.play('explosion', { volume: 1.1 });
  }

  pickup() {
    this.blip(880, 0.1, 'sine', 0.08);
    setTimeout(() => this.blip(1100, 0.12, 'sine', 0.06), 60);
  }

  zombieGroan() {
    const idx = Math.floor(Math.random() * 4);
    this.play(`zombie_groan_${idx}`, { volume: 0.7, pitch: 0.92 + Math.random() * 0.16, pitchJitter: 0.04 });
  }

  zombieAttack() {
    this.play(`zombie_attack_${Math.random() < 0.5 ? 0 : 1}`, { volume: 0.75, pitch: 0.95 + Math.random() * 0.1 });
    this.play('hit_flesh_swing', { volume: 0.85, pitch: 0.88, pitchJitter: 0.06 });
    setTimeout(() => {
      this.play('flesh_02', { volume: 0.95, pitch: 0.82, pitchJitter: 0.05 });
    }, 70);
  }

  zombieDeath() {
    this.play(`zombie_death_${Math.random() < 0.5 ? 0 : 1}`, { volume: 0.9, pitch: 0.95 + Math.random() * 0.1, pitchJitter: 0.04 });
    this.play('flesh_03', { volume: 0.85, pitch: 0.9 });
  }

  scopeZoom(inZoom = true) {
    this.play('scope_zoom', { volume: 0.65, pitch: inZoom ? 1.05 : 0.95 });
  }

  /** Synthese-Fallback für den Fall, dass kein AudioBuffer geladen ist */
  blip(freq, dur, type = 'square', gain = 0.06) {
    if (this.muted) return;
    this.ensure();
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain * this.volume;
    o.connect(g).connect(this.ctx.destination);
    const t = this.ctx.currentTime;
    o.start(t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.stop(t + dur);
  }

  _fallback(name) {
    if (name.startsWith('shot')) {
      this.blip(220, 0.09, 'sawtooth', 0.05);
      this.blip(90, 0.12, 'square', 0.05);
    } else if (name === 'dry_fire') {
      this.blip(160, 0.05, 'square', 0.04);
    } else if (name.startsWith('hit') || name.startsWith('flesh')) {
      this.blip(400, 0.04, 'triangle', 0.04);
    } else if (name.startsWith('vox')) {
      this.blip(95, 0.35, 'sawtooth', 0.06);
    } else if (name === 'explosion') {
      this.blip(60, 0.35, 'sawtooth', 0.09);
    }
  }
}
