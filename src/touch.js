// Handy-Steuerung für den Erkundungsflug (im Querformat halten).
//
// Neigen lenkt (DeviceOrientation): nach vorne kippen = sinken, nach hinten = steigen, rechts/links = Kurve.
// Die Haltung beim Start (oder nach „Ausrichten“) gilt als Mitte. Touch-Knöpfe: Schub und Bremse rechts, Hoch und
// Runter links, oben Pause, Navi (Karte mit Mitfliegern und Autopilot), Ausrichten und Neigung an/aus. Wischen auf freier Fläche dreht die Sicht (auch ohne
// Sensor, z. B. wenn der Browser die Neigung nicht freigibt).
// Browser geben die Neigungssensoren nur über HTTPS frei; iPhones fragen zusätzlich einmal nach Erlaubnis.

const D = Math.PI / 180;
const DEAD = 3 * D;              // Totzone um die Mitte
const YAW_GAIN = 2.4;            // rad/s Drehung je rad Seitenneigung …
const YAW_MAX = 1.7;             // … höchstens
const PITCH_GAIN = 1.5;          // Blickneigung je rad Vor-/Rückneigung
const PITCH_MAX = 1.2;
const DRAG = 0.006;              // rad je Pixel beim Wischen

/** Gerät mit Touch als Hauptzeiger (Handy, Tablet). */
export const isTouchDevice = () =>
  matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);

const dz = (v) => Math.sign(v) * Math.max(0, Math.abs(v) - DEAD);
const clamp = (v, a) => Math.max(-a, Math.min(a, v));

export function createTouch({ onPause, onSpiral, onNav } = {}) {
  const st = { thrust: false, brake: false, up: false, down: false };
  let tiltOn = true, hasTilt = false, needCal = true, roll = 0, tp = 0, roll0 = 0, tp0 = 0;
  let dragX = 0, dragY = 0, layer = null, tiltBtn = null, shown = false, listening = false;

  // ---------- Sensor ----------
  function onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    hasTilt = true;
    const b = e.beta * D, g = e.gamma * D;
    // Schwerkraft im Gerätesystem (x rechts, y oben, z aus dem Bildschirm), dann in Bildschirmrichtung gedreht
    const gx = Math.sin(g) * Math.cos(b), gy = -Math.sin(b), gz = -Math.cos(g) * Math.cos(b);
    const th = (screen.orientation?.angle ?? window.orientation ?? 0) * D;
    const sx = gx * Math.cos(th) - gy * Math.sin(th), sy = gx * Math.sin(th) + gy * Math.cos(th);
    roll = Math.atan2(sx, Math.hypot(sy, gz));       // rechte Kante tiefer = positiv
    tp = Math.atan2(-sy, -gz);                       // 0 = flach, 90° = senkrecht vor dem Gesicht
    if (needCal) { roll0 = roll; tp0 = tp; needCal = false; }
  }
  function listen() {
    if (listening) return;
    listening = true;
    addEventListener('deviceorientation', onOrientation);
  }

  // ---------- Knöpfe ----------
  // onClick: erst beim Klick auslösen (für Knöpfe, die ein Fenster öffnen – sonst landet der Klick, den der Browser
  // nach dem Antippen nachschickt, schon im neuen Fenster, z. B. auf „Schließen“)
  function button(cls, label, hold, onTap, onClick) {
    const b = document.createElement('button');
    b.className = 'tc-btn ' + cls; b.textContent = label; b.type = 'button';
    const set = (on) => { if (hold) st[hold] = on; b.classList.toggle('on', on); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); try { b.setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg */ } set(true); onTap?.(); });
    if (onClick) b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, (e) => { e.stopPropagation(); set(false); });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }
  function build() {
    layer = document.createElement('div');
    layer.id = 'touchControls';
    layer.append(
      button('tc-thrust', 'SCHUB', 'thrust'),
      button('tc-brake', 'BREMSE', 'brake'),
      button('tc-spiral', '🌀', null, () => onSpiral?.()),
      button('tc-up', '▲', 'up'),
      button('tc-down', '▼', 'down'),
      button('tc-pause', '⏸', null, () => onPause?.()),
      button('tc-nav', '🧭 Navi', null, null, () => onNav?.()),
      button('tc-cal', '⟲ Mitte', null, () => api.calibrate()),
    );
    tiltBtn = button('tc-tilt', '', null, () => { tiltOn = !tiltOn; syncTilt(); if (tiltOn) api.calibrate(); });
    layer.append(tiltBtn);
    syncTilt();
    // Wischen auf der freien Fläche: Sicht drehen
    let last = null;
    layer.addEventListener('pointerdown', (e) => { if (e.target === layer) { last = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { layer.setPointerCapture(e.pointerId); } catch { /* egal */ } } });
    layer.addEventListener('pointermove', (e) => {
      if (!last || e.pointerId !== last.id) return;
      dragX += e.clientX - last.x; dragY += e.clientY - last.y; last.x = e.clientX; last.y = e.clientY;
    });
    for (const ev of ['pointerup', 'pointercancel']) layer.addEventListener(ev, (e) => { if (last && e.pointerId === last.id) last = null; });
    document.body.appendChild(layer);
  }
  function syncTilt() {
    if (tiltBtn) tiltBtn.textContent = tiltOn ? '📱 Neigen: AN' : '📱 Neigen: AUS';
  }

  const api = {
    get state() { return st; },
    get tiltActive() { return tiltOn && hasTilt; },

    /**
     * Im Klick-Handler aufrufen (Nutzergeste): Vollbild, Querformat, Sensor-Erlaubnis (iPhone). Fehler sind egal –
     * dann bleibt es beim Wischen.
     */
    async enable() {
      try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch { /* nicht erlaubt */ }
      try { await screen.orientation?.lock?.('landscape'); } catch { /* nur im Vollbild, nicht überall */ }
      try {
        const D0 = window.DeviceOrientationEvent;
        if (D0 && typeof D0.requestPermission === 'function') {
          if ((await D0.requestPermission()) === 'granted') listen();
        } else listen();
      } catch { /* abgelehnt */ }
      api.calibrate();
    },
    /** Aktuelle Haltung als Mitte nehmen. */
    calibrate() { needCal = true; },
    show(on) {
      if (on && !layer) build();
      shown = !!on;
      if (layer) layer.style.display = on ? 'block' : 'none';
      if (!on) for (const k in st) st[k] = false;
      for (const b of layer ? layer.querySelectorAll('.tc-btn.on') : []) b.classList.remove('on');
    },
    get shown() { return shown; },

    /**
     * Eingaben eines Bildes: Drehung (yaw += yawDelta), Ziel-Neigung der Sicht (null = keine Vorgabe) und
     * Wisch-Anteile seit dem letzten Aufruf.
     */
    consume(dt) {
      const out = { yawDelta: -dragX * DRAG, pitchDelta: -dragY * DRAG, pitchTarget: null };
      dragX = dragY = 0;
      if (tiltOn && hasTilt && !needCal) {
        out.yawDelta -= clamp(dz(roll - roll0) * YAW_GAIN, YAW_MAX) * dt;
        out.pitchTarget = clamp(dz(tp - tp0) * PITCH_GAIN, PITCH_MAX);
      }
      return out;
    },
  };
  return api;
}
