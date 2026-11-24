import * as THREE from 'three';

/**
 * Wahrzeichen in Much, die das LoD2-Modell nicht enthält – nachgebaut nach Street-View-Bildern (nur Vorlage für
 * Form, Farben und Lage der Details, nicht als Textur). Maße aus dem LoD2-Grundriss und dem 3D-Mesh von
 * Geobasis NRW (Befliegung Juni 2025, siehe tools/nrw_mesh_fetch.py).
 *  - Turm von St. Martinus: Im LoD2 ist die Kirche ein Klotz von 15 m Höhe, der Turm fehlt. Grundriss = die vier
 *    Turmecken im LoD2-Umriss, Traufe und Helmspitze aus dem Mesh (Spielkoordinaten wie in nrw-level.js).
 *  - Kugelbrunnen auf dem Platz vor der VR-Bank (Lage aus Luftbild und Mesh geschätzt).
 * Dazu die Wandtexturen für Kirchenschiff und Bank (Ebenen im Fassaden-Array von nrw-level.js).
 * Turm und Brunnen sind EIN Mesh mit EINER Textur → ein Draw-Call.
 */
export const MUCH_TOWER = {
  corners: [[368.63, -21.44], [370.53, -28.7], [377.28, -26.69], [375.35, -19.59]],
  eave: 16.3,          // Oberkante Turmschaft (Spielkoordinaten, y)
  apex: 38.3,          // Helmspitze
};
export const MUCH_FOUNTAIN = { x: 383.5, z: -67, r: 1.7, h: 0.55, ball: 0.7 };

const PLASTER = '#d4856e';           // Altrosa/Lachs der Kirche (nach Foto)
const BASALT = '#4e4b47';            // dunkler Sockel und Portal

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function speckle(g, x, y, w, h, n, a, rnd) {
  for (let i = 0; i < n; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${a * rnd()})`;
    g.fillRect(x + rnd() * w, y + rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}
/** Rundbogen: Rechteck von h0 bis zum Bogenansatz, Halbkreis oben (Maße in Metern, X/Y rechnen in Pixel um). */
function archPath(g, X, Y, sx, sy, xc, w, h0, h1) {
  const r = w / 2;
  g.beginPath();
  g.moveTo(X(xc - r), Y(h0)); g.lineTo(X(xc - r), Y(h1 - r));
  g.ellipse(X(xc), Y(h1 - r), r * sx, r * sy, 0, Math.PI, 0);
  g.lineTo(X(xc + r), Y(h0)); g.closePath();
}

// ---------------------------------------------------------------------------------------------------------------
// Wandtexturen für das Fassaden-Array (256 × 256, nrw-level.js legt sie als Ebenen ab)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Kirchenschiff: eine Kachel = 4 m breit × 8 m hoch ab Gebäudesockel (nrw-level.js streckt v nicht, sondern klemmt
 * oben → über 8 m glatter Putz). Basaltsockel, Rundbogenfenster mit Bleiverglasung, Sohlbank.
 */
function churchWall() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), rnd = rng(31);
  const sx = S / 4, sy = S / 8, X = (m) => m * sx, Y = (h) => (8 - h) * sy;
  g.fillStyle = PLASTER; g.fillRect(0, 0, S, S);
  speckle(g, 0, 0, S, S, 2600, 0.06, rnd);
  const dirt = g.createLinearGradient(0, Y(2), 0, Y(0.8));
  dirt.addColorStop(0, 'rgba(90,50,40,0)'); dirt.addColorStop(1, 'rgba(90,50,40,0.16)');
  g.fillStyle = dirt; g.fillRect(0, Y(2), S, Y(0.8) - Y(2));
  // Basaltsockel mit Quaderfugen
  g.fillStyle = BASALT; g.fillRect(0, Y(0.8), S, S - Y(0.8));
  for (let row = 0, h = 0; h < 0.8; row++, h += 0.27) {
    for (let x = (row % 2) * -0.35; x < 4; x += 0.7) {
      const l = 70 + rnd() * 18;
      g.fillStyle = `rgb(${l | 0},${(l - 3) | 0},${(l - 7) | 0})`;
      g.fillRect(X(x) + 1, Y(Math.min(0.8, h + 0.27)) + 1, X(0.7) - 2, (Math.min(0.8, h + 0.27) - h) * sy - 2);
    }
  }
  g.fillStyle = '#8a847c'; g.fillRect(0, Y(0.86), S, 0.08 * sy);          // Sockelabdeckung
  // Fenster: Laibung (dunkler Putz), Glas mit Verlauf, Bleiruten, Sohlbank
  g.fillStyle = '#b36a58'; archPath(g, X, Y, sx, sy, 2, 1.42, 2.0, 5.35); g.fill();
  const gl = g.createLinearGradient(0, Y(5.2), 0, Y(2.1));
  gl.addColorStop(0, '#6c7f8c'); gl.addColorStop(0.45, '#3a4651'); gl.addColorStop(1, '#222a31');
  g.fillStyle = gl; archPath(g, X, Y, sx, sy, 2, 1.18, 2.12, 5.2); g.fill();
  g.save(); archPath(g, X, Y, sx, sy, 2, 1.18, 2.12, 5.2); g.clip();
  g.strokeStyle = 'rgba(190,196,198,0.55)'; g.lineWidth = 1;
  for (const xm of [1.6, 2.0, 2.4]) { g.beginPath(); g.moveTo(X(xm), Y(2.1)); g.lineTo(X(xm), Y(5.3)); g.stroke(); }
  for (let h = 2.5; h < 5.2; h += 0.4) { g.beginPath(); g.moveTo(X(1.4), Y(h)); g.lineTo(X(2.6), Y(h)); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(X(1.45), Y(5.2), X(0.25), Y(2.1) - Y(5.2));
  g.restore();
  g.fillStyle = '#a49c92'; g.fillRect(X(1.25), Y(2.06), X(1.5), 0.12 * sy);  // Sohlbank
  g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(X(1.3), Y(1.94), X(1.4), 0.05 * sy);
  return c;
}

/** Bank, Erdgeschoss (3,6 m × 3 m): Glasfelder in dunklen Rahmen, mintgrüne Brüstung, dunkle Blende darüber. */
function bankGround() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), rnd = rng(47);
  const sx = S / 3, sy = S / 3.6, X = (m) => m * sx, Y = (h) => (3.6 - h) * sy;
  g.fillStyle = '#9fd0c6'; g.fillRect(0, 0, S, S);                        // Mintgrün
  speckle(g, 0, 0, S, S, 500, 0.04, rnd);
  g.fillStyle = '#5f6468'; g.fillRect(0, Y(0.35), S, S - Y(0.35));        // Sockel
  g.fillStyle = '#3d4246'; g.fillRect(X(0.12), Y(2.85), X(2.76), Y(0.35) - Y(2.85));   // Rahmen
  const gl = g.createLinearGradient(X(0.2), Y(2.8), X(2.8), Y(0.4));
  gl.addColorStop(0, '#8fb3b4'); gl.addColorStop(0.5, '#3f5a60'); gl.addColorStop(1, '#25343a');
  g.fillStyle = gl; g.fillRect(X(0.2), Y(2.78), X(2.6), Y(0.42) - Y(2.78));
  g.fillStyle = '#3d4246'; g.fillRect(X(1.47), Y(2.85), X(0.06), Y(0.35) - Y(2.85));   // Mittelpfosten
  g.fillRect(X(0.12), Y(2.3), X(2.76), 0.05 * sy);                          // Kämpfer
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.beginPath(); g.moveTo(X(0.4), Y(0.42)); g.lineTo(X(1.1), Y(2.78)); g.lineTo(X(1.35), Y(2.78)); g.lineTo(X(0.65), Y(0.42)); g.fill();
  g.fillStyle = '#4a4e53'; g.fillRect(0, 0, S, Y(2.95));                    // Blende über dem Erdgeschoss
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, Y(2.97), S, 0.03 * sy);
  return c;
}

/** Bank, Obergeschoss (3,6 m × 3 m): Fensterband mit dunklen Rahmen, mintgrüne Paneele, dunkle Abdeckung oben. */
function bankUpper() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), rnd = rng(53);
  const sx = S / 3, sy = S / 3.6, X = (m) => m * sx, Y = (h) => (3.6 - h) * sy;
  g.fillStyle = '#a6d6cc'; g.fillRect(0, 0, S, S);
  speckle(g, 0, 0, S, S, 500, 0.04, rnd);
  for (let x = 0; x < 3; x += 1.0) { g.fillStyle = 'rgba(40,70,66,0.18)'; g.fillRect(X(x), 0, 1.5, S); }   // Paneelfugen
  g.fillStyle = '#3d4246'; g.fillRect(X(0.35), Y(2.75), X(1.9), Y(0.85) - Y(2.75));
  const gl = g.createLinearGradient(X(0.4), Y(2.7), X(2.2), Y(0.9));
  gl.addColorStop(0, '#9cc0c0'); gl.addColorStop(0.55, '#46636a'); gl.addColorStop(1, '#2a3a40');
  g.fillStyle = gl; g.fillRect(X(0.42), Y(2.68), X(1.76), Y(0.92) - Y(2.68));
  g.fillStyle = '#3d4246'; g.fillRect(X(1.27), Y(2.75), X(0.06), Y(0.85) - Y(2.75));
  g.fillStyle = 'rgba(235,240,240,0.35)'; g.fillRect(X(0.42), Y(2.68), X(1.76), 0.35 * sy);   // Jalousie halb oben
  g.fillStyle = '#c9cfcf'; g.fillRect(X(0.3), Y(0.85), X(2.0), 0.06 * sy);   // Fensterbank
  g.fillStyle = '#44494e'; g.fillRect(0, 0, S, Y(3.3));                     // Abdeckung / Traufblech
  return c;
}

/** Fassaden-Ebenen für nrw-level.js: { church, bank_eg, bank_og } als { image }. */
export function muchWallTextures() {
  return { church: { image: churchWall() }, bank_eg: { image: bankGround() }, bank_og: { image: bankUpper() } };
}

// ---------------------------------------------------------------------------------------------------------------
// Turm und Brunnen: ein Atlas 2048 × 1024
// ---------------------------------------------------------------------------------------------------------------
const AW = 2048, AH = 1024, FACE_W = 300;
const REG = {
  spire: [1200, 0, 400, 1024],
  stone: [1600, 0, 224, 256], water: [1824, 0, 224, 256],
  bronze: [1600, 256, 224, 256], metal: [1824, 256, 224, 256],
  gold: [1600, 512, 224, 128], soffit: [1824, 512, 224, 128],
};

/** Eine Turmseite: w × hT Meter (ab Turmfuß), gr = Gelände über dem Fuß, kind = Himmelsrichtung. */
function drawTowerFace(g, ox, w, hT, gr, kind, rnd) {
  const sx = FACE_W / w, sy = AH / hT;
  const X = (m) => ox + m * sx, Y = (h) => (hT - h) * sy;
  const R = (x0, x1, h0, h1, col) => { g.fillStyle = col; g.fillRect(X(x0), Y(h1), (x1 - x0) * sx, (h1 - h0) * sy); };
  g.save(); g.beginPath(); g.rect(ox, 0, FACE_W, AH); g.clip();
  R(0, w, 0, hT, PLASTER);
  speckle(g, ox, 0, FACE_W, AH, 9000, 0.06, rnd);
  for (let i = 0; i < 26; i++) {                              // feine Regenspuren
    const x = rnd() * w, h1 = hT - 0.4 - rnd() * 3, len = 2 + rnd() * 8;
    g.fillStyle = `rgba(80,45,35,${0.03 + rnd() * 0.04})`; g.fillRect(X(x), Y(h1), 1 + rnd() * 2, len * sy);
  }
  const dirt = g.createLinearGradient(0, Y(gr + 2.5), 0, Y(gr + 0.9));
  dirt.addColorStop(0, 'rgba(90,50,40,0)'); dirt.addColorStop(1, 'rgba(90,50,40,0.18)');
  g.fillStyle = dirt; g.fillRect(ox, Y(gr + 2.5), FACE_W, (1.6) * sy);
  // Sockel: Basaltquader bis knapp 1 m über Gelände
  const pTop = gr + 0.95;
  R(0, w, 0, pTop, BASALT);
  for (let row = 0, h = 0; h < pTop; row++, h += 0.32) {
    for (let x = (row % 2) * -0.4; x < w; x += 0.8) {
      const l = 68 + rnd() * 20;
      g.fillStyle = `rgb(${l | 0},${(l - 3) | 0},${(l - 7) | 0})`;
      g.fillRect(X(x) + 1, Y(Math.min(pTop, h + 0.32)) + 1, 0.8 * sx - 2, (Math.min(pTop, h + 0.32) - h) * sy - 2);
    }
  }
  R(0, w, pTop - 0.06, pTop + 0.06, '#77716a');
  // Traufgesims
  R(0, w, hT - 0.32, hT, '#3c3836');
  R(0, w, hT - 0.4, hT - 0.32, 'rgba(0,0,0,0.25)');
  // Schallöffnungen: zwei schmale Rundbögen mit Lamellen
  for (const xc of [w * 0.37, w * 0.63]) {
    g.fillStyle = '#ad6452'; archPath(g, X, Y, sx, sy, xc, 0.82, hT - 3.15, hT - 0.9); g.fill();
    g.fillStyle = '#1d1a18'; archPath(g, X, Y, sx, sy, xc, 0.62, hT - 3.05, hT - 1.0); g.fill();
    g.save(); archPath(g, X, Y, sx, sy, xc, 0.62, hT - 3.05, hT - 1.0); g.clip();
    for (let h = hT - 3.0; h < hT - 1.1; h += 0.19) R(xc - 0.32, xc + 0.32, h, h + 0.06, '#4a403a');
    g.restore();
    R(xc - 0.45, xc + 0.45, hT - 3.22, hT - 3.12, '#8d867e');
  }
  // Turmuhr: grünes Zifferblatt, goldener Ring, Stundenmarken und Zeiger (10:10)
  {
    const cx = X(w / 2), cy = Y(hT - 4.35), r = 0.66;
    g.fillStyle = '#c4a048'; g.beginPath(); g.ellipse(cx, cy, r * sx, r * sy, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#23443a'; g.beginPath(); g.ellipse(cx, cy, (r - 0.08) * sx, (r - 0.08) * sy, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d9b75a'; g.lineCap = 'round';
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2, c = Math.sin(a), s = -Math.cos(a);
      g.lineWidth = k % 3 ? 2 : 3;
      g.beginPath(); g.moveTo(cx + c * (r - 0.2) * sx, cy + s * (r - 0.2) * sy); g.lineTo(cx + c * (r - 0.11) * sx, cy + s * (r - 0.11) * sy); g.stroke();
    }
    const hand = (a, len, lw) => { g.lineWidth = lw; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(a) * len * sx, cy - Math.cos(a) * len * sy); g.stroke(); };
    hand(-Math.PI / 3 - 0.08, 0.32, 3); hand(Math.PI / 3, 0.46, 2);
  }
  if (kind === 'W') {
    // Hauptportal: hohe Rundbogennische aus dunklem Stein, darin die rote Doppeltür
    const xc = w / 2;
    g.fillStyle = '#5d5953'; archPath(g, X, Y, sx, sy, xc, 3.15, gr, gr + 7.15); g.fill();
    g.strokeStyle = 'rgba(30,28,26,0.55)'; g.lineWidth = 1.5;               // Keilsteine im Bogen
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI + k / 10 * Math.PI, r0 = 1.25, r1 = 1.575, cy = gr + 7.15 - 1.575;
      g.beginPath(); g.moveTo(X(xc + Math.cos(a) * r0), Y(cy - Math.sin(a) * r0)); g.lineTo(X(xc + Math.cos(a) * r1), Y(cy - Math.sin(a) * r1)); g.stroke();
    }
    for (let h = gr + 0.6; h < gr + 5.5; h += 0.6) {
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(X(xc + s * 1.25), Y(h)); g.lineTo(X(xc + s * 1.575), Y(h)); g.stroke(); }
    }
    g.fillStyle = '#46423e'; archPath(g, X, Y, sx, sy, xc, 2.5, gr, gr + 6.85); g.fill();
    g.fillStyle = '#7a2620'; archPath(g, X, Y, sx, sy, xc, 2.02, gr, gr + 4.3); g.fill();
    g.fillStyle = '#a3352b'; archPath(g, X, Y, sx, sy, xc, 1.86, gr, gr + 4.2); g.fill();
    R(xc - 0.025, xc + 0.025, gr, gr + 3.25, '#5e1d18');                    // Mittelfuge
    for (const s of [-1, 1]) {                                                // Füllungen je Flügel
      R(xc + s * 0.15 - (s < 0 ? 0.62 : 0), xc + s * 0.15 + (s > 0 ? 0.62 : 0), gr + 0.3, gr + 1.6, 'rgba(70,15,12,0.35)');
      R(xc + s * 0.15 - (s < 0 ? 0.62 : 0), xc + s * 0.15 + (s > 0 ? 0.62 : 0), gr + 1.9, gr + 3.0, 'rgba(70,15,12,0.35)');
    }
    R(xc - 0.12, xc - 0.06, gr + 1.2, gr + 1.5, '#c9b06a'); R(xc + 0.06, xc + 0.12, gr + 1.2, gr + 1.5, '#c9b06a');
    R(xc - 1.4, xc + 1.4, gr - 0.1, gr + 0.12, '#8b8781');                  // Schwelle
  } else if (kind === 'N' || kind === 'S') {
    // schmales Rundbogenfenster etwa auf halber Höhe
    const h0 = gr + (hT - gr) * 0.42;
    g.fillStyle = '#ad6452'; archPath(g, X, Y, sx, sy, w / 2, 0.66, h0, h0 + 2.0); g.fill();
    const gl = g.createLinearGradient(0, Y(h0 + 1.9), 0, Y(h0));
    gl.addColorStop(0, '#5f717c'); gl.addColorStop(1, '#232a30');
    g.fillStyle = gl; archPath(g, X, Y, sx, sy, w / 2, 0.48, h0 + 0.08, h0 + 1.9); g.fill();
    R(w / 2 - 0.38, w / 2 + 0.38, h0 - 0.06, h0 + 0.05, '#8d867e');
  }
  g.restore();
}

function drawAtlasExtras(g, rnd) {
  // Helm: Schieferschuppen in Reihen, Grate als hellere Linien
  {
    const [x0, y0, w, h] = REG.spire;
    g.fillStyle = '#41464e'; g.fillRect(x0, y0, w, h);
    for (let y = y0 + h - 9, row = 0; y > y0 - 9; y -= 9, row++) {
      for (let x = x0 - (row % 2) * 7; x < x0 + w; x += 14) {
        const l = 60 + rnd() * 20;
        g.fillStyle = `rgb(${l | 0},${(l + 5) | 0},${(l + 13) | 0})`;
        g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + 13, y); g.lineTo(x + 13, y + 6);
        g.quadraticCurveTo(x + 7, y + 10, x + 1, y + 6); g.closePath(); g.fill();
      }
    }
    g.strokeStyle = 'rgba(150,156,162,0.65)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(x0 + 2, y0 + h); g.lineTo(x0 + w / 2, y0); g.lineTo(x0 + w - 2, y0 + h); g.stroke();
  }
  const fill = (r, col, n = 0, a = 0.08) => { const [x, y, w, h] = REG[r]; g.fillStyle = col; g.fillRect(x, y, w, h); if (n) speckle(g, x, y, w, h, n, a, rnd); };
  fill('stone', '#55524d');
  {
    const [x0, y0, w, h] = REG.stone;
    for (let y = y0, row = 0; y < y0 + h; y += 32, row++) {
      for (let x = x0 - (row % 2) * 28; x < x0 + w; x += 56) {
        const l = 72 + rnd() * 22;
        g.fillStyle = `rgb(${l | 0},${(l - 2) | 0},${(l - 6) | 0})`; g.fillRect(Math.max(x0, x + 2), y + 2, 52, 28);
      }
    }
  }
  fill('water', '#3e5560');
  {
    const [x0, y0, w, h] = REG.water;
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(190,215,225,${0.08 + rnd() * 0.12})`; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(x0 + rnd() * w, y0 + rnd() * h, 8 + rnd() * 30, 3 + rnd() * 8, 0, 0, Math.PI * 2); g.stroke();
    }
  }
  fill('bronze', '#36322e', 3000, 0.1);
  fill('metal', '#2b2b2e', 800, 0.06);
  fill('gold', '#c9a443', 400, 0.1);
  fill('soffit', '#5d3429', 600, 0.08);
}

/**
 * Turm von St. Martinus und Kugelbrunnen bauen. H(x, z) = Geländehöhe.
 * → { mesh, hull (unsichtbare Trefferhülle), obstacles, tall: { h, c } }
 */
export function buildMuchLandmarks(H, hullMat) {
  const T = MUCH_TOWER, rnd = rng(1902);
  const pos = [], nor = [], uv = [], hull = [];
  const UV = (px, py) => [px / AW, 1 - py / AH];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  /** Dreieck; Wicklung so, dass die Vorderseite zu dir zeigt; n = flache Normale oder [na, nb, nc] (weich). */
  const tri = (a, b, c, ta, tb, tc, dir, ns = null, solid = true) => {
    const fn = norm(cross(sub(b, a), sub(c, b)));
    if (dot(fn, dir) < 0) { [b, c] = [c, b]; [tb, tc] = [tc, tb]; if (ns) ns = [ns[0], ns[2], ns[1]]; }
    const n3 = ns || [norm(dir), norm(dir), norm(dir)];
    for (const [p, t, n] of [[a, ta, n3[0]], [b, tb, n3[1]], [c, tc, n3[2]]]) { pos.push(...p); uv.push(...t); nor.push(...n); }
    if (solid) hull.push(...a, ...b, ...c);
  };
  const quad = (a, b, c, d, ta, tb, tc, td, dir, ns = null, solid = true) => {
    tri(a, b, c, ta, tb, tc, dir, ns && [ns[0], ns[1], ns[2]], solid);
    tri(a, c, d, ta, tc, td, dir, ns && [ns[0], ns[2], ns[3]], solid);
  };

  // ---------- Turm ----------
  const P = T.corners, n = P.length;
  const cx = P.reduce((s, p) => s + p[0], 0) / n, cz = P.reduce((s, p) => s + p[1], 0) / n;
  // Kanten mit Außennormale; Polygon um d nach außen versetzen (Gehrung an den Ecken)
  const edges = P.map((a, i) => {
    const b = P[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez);
    let nx = ez / l, nz = -ex / l;
    if ((a[0] + b[0]) / 2 * nx + (a[1] + b[1]) / 2 * nz < cx * nx + cz * nz) { nx = -nx; nz = -nz; }
    return { nx, nz };
  });
  const offset = (d) => P.map((p, i) => {
    const e0 = edges[(i + n - 1) % n], e1 = edges[i], k = d / (1 + e0.nx * e1.nx + e0.nz * e1.nz);
    return [p[0] + (e0.nx + e1.nx) * k, p[1] + (e0.nz + e1.nz) * k];
  });
  const wall = offset(0.08);                         // knapp vor den LoD2-Wänden (kein Flimmern)
  const yb = Math.min(...wall.map(p => H(p[0], p[1]))) - 0.6;   // Turmfuß etwas im Boden
  const hT = T.eave - yb;
  const kindOf = (e) => (Math.abs(e.nx) > Math.abs(e.nz) ? (e.nx < 0 ? 'W' : 'E') : (e.nz < 0 ? 'N' : 'S'));
  const atlas = canvas(AW, AH), g = atlas.getContext('2d');
  for (let i = 0; i < n; i++) {
    const a = wall[i], b = wall[(i + 1) % n], e = edges[i];
    const rx = e.nz, rz = -e.nx;                     // nach rechts, von außen gesehen
    const [L, Rr] = a[0] * rx + a[1] * rz < b[0] * rx + b[1] * rz ? [a, b] : [b, a];
    const w = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let gmin = Infinity;                              // Gelände vor dieser Seite
    for (let s = 0; s <= 4; s++) {
      const t = 0.1 + 0.8 * s / 4, x = L[0] + (Rr[0] - L[0]) * t + e.nx * 0.6, z = L[1] + (Rr[1] - L[1]) * t + e.nz * 0.6;
      gmin = Math.min(gmin, H(x, z));
    }
    const ox = i * FACE_W;
    drawTowerFace(g, ox, w, hT, Math.max(0, gmin - yb), kindOf(e), rnd);
    const u0 = UV(ox + 1, 0)[0], u1 = UV(ox + FACE_W - 1, 0)[0];
    quad([L[0], yb, L[1]], [Rr[0], yb, Rr[1]], [Rr[0], T.eave, Rr[1]], [L[0], T.eave, L[1]],
      [u0, 0], [u1, 0], [u1, 1], [u0, 1], [e.nx, 0, e.nz]);
  }
  drawAtlasExtras(g, rnd);

  // Helm: Unterseite der Traufe, kurzer Knick (aufgeschiebt), dann schlanke Pyramide bis zur Spitze
  const eaveSq = offset(0.55), baseSq = offset(0.04), yKnick = T.eave + 1.3;
  const apex = [cx, T.apex, cz];
  const [sx0, sy0, sw, sh] = REG.spire, [fx0, fy0, fw, fh] = REG.soffit;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, e = edges[i];
    const w0 = wall[i], w1 = wall[j], o0 = eaveSq[i], o1 = eaveSq[j], b0 = baseSq[i], b1 = baseSq[j];
    quad([w0[0], T.eave, w0[1]], [w1[0], T.eave, w1[1]], [o1[0], T.eave, o1[1]], [o0[0], T.eave, o0[1]],
      UV(fx0 + 4, fy0 + 4), UV(fx0 + fw - 4, fy0 + 4), UV(fx0 + fw - 4, fy0 + fh - 4), UV(fx0 + 4, fy0 + fh - 4), [0, -1, 0]);
    const kn = norm([e.nx * 1.3, 0.55, e.nz * 1.3]);
    quad([o0[0], T.eave, o0[1]], [o1[0], T.eave, o1[1]], [b1[0], yKnick, b1[1]], [b0[0], yKnick, b0[1]],
      UV(sx0, sy0 + sh), UV(sx0 + sw, sy0 + sh), UV(sx0 + sw - 6, sy0 + sh - 60), UV(sx0 + 6, sy0 + sh - 60), kn);
    const sn = norm([e.nx * (T.apex - yKnick), 3.6, e.nz * (T.apex - yKnick)]);
    tri([b0[0], yKnick, b0[1]], [b1[0], yKnick, b1[1]], apex,
      UV(sx0 + 6, sy0 + sh - 60), UV(sx0 + sw - 6, sy0 + sh - 60), UV(sx0 + sw / 2, sy0 + 2), sn);
  }
  // Kreuz mit Kugel auf der Spitze
  const box = (x, y, z, hx, hy, hz, reg, solid = false) => {
    const [rx0, ry0, rw, rh] = REG[reg], t = [UV(rx0 + 4, ry0 + rh - 4), UV(rx0 + rw - 4, ry0 + rh - 4), UV(rx0 + rw - 4, ry0 + 4), UV(rx0 + 4, ry0 + 4)];
    const c = (sx, sy, sz) => [x + sx * hx, y + sy * hy, z + sz * hz];
    const faces = [[[1, 0, 0], c(1, -1, -1), c(1, -1, 1), c(1, 1, 1), c(1, 1, -1)], [[-1, 0, 0], c(-1, -1, 1), c(-1, -1, -1), c(-1, 1, -1), c(-1, 1, 1)],
      [[0, 0, 1], c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1)], [[0, 0, -1], c(1, -1, -1), c(-1, -1, -1), c(-1, 1, -1), c(1, 1, -1)],
      [[0, 1, 0], c(-1, 1, 1), c(1, 1, 1), c(1, 1, -1), c(-1, 1, -1)], [[0, -1, 0], c(-1, -1, -1), c(1, -1, -1), c(1, -1, 1), c(-1, -1, 1)]];
    for (const [d, a, b, cc, dd] of faces) quad(a, b, cc, dd, t[0], t[1], t[2], t[3], d, null, solid);
  };
  const ax = edges[0].nz, az = -edges[0].nx;         // Querbalken quer zur Westseite
  box(cx, T.apex + 1.0, cz, 0.06, 1.25, 0.06, 'metal');
  box(cx, T.apex + 1.55, cz, 0.55 * Math.abs(ax) + 0.06, 0.05, 0.55 * Math.abs(az) + 0.06, 'metal');
  box(cx, T.apex + 0.12, cz, 0.2, 0.2, 0.2, 'gold');

  // ---------- Kugelbrunnen ----------
  const F = MUCH_FOUNTAIN, gy = H(F.x, F.z), SEG = 28, rIn = F.r - 0.25, yTop = gy + F.h, yWater = yTop - 0.12;
  {
    const [x0, y0, w, h] = REG.stone, [wx0, wy0, ww, wh] = REG.water;
    for (let i = 0; i < SEG; i++) {
      const a0 = i / SEG * Math.PI * 2, a1 = (i + 1) / SEG * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const P0 = (r, y) => [F.x + c0 * r, y, F.z + s0 * r], P1 = (r, y) => [F.x + c1 * r, y, F.z + s1 * r];
      const n0 = [c0, 0, s0], n1 = [c1, 0, s1], mid = [(c0 + c1) / 2, 0, (s0 + s1) / 2];
      const ua = x0 + (i % 4) * 56, ub = ua + 54;
      quad(P0(F.r, gy - 0.3), P1(F.r, gy - 0.3), P1(F.r, yTop), P0(F.r, yTop),
        UV(ua, y0 + 100), UV(ub, y0 + 100), UV(ub, y0 + 4), UV(ua, y0 + 4), mid, [n0, n1, n1, n0]);
      quad(P0(F.r, yTop), P1(F.r, yTop), P1(rIn, yTop), P0(rIn, yTop),
        UV(ua, y0 + 140), UV(ub, y0 + 140), UV(ub, y0 + 112), UV(ua, y0 + 112), [0, 1, 0]);
      quad(P0(rIn, yTop), P1(rIn, yTop), P1(rIn, yWater), P0(rIn, yWater),
        UV(ua, y0 + 180), UV(ub, y0 + 180), UV(ub, y0 + 150), UV(ua, y0 + 150), [-mid[0], 0, -mid[2]], [[-c0, 0, -s0], [-c1, 0, -s1], [-c1, 0, -s1], [-c0, 0, -s0]]);
      const wt = (c, s) => UV(wx0 + ww / 2 + c * ww * 0.45, wy0 + wh / 2 + s * wh * 0.45);
      tri([F.x, yWater, F.z], P0(rIn, yWater), P1(rIn, yWater), wt(0, 0), wt(c0, s0), wt(c1, s1), [0, 1, 0]);
    }
    // Kugel (dunkler Stein/Bronze), sitzt knapp im Wasser
    const [bx0, by0, bw, bh] = REG.bronze, R = F.ball, yc = yWater + R * 0.85, LAT = 10, LON = 18;
    const sp = (la, lo) => { const t = la / LAT * Math.PI, p = lo / LON * Math.PI * 2; return [Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p)]; };
    const tu = (la, lo) => UV(bx0 + 4 + lo / LON * (bw - 8), by0 + 4 + la / LAT * (bh - 8));
    for (let la = 0; la < LAT; la++) for (let lo = 0; lo < LON; lo++) {
      const q = [[la, lo], [la, lo + 1], [la + 1, lo + 1], [la + 1, lo]].map(([a, b]) => [sp(a, b), tu(a, b)]);
      const pt = (v) => [F.x + v[0] * R, yc + v[1] * R, F.z + v[2] * R];
      const m = norm(q.reduce((s, [v]) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]));
      quad(pt(q[0][0]), pt(q[1][0]), pt(q[2][0]), pt(q[3][0]), q[0][1], q[1][1], q[2][1], q[3][1], m, q.map(([v]) => v));
    }
  }

  const tex = new THREE.CanvasTexture(atlas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
  mesh.name = 'muchLandmarks';
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.dispose = () => { tex.dispose(); mesh.material.dispose(); };   // Geometrie räumt main.js beim Kartenwechsel weg
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(hull, 3));
  hg.computeBoundingSphere();
  const hullMesh = new THREE.Mesh(hg, hullMat);
  hullMesh.name = 'building';
  hullMesh.userData = { addr: 'Kirchplatz 1', name: 'St. Martinus (Turm)' };
  // Kollision: Turmschaft bis zum Knick, Helm grob als schmaler Kern; Brunnen als Achteck
  const bounds = (pts) => ({ minX: Math.min(...pts.map(p => p[0])), maxX: Math.max(...pts.map(p => p[0])), minZ: Math.min(...pts.map(p => p[1])), maxZ: Math.max(...pts.map(p => p[1])) });
  const flat = (pts) => pts.flat();               // [x, z, x, z, …] wie die Gebäudeumrisse
  const core = P.map(p => [cx + (p[0] - cx) * 0.45, cz + (p[1] - cz) * 0.45]);
  const oct = Array.from({ length: 8 }, (_, k) => [F.x + Math.cos(k / 8 * Math.PI * 2) * F.r, F.z + Math.sin(k / 8 * Math.PI * 2) * F.r]);
  const obstacles = [
    { ...bounds(eaveSq), minY: yb - 2, maxY: yKnick, top: yKnick - yb, poly: flat(eaveSq) },
    { ...bounds(core), minY: yKnick, maxY: T.apex - 4, top: T.apex - yb, poly: flat(core) },
    { ...bounds(oct), minY: gy - 1, maxY: yTop, top: F.h, poly: flat(oct) },
  ];
  return { mesh, hull: hullMesh, obstacles, tall: { h: T.apex - yb, c: [cx, cz] } };
}
