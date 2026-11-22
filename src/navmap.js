import * as THREE from 'three';
import { pointInPoly, closestOnPoly } from './poly2d.js';

/**
 * Karte & Navi
 *  - Vollbild-Karte (Luftbild, wenn die Karte eines liefert; sonst Grundrisse), Zoom per Mausrad,
 *    Verschieben per Ziehen, Klick = Ziel setzen, Rechtsklick = Ziel löschen
 *  - Route per A* auf einem Raster über die Spielfläche: um Häuser/Hindernisse herum, Straßen bevorzugt
 *  - Führung im Spiel: leuchtende Pfeillinie am Boden, Hinweis oben („In 40 m rechts abbiegen“),
 *    Route auf dem Radar, optional Navi-Stimme (Web Speech, deutsch)
 * Koordinaten: Welt x = Osten, Welt z = Süden (Norden = −z, also oben auf der Karte).
 */
const _cp = { x: 0, z: 0, d2: 0 };
const PLAYER_R = 0.45;            // Platzbedarf beim Rastern der Hindernisse
const ROAD_COST = 0.5, OFF_COST = 1.4;      // abseits der Wege fast 3× teurer → Route folgt Straßen und Fußwegen
const ARRIVE = 4, OFFROUTE = 7;   // m

export class NavMap {
  /**
   * @param {object} o
   * @param {THREE.Scene} o.scene
   * @param {object[]} o.obstacles      Hindernisliste des Spiels (wird bei Bedarf gerastert)
   * @param {() => {x:number, z:number}} o.getBounds   halbe Kantenlängen der (rechteckigen) Spielfläche, Ost-West und Nord-Süd
   * @param {(x:number,z:number)=>number} o.groundAt
   * @param {() => object[]} o.getEnemies
   * @param {(t:string)=>void} o.banner
   */
  constructor(o) {
    Object.assign(this, o);
    this.isOpen = false;
    this.layers = []; this.roads = [];
    this.grid = null; this.gridDirty = true;
    this.marker = null; this.route = null; this.rerouteT = 0;
    this.voice = localStorage.getItem('rod.navVoice') !== '0';
    this.view = { x: 0, z: 0, s: 2 };      // Kartenmitte (Welt) und Maßstab (Pixel pro Meter, CSS)
    this._buildDom();
    this._buildRibbon();
  }

  // ------------------------------------------------------------------ Karte wechseln
  reset() {
    this.layers = []; this.roads = [];
    this.gridDirty = true;
    this.clearMarker(true);
  }
  setLevel({ layers = [], roads = [] } = {}) {
    this.layers = layers.filter(l => l && l.image);
    this.roads = roads || [];
    this.gridDirty = true;
  }

  // ------------------------------------------------------------------ Raster + A*
  _ensureGrid() {
    const B = this.getBounds(), bx = B.x, bz = B.z;
    const old = this.grid;
    if (old && !this.gridDirty && old.bx === bx && old.bz === bz && old.nObs === this.obstacles.length) return old;
    const c = Math.max(bx, bz) > 120 ? 2 : 1, nx = Math.ceil(2 * bx / c), nz = Math.ceil(2 * bz / c);
    const blocked = new Uint8Array(nx * nz), cost = new Float32Array(nx * nz).fill(this.roads.length ? OFF_COST : 1);
    const cxw = (i) => -bx + (i + 0.5) * c, czw = (j) => -bz + (j + 0.5) * c;     // Zellmitte in Weltkoordinaten
    const ix = (v) => Math.max(0, Math.min(nx - 1, Math.floor((v + bx) / c)));
    const iz = (v) => Math.max(0, Math.min(nz - 1, Math.floor((v + bz) / c)));
    for (const o of this.obstacles) {
      if ((o.top ?? 9) < 0.5) continue;                          // flache Dinge (Bordsteine) blockieren nicht
      const i0 = ix(o.minX - PLAYER_R), i1 = ix(o.maxX + PLAYER_R), j0 = iz(o.minZ - PLAYER_R), j1 = iz(o.maxZ + PLAYER_R);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * nx + i; if (blocked[k]) continue;
        const x = cxw(i), z = czw(j);
        if (o.poly) { if (pointInPoly(x, z, o.poly) || closestOnPoly(x, z, o.poly, _cp).d2 < PLAYER_R * PLAYER_R) blocked[k] = 1; }
        else if (x > o.minX - PLAYER_R && x < o.maxX + PLAYER_R && z > o.minZ - PLAYER_R && z < o.maxZ + PLAYER_R) blocked[k] = 1;
      }
    }
    for (const r of this.roads) {                                 // Straßen bevorzugen (Navi folgt den Wegen)
      const p = r.pts, w = (r.width || 4) / 2 + (r.main ? 1.2 : 0.6);
      for (let s = 0; s + 3 < p.length; s += 2) {
        const ax = p[s], az = p[s + 1], bx = p[s + 2], bz = p[s + 3], len = Math.hypot(bx - ax, bz - az);
        for (let t = 0; t <= len; t += c * 0.5) {
          const x = ax + (bx - ax) * t / Math.max(len, 1e-6), z = az + (bz - az) * t / Math.max(len, 1e-6);
          const i0 = ix(x - w), i1 = ix(x + w), j0 = iz(z - w), j1 = iz(z + w);
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            if (Math.hypot(cxw(i) - x, czw(j) - z) <= w) cost[j * nx + i] = ROAD_COST;
          }
        }
      }
    }
    this.grid = { bx, bz, c, nx, nz, blocked, cost, nObs: this.obstacles.length };
    this.gridDirty = false;
    return this.grid;
  }
  _nearestFree(G, k) {
    if (!G.blocked[k]) return k;
    const nx = G.nx, nz = G.nz, i0 = k % nx, j0 = (k / nx) | 0;
    for (let r = 1; r < 40; r++) {
      for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
        if (i < 0 || j < 0 || i >= nx || j >= nz || (Math.abs(i - i0) !== r && Math.abs(j - j0) !== r)) continue;
        if (!G.blocked[j * nx + i]) return j * nx + i;
      }
    }
    return k;
  }
  /** A* (8 Nachbarn, keine Ecken schneiden) → geglättete Wegpunkte [{x,z}] oder null. */
  findPath(sx, sz, gx, gz) {
    const G = this._ensureGrid(), { nx, nz, c, bx, bz, blocked, cost } = G;
    const cell = (x, z) => Math.max(0, Math.min(nz - 1, Math.floor((z + bz) / c))) * nx + Math.max(0, Math.min(nx - 1, Math.floor((x + bx) / c)));
    const s = this._nearestFree(G, cell(sx, sz)), g = this._nearestFree(G, cell(gx, gz));
    const N = nx * nz, gs = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const gi = g % nx, gj = (g / nx) | 0, minC = Math.min(ROAD_COST, OFF_COST);
    const h = (k) => { const dx = Math.abs(k % nx - gi), dy = Math.abs(((k / nx) | 0) - gj); return (Math.max(dx, dy) + 0.4142 * Math.min(dx, dy)) * c * minC; };
    const heap = [], push = (f, k) => {          // Binär-Heap [f, k]
      heap.push([f, k]); let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } }
      return top;
    };
    gs[s] = 0; push(h(s), s);
    const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    let found = false;
    while (heap.length) {
      const [, k] = pop();
      if (closed[k]) continue;
      if (k === g) { found = true; break; }
      closed[k] = 1;
      const i = k % nx, j = (k / nx) | 0;
      for (const [di, dj, dc] of D) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const nk = nj * nx + ni;
        if (blocked[nk] || closed[nk]) continue;
        if (di && dj && (blocked[j * nx + ni] || blocked[nj * nx + i])) continue;
        const ng = gs[k] + dc * c * (cost[k] + cost[nk]) * 0.5;
        if (ng < gs[nk]) { gs[nk] = ng; came[nk] = k; push(ng + h(nk), nk); }
      }
    }
    if (!found) return null;
    const cells = []; for (let k = g; k !== -1; k = came[k]) cells.push(k);
    cells.reverse();
    const pt = (k) => ({ x: -bx + (k % nx + 0.5) * c, z: -bz + (((k / nx) | 0) + 0.5) * c, k });
    // Glätten: so weit wie möglich geradeaus – aber nur über Zellen, die nicht teurer sind als der
    // ursprüngliche Weg dazwischen (folgt der Weg der Straße, bleibt auch die Abkürzung auf der Straße)
    const los = (a, z2, lim) => {
      const len = Math.hypot(z2.x - a.x, z2.z - a.z), steps = Math.ceil(len / (c * 0.4));
      for (let t = 1; t < steps; t++) {
        const k = cell(a.x + (z2.x - a.x) * t / steps, a.z + (z2.z - a.z) * t / steps);
        if (blocked[k] || cost[k] > lim) return false;
      }
      return true;
    };
    const raw = cells.map(pt), out = [raw[0]];
    let i = 0;
    while (i < raw.length - 1) {
      const maxJ = Math.min(raw.length - 1, i + 60), runMax = [];
      let m = cost[raw[i].k];
      for (let j = i + 1; j <= maxJ; j++) { m = Math.max(m, cost[raw[j].k]); runMax[j] = m + 1e-3; }
      let j = maxJ;
      while (j > i + 1 && !los(raw[i], raw[j], runMax[j])) j--;
      out.push(raw[j]); i = j;
    }
    const path = out.map(p => ({ x: p.x, z: p.z }));
    path[0] = { x: sx, z: sz };
    if (!blocked[cell(gx, gz)]) path[path.length - 1] = { x: gx, z: gz };
    return path;
  }

  // ------------------------------------------------------------------ Ziel & Route
  setMarker(x, z, from) {
    const B = this.getBounds(), mx = B.x - 1.5, mz = B.z - 1.5;
    this.marker = { x: Math.max(-mx, Math.min(mx, x)), z: Math.max(-mz, Math.min(mz, z)) };
    this._route(from);
    if (this.route) this._say(`Route berechnet. ${this._fmt(this.route.len)} bis zum Ziel.`);
    else this.banner('KEIN WEG ZUM ZIEL GEFUNDEN');
  }
  clearMarker(silent) {
    this.marker = null; this.route = null;
    this.ribbon.visible = false; this.hud.style.display = 'none';
    if (!silent) this._say('Navigation beendet.');
  }
  _route(from) {
    if (!this.marker) return;
    const path = this.findPath(from.x, from.z, this.marker.x, this.marker.z);
    if (!path || path.length < 2) { this.route = null; this.ribbon.visible = false; return; }
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
    const turns = [];                                   // Abbiegepunkte (Richtungswechsel > 35°)
    for (let i = 1; i < path.length - 1; i++) {
      const ax = path[i].x - path[i - 1].x, az = path[i].z - path[i - 1].z, bx = path[i + 1].x - path[i].x, bz = path[i + 1].z - path[i].z;
      const ang = Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
      if (Math.abs(ang) > 0.61) turns.push({ i, at: cum[i], dir: ang > 0 ? 'rechts' : 'links', sharp: Math.abs(ang) > 1.9, said: 0 });
    }
    this.route = { path, cum, len: cum[cum.length - 1], turns, prog: 0, seg: 0 };
    this._buildRibbonGeometry();
  }
  _fmt(m) { return m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : (m < 20 ? Math.round(m) : Math.round(m / 10) * 10) + ' m'; }
  _say(text) {
    if (!this.voice || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'de-DE'; u.rate = 1.05; u.volume = 0.9;
      const v = speechSynthesis.getVoices().find(v => /^de/i.test(v.lang));
      if (v) u.voice = v;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) { /* Stimme nicht verfügbar */ }
  }

  // ------------------------------------------------------------------ Führung im Spiel (jedes Bild)
  update(dt, pos, yaw) {
    this.ribbonMat.map.offset.x -= dt * 0.9;            // Pfeile laufen in Fahrtrichtung
    const R = this.route;
    if (!R) return;
    // Fortschritt: nächster Punkt auf der Route (Suche um das letzte Segment)
    const P = R.path;
    let best = Infinity, bestSeg = R.seg, bestT = 0;
    for (let i = Math.max(0, R.seg - 3); i < Math.min(P.length - 1, R.seg + 12); i++) {
      const ax = P[i].x, az = P[i].z, dx = P[i + 1].x - ax, dz = P[i + 1].z - az, L2 = dx * dx + dz * dz || 1e-6;
      const t = Math.max(0, Math.min(1, ((pos.x - ax) * dx + (pos.z - az) * dz) / L2));
      const d = Math.hypot(pos.x - (ax + dx * t), pos.z - (az + dz * t));
      if (d < best) { best = d; bestSeg = i; bestT = t; }
    }
    R.seg = bestSeg; R.prog = R.cum[bestSeg] + bestT * (R.cum[bestSeg + 1] - R.cum[bestSeg]);
    const remain = R.len - R.prog;
    if (Math.hypot(pos.x - this.marker.x, pos.z - this.marker.z) < ARRIVE || remain < ARRIVE * 0.5) {
      this.banner('ZIEL ERREICHT'); this._say('Sie haben Ihr Ziel erreicht.');
      this.clearMarker(true); return;
    }
    this.rerouteT -= dt;
    if (best > OFFROUTE && this.rerouteT <= 0) {        // vom Weg abgekommen → neu berechnen
      this.rerouteT = 1.5; this._route(pos);
      if (this.route) this._say('Route wird neu berechnet.');
      return;
    }
    // sichtbarer Teil der Leuchtlinie: ab der aktuellen Position
    const q0 = Math.max(0, Math.floor(R.prog / this.ribbonStep) - 1);
    this.ribbon.geometry.setDrawRange(q0 * 6, Math.max(0, this.ribbonQuads - q0) * 6);
    // Richtungspfeil: Punkt 8 m voraus auf der Route
    const ahead = this._pointAt(Math.min(R.len, R.prog + 8));
    const dx = ahead.x - pos.x, dz = ahead.z - pos.z;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const rel = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    this.hudArrow.style.transform = `rotate(${rel - Math.PI / 2}rad)`;   // Zeichen ➤ zeigt nach rechts
    // nächste Abbiegung
    const next = R.turns.find(t => t.at > R.prog + 1);
    let text;
    if (next) {
      const d = next.at - R.prog;
      const verb = next.sharp ? `scharf ${next.dir}` : `${next.dir} abbiegen`;
      text = d < 12 ? `Jetzt ${verb}` : `In ${this._fmt(d)} ${verb}`;
      if (d < 45 && next.said < 1 && d > 15) { next.said = 1; this._say(`In ${this._fmt(d)} ${verb}.`); }
      if (d < 12 && next.said < 2) { next.said = 2; this._say(`Jetzt ${verb}.`); }
    } else text = 'Geradeaus';
    this.hudText.textContent = text;
    this.hudDist.textContent = `Ziel: ${this._fmt(remain)}`;
    this.hud.style.display = 'flex';
  }
  _pointAt(d) {
    const R = this.route, P = R.path;
    let i = Math.max(0, Math.min(P.length - 2, R.seg));
    while (i < P.length - 2 && R.cum[i + 1] < d) i++;
    const L = R.cum[i + 1] - R.cum[i] || 1e-6, t = Math.max(0, Math.min(1, (d - R.cum[i]) / L));
    return { x: P[i].x + (P[i + 1].x - P[i].x) * t, z: P[i].z + (P[i + 1].z - P[i].z) * t };
  }

  // ------------------------------------------------------------------ Leuchtlinie am Boden
  _buildRibbon() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(0, 22, 128, 20);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(34, 6); g.lineTo(78, 32); g.lineTo(34, 58); g.lineTo(52, 32); g.closePath(); g.fill();   // Pfeil „>“
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    this.ribbonMat = new THREE.MeshBasicMaterial({ map: tex, color: '#3cf2ff', transparent: true, opacity: 0.92, depthWrite: false, fog: false,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.ribbon = new THREE.Mesh(new THREE.BufferGeometry(), this.ribbonMat);
    this.ribbon.visible = false; this.ribbon.renderOrder = 4; this.ribbon.frustumCulled = false;
    this.ribbon.name = 'navRibbon';
    this.scene.add(this.ribbon);
    this.ribbonStep = 1; this.ribbonQuads = 0;
  }
  _buildRibbonGeometry() {
    const R = this.route, step = this.ribbonStep, W = 0.38;
    const pts = [];
    for (let d = 0; d <= R.len; d += step) pts.push(this._pointAlong(d));
    pts.push(R.path[R.path.length - 1]);
    const n = pts.length, pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), idx = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const y = this.groundAt(pts[i].x, pts[i].z) + 0.16, d = Math.min(R.len, i * step);
      pos.set([pts[i].x - dz * W, y, pts[i].z + dx * W, pts[i].x + dz * W, y, pts[i].z - dx * W], i * 6);
      uv.set([d / 1.6, 0, d / 1.6, 1], i * 4);
      if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.ribbon.geometry.dispose();
    this.ribbon.geometry = g;
    this.ribbonQuads = n - 1;
    this.ribbon.visible = true;
  }
  _pointAlong(d) {                                      // Punkt bei Strecke d (unabhängig vom Fortschritt)
    const R = this.route, P = R.path;
    let i = 0; while (i < P.length - 2 && R.cum[i + 1] < d) i++;
    const L = R.cum[i + 1] - R.cum[i] || 1e-6, t = Math.max(0, Math.min(1, (d - R.cum[i]) / L));
    return { x: P[i].x + (P[i + 1].x - P[i].x) * t, z: P[i].z + (P[i + 1].z - P[i].z) * t };
  }

  // ------------------------------------------------------------------ Radar
  /** Route + Ziel ins Radar zeichnen. project(dx,dz) → {x,y} in Radar-Pixeln (gleiche Drehung wie die Gegnerpunkte). */
  drawRadar(ctx, pos, project, cx, cy, maxR) {
    if (!this.marker) return;
    if (this.route) {
      ctx.save();
      ctx.strokeStyle = 'rgba(60,242,255,0.9)'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.beginPath();
      const P = this.route.path; let started = false;
      const from = Math.max(0, this.route.seg);
      const p0 = project(0, 0); ctx.moveTo(p0.x, p0.y); started = true;
      for (let i = from + 1; i < P.length; i++) { const p = project(P[i].x - pos.x, P[i].z - pos.z); ctx.lineTo(p.x, p.y); }
      if (started) ctx.stroke();
      ctx.restore();
    }
    let m = project(this.marker.x - pos.x, this.marker.z - pos.z);
    const d = Math.hypot(m.x - cx, m.y - cy);
    if (d > maxR) m = { x: cx + (m.x - cx) / d * maxR, y: cy + (m.y - cy) / d * maxR };
    ctx.save();
    ctx.fillStyle = '#ff3b6b'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(m.x, m.y, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------------ Vollbild-Karte
  _buildDom() {
    const root = document.createElement('div');
    root.id = 'navMap';
    root.innerHTML = `
      <canvas id="navMapCanvas"></canvas>
      <div class="nm-top"><b>KARTE</b><span id="nmInfo"></span>
        <button id="nmVoice" type="button"></button><button id="nmClear" type="button">Ziel löschen</button><button id="nmClose" type="button">Schließen (N)</button></div>
      <div class="nm-help">Mausrad: Zoom · Ziehen: Verschieben · Klick: Ziel setzen · Rechtsklick: Ziel löschen · Leertaste: auf mich zentrieren · N / Tab: zurück ins Spiel · Esc: Pause</div>`;
    document.body.appendChild(root);
    const hud = document.createElement('div');
    hud.id = 'navHud';
    hud.innerHTML = `<div class="nh-arrow">➤</div><div class="nh-col"><div class="nh-text"></div><div class="nh-dist"></div></div>`;
    document.body.appendChild(hud);
    this.root = root; this.canvas = root.querySelector('canvas'); this.ctx = this.canvas.getContext('2d');
    this.hud = hud; this.hudArrow = hud.querySelector('.nh-arrow'); this.hudText = hud.querySelector('.nh-text'); this.hudDist = hud.querySelector('.nh-dist');
    this.info = root.querySelector('#nmInfo');
    const vb = root.querySelector('#nmVoice');
    const syncVoice = () => { vb.textContent = this.voice ? '🔊 Navi-Stimme: AN' : '🔇 Navi-Stimme: AUS'; };
    syncVoice();
    vb.addEventListener('click', (e) => { e.stopPropagation(); this.voice = !this.voice; localStorage.setItem('rod.navVoice', this.voice ? '1' : '0'); syncVoice(); });
    root.querySelector('#nmClear').addEventListener('click', (e) => { e.stopPropagation(); this.clearMarker(); });
    root.querySelector('#nmClose').addEventListener('click', (e) => { e.stopPropagation(); this.onRequestClose?.('resume'); });
    // Maus: Zoom um den Mauszeiger, Ziehen = verschieben, Klick = Ziel
    const cv = this.canvas;
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const w = this._toWorld(mx, my), f = Math.pow(1.0015, -e.deltaY);
      this.view.s = Math.max(this._minScale(), Math.min(14, this.view.s * f));
      this.view.x = w.x - (mx - r.width / 2) / this.view.s; this.view.z = w.z - (my - r.height / 2) / this.view.s;
    }, { passive: false });
    let drag = null;
    cv.addEventListener('mousedown', (e) => { if (e.button === 0) drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vz: this.view.z, moved: false }; });
    addEventListener('mousemove', (e) => {
      if (!drag || !this.isOpen) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) { this.view.x = drag.vx - dx / this.view.s; this.view.z = drag.vz - dy / this.view.s; }
    });
    addEventListener('mouseup', (e) => {
      if (!drag || !this.isOpen) { drag = null; return; }
      const wasClick = !drag.moved; drag = null;
      if (wasClick && e.target === cv) {
        const r = cv.getBoundingClientRect(), w = this._toWorld(e.clientX - r.left, e.clientY - r.top);
        this.setMarker(w.x, w.z, this._lastPos || { x: 0, z: 0 });
      }
    });
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); if (this.marker) this.clearMarker(); });
  }
  _minScale() { const r = this.canvas.getBoundingClientRect(), B = this.getBounds(); return Math.min(r.width / (2 * (B.x + 60)), r.height / (2 * (B.z + 60))); }
  _toWorld(mx, my) {
    const r = this.canvas.getBoundingClientRect();
    return { x: this.view.x + (mx - r.width / 2) / this.view.s, z: this.view.z + (my - r.height / 2) / this.view.s };
  }
  open(pos) {
    this.isOpen = true; this.root.style.display = 'block';
    this._lastPos = { x: pos.x, z: pos.z };
    const r = this.canvas.getBoundingClientRect();
    if (!this._viewInit) {                               // beim ersten Öffnen: ~240 m Ausschnitt um den Spieler
      const B = this.getBounds();
      this.view.s = Math.max(this._minScale(), Math.min(r.width, r.height) / Math.min(240, 2 * Math.min(B.x, B.z) + 20));
      this._viewInit = true;
    }
    this.view.x = pos.x; this.view.z = pos.z;
    this._ensureGrid();
  }
  close() { this.isOpen = false; this.root.style.display = 'none'; }
  center(pos) { this.view.x = pos.x; this.view.z = pos.z; }

  draw(pos, yaw) {
    this._lastPos = { x: pos.x, z: pos.z };
    const cv = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = this.ctx, v = this.view, s = v.s;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#10161d'; g.fillRect(0, 0, W, H);
    const X = (x) => (x - v.x) * s + W / 2, Y = (z) => (z - v.z) * s + H / 2;
    // Luftbild-Ebenen (grob → fein)
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    for (const l of this.layers) g.drawImage(l.image, X(-l.half), Y(-l.half), 2 * l.half * s, 2 * l.half * s);
    const B = this.getBounds(), photo = this.layers.length > 0;
    // Hindernisse: ohne Luftbild als Grundriss-Karte, mit Luftbild nur dezente Umrisse
    g.lineWidth = 1;
    for (const o of this.obstacles) {
      if (X(o.maxX) < 0 || X(o.minX) > W || Y(o.maxZ) < 0 || Y(o.minZ) > H) continue;
      if (o.poly) {
        g.beginPath();
        for (let i = 0; i < o.poly.length; i += 2) { const px = X(o.poly[i]), py = Y(o.poly[i + 1]); i ? g.lineTo(px, py) : g.moveTo(px, py); }
        g.closePath();
        if (photo) { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.stroke(); }
        else { g.fillStyle = 'rgba(150,160,175,0.85)'; g.fill(); g.strokeStyle = '#d7dde6'; g.stroke(); }
      } else if (!photo || (o.maxX - o.minX) > 1.2) {
        g.fillStyle = photo ? 'rgba(255,255,255,0.25)' : 'rgba(150,160,175,0.85)';
        g.fillRect(X(o.minX), Y(o.minZ), (o.maxX - o.minX) * s, (o.maxZ - o.minZ) * s);
      }
    }
    if (!photo && this.roads.length) {
      g.strokeStyle = 'rgba(230,220,190,0.55)'; g.lineCap = 'round';
      for (const r of this.roads) { g.lineWidth = Math.max(1, (r.width || 4) * s); g.beginPath();
        for (let i = 0; i < r.pts.length; i += 2) { const px = X(r.pts[i]), py = Y(r.pts[i + 1]); i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); }
    }
    // Spielgrenze
    g.setLineDash([10, 7]); g.strokeStyle = '#ffd34d'; g.lineWidth = 2;
    g.strokeRect(X(-B.x), Y(-B.z), 2 * B.x * s, 2 * B.z * s); g.setLineDash([]);
    // Route
    if (this.route) {
      const P = this.route.path;
      for (const [w, col] of [[7, 'rgba(0,20,30,0.75)'], [4, '#3cf2ff']]) {
        g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath();
        P.forEach((p, i) => { const px = X(p.x), py = Y(p.z); i ? g.lineTo(px, py) : g.moveTo(px, py); });
        g.stroke();
      }
    }
    // Gegner
    for (const e of this.getEnemies()) {
      if (e.dead) continue;
      g.fillStyle = '#ff3b3b'; g.beginPath(); g.arc(X(e.g.position.x), Y(e.g.position.z), 3.5, 0, Math.PI * 2); g.fill();
    }
    // Ziel-Nadel
    if (this.marker) {
      const mx = X(this.marker.x), my = Y(this.marker.z);
      g.fillStyle = '#ff3b6b'; g.strokeStyle = '#fff'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(mx, my); g.lineTo(mx - 9, my - 18); g.arc(mx, my - 20, 9, Math.PI * 0.82, Math.PI * 0.18); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(mx, my - 20, 3.5, 0, Math.PI * 2); g.fill();
    }
    // Spieler-Pfeil (Blickrichtung)
    {
      const px = X(pos.x), py = Y(pos.z), a = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
      g.save(); g.translate(px, py); g.rotate(a);
      g.fillStyle = '#7ef0c0'; g.strokeStyle = '#06140d'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(13, 0); g.lineTo(-8, -8); g.lineTo(-4, 0); g.lineTo(-8, 8); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
    // Maßstab + Norden
    const nice = [5, 10, 20, 50, 100, 200, 500].find(m => m * s >= 70) || 500;
    g.fillStyle = 'rgba(8,14,20,0.8)'; g.fillRect(14, H - 40, nice * s + 20, 26);
    g.fillStyle = '#e8eef5'; g.fillRect(24, H - 24, nice * s, 4);
    g.font = '600 12px system-ui, sans-serif'; g.fillText(`${nice} m`, 24, H - 28);
    g.save(); g.translate(W - 34, 70); g.fillStyle = 'rgba(8,14,20,0.8)'; g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff6b6b'; g.beginPath(); g.moveTo(0, -13); g.lineTo(6, 2); g.lineTo(-6, 2); g.closePath(); g.fill();
    g.fillStyle = '#e8eef5'; g.font = '700 11px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('N', 0, 14); g.restore();
    this.info.textContent = this.route ? `Ziel: ${this._fmt(this.route.len - this.route.prog)} · ${this.route.turns.length} Abbiegungen`
      : (this.marker ? 'Kein Weg gefunden' : 'Klick auf die Karte setzt ein Ziel');
  }
}
