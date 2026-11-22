// Flugbesen
//
// B ruft den Besen oder steigt ab. Gelenkt wird mit der Maus: Man fliegt dorthin, wohin man schaut.
//   Maus 3 (mittlere Taste) oder W  Schub          S          bremsen
//   A / D                           seitlich       Leertaste  steigen    C oder Strg  sinken
//   Mausrad hoch / runter           Spirale nach vorne / nach hinten (Rolle mit kurzem Satz)
//   Maus 1                          Zauber (Treffer-Strahl wie bei den Waffen, siehe hitscanShot in main.js)
// Die Ich-Ansicht ist das Bild des Users (ui/besen.webp), das Fluggeräusch seine Datei audio/blow.mp3.
// Zauber, Spirale und Auf-/Absteigen sind kleine Synthesizer-Töne. Gebäude und Bäume halten die vorhandene
// Kollision auf (main.js collide, mit Ober- und Unterkante). Über Dächer fliegt man einfach hinweg.
import * as THREE from 'three';

const MAX_SPEED = 28;            // m/s mit Schub, gut 100 km/h
const FOLLOW_THRUST = 1.7;       // wie schnell die Geschwindigkeit dem Ziel folgt (pro Sekunde): mit Schub …
const FOLLOW_GLIDE = 1.1;        // … und ohne, dann gleitet man aus bis zum Schweben
const SIDE = 7, CLIMB = 7, BRAKE = 6;
const SPIRAL_DUR = 0.8;          // s für eine ganze Rolle
const SPIRAL_DIST = 14;          // m Satz nach vorne oder hinten
const SPIRAL_R = 0.9;            // m Radius der Schraubenbahn
const CAST_CD = 0.16;            // s zwischen zwei Zaubern
const MAX_ALT = 140;             // m höchstens über dem Gelände
const CLEAR = 0.3;               // m Abstand Füße–Boden beim Tiefflug
// Besenspitze im Bild: Das Bild ist 56vh hoch und unten bündig, die Spitze liegt bei 17 % von oben.
// Das ergibt 53,5 % Bildschirmhöhe, als Normkoordinate y = 1 - 2 * 0,535 = -0,07. Der Zauber startet dort.
const TIP_NDC_Y = -0.07;

const UP = new THREE.Vector3(0, 1, 0);
const smooth = (t) => t * t * (3 - 2 * t);
const ease = (k, dt) => 1 - Math.exp(-k * dt);

export function createBroom({ camera, overlay, help, audio, groundAt, player, onCast }) {
  const vel = new THREE.Vector3(), target = new THREE.Vector3();
  const dir = new THREE.Vector3(), side = new THREE.Vector3(), off = new THREE.Vector3(), tip = new THREE.Vector3();
  const sp = { on: false, t: 0, sign: 1, prevE: 0, d: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(), prevOff: new THREE.Vector3() };
  let active = false, thrust = false, casting = false, castT = 0;
  let roll = 0, bank = 0, lastYaw = null, lastPitch = null, swayX = 0, swayY = 0, bobT = 0, kick = 0, helpT = 0;

  // ---------- Ton: kleine WebAudio-Synthese über den AudioContext des Spiels ----------
  let wind = null, noiseBuf = null;
  const ctx = () => (audio && audio.ctx && !audio.muted ? audio.ctx : null);
  const vol = () => audio?.volume ?? 0.85;
  function noise(c) {
    if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function env(c, g, t, peak, attack, release) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }
  // Fluggeräusch: audio/blow.mp3 (Pixabay, vom User, 36 s) in Schleife. Bis es geladen ist, oder falls es
  // fehlt, rauscht ein synthetischer Wind (gefiltertes Rauschen).
  let blowBuf = null, blowLoading = false;
  function loadBlow(c) {
    if (blowBuf || blowLoading) return;
    blowLoading = true;
    fetch('./audio/blow.mp3')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then((b) => c.decodeAudioData(b))
      .then((buf) => { blowBuf = buf; if (wind?.synth && active) { stopWind(); startWind(); } })
      .catch((err) => console.warn('[broom] Fluggeräusch nicht ladbar:', err.message))
      .finally(() => { blowLoading = false; });
  }
  function startWind() {
    const c = ctx();
    if (!c || wind) return;
    loadBlow(c);
    const src = c.createBufferSource(), g = c.createGain();
    g.gain.value = 0;
    let bp = null;
    if (blowBuf) {
      src.buffer = blowBuf; src.loop = true; src.connect(g);
    } else {
      src.buffer = noise(c); src.loop = true;
      bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.7;
      src.connect(bp).connect(g);
    }
    g.connect(c.destination);
    src.start(0, blowBuf ? Math.random() * blowBuf.duration : 0);   // nicht jedes Mal von vorn
    wind = { src, bp, g, c, synth: !blowBuf };
  }
  /** Lautstärke und Klang nach Fahrt (sf = 0 schweben … 1 Höchstgeschwindigkeit). */
  function windTo(level, sf) {
    if (!wind) return;
    const t = wind.c.currentTime;
    wind.g.gain.setTargetAtTime(level, t, 0.12);
    if (sf === undefined) return;
    if (wind.bp) wind.bp.frequency.setTargetAtTime(380 + 900 * sf, t, 0.25);
    else wind.src.playbackRate.setTargetAtTime(0.9 + 0.25 * sf, t, 0.3);   // schneller = etwas heller
  }
  function stopWind() {
    if (!wind) return;
    const w = wind; wind = null;
    try { w.g.gain.setTargetAtTime(0, w.c.currentTime, 0.12); w.src.stop(w.c.currentTime + 0.8); } catch { /* schon gestoppt */ }
  }
  function zap() {                 // Zauber: fallender Säge-Ton durch einen schließenden Tiefpass, dazu ein helles Glitzern
    const c = ctx(); if (!c) return;
    const t = c.currentTime, v = vol();
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(240, t + 0.16);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.16);
    const g = c.createGain(); env(c, g, t, 0.1 * v, 0.012, 0.19);
    o.connect(lp).connect(g).connect(c.destination); o.start(t); o.stop(t + 0.24);
    const s = c.createOscillator(); s.type = 'sine';
    s.frequency.setValueAtTime(2600, t); s.frequency.exponentialRampToValueAtTime(1800, t + 0.12);
    const sg = c.createGain(); env(c, sg, t, 0.045 * v, 0.01, 0.13);
    s.connect(sg).connect(c.destination); s.start(t); s.stop(t + 0.16);
  }
  function whoosh() {              // Spirale: Rauschen mit wanderndem Bandpass
    const c = ctx(); if (!c) return;
    const t = c.currentTime, v = vol();
    const src = c.createBufferSource(); src.buffer = noise(c);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(1800, t + 0.4); bp.frequency.exponentialRampToValueAtTime(500, t + 0.8);
    const g = c.createGain(); env(c, g, t, 0.3 * v, 0.25, 0.6);
    src.connect(bp).connect(g).connect(c.destination); src.start(t); src.stop(t + 0.9);
  }
  function chime(up) {             // Aufsteigen (steigende Töne) und Absteigen (fallende Töne)
    const c = ctx(); if (!c) return;
    const t = c.currentTime, v = vol(), notes = up ? [660, 880, 1320] : [1320, 880, 660];
    notes.forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = c.createGain(); env(c, g, t + i * 0.07, 0.06 * v, 0.01, 0.24);
      o.connect(g).connect(c.destination); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.3);
    });
  }

  function show(on) {
    if (overlay) { overlay.style.display = on ? 'block' : 'none'; overlay.style.transform = 'translateX(-50%)'; }
    if (help) { help.style.display = on ? 'block' : 'none'; help.style.opacity = '1'; }
  }

  return {
    get active() { return active; },
    /** Kamera-Rolle: Schräglage in Kurven plus Spirale (rad). */
    get roll() { return roll + bank; },
    get vy() { return vel.y; },
    get speedFrac() { return Math.min(1, vel.length() / MAX_SPEED); },
    /** Zusätzliches Sichtfeld während der Spirale (Grad). */
    get spiralFov() { return sp.on ? Math.sin(Math.PI * sp.t / SPIRAL_DUR) * 8 : 0; },

    setThrust(on) { thrust = !!on; },
    fire(on) { casting = !!on; },

    mount() {
      if (active) return;
      active = true; thrust = false; casting = false; castT = 0;
      vel.set(0, 4.5, 0);                       // vom Boden abheben
      roll = bank = 0; sp.on = false; lastYaw = lastPitch = null; swayX = swayY = kick = 0; helpT = 7;
      show(true);
      startWind(); chime(true);
    },
    /** Absteigen. Gibt die senkrechte Geschwindigkeit zurück, damit der Fall nahtlos weitergeht. */
    dismount() {
      if (!active) return 0;
      active = false; thrust = casting = false; sp.on = false; roll = bank = 0;
      show(false); stopWind(); chime(false);
      return vel.y;
    },
    /** Sofort weg, ohne Ton (Spielende, Neustart, Kartenwechsel, Mehrspieler). */
    reset() {
      active = false; thrust = casting = false; sp.on = false; roll = bank = 0; vel.set(0, 0, 0);
      show(false); stopWind();
    },
    /** Pause oder Menü: Wind leise stellen, bis wieder geflogen wird. */
    quiet() { windTo(0); },

    /** Mausrad: +1 = Spirale nach vorne, -1 = nach hinten. */
    wheel(sign) {
      if (!active || sp.on) return;
      sp.on = true; sp.t = 0; sp.sign = sign; sp.prevE = 0; sp.prevOff.set(0, 0, 0);
      camera.getWorldDirection(sp.d);
      sp.r.crossVectors(sp.d, UP);
      if (sp.r.lengthSq() < 1e-6) sp.r.set(1, 0, 0);   // senkrecht nach oben oder unten geschaut
      sp.r.normalize();
      sp.u.crossVectors(sp.r, sp.d).normalize();
      whoosh();
    },

    /** Ein Bild Flug: bewegt camera.position. Danach ruft main.js collide() für Gebäude und Kartenrand. */
    update(dt, inp) {
      if (!active) return;
      const pos = camera.position;
      const cp = Math.cos(inp.pitch);
      dir.set(-Math.sin(inp.yaw) * cp, Math.sin(inp.pitch), -Math.cos(inp.yaw) * cp);
      side.set(Math.cos(inp.yaw), 0, -Math.sin(inp.yaw));

      // Zielgeschwindigkeit aus den Eingaben, die echte Geschwindigkeit folgt ihr weich (Trägheit)
      const go = thrust || inp.forward;
      target.set(0, 0, 0);
      if (go) target.addScaledVector(dir, MAX_SPEED);
      if (inp.brake) target.addScaledVector(dir, -BRAKE);
      if (inp.right) target.addScaledVector(side, SIDE);
      if (inp.left) target.addScaledVector(side, -SIDE);
      if (inp.up) target.y += CLIMB;
      if (inp.down) target.y -= CLIMB;
      vel.lerp(target, ease(go ? FOLLOW_THRUST : FOLLOW_GLIDE, dt));
      pos.addScaledVector(vel, dt);

      // Schweben: sanftes Auf und Ab, solange kaum Fahrt ist
      bobT += dt;
      const still = 1 - Math.min(1, vel.length() / 3);
      pos.y += Math.cos(bobT * 2.1) * 0.25 * still * dt;

      // Spirale: eine ganze Rolle, dabei ein Satz nach vorne oder hinten auf einer Schraubenbahn
      if (sp.on) {
        sp.t = Math.min(SPIRAL_DUR, sp.t + dt);
        const e = smooth(sp.t / SPIRAL_DUR), phi = 2 * Math.PI * e;
        pos.addScaledVector(sp.d, sp.sign * SPIRAL_DIST * (e - sp.prevE));
        off.copy(sp.r).multiplyScalar((Math.cos(phi) - 1) * SPIRAL_R).addScaledVector(sp.u, Math.sin(phi) * SPIRAL_R * sp.sign);
        pos.add(sp.prevOff.negate().add(off));
        sp.prevOff.copy(off); sp.prevE = e;
        roll = -sp.sign * phi;                    // vorwärts rollt nach rechts, rückwärts nach links
        if (sp.t >= SPIRAL_DUR) { sp.on = false; roll = 0; }
      }

      // Schräglage in Kurven und Schwanken des Bildes
      if (lastYaw !== null) {
        let dy = inp.yaw - lastYaw;
        if (dy > Math.PI) dy -= 2 * Math.PI; else if (dy < -Math.PI) dy += 2 * Math.PI;
        const yawRate = dy / Math.max(dt, 1e-3), pitchRate = (inp.pitch - lastPitch) / Math.max(dt, 1e-3);
        const fast = Math.min(1, 0.3 + vel.length() / 10);
        bank += (THREE.MathUtils.clamp(yawRate * 0.08, -0.45, 0.45) * fast - bank) * ease(5, dt);
        swayX += (THREE.MathUtils.clamp(yawRate * 18, -45, 45) - swayX) * ease(8, dt);
        swayY += (THREE.MathUtils.clamp(-pitchRate * 12 + vel.y * 0.8, -35, 35) - swayY) * ease(8, dt);
      }
      lastYaw = inp.yaw; lastPitch = inp.pitch;

      // Boden und Höhengrenze
      const g = groundAt(pos.x, pos.z), h = player.height;
      if (pos.y < g + h + CLEAR) { pos.y = g + h + CLEAR; if (vel.y < 0) vel.y = 0; }
      if (pos.y > g + h + MAX_ALT) { pos.y = g + h + MAX_ALT; if (vel.y > 0) vel.y = 0; }

      // Zauber aus der Besenspitze
      castT -= dt;
      if (casting && castT <= 0) {
        castT = CAST_CD;
        camera.updateMatrixWorld();
        tip.set(0, TIP_NDC_Y, 0.5).unproject(camera).sub(pos).normalize().multiplyScalar(1.6).add(pos);
        onCast?.(tip);
        zap();
        kick = 1;
      }

      // Bild: Schwanken, Schweben, Rückstoß beim Zaubern und ein leichtes Zittern bei hoher Fahrt
      const sf = Math.min(1, vel.length() / MAX_SPEED), jit = sf * sf * 2.2;
      kick *= Math.exp(-14 * dt);
      if (overlay) {
        const x = swayX + (Math.random() - 0.5) * jit;
        const y = swayY + Math.sin(bobT * 2.1) * 5 * still + kick * 10 + (Math.random() - 0.5) * jit;
        overlay.style.transform = `translate(calc(-50% + ${x.toFixed(1)}px), ${y.toFixed(1)}px) rotate(${(bank * 5).toFixed(2)}deg)`;
      }
      if (help && helpT > 0) {
        helpT -= dt;
        help.style.opacity = String(Math.max(0, Math.min(1, helpT)));
        if (helpT <= 0) help.style.display = 'none';
      }
      startWind();                                // falls der Ton erst jetzt freigegeben wurde
      const lvl = wind && !wind.synth ? 0.15 + 0.6 * sf ** 1.2 : 0.015 + 0.22 * sf ** 1.5;
      windTo(lvl * vol(), sf);
    },
  };
}
