// Handy-Steuerung für den Erkundungsflug (im Querformat halten).
//
// Neigen lenkt (DeviceOrientation): nach vorne kippen = sinken, nach hinten = steigen, rechts/links = Kurve.
// Ausrichten (beim Start, mit ⟲ und nach jedem Drehen des Bildschirms): Man hält das Handy bequem und kurz ruhig, der
// Mittelwert dieser ruhigen Zeit wird die Mitte (nicht der Moment des Antippens, da wackelt das Handy). Liegt das Handy
// still (z. B. auf dem Tisch) oder ist es sehr weit gekippt, zählt die Neigung nicht. Touch-Knöpfe: Schub und Bremse rechts, Hoch und
// Runter links, oben Pause, Navi (Karte mit Mitfliegern und Autopilot), Ausrichten und Neigung an/aus. Wischen auf freier Fläche dreht die Sicht (auch ohne
// Sensor, z. B. wenn der Browser die Neigung nicht freigibt).
// Browser geben die Neigungssensoren nur über HTTPS frei; iPhones fragen zusätzlich einmal nach Erlaubnis.

const D = Math.PI / 180;
const DEAD = 5 * D;              // Totzone um die Mitte (Handzittern lenkt nicht)
const SMOOTH = 0.1;              // s, Glättung der Sensorwerte
const CAL_STEADY = 3 * D;        // Ausrichten: so wenig darf das Handy wackeln …
const CAL_T = 0.8;               // … so lange (s), dann ist die Mitte gespeichert
const CAL_MAX = 5;               // spätestens nach so vielen Sekunden wird der Mittelwert genommen
const STILL = 0.5 * D;           // so wenig Bewegung in STILL_T: Das Handy liegt, in der Hand zittert es immer mehr
const STILL_T = 1.2;
const OUT = 65 * D;              // weiter von der Mitte weg: Neigung zählt nicht (weggelegt, falsch herum gehalten)
const HIST = 1.6;                // s Sensorwerte merken
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
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));    // Winkel auf -180° … 180°

export function createTouch({ onPause, onSpiral, onNav, onTrick } = {}) {
  const st = { thrust: false, brake: false, up: false, down: false };
  let tiltOn = true, hasTilt = false, roll = 0, tp = 0, roll0 = 0, tp0 = 0;
  let calibrated = false, cal = null, calProg = 0, resting = false, outSince = 0, doneUntil = 0, lastT = 0, lastTh = null;
  let dragX = 0, dragY = 0, layer = null, tiltBtn = null, hint = null, shown = false, listening = false;
  const hist = [];                                   // { t, r, p }: ungeglättete Werte der letzten HIST Sekunden
  const now = () => performance.now() / 1000;

  // ---------- Sensor ----------
  /** Wie lange (s) das Handy bis jetzt höchstens um lim gewackelt hat (Neigung und Seitenneigung). */
  function steadyFor(t, lim) {
    if (!hist.length) return 0;
    const last = hist[hist.length - 1];
    let r0 = last.r, r1 = last.r, p0 = 0, p1 = 0, since = last.t;
    for (let i = hist.length - 1; i >= 0; i--) {
      const h = hist[i], dp = wrap(h.p - last.p);
      r0 = Math.min(r0, h.r); r1 = Math.max(r1, h.r); p0 = Math.min(p0, dp); p1 = Math.max(p1, dp);
      if (r1 - r0 > lim || p1 - p0 > lim) break;
      since = h.t;
    }
    return t - since;
  }
  /** Mitte = Mittelwert der Werte seit from. */
  function takeCenter(from) {
    const win = hist.filter((h) => h.t >= from);
    if (!win.length) return;
    const ref = win[0].p;
    roll0 = win.reduce((s, h) => s + h.r, 0) / win.length;
    tp0 = wrap(ref + win.reduce((s, h) => s + wrap(h.p - ref), 0) / win.length);
    calibrated = true; cal = null; calProg = 1; doneUntil = now() + 1.6;
  }
  function onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    const t = now();
    const b = e.beta * D, g = e.gamma * D;
    // Schwerkraft im Gerätesystem (x rechts, y oben, z aus dem Bildschirm), dann in Bildschirmrichtung gedreht
    const gx = Math.sin(g) * Math.cos(b), gy = -Math.sin(b), gz = -Math.cos(g) * Math.cos(b);
    const th = (screen.orientation?.angle ?? window.orientation ?? 0) * D;
    const sx = gx * Math.cos(th) - gy * Math.sin(th), sy = gx * Math.sin(th) + gy * Math.cos(th);
    const r = Math.atan2(sx, Math.hypot(sy, gz));    // rechte Kante tiefer = positiv
    const p = Math.atan2(-sy, -gz);                  // 0 = flach, 90° = senkrecht vor dem Gesicht
    // Bildschirm gedreht (hochkant ↔ quer): alte Werte passen nicht mehr, neu ausrichten
    if (lastTh !== null && th !== lastTh) { hist.length = 0; hasTilt = false; if (tiltOn) api.calibrate(); }
    lastTh = th;
    if (!hasTilt) { roll = r; tp = p; lastT = t; }
    hasTilt = true;
    const k = 1 - Math.exp(-Math.min(0.2, t - lastT) / SMOOTH);
    roll += (r - roll) * k; tp = wrap(tp + wrap(p - tp) * k); lastT = t;
    hist.push({ t, r, p });
    while (hist.length && hist[0].t < t - HIST) hist.shift();
    resting = steadyFor(t, STILL) >= STILL_T;
    if (cal) {
      // Liegt das Handy (z. B. auf dem Tisch), wäre das keine Spielhaltung: warten, bis es in der Hand ist
      cal.lying = steadyFor(t, STILL) >= CAL_T;
      if (cal.lying) { calProg = 0; cal.t0 = t; }
      else {
        const st = steadyFor(t, CAL_STEADY);
        calProg = Math.min(1, Math.min(st, t - cal.t0) / CAL_T);
        if (calProg >= 1) takeCenter(t - CAL_T);
        else if (t - cal.t0 > CAL_MAX) takeCenter(t - 0.5);
      }
    }
    const out = calibrated && !cal && (Math.abs(wrap(roll - roll0)) > OUT || Math.abs(wrap(tp - tp0)) > OUT);
    outSince = out ? (outSince || t) : 0;
    syncHint();
  }
  function listen() {
    if (listening) return;
    listening = true;
    addEventListener('deviceorientation', onOrientation);
  }
  /** Hinweis in der Mitte: Ausrichten mit Fortschritt, „Mitte gespeichert“, „liegt still“, „zu weit gekippt“. */
  function syncHint() {
    if (!hint) return;
    const t = now();
    let html = '';
    if (tiltOn && hasTilt) {
      if (cal) html = `📱 Ausrichten<small>${cal.lying ? 'Nimm das Handy in die Hand und halte es bequem.'
        : 'Halte das Handy so, wie du bequem spielen willst, und kurz ruhig.'}</small>`
        + `<span class="tc-bar"><i style="width:${Math.round(calProg * 100)}%"></i></span>`;
      else if (t < doneUntil) html = `✓ Mitte gespeichert<small>Neu ausrichten: Knopf ⟲ oben links</small>`;
      // „liegt still“ nur, wenn es etwas ausmacht (Haltung weg von der Mitte), nicht bei sehr ruhiger Hand in der Mitte
      else if (resting && calibrated && (Math.abs(wrap(roll - roll0)) > DEAD || Math.abs(wrap(tp - tp0)) > DEAD))
        html = `📱 Handy liegt still<small>Neigen ist pausiert, bis du es wieder in die Hand nimmst.</small>`;
      else if (outSince && t - outSince > 0.8) html = `📱 Zu weit gekippt<small>Zurück in deine Spielhaltung oder ⟲ tippen</small>`;
    }
    hint.classList.toggle('on', !!html);
    if (html && hint.innerHTML !== html) hint.innerHTML = html;
  }

  // ---------- Knöpfe ----------
  // onClick: erst beim Klick auslösen (für Knöpfe, die ein Fenster öffnen – sonst landet der Klick, den der Browser
  // nach dem Antippen nachschickt, schon im neuen Fenster, z. B. auf „Schließen“)
  function button(cls, label, hold, onTap, onClick) {
    const b = document.createElement('button');
    b.className = 'tc-btn ' + cls; b.innerHTML = label; b.type = 'button';   // feste Beschriftungen aus diesem Modul; .tc-long fällt im Hochformat weg
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
      button('tc-tricks', '🤸', null, () => tricks.classList.toggle('on')),
      button('tc-up', '▲', 'up'),
      button('tc-down', '▼', 'down'),
      button('tc-pause', '⏸', null, () => onPause?.()),
      button('tc-nav', '🧭 Navi', null, null, () => onNav?.()),
      button('tc-cal', '⟲<span class="tc-long"> Mitte</span>', null, () => api.calibrate()),
    );
    // Trick-Menü: 🤸 klappt es auf, ein Trick klappt es wieder zu
    const tricks = document.createElement('div');
    tricks.className = 'tc-trickmenu';
    for (const [move, label] of [['trick', '✨ Trick'], ['wave', '👋 Winken'], ['handstand', '🤸 Handstand'], ['liedown', '😎 Hinlegen'], ['dance', '💃 Tanzen']])
      tricks.append(button('tc-trick', label, null, () => { tricks.classList.remove('on'); onTrick?.(move); }));
    layer.append(tricks);
    tiltBtn = button('tc-tilt', '', null, () => { tiltOn = !tiltOn; syncTilt(); if (tiltOn) api.calibrate(); });
    layer.append(tiltBtn);
    hint = document.createElement('div');
    hint.className = 'tc-hint';
    layer.append(hint);
    syncTilt(); syncHint();
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
    if (tiltBtn) tiltBtn.innerHTML = '📱<span class="tc-long"> Neigen:</span> ' + (tiltOn ? 'AN' : 'AUS');
    syncHint();
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
    /** Neu ausrichten: Sobald das Handy kurz ruhig gehalten wird, ist diese Haltung die Mitte. */
    calibrate() { cal = { t0: now() }; calProg = 0; doneUntil = 0; syncHint(); },
    /** Für Tests und Fehlersuche: Zustand der Neigungssteuerung (Winkel in Grad). */
    get tiltInfo() {
      return { hasTilt, calibrated, calibrating: !!cal, progress: +calProg.toFixed(2), resting, out: !!outSince,
        roll: +(wrap(roll - roll0) / D).toFixed(1), tilt: +(wrap(tp - tp0) / D).toFixed(1) };
    },
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
      // Neigung zählt nur ausgerichtet und nicht zu weit gekippt. Liegt das Handy still: nicht drehen, geradeaus schauen.
      if (tiltOn && hasTilt && calibrated && !cal && !outSince) {
        if (resting) out.pitchTarget = 0;
        else {
          out.yawDelta -= clamp(dz(wrap(roll - roll0)) * YAW_GAIN, YAW_MAX) * dt;
          out.pitchTarget = clamp(dz(wrap(tp - tp0)) * PITCH_GAIN, PITCH_MAX);
        }
      }
      if (hint && doneUntil && now() > doneUntil) { doneUntil = 0; syncHint(); }   // „Mitte gespeichert“ ausblenden
      return out;
    },
  };
  return api;
}
