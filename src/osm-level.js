import * as THREE from 'three';
import { pointInPoly, closestOnPoly } from './poly2d.js';
import { buildNrwLevel } from './nrw-level.js?v=20';
import { makeLocalFrame } from './geo.js';

/**
 * OpenStreetMap → 3D-Kulisse (generisch).
 *
 * Neue Orte:  python tools/osm_fetch.py <name> <lat> <lon>   → assets/osm/<name>.json
 *             hier in OSM_LOCATIONS eintragen + in main.js (MAP_CONFIGS) eine Karte anlegen.
 *
 * Gebaut wird alles prozedural: echte Grundrisse (extrudiert), Sattel-/Walm-/Flachdächer,
 * Straßen mit Gehwegen, Flächen (Wiese, Wald, Wasser, Parkplatz), Hecken, Bäume, Bauzaun
 * als Spielgrenze. Pro Material wird zu einem Mesh zusammengefasst (wenige Draw-Calls).
 *
 * Daten © OpenStreetMap-Mitwirkende (ODbL) – der Hinweis wird im Spiel eingeblendet.
 */
export const OSM_LOCATIONS = {
  potsdamer: {
    label: 'Potsdamer Platz, Berlin',
    file: './assets/osm/potsdamer_platz.json',
    center: [52.5098, 13.3762],
    style: 'city',
  },
  much: {
    label: 'Much, Hauptstraße bis Schulstraße',
    file: './assets/osm/much.json',
    center: [50.904981, 7.402773],      // Mitte des Ausschnitts: Zanderstraße (N) – Schulstraße (S), Zeitstraße-Kreisel (W) – Kirchplatz (O)
    spawn: [50.90589, 7.40288],         // Start: Hauptstraße beim Rathaus (Gemeinde Much)
    style: 'village',
    nrw: './assets/nrw/much/',          // echtes Gelände + LoD2-Gebäude + Luftbild (tools/nrw_fetch.py)
  },
};

const STYLES = {
  city: {
    ground: { color: '#242830', map: null },
    fog: ['#90a8c8', 0.0035],
    hemi: ['#d8e8ff', '#2a3240', 1.2], amb: ['#4a5568', 0.8], sun: ['#fff2d6', 3.2],
    sky: ['#1e4070', '#648cb8', '#a0b8d4'],
    trees: false, boundary: 'wall', sidewalks: false, maxDist: 135,
  },
  village: {
    ground: { color: '#d2d4c8', map: 'grass' },
    fog: ['#c6d2da', 0.0048],
    hemi: ['#eaf2ff', '#55653f', 1.15], amb: ['#6a7280', 0.55], sun: ['#fff1dc', 3.0],
    sky: ['#4f82bd', '#9dbbd8', '#c9d5dd'],
    trees: true, boundary: 'fence', sidewalks: true, maxDist: 380,
  },
};

// ----------------------------------------------------------------------------
// Kleinkram
// ----------------------------------------------------------------------------
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const num = (v) => { const f = parseFloat(v); return Number.isFinite(f) ? f : undefined; };
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
const UP = [0, 1, 0];
const _cp = { x: 0, z: 0, d2: 0 };

export function signedArea(p) {
  let a = 0;
  for (let i = 0, n = p.length, j = n - 2; i < n; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1];
  return a / 2;
}
export function reverseRing(p) {
  const out = [];
  for (let i = p.length - 2; i >= 0; i -= 2) out.push(p[i], p[i + 1]);
  return out;
}
function centroid(p) {
  let cx = 0, cz = 0, a = 0;
  for (let i = 0, n = p.length, j = n - 2; i < n; j = i, i += 2) {
    const f = p[j] * p[i + 1] - p[i] * p[j + 1];
    a += f; cx += (p[j] + p[i]) * f; cz += (p[j + 1] + p[i + 1]) * f;
  }
  if (Math.abs(a) < 1e-9) return [p[0], p[1]];
  return [cx / (3 * a), cz / (3 * a)];
}
export function bounds(p) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < minX) minX = p[i]; if (p[i] > maxX) maxX = p[i];
    if (p[i + 1] < minZ) minZ = p[i + 1]; if (p[i + 1] > maxZ) maxZ = p[i + 1];
  }
  return { minX, maxX, minZ, maxZ };
}
/** Orientiertes Mindest-Rechteck (Kantenrichtungen als Kandidaten) – für Satteldächer. */
function orientedBox(p) {
  let best = null;
  for (let i = 0, n = p.length, j = n - 2; i < n; j = i, i += 2) {
    const ex = p[i] - p[j], ez = p[i + 1] - p[j + 1], len = Math.hypot(ex, ez);
    if (len < 0.4) continue;
    const ax = ex / len, az = ez / len;
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (let k = 0; k < n; k += 2) {
      const a = p[k] * ax + p[k + 1] * az, b = -p[k] * az + p[k + 1] * ax;
      if (a < minA) minA = a; if (a > maxA) maxA = a; if (b < minB) minB = b; if (b > maxB) maxB = b;
    }
    const area = (maxA - minA) * (maxB - minB);
    if (!best || area < best.area) best = { area, ax, az, minA, maxA, minB, maxB };
  }
  if (!best) return null;
  let { ax, az } = best;
  const ca = (best.minA + best.maxA) / 2, cb = (best.minB + best.maxB) / 2;
  const cx = ax * ca - az * cb, cz = az * ca + ax * cb;
  let L = (best.maxA - best.minA) / 2, W = (best.maxB - best.minB) / 2;
  if (W > L) { [L, W] = [W, L]; [ax, az] = [-az, ax]; }   // lange Achse = Firstrichtung
  return { cx, cz, ax, az, bx: -az, bz: ax, L, W, area: best.area };
}

// ----------------------------------------------------------------------------
// Geometrie-Puffer: nicht-indiziert, Flächennormalen, UV in Metern/Kachel, Vertex-Farben
// ----------------------------------------------------------------------------
export class Buf {
  constructor() { this.p = []; this.u = []; this.c = []; }
  tri(a, b, c, ua, ub, uc, col, hint) {
    if (hint) {
      const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
      const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; }
    }
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.u.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    const r = col ? col.r : 1, g = col ? col.g : 1, bl = col ? col.b : 1;
    this.c.push(r, g, bl, r, g, bl, r, g, bl);
  }
  quad(a, b, c, d, ua, ub, uc, ud, col, hint) {
    this.tri(a, b, c, ua, ub, uc, col, hint);
    this.tri(a, c, d, ua, uc, ud, col, hint);
  }
  mesh(material, { shadow = true, receive = true } = {}) {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.castShadow = shadow; m.receiveShadow = receive;
    return m;
  }
}

/** Flaches Polygon (Boden-Layer) – Weltkoordinaten-UV. */
function addFlatPoly(buf, ring, y, tile, col, hint = UP) {
  const contour = [];
  for (let i = 0; i < ring.length; i += 2) contour.push(new THREE.Vector2(ring[i], ring[i + 1]));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const f of faces) {
    const a = contour[f[0]], b = contour[f[1]], c = contour[f[2]];
    buf.tri([a.x, y, a.y], [b.x, y, b.y], [c.x, y, c.y],
      [a.x / tile, a.y / tile], [b.x / tile, b.y / tile], [c.x / tile, c.y / tile], col, hint);
  }
}
/** Band entlang einer Polylinie (Straße, Weg, Bach) inkl. runder Gelenke. */
function addRibbon(buf, pts, width, y, tile, col) {
  const hw = width / 2;
  const uv = (x, z) => [x / tile, z / tile];
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    const nx = -dz / len * hw, nz = dx / len * hw;
    buf.quad([ax + nx, y, az + nz], [bx + nx, y, bz + nz], [bx - nx, y, bz - nz], [ax - nx, y, az - nz],
      uv(ax + nx, az + nz), uv(bx + nx, bz + nz), uv(bx - nx, bz - nz), uv(ax - nx, az - nz), col, UP);
  }
  const seg = width > 3 ? 10 : 6;
  for (let i = 0; i < pts.length; i += 2) {
    const cx = pts[i], cz = pts[i + 1];
    for (let k = 0; k < seg; k++) {
      const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
      const p0x = cx + Math.cos(a0) * hw, p0z = cz + Math.sin(a0) * hw;
      const p1x = cx + Math.cos(a1) * hw, p1z = cz + Math.sin(a1) * hw;
      buf.tri([cx, y, cz], [p0x, y, p0z], [p1x, y, p1z], uv(cx, cz), uv(p0x, p0z), uv(p1x, p1z), col, UP);
    }
  }
}
/** Mittellinie (gestrichelt). */
function addDashes(buf, pts, y, col) {
  let carry = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], az = pts[i + 1], dx = pts[i + 2] - ax, dz = pts[i + 3] - az;
    const len = Math.hypot(dx, dz); if (len < 0.01) continue;
    const ux = dx / len, uz = dz / len, nx = -uz * 0.07, nz = ux * 0.07;
    for (let s = carry; s < len; s += 9) {
      const e = Math.min(len, s + 3);
      const p0x = ax + ux * s, p0z = az + uz * s, p1x = ax + ux * e, p1z = az + uz * e;
      buf.quad([p0x + nx, y, p0z + nz], [p1x + nx, y, p1z + nz], [p1x - nx, y, p1z - nz], [p0x - nx, y, p0z - nz],
        [0, 0], [1, 0], [1, 1], [0, 1], col, UP);
      carry = s + 9 - len;
    }
  }
}
/** Quader entlang eines Segments (Hecke, Mauer). */
function addWallSeg(buf, ax, az, bx, bz, w, h, col) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  if (len < 0.05) return null;
  const nx = -dz / len * w / 2, nz = dx / len * w / 2;
  const c = [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]];
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  for (let i = 0; i < 4; i++) {
    const p = c[i], q = c[(i + 1) % 4], ex = q[0] - p[0], ez = q[1] - p[1], el = Math.hypot(ex, ez);
    const hint = [(p[0] + q[0]) / 2 - mx, 0, (p[1] + q[1]) / 2 - mz];
    buf.quad([p[0], 0, p[1]], [q[0], 0, q[1]], [q[0], h, q[1]], [p[0], h, p[1]], [0, 0], [el, 0], [el, h], [0, h], col, hint);
  }
  buf.quad([c[0][0], h, c[0][1]], [c[1][0], h, c[1][1]], [c[2][0], h, c[2][1]], [c[3][0], h, c[3][1]], [0, 0], [len, 0], [len, w], [0, w], col, UP);
  return [c[0][0], c[0][1], c[1][0], c[1][1], c[2][0], c[2][1], c[3][0], c[3][1]];
}

// ----------------------------------------------------------------------------
// Texturen & Materialien (einmal erzeugt, über Kartenwechsel hinweg wiederverwendet)
// ----------------------------------------------------------------------------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeTextures() {
  const r = mulberry32(1234);
  const speck = (g, w, h, n, a) => {
    for (let i = 0; i < n; i++) {
      const v = r() < 0.5 ? 0 : 255, s = 1 + r() * 2;
      g.fillStyle = `rgba(${v},${v},${v},${a * r()})`; g.fillRect(r() * w, r() * h, s, s);
    }
  };
  const plaster = (g, base) => { g.fillStyle = base; g.fillRect(0, 0, 128, 128); speck(g, 128, 128, 900, 0.06); };
  // Ein Feld = 3 m breit × 3 m (ein Geschoss). Fenster 1,1 m breit, 0,85–2,25 m hoch.
  const windowBay = (g, shutters, frame = '#f7f7f2') => {
    if (shutters) {      // grüne Klappläden – "Bergischer Dreiklang" (Schiefer, Weiß, Grün)
      g.fillStyle = '#2f5b3d'; g.fillRect(17, 32, 23, 60); g.fillRect(88, 32, 23, 60);
      g.fillStyle = 'rgba(255,255,255,0.10)';
      for (let y = 35; y < 90; y += 5) { g.fillRect(19, y, 19, 2); g.fillRect(90, y, 19, 2); }
    }
    g.fillStyle = '#bdb7ad'; g.fillRect(38, 91, 52, 5);
    g.fillStyle = frame; g.fillRect(41, 32, 46, 60);
    const gr = g.createLinearGradient(44, 35, 84, 89);
    gr.addColorStop(0, '#5f7180'); gr.addColorStop(0.45, '#28323b'); gr.addColorStop(1, '#1d252c');
    g.fillStyle = gr; g.fillRect(45, 36, 38, 52);
    g.fillStyle = frame; g.fillRect(62, 36, 4, 52); g.fillRect(45, 56, 38, 3);
  };
  const glassGrad = (g, x, y, w, h) => {
    const gr = g.createLinearGradient(x, y, x + w, y + h);
    gr.addColorStop(0, '#a9bccb'); gr.addColorStop(0.45, '#56677a'); gr.addColorStop(1, '#3e4b58');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  };

  const T = {};
  T.house = canvasTex(128, 128, g => { plaster(g, '#f3f0e9'); windowBay(g, true); });
  T.house2 = canvasTex(128, 128, g => { plaster(g, '#efebe3'); windowBay(g, false); });
  T.slate = canvasTex(128, 128, g => {
    g.fillStyle = '#454b54'; g.fillRect(0, 0, 128, 128);
    for (let y = 0, row = 0; y < 128; y += 8, row++) {
      for (let x = (row % 2) * 6 - 6; x < 128; x += 12) {
        const l = 62 + r() * 16; g.fillStyle = `rgb(${l | 0},${(l + 4) | 0},${(l + 12) | 0})`;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 11, y); g.lineTo(x + 11, y + 6);
        g.quadraticCurveTo(x + 5.5, y + 10, x, y + 6); g.closePath(); g.fill();
      }
    }
    windowBay(g, true, '#ffffff');
  });
  T.fachwerk = canvasTex(128, 128, g => {
    plaster(g, '#f1ece1');
    g.fillStyle = '#2b2420';
    g.fillRect(0, 0, 7, 128); g.fillRect(121, 0, 7, 128); g.fillRect(0, 0, 128, 6); g.fillRect(0, 122, 128, 6);
    g.fillRect(33, 0, 6, 128); g.fillRect(89, 0, 6, 128); g.fillRect(33, 25, 62, 6); g.fillRect(33, 93, 62, 6);
    g.strokeStyle = '#2b2420'; g.lineWidth = 6; g.beginPath();
    g.moveTo(5, 120); g.lineTo(34, 96); g.moveTo(123, 120); g.lineTo(94, 96);
    g.moveTo(5, 7); g.lineTo(34, 28); g.moveTo(123, 7); g.lineTo(94, 28); g.stroke();
    windowBay(g, false, '#ffffff');
  });
  // --- Spezifische & neutrale Fassaden für Much (aus Street View) ---
  T.church = canvasTex(256, 256, g => {
    // St. Martinus Kirche Much: echter Altrosa/Terrakotta-Putz (Bilder 3 & 4)
    g.fillStyle = '#be7972'; g.fillRect(0, 0, 256, 256);
    speck(g, 256, 256, 1400, 0.05);
    // Grauwacke / Bruchstein-Sockelmauer unten
    g.fillStyle = '#5c5750'; g.fillRect(0, 228, 256, 28);
    for (let y = 228; y < 256; y += 7) {
      for (let x = (y % 14 === 0 ? 0 : 8); x < 256; x += 16) {
        g.fillStyle = (r() < 0.5) ? '#69645c' : '#4f4b44';
        g.fillRect(x + 1, y + 1, 14, 5.5);
      }
    }
    // Romanisches Rundbogenfenster
    g.fillStyle = '#3a3430'; g.beginPath();
    g.moveTo(106, 185); g.lineTo(106, 95); g.arc(128, 95, 22, Math.PI, 0); g.lineTo(150, 185);
    g.closePath(); g.fill();
    // Bleiverglasung
    const grGlass = g.createLinearGradient(110, 80, 146, 180);
    grGlass.addColorStop(0, '#5a6e7d'); grGlass.addColorStop(0.5, '#2e3a44'); grGlass.addColorStop(1, '#1b232a');
    g.fillStyle = grGlass; g.beginPath();
    g.moveTo(110, 180); g.lineTo(110, 95); g.arc(128, 95, 18, Math.PI, 0); g.lineTo(146, 180);
    g.closePath(); g.fill();
    // Turmuhr (grünes Ziffernblatt mit Goldzeigern)
    g.fillStyle = '#2d4a3e'; g.beginPath(); g.arc(128, 38, 16, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d4af37'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#d4af37'; g.fillRect(127, 26, 2, 12); g.fillRect(127, 37, 8, 2);
    // Steinerne Fensterbank
    g.fillStyle = '#9e978c'; g.fillRect(100, 185, 56, 6);
  });

  // Neutrales Bergisches Fachwerk mit Ladenlokal im EG (Bilder 6 & 7: Friseur, Yoga, etc.)
  T.fachwerk_shop = canvasTex(256, 256, g => {
    g.fillStyle = '#f3efe6'; g.fillRect(0, 0, 256, 256); speck(g, 256, 256, 900, 0.05);
    g.fillStyle = '#221914';
    g.fillRect(0, 0, 14, 256); g.fillRect(242, 0, 14, 256);
    g.fillRect(0, 0, 256, 12); g.fillRect(0, 68, 256, 10); g.fillRect(0, 246, 256, 10);
    g.fillRect(164, 0, 10, 256);
    g.strokeStyle = '#221914'; g.lineWidth = 10; g.beginPath();
    g.moveTo(10, 66); g.lineTo(60, 14); g.moveTo(244, 66); g.lineTo(194, 14); g.stroke();
    // Erdgeschoss: Neutrales Schaufenster & Tür
    g.fillStyle = '#343840'; g.fillRect(18, 86, 138, 148);
    glassGrad(g, 24, 92, 126, 136);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.beginPath(); g.moveTo(35, 220); g.lineTo(85, 95); g.lineTo(115, 95); g.lineTo(55, 220); g.closePath(); g.fill();
    g.fillStyle = '#221914'; g.fillRect(18, 234, 138, 12);
    g.fillStyle = '#343840'; g.fillRect(180, 86, 60, 148);
    glassGrad(g, 185, 92, 50, 95);
    g.fillStyle = '#221914'; g.fillRect(185, 192, 50, 42);
    g.fillStyle = '#dcdcdc'; g.fillRect(228, 142, 3, 20);
    g.fillStyle = '#8a857d'; g.fillRect(176, 234, 68, 6); g.fillRect(180, 240, 60, 6);
  });

  // Neutraler Schiefer mit Ladenlokal im EG (Bild 5)
  T.slate_shop = canvasTex(256, 256, g => {
    g.fillStyle = '#40454e'; g.fillRect(0, 0, 256, 256);
    for (let y = 0, row = 0; y < 76; y += 10, row++) {
      for (let x = (row % 2) * 8 - 8; x < 256; x += 16) {
        const l = 56 + r() * 16; g.fillStyle = `rgb(${l | 0},${(l + 4) | 0},${(l + 10) | 0})`;
        g.fillRect(x + 1, y + 1, 14, 8);
      }
    }
    g.fillStyle = '#2b2e34'; g.fillRect(14, 84, 144, 150);
    glassGrad(g, 20, 90, 132, 138);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.beginPath(); g.moveTo(35, 220); g.lineTo(85, 92); g.lineTo(115, 92); g.lineTo(55, 220); g.closePath(); g.fill();
    g.fillStyle = '#2b2e34'; g.fillRect(174, 84, 68, 150);
    glassGrad(g, 180, 90, 56, 95);
    g.fillStyle = '#1c1e22'; g.fillRect(180, 190, 56, 44);
    g.fillStyle = '#cccccc'; g.fillRect(230, 140, 3, 20);
    g.fillStyle = '#1c1e22'; g.fillRect(0, 236, 256, 20);
  });

  // Kreissparkasse (Dr.-Wirtz-Str. 4)
  T.shop_sparkasse = canvasTex(256, 256, g => {
    g.fillStyle = '#f4f0e6'; g.fillRect(0, 0, 256, 256); speck(g, 256, 256, 900, 0.05);
    g.fillStyle = '#221914';
    g.fillRect(0, 0, 14, 256); g.fillRect(242, 0, 14, 256);
    g.fillRect(0, 0, 256, 12); g.fillRect(0, 68, 256, 10); g.fillRect(0, 244, 256, 12);
    // Rotes Sparkassen-S Schild an der Wand
    g.fillStyle = '#e30613'; g.fillRect(18, 16, 40, 42);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(38, 28, 6, 0, Math.PI * 2); g.fill();
    g.fillRect(35, 38, 6, 6);
    // Schriftzug
    g.fillStyle = '#ffffff'; g.fillRect(70, 20, 160, 34);
    g.strokeStyle = '#e30613'; g.lineWidth = 1.5; g.strokeRect(70, 20, 160, 34);
    g.font = 'bold 17px sans-serif'; g.fillStyle = '#e30613'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Kreissparkasse', 150, 37);
    g.fillStyle = '#221914'; g.fillRect(18, 86, 140, 148);
    glassGrad(g, 24, 92, 128, 136);
    g.fillStyle = '#221914'; g.fillRect(174, 86, 66, 148);
    glassGrad(g, 180, 92, 54, 95);
    g.fillStyle = '#1c130d'; g.fillRect(180, 192, 54, 42);
    g.fillStyle = '#d4af37'; g.fillRect(226, 142, 4, 18);
  });
  T.garage = canvasTex(128, 128, g => {     // Sektionaltor 2,5 m × 2,1 m je 3-m-Feld
    plaster(g, '#ece8e0');
    g.fillStyle = '#9b9ea2'; g.fillRect(9, 36, 110, 92);
    for (let y = 38; y < 128; y += 11) { g.fillStyle = '#d9dbdd'; g.fillRect(11, y, 106, 9); g.fillStyle = '#b9bcc0'; g.fillRect(11, y + 7, 106, 2); }
  });
  T.plain = canvasTex(128, 128, g => {
    plaster(g, '#ece8e0'); g.fillStyle = 'rgba(0,0,0,0.05)';
    for (let i = 0; i < 10; i++) g.fillRect(r() * 128, 0, 1 + r() * 2, 128);
  });
  // Stadtfassaden (Feld = 32 m × 76,8 m, wie die alte Potsdamer-Platz-Optik)
  const cityFacade = (base, lit, dark, sx, sy, w, h, p) => canvasTex(256, 512, g => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 512);
    for (let y = 8; y < 512; y += sy) for (let x = 6; x < 256; x += sx) {
      g.fillStyle = r() > p ? lit : dark; g.fillRect(x, y, w, h);
    }
  });
  T.glass = cityFacade('#1c2432', 'rgba(180,225,255,0.75)', 'rgba(30,45,65,0.9)', 20, 24, 14, 16, 0.45);
  T.modern = cityFacade('#2d333b', 'rgba(255,230,180,0.8)', 'rgba(20,25,35,0.95)', 26, 32, 18, 20, 0.4);
  T.stone = cityFacade('#3a3e47', 'rgba(255,240,200,0.7)', 'rgba(25,30,40,0.9)', 22, 28, 12, 16, 0.5);

  // Dächer: Feld = 2 m × 2 m
  T.roofSlate = canvasTex(128, 128, g => {
    g.fillStyle = '#2f3339'; g.fillRect(0, 0, 128, 128);
    for (let y = 0, row = 0; y < 128; y += 128 / 12, row++) {
      for (let x = (row % 2) * 8 - 8; x < 128; x += 16) {
        const l = 50 + r() * 16; g.fillStyle = `rgb(${l | 0},${(l + 3) | 0},${(l + 9) | 0})`; g.fillRect(x + 1, y + 1, 14, 8.6);
      }
    }
  });
  T.roofTile = canvasTex(128, 128, g => {
    g.fillStyle = '#6d3326'; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 12.8) {
      for (let x = 0; x < 128; x += 12.8) {
        const l = r() * 22; g.fillStyle = `rgb(${(132 + l) | 0},${(62 + l * 0.5) | 0},${(46 + l * 0.4) | 0})`;
        g.beginPath(); g.ellipse(x + 6.4, y + 5.5, 6.2, 6, 0, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, y + 10, 128, 2.8);
    }
  });
  T.roofFlat = canvasTex(128, 128, g => { g.fillStyle = '#6b6c6a'; g.fillRect(0, 0, 128, 128); speck(g, 128, 128, 2500, 0.25); });
  // Boden: Gras 8 m, Asphalt 6 m, Pflaster 2 m
  T.grass = canvasTex(256, 256, g => {
    g.fillStyle = '#6b8a42'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 14; i++) {
      const x = 40 + r() * 176, y = 40 + r() * 176, rad = 10 + r() * 28;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, r() < 0.5 ? 'rgba(50,75,25,0.28)' : 'rgba(150,160,80,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 5000; i++) {
      const t = r();
      g.fillStyle = t < 0.4 ? 'rgba(40,70,20,0.35)' : t < 0.75 ? 'rgba(140,170,80,0.35)' : 'rgba(170,160,90,0.25)';
      g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 3);
    }
  });
  T.asphalt = canvasTex(256, 256, g => { g.fillStyle = '#56595e'; g.fillRect(0, 0, 256, 256); speck(g, 256, 256, 6000, 0.16); });
  T.paving = canvasTex(128, 128, g => {
    g.fillStyle = '#8a857d'; g.fillRect(0, 0, 128, 128);
    for (let y = 0, row = 0; y < 128; y += 16, row++) for (let x = (row % 2) * 16 - 16; x < 128; x += 32) {
      const l = 152 + r() * 24; g.fillStyle = `rgb(${l | 0},${(l - 5) | 0},${(l - 12) | 0})`; g.fillRect(x + 1, y + 1, 30, 14);
    }
  });
  // Bauzaun-Feld 3,5 m × 2 m (Alpha)
  T.fence = canvasTex(128, 74, g => {
    g.clearRect(0, 0, 128, 74);
    g.strokeStyle = 'rgba(205,210,215,0.95)'; g.lineWidth = 1;
    for (let x = 4; x < 126; x += 5) { g.beginPath(); g.moveTo(x + 0.5, 2); g.lineTo(x + 0.5, 72); g.stroke(); }
    for (let y = 4; y < 72; y += 5) { g.beginPath(); g.moveTo(2, y + 0.5); g.lineTo(126, y + 0.5); g.stroke(); }
    g.strokeStyle = '#c9ced3'; g.lineWidth = 4; g.strokeRect(2, 2, 124, 70);
  });
  // Klinker (rotbraun mit einzelnen grauen Steinen), ein 3-m-Feld mit Fenster – z. B. Hauptstraße 24
  T.brick = canvasTex(128, 128, g => {
    g.fillStyle = '#b8afa3'; g.fillRect(0, 0, 128, 128);
    const rowH = 128 / 24;
    for (let row = 0; row < 24; row++) {
      for (let x = (row % 2) * -8; x < 128; x += 16) {
        const k = r(), j = (r() - 0.5) * 18;
        const c = k < 0.55 ? [134, 84, 66] : k < 0.85 ? [114, 71, 57] : [126, 119, 111];
        g.fillStyle = `rgb(${c[0] + j | 0},${c[1] + j | 0},${c[2] + j | 0})`;
        g.fillRect(x + 1, row * rowH + 0.8, 14, rowH - 1.2);
      }
    }
    windowBay(g, false, '#ffffff');
  });
  return T;
}

let MATS = null;
export function getMats() {
  if (MATS) return MATS;
  const T = makeTextures();
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0 }, o));
  const layer = (m, k) => { m.polygonOffset = true; m.polygonOffsetFactor = -k; m.polygonOffsetUnits = -2 * k; return m; };
  const groundTex = T.grass.clone();     // eigene Kopie: Wiederholung passend zur 180-m-Bodenplatte
  groundTex.repeat.set(180 / 8, 180 / 8);
  MATS = {
    T, groundTex,
    // [Material, Kachelbreite m, Kachelhöhe m]
    wall: {
      house: [std({ map: T.house, vertexColors: true }), 3, 3],
      house2: [std({ map: T.house2, vertexColors: true }), 3, 3],
      slate: [std({ map: T.slate, vertexColors: true, roughness: 0.7 }), 3, 3],
      fachwerk: [std({ map: T.fachwerk, vertexColors: true }), 3, 3],
      shop: [std({ map: T.shop, vertexColors: true, roughness: 0.55 }), 3, 3],
      plain: [std({ map: T.plain, vertexColors: true }), 3, 3],
      church: [std({ map: T.church, vertexColors: true }), 3, 3.5],
      fachwerk_shop: [std({ map: T.fachwerk_shop, vertexColors: true }), 3, 3],
      slate_shop: [std({ map: T.slate_shop, vertexColors: true, roughness: 0.7 }), 3, 3],
      shop_sparkasse: [std({ map: T.shop_sparkasse, vertexColors: true }), 3, 3],
      garage: [std({ map: T.garage, vertexColors: true }), 3, 3],
      glass: [std({ map: T.glass, vertexColors: true, roughness: 0.15, metalness: 0.65, emissive: '#102030', emissiveIntensity: 0.4 }), 32, 76.8],
      tower: [std({ map: T.glass, vertexColors: true, roughness: 0.12, metalness: 0.75, emissive: '#0a1828', emissiveIntensity: 0.5 }), 32, 76.8],
      modern: [std({ map: T.modern, vertexColors: true, roughness: 0.4, metalness: 0.3 }), 32, 76.8],
      stone: [std({ map: T.stone, vertexColors: true, roughness: 0.75, metalness: 0.1 }), 32, 76.8],
    },
    roof: {
      slate: [std({ map: T.roofSlate, vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }), 2],
      tile: [std({ map: T.roofTile, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), 2],
      flat: [std({ map: T.roofFlat, vertexColors: true }), 2],
      city: [std({ color: '#1a1e24', vertexColors: true }), 4],
    },
    area: {
      grass: [layer(std({ map: T.grass, color: '#f2f6ea' }), 1), 8],
      forest: [layer(std({ map: T.grass, color: '#8ea27a' }), 1), 8],
      farmland: [layer(std({ map: T.grass, color: '#efe6a8' }), 1), 8],
      water: [layer(std({ color: '#4d6f86', roughness: 0.12, metalness: 0.25 }), 2), 8],
      paving: [layer(std({ map: T.paving }), 2), 2],
      parking: [layer(std({ map: T.asphalt, color: '#dcdcdc' }), 2), 6],
    },
    sidewalk: [layer(std({ map: T.paving }), 3), 2],
    path: [layer(std({ map: T.paving, color: '#e9dfcc' }), 3), 2],
    road: [layer(std({ map: T.asphalt }), 4), 6],
    marking: layer(std({ color: '#e6e6de', roughness: 0.6 }), 5),
    hedge: std({ color: '#3d6a2e', roughness: 1, vertexColors: true }),
    wallLow: std({ color: '#8c877d', vertexColors: true }),
    barrier: std({ color: '#908578', roughness: 0.95, vertexColors: true }),
    trunk: std({ color: '#5a4330' }),
    crown: std({ color: '#ffffff', roughness: 0.85, flatShading: true }),
    fence: std({ map: T.fence, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.6 }),
    fenceFoot: std({ color: '#8d8883' }),
    farGround: std({ map: T.grass, roughness: 0.95 }),
  };
  return MATS;
}

// Gemeinsame Geometrien für Bäume & Zaun
let SHARED = null;
export function shared() {
  if (SHARED) return SHARED;
  SHARED = {
    trunk: new THREE.CylinderGeometry(0.14, 0.22, 1, 6).translate(0, 0.5, 0),
    leaf: new THREE.IcosahedronGeometry(1, 1),
    cone: new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0),
    panel: new THREE.PlaneGeometry(3.5, 2).translate(0, 1.12, 0),
    foot: new THREE.BoxGeometry(0.7, 0.14, 0.24).translate(0, 0.07, 0),
  };
  return SHARED;
}

/** OSM-Quellenhinweis (ODbL-Pflicht) unten rechts einblenden / entfernen. */
export function showOsmCredit(text) {
  let el = document.getElementById('osm-credit');
  if (!text) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'osm-credit';
    el.style.cssText = 'position:fixed;right:8px;bottom:3px;z-index:25;font:10px/1.2 system-ui,sans-serif;' +
      'color:rgba(255,255,255,.7);text-shadow:0 1px 2px rgba(0,0,0,.85);pointer-events:none;letter-spacing:.02em';
    document.body.appendChild(el);
  }
  el.textContent = text;
}

// ----------------------------------------------------------------------------
// Gebäude-Einstufung: Tags → Höhe, Dachform, Fassade
// ----------------------------------------------------------------------------
const SMALL = new Set(['garage', 'garages', 'carport', 'shed', 'hut', 'kiosk', 'service', 'transformer_tower', 'container', 'toilets', 'bunker']);
const CIVIC = new Set(['school', 'public', 'civic', 'townhall', 'office', 'commercial', 'retail', 'supermarket', 'hospital',
  'kindergarten', 'university', 'college', 'government', 'hotel', 'train_station', 'sports_hall', 'fire_station', 'bank']);
const FARM = new Set(['industrial', 'warehouse', 'barn', 'farm_auxiliary', 'agricultural', 'stable', 'cowshed',
  'manufacture', 'greenhouse', 'sports_centre', 'riding_hall', 'parking']);
export const PLASTER = ['#ffffff', '#fbf5e8', '#f4ead6', '#efe6dc', '#f6f1ea', '#e9e4da', '#f2e3cf', '#e6ebe9', '#f7efe2'];

function villageSpec(tags, area, rect, rng) {
  const t = tags.building || tags['building:part'] || 'yes';
  const s = { base: 0, eave: undefined, roof: 'gable', pitch: 38, wall: 'house', roofMat: rng() < 0.86 ? 'slate' : 'tile', tower: false, canopy: false };
  let levels;
  if (t === 'roof' || (t === 'carport' && area < 80)) { s.canopy = true; s.roof = 'flat'; s.eave = 2.6; s.wall = 'plain'; return s; }
  if (SMALL.has(t) || (t === 'yes' && area < 28)) {
    s.eave = 2.7; s.wall = 'plain'; s.pitch = 28;
    s.roof = (area < 45 && rect > 0.8 && t !== 'garage' && t !== 'garages') ? 'gable' : 'flat';
  } else if (t === 'church' || t === 'cathedral') {
    s.eave = area > 250 ? 10 : 6; s.pitch = 52; s.wall = 'church'; s.roofMat = 'slate'; s.tower = area > 250;
  } else if (t === 'chapel') {
    s.eave = 4.5; s.pitch = 50; s.wall = 'church'; s.roofMat = 'slate';
  } else if (CIVIC.has(t)) {
    levels = 2; s.wall = 'shop'; s.pitch = 28; s.roof = area > 350 ? 'flat' : 'hip';
  } else if (FARM.has(t)) {
    s.eave = 5; s.pitch = 22; s.wall = 'plain'; s.roof = area > 900 ? 'flat' : 'gable';
  } else if (t === 'apartments') {
    levels = 3; s.wall = pick(rng, ['house2', 'house', 'slate', 'house2']);
  } else {          // house, detached, semidetached_house, terrace, residential, yes, farm, bungalow …
    levels = t === 'bungalow' ? 1 : 2;
    if (t === 'yes' && area > 500) { s.roof = 'flat'; s.wall = 'shop'; }
    else {
      const w = rng();
      s.wall = w < 0.42 ? 'house' : w < 0.64 ? 'house2' : w < 0.84 ? 'slate' : 'fachwerk';
    }
  }
  const lv = num(tags['building:levels']);
  if (lv !== undefined) levels = Math.max(1, lv);
  if (s.eave === undefined) s.eave = (levels || 2) * 2.8 + 0.4;
  else if (lv !== undefined) s.eave = Math.max(s.eave, lv * 2.8 + 0.4);

  const shape = tags['roof:shape'];
  if (shape === 'flat' || shape === 'skillion') s.roof = 'flat';
  else if (shape === 'gabled' || shape === 'half-hipped' || shape === 'gambrel' || shape === 'saltbox') s.roof = 'gable';
  else if (shape === 'hipped' || shape === 'pyramidal') s.roof = 'hip';
  if (s.roof === 'gable' && rect < 0.72) s.roof = 'hip';
  if (s.roof !== 'flat' && area > 1600) s.roof = 'flat';

  const h = num(tags.height);
  if (h !== undefined) s.eave = s.roof === 'flat' ? h : Math.max(2.4, h * 0.68);
  const minH = num(tags.min_height), minLv = num(tags['building:min_level']);
  s.base = minH !== undefined ? minH : (minLv !== undefined ? minLv * 2.8 : 0);
  return s;
}

function citySpec(tags) {
  let height = 22;
  const h = num(tags.height), lv = num(tags['building:levels']);
  if (h !== undefined) height = h; else if (lv !== undefined) height = lv * 3.6;
  height = Math.max(12, Math.min(105, height));
  const name = tags.name || '';
  const wall = (name.includes('Bahntower') || height > 90) ? 'tower' : height > 40 ? 'glass' : height > 20 ? 'modern' : 'stone';
  return { base: 0, eave: height, roof: 'flat', wall, roofMat: 'city', roofBox: true, tower: false, canopy: false };
}

const ROAD_W = { motorway: 12, trunk: 10, primary: 7.5, secondary: 6.8, tertiary: 6.2, unclassified: 5.2, residential: 5.2,
  living_street: 4.6, service: 3.6, pedestrian: 4.5, track: 3, busway: 6, road: 5,
  motorway_link: 6, trunk_link: 6, primary_link: 6, secondary_link: 5.5, tertiary_link: 5 };
const PATH_W = { footway: 1.8, path: 1.5, cycleway: 2, bridleway: 1.6, steps: 1.8, platform: 2.5 };
const HELPERS = { Buf, getMats, shared, mulberry32, pick, PLASTER, signedArea, reverseRing, bounds, showOsmCredit };

// ----------------------------------------------------------------------------
// Hauptfunktion
// ----------------------------------------------------------------------------
export async function buildOsmLevel(ctx, locationId = 'potsdamer') {
  const loc = OSM_LOCATIONS[locationId] || OSM_LOCATIONS.potsdamer;
  const S = STYLES[loc.style] || STYLES.city;
  const {
    scene, mapGroup, obstacles, worldColliders, floorPlates,
    hemi, amb, sun, sunSprite, sky, ground, ARENA, isActive = () => true,
  } = ctx;    // ARENA: quadratische Halbkante (flache OSM-Karten); NRW-Karten bekommen ctx.bounds {x, z} (Rechteck)
  const M = getMats();
  const G = shared();
  const bound = ARENA;

  // ---------- Atmosphäre ----------
  ground.material.map = S.ground.map ? M.groundTex : null;
  ground.material.color.set(S.ground.color);
  ground.material.roughness = 0.95;
  ground.material.needsUpdate = true;
  scene.fog = new THREE.FogExp2(S.fog[0], S.fog[1]);
  hemi.color.set(S.hemi[0]); hemi.groundColor.set(S.hemi[1]); hemi.intensity = S.hemi[2];
  amb.color.set(S.amb[0]); amb.intensity = S.amb[1];
  sun.color.set(S.sun[0]); sun.intensity = S.sun[1]; sun.position.set(50, 75, -50);
  sunSprite.visible = true; sunSprite.material.color.set('#ffffff');
  sunSprite.position.set(50, 75, -50).normalize().multiplyScalar(260);
  sky.material.uniforms.top.value.set(S.sky[0]);
  sky.material.uniforms.mid.value.set(S.sky[1]);
  sky.material.uniforms.bot.value.set(S.sky[2]);
  const flatFloor = () => floorPlates.push({ minX: -bound, maxX: bound, minZ: -bound, maxZ: bound, y: 0, label: 'Straße / Platz' });
  if (!loc.nrw) flatFloor();        // mit NRW-Gelände liefert das Höhenraster den Boden

  // ---------- Daten ----------
  let data = null;
  try {
    const res = await fetch(loc.file);
    if (res.ok) data = await res.json();
  } catch (err) {
    console.warn('OSM-Daten nicht ladbar:', loc.file, err);
  }
  if (!isActive()) return null;          // Karte wurde inzwischen gewechselt
  const elements = (data && data.elements) || [];
  showOsmCredit(`Kartendaten © OpenStreetMap-Mitwirkende (ODbL) · ${loc.label}`);

  const [lat0, lon0] = loc.center;
  const toLocal = makeLocalFrame(lat0, lon0, !!loc.nrw);   // NRW-Orte: im UTM-Raster der Gebäude- und Luftbilddaten
  const nodes = new Map();
  const treeNodes = [];
  for (const el of elements) {
    if (el.type !== 'node') continue;
    const [x, z] = toLocal(el.lat, el.lon);
    nodes.set(el.id, [x, z]);
    if (el.tags && el.tags.natural === 'tree') treeNodes.push([x, z]);
  }
  const ways = elements.filter(el => el.type === 'way' && el.tags && el.nodes);
  const maxD = S.maxDist;

  const lineOf = (w) => {
    const pts = [];
    for (const id of w.nodes) { const p = nodes.get(id); if (p) pts.push(p[0], p[1]); }
    return pts;
  };
  const ringOf = (w) => {
    const ids = w.nodes;
    if (ids.length < 4 || ids[0] !== ids[ids.length - 1]) return null;
    const pts = [];
    for (let i = 0; i < ids.length - 1; i++) {
      const p = nodes.get(ids[i]); if (!p) return null;
      const n = pts.length;
      if (n >= 2 && Math.abs(pts[n - 2] - p[0]) < 0.05 && Math.abs(pts[n - 1] - p[1]) < 0.05) continue;
      pts.push(p[0], p[1]);
    }
    if (pts.length < 6) return null;
    return signedArea(pts) > 0 ? reverseRing(pts) : pts;   // negative Fläche ⇒ Wandnormalen zeigen nach außen
  };
  const near = (b, d) => b.maxX > -d && b.minX < d && b.maxZ > -d && b.minZ < d;

  // ---------- Echte NRW-Kulisse (Gelände, LoD2-Gebäude, Luftbild) ----------
  if (loc.nrw) {
    const roadLines = [];
    for (const w of ways) {
      const hw = w.tags.highway;
      if (!hw || w.tags.tunnel === 'yes' || w.tags.area === 'yes') continue;
      const width = ROAD_W[hw] || PATH_W[hw]; if (!width) continue;
      const pts = lineOf(w); if (pts.length >= 4) roadLines.push({ pts, width, main: !!ROAD_W[hw] && hw !== 'pedestrian', name: w.tags.name || '' });
    }
    const spawnHint = loc.spawn ? toLocal(loc.spawn[0], loc.spawn[1]) : [0, 0];
    const res = await buildNrwLevel(ctx, loc, { roadLines, spawnHint }, HELPERS);
    if (res || !isActive()) return res;
    flatFloor();                     // Rückfall: flache OSM-Kulisse
  }

  // ---------- Gebäude sammeln ----------
  const rngB = mulberry32(4711);
  const parts = [], outlines = [];
  for (const w of ways) {
    const t = w.tags;
    if (!(t.building || t['building:part'])) continue;
    if (t.building === 'no' || t.location === 'underground') continue;
    const ring = ringOf(w); if (!ring) continue;
    const b = bounds(ring);
    const c = centroid(ring);
    if (Math.hypot(c[0], c[1]) > maxD) continue;
    const item = { w, ring, b, c, area: Math.abs(signedArea(ring)) };
    (t['building:part'] && !t.building ? parts : outlines).push(item);
  }
  // Umrisse mit Gebäudeteilen nicht doppelt bauen – die Teile ersetzen sie
  const buildings = parts.slice();
  for (const o of outlines) {
    if (parts.some(p => p.c[0] > o.b.minX && p.c[0] < o.b.maxX && p.c[1] > o.b.minZ && p.c[1] < o.b.maxZ && pointInPoly(p.c[0], p.c[1], o.ring))) continue;
    buildings.push(o);
  }

  // Puffer: inner (nahe Spielfläche → Trefferziele) / outer (Kulisse)
  const bufs = { inner: {}, outer: {} };
  const getBuf = (zone, key) => (bufs[zone][key] ||= new Buf());
  const innerD = bound + 45;
  const buildingRings = [];       // für Zaun/Bäume/Spawn
  let tallest = null, count = 0;

  for (const B of buildings) {
    if (B.area < (loc.style === 'city' ? 16 : 6)) continue;
    const ob = orientedBox(B.ring); if (!ob) continue;
    const rect = B.area / Math.max(ob.area, 1e-6);
    const spec = loc.style === 'city' ? citySpec(B.w.tags) : villageSpec(B.w.tags, B.area, rect, rngB);
    const zone = near(B.b, innerD) ? 'inner' : 'outer';
    const [wallMat, tw, th] = M.wall[spec.wall];
    const wallKey = 'w_' + spec.wall;
    const wallBuf = getBuf(zone, wallKey);
    const tint = new THREE.Color(loc.style === 'city' ? '#ffffff'
      : spec.wall === 'slate' ? pick(rngB, ['#ffffff', '#eef0f4', '#e4e8ee'])
      : spec.wall === 'fachwerk' ? pick(rngB, ['#ffffff', '#fbf6ec']) : pick(rngB, PLASTER));
    const roofTint = new THREE.Color().setScalar(0.85 + rngB() * 0.3);
    const ring = B.ring, base = spec.base, eave = Math.max(base + 1.2, spec.eave);
    let top = eave;

    if (spec.canopy) {       // Carport / Dach ohne Wände: dünne Platte auf Stützen
      const rb = getBuf(zone, 'r_flat');
      addFlatPoly(rb, ring, eave, 2, roofTint);
      addFlatPoly(rb, ring, eave - 0.2, 2, roofTint, [0, -1, 0]);  // Unterseite zeigt nach unten
      for (let i = 0; i < ring.length; i += 2) addWallSeg(getBuf(zone, 'w_plain'), ring[i], ring[i + 1], ring[i] + 0.15, ring[i + 1] + 0.15, 0.15, eave, tint);
      count++; continue;
    }

    // Wände
    let s = 0;
    for (let i = 0, n = ring.length, j = n - 2; i < n; j = i, i += 2) {
      const ax = ring[j], az = ring[j + 1], bx = ring[i], bz = ring[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      wallBuf.quad([ax, base, az], [bx, base, bz], [bx, eave, bz], [ax, eave, az],
        [s / tw, base / th], [(s + len) / tw, base / th], [(s + len) / tw, eave / th], [s / tw, eave / th], tint);
      s += len;
    }

    // Dach
    const roofKey = 'r_' + spec.roofMat;
    const [, rTile] = M.roof[spec.roofMat];
    if (spec.roof === 'gable') {
      const rb = getBuf(zone, roofKey);
      const { cx, cz, ax, az, bx, bz, L, W } = ob;
      const rh = Math.min(W * Math.tan(spec.pitch * Math.PI / 180), 7.5);
      const ov = 0.45, drop = ov * rh / Math.max(W, 0.1);
      const P = (sa, sb, y) => [cx + ax * sa + bx * sb, y, cz + az * sa + bz * sb];
      const Le = L + 0.35, We = W + ov, ye = eave - drop, yr = eave + rh;
      const slope = Math.hypot(We, rh + drop) / rTile, u0 = -Le / rTile, u1 = Le / rTile;
      rb.quad(P(-Le, We, ye), P(Le, We, ye), P(Le, 0, yr), P(-Le, 0, yr), [u0, 0], [u1, 0], [u1, slope], [u0, slope], roofTint, UP);
      rb.quad(P(Le, -We, ye), P(-Le, -We, ye), P(-Le, 0, yr), P(Le, 0, yr), [u1, 0], [u0, 0], [u0, slope], [u1, slope], roofTint, UP);
      for (const sgn of [-1, 1]) {   // Giebeldreiecke in Wandmaterial
        wallBuf.tri(P(sgn * L, W, eave), P(sgn * L, -W, eave), P(sgn * L, 0, yr),
          [W / tw, eave / th], [-W / tw, eave / th], [0, yr / th], tint, [ax * sgn, 0, az * sgn]);
      }
      top = yr;
    } else if (spec.roof === 'hip') {
      const rb = getBuf(zone, roofKey);
      const [cx, cz] = centroid(ring);
      const rh = Math.min(ob.W * Math.tan(spec.pitch * Math.PI / 180), 6);
      const apex = [cx, eave + rh, cz];
      for (let i = 0, n = ring.length, j = n - 2; i < n; j = i, i += 2) {
        const ox = (x, c) => c + (x - c) * 1.06;
        const a = [ox(ring[j], cx), eave - 0.15, ox(ring[j + 1], cz)], b = [ox(ring[i], cx), eave - 0.15, ox(ring[i + 1], cz)];
        const el = Math.hypot(b[0] - a[0], b[2] - a[2]) / rTile;
        const sl = Math.hypot((a[0] + b[0]) / 2 - cx, (a[2] + b[2]) / 2 - cz, rh) / rTile;
        rb.tri(a, b, apex, [0, 0], [el, 0], [el / 2, sl], roofTint, UP);
      }
      top = eave + rh;
    } else {
      const rb = getBuf(zone, spec.roofMat === 'city' ? 'r_city' : 'r_flat');
      addFlatPoly(rb, ring, eave, rTile, roofTint);
      if (spec.roofBox) {     // Dachtechnik (Stadt)
        const bw = ob.L * 0.9, bd = ob.W * 0.9;
        const P = (sa, sb, y) => [ob.cx + ob.ax * sa + ob.bx * sb, y, ob.cz + ob.az * sa + ob.bz * sb];
        const box = [P(-bw, -bd, 0), P(bw, -bd, 0), P(bw, bd, 0), P(-bw, bd, 0)];
        for (let k = 0; k < 4; k++) {
          const p = box[k], q = box[(k + 1) % 4];
          rb.quad([p[0], eave, p[2]], [q[0], eave, q[2]], [q[0], eave + 2.5, q[2]], [p[0], eave + 2.5, p[2]],
            [0, 0], [1, 0], [1, 1], [0, 1], roofTint, [(p[0] + q[0]) / 2 - ob.cx, 0, (p[2] + q[2]) / 2 - ob.cz]);
        }
        rb.quad(...box.map(p => [p[0], eave + 2.5, p[2]]), [0, 0], [1, 0], [1, 1], [0, 1], roofTint, UP);
        top = eave + 2.5;
      }
    }

    // Kirchturm (westliches Ende der Längsachse) mit spitzem Helm
    if (spec.tower) {
      const { cx, cz, ax, az, bx, bz, L, W } = ob;
      const sgn = ax > 0 ? -1 : 1;                          // Westende = kleineres x
      const side = Math.min(8, W * 1.2) / 2;
      const tcx = cx + ax * sgn * (L - side), tcz = cz + az * sgn * (L - side);
      const P = (sa, sb, y) => [tcx + ax * sa + bx * sb, y, tcz + az * sa + bz * sb];
      const tH = 25, spire = 15;
      const sq = [P(-side, -side, 0), P(side, -side, 0), P(side, side, 0), P(-side, side, 0)];
      const tb = getBuf(zone, 'w_church'), [, ptw, pth] = M.wall.church;
      for (let k = 0; k < 4; k++) {
        const p = sq[k], q = sq[(k + 1) % 4];
        const hint = [(p[0] + q[0]) / 2 - tcx, 0, (p[2] + q[2]) / 2 - tcz];
        tb.quad([p[0], 0, p[2]], [q[0], 0, q[2]], [q[0], tH, q[2]], [p[0], tH, p[2]],
          [0, 0], [side * 2 / ptw, 0], [side * 2 / ptw, tH / pth], [0, tH / pth], tint, hint);
        const rb = getBuf(zone, 'r_slate');
        const o = 0.25, pe = [tcx + (p[0] - tcx) * (1 + o / side), tH, tcz + (p[2] - tcz) * (1 + o / side)];
        const qe = [tcx + (q[0] - tcx) * (1 + o / side), tH, tcz + (q[2] - tcz) * (1 + o / side)];
        rb.tri(pe, qe, [tcx, tH + spire, tcz], [0, 0], [side, 0], [side / 2, spire / 2], roofTint, UP);
      }
      top = Math.max(top, tH + spire);
      if (near(B.b, bound + 2)) {
        const tp = []; for (const p of sq) tp.push(p[0], p[2]);
        const tr = signedArea(tp) > 0 ? reverseRing(tp) : tp;
        obstacles.push({ ...bounds(tr), minY: 0, maxY: tH + spire, top: tH + spire, poly: tr });
      }
    }

    if (!tallest || top > tallest.top) { if (near(B.b, bound - 5)) tallest = { top, c: B.c }; }
    if (base < 2.2) buildingRings.push({ ring, b: B.b });
    if (near(B.b, bound + 2) && base < 2.2) {
      obstacles.push({ minX: B.b.minX, maxX: B.b.maxX, minZ: B.b.minZ, maxZ: B.b.maxZ, minY: base, maxY: top, top, poly: ring });
    }
    count++;
  }

  // ---------- Straßen, Wege, Flächen ----------
  const ground1 = { grass: new Buf(), forest: new Buf(), farmland: new Buf(), water: new Buf(), paving: new Buf(), parking: new Buf() };
  const roadBuf = new Buf(), walkBuf = new Buf(), pathBuf = new Buf(), markBuf = new Buf();
  const hedgeBuf = new Buf(), wallLowBuf = new Buf();
  const AREA_OF = { grass: 'grass', meadow: 'grass', village_green: 'grass', park: 'grass', garden: 'grass', recreation_ground: 'grass',
    cemetery: 'grass', playground: 'grass', pitch: 'grass', allotments: 'grass', orchard: 'farmland', farmland: 'farmland',
    forest: 'forest', wood: 'forest', scrub: 'forest', heath: 'farmland', water: 'water', reservoir: 'water', basin: 'water' };
  const AREA_Y = { farmland: 0.012, forest: 0.014, grass: 0.016, water: 0.02, paving: 0.026, parking: 0.03 };
  const forests = [], treeRows = [], roadLines = [];

  for (const w of ways) {
    const t = w.tags;
    if (t.building || t['building:part']) continue;
    const closed = w.nodes.length > 3 && w.nodes[0] === w.nodes[w.nodes.length - 1];
    const hw = t.highway;
    // Flächen
    let areaKind = null;
    if (closed && (t.area === 'yes' || !hw)) {
      if (hw === 'pedestrian' || hw === 'footway' || t.place === 'square') areaKind = 'paving';
      else if (t.amenity === 'parking') areaKind = 'parking';
      else areaKind = AREA_OF[t.landuse] || AREA_OF[t.leisure] || AREA_OF[t.natural] || (t.water ? 'water' : null);
    }
    if (areaKind) {
      const ring = ringOf(w); if (!ring) continue;
      const b = bounds(ring); if (!near(b, maxD + 60)) continue;
      addFlatPoly(ground1[areaKind], ring, AREA_Y[areaKind], M.area[areaKind][1], null);
      if (areaKind === 'forest') forests.push({ ring, b });
      continue;
    }
    const pts = lineOf(w); if (pts.length < 4) continue;
    const b = bounds(pts); if (!near(b, maxD + 40)) continue;
    if (hw && t.tunnel !== 'yes') {
      if (ROAD_W[hw]) {
        let width = ROAD_W[hw];
        if (hw === 'service' && (t.service === 'parking_aisle' || t.service === 'driveway')) width = 2.9;
        if (S.sidewalks && (hw === 'primary' || hw === 'secondary' || hw === 'tertiary')) addRibbon(walkBuf, pts, width + 3.4, 0.036, M.sidewalk[1], null);
        const pave = hw === 'pedestrian';
        addRibbon(pave ? walkBuf : roadBuf, pts, width, pave ? 0.038 : 0.046, pave ? M.sidewalk[1] : M.road[1], null);
        if (hw === 'primary' || hw === 'secondary' || hw === 'trunk') addDashes(markBuf, pts, 0.054, null);
        roadLines.push({ pts, width, main: !pave });
      } else if (PATH_W[hw]) {
        addRibbon(pathBuf, pts, PATH_W[hw], 0.033, M.path[1], null);
        roadLines.push({ pts, width: PATH_W[hw], main: false });
      }
    } else if (t.waterway && t.tunnel !== 'culvert') {
      const ww = t.waterway === 'river' ? 8 : t.waterway === 'stream' ? 1.8 : 1.1;
      addRibbon(ground1.water, pts, ww, AREA_Y.water, 8, null);
    } else if (t.natural === 'tree_row') {
      treeRows.push(pts);
    } else if (t.barrier === 'hedge' || t.barrier === 'wall' || t.barrier === 'retaining_wall') {
      const hedge = t.barrier === 'hedge';
      const bw = hedge ? 0.9 : 0.35, bh = hedge ? 1.3 : 1.0;
      for (let i = 0; i + 3 < pts.length; i += 2) {
        const quad = addWallSeg(hedge ? hedgeBuf : wallLowBuf, pts[i], pts[i + 1], pts[i + 2], pts[i + 3], bw, bh, null);
        if (!quad) continue;
        const qb = bounds(quad);
        if (near(qb, bound + 1)) obstacles.push({ ...qb, minY: 0, maxY: bh, top: bh, poly: signedArea(quad) > 0 ? reverseRing(quad) : quad });
      }
    }
  }

  // ---------- Meshes einhängen ----------
  const addMesh = (m, collider) => { if (!m) return; mapGroup.add(m); if (collider) worldColliders.push(m); };
  for (const zone of ['inner', 'outer']) {
    for (const [key, buf] of Object.entries(bufs[zone])) {
      const mat = key.startsWith('w_') ? M.wall[key.slice(2)][0] : M.roof[key.slice(2)][0];
      addMesh(buf.mesh(mat), zone === 'inner');
    }
  }
  for (const [k, buf] of Object.entries(ground1)) addMesh(buf.mesh(M.area[k][0], { shadow: false }), false);
  addMesh(walkBuf.mesh(M.sidewalk[0], { shadow: false }), false);
  addMesh(pathBuf.mesh(M.path[0], { shadow: false }), false);
  addMesh(roadBuf.mesh(M.road[0], { shadow: false }), false);
  addMesh(markBuf.mesh(M.marking, { shadow: false }), false);
  addMesh(hedgeBuf.mesh(M.hedge), true);
  addMesh(wallLowBuf.mesh(M.wallLow), true);

  // Boden außerhalb der 180-m-Platte (Kulisse), Kachelung bündig zur Platte
  if (S.ground.map) {
    const size = 1012;
    const g = new THREE.PlaneGeometry(size, size);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size / 8, uv.getY(i) * size / 8);
    M.farGround.color.set(S.ground.color);
    const far = new THREE.Mesh(g, M.farGround);
    far.rotation.x = -Math.PI / 2; far.position.y = -0.04; far.receiveShadow = true;
    mapGroup.add(far);
  }

  // ---------- Freiflächen-Test (für Bäume, Zaun, Spawn) ----------
  const insideBuilding = (x, z, pad) => {
    for (const r of buildingRings) {
      const b = r.b;
      if (x < b.minX - pad || x > b.maxX + pad || z < b.minZ - pad || z > b.maxZ + pad) continue;
      if (pointInPoly(x, z, r.ring)) return true;
      if (pad > 0 && closestOnPoly(x, z, r.ring, _cp).d2 < pad * pad) return true;
    }
    return false;
  };
  const nearRoad = (x, z, pad) => {
    for (const l of roadLines) {
      const p = l.pts, lim = l.width / 2 + pad;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], az = p[i + 1], ex = p[i + 2] - ax, ez = p[i + 3] - az;
        const len2 = ex * ex + ez * ez; if (len2 < 1e-6) continue;
        let t = ((x - ax) * ex + (z - az) * ez) / len2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - ax - ex * t, dz = z - az - ez * t;
        if (dx * dx + dz * dz < lim * lim) return true;
      }
    }
    return false;
  };

  // ---------- Bäume ----------
  if (S.trees) {
    const rngT = mulberry32(9001);
    const trees = [];   // {x,z,s,conifer}
    const tryTree = (x, z, conifer, pad = 2.2) => {
      if (Math.hypot(x, z) > maxD) return;
      if (insideBuilding(x, z, pad) || nearRoad(x, z, 1.2)) return;
      trees.push({ x, z, s: 0.75 + rngT() * 0.6, conifer });
    };
    for (const [x, z] of treeNodes) tryTree(x, z, false, 0.5);
    for (const pts of treeRows) {
      for (let i = 0; i + 3 < pts.length; i += 2) {
        const ax = pts[i], az = pts[i + 1], dx = pts[i + 2] - ax, dz = pts[i + 3] - az, len = Math.hypot(dx, dz);
        for (let s = 0; s < len; s += 7) tryTree(ax + dx * s / len, az + dz * s / len, false, 0.8);
      }
    }
    for (const f of forests) {    // Wald: dicht, viele Nadelbäume
      const area = (f.b.maxX - f.b.minX) * (f.b.maxZ - f.b.minZ);
      const n = Math.min(260, area / 55);
      for (let i = 0; i < n; i++) {
        const x = f.b.minX + rngT() * (f.b.maxX - f.b.minX), z = f.b.minZ + rngT() * (f.b.maxZ - f.b.minZ);
        if (pointInPoly(x, z, f.ring)) tryTree(x, z, rngT() < 0.55);
      }
    }
    // Gärten: zufällige Punkte nahe Häusern, abseits der Straßen
    let placed = 0;
    for (let i = 0; i < 4000 && placed < 320; i++) {
      const x = (rngT() * 2 - 1) * (maxD - 20), z = (rngT() * 2 - 1) * (maxD - 20);
      if (!insideBuilding(x, z, 9)) continue;            // nicht weiter als ~9 m vom nächsten Haus
      const before = trees.length;
      tryTree(x, z, rngT() < 0.22, 2.4);
      if (trees.length > before) placed++;
    }
    // Instanzen
    const leafy = trees.filter(t => !t.conifer), conif = trees.filter(t => t.conifer);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    const leafCols = ['#4f7a33', '#5c8a3a', '#47702e', '#678f3f', '#3f6a2c', '#6c9444'];
    const conCols = ['#2f5233', '#35593a', '#2a4a2e', '#3a6040'];
    const innerT = trees.filter(t => Math.abs(t.x) < bound + 8 && Math.abs(t.z) < bound + 8);
    const outerT = trees.filter(t => !(Math.abs(t.x) < bound + 8 && Math.abs(t.z) < bound + 8));
    const trunkMesh = (list) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(G.trunk, M.trunk, list.length);
      list.forEach((t, i) => {
        const h = (t.conifer ? 1.6 : 2.3) * t.s;
        m4.compose(v.set(t.x, 0, t.z), q.identity(), sc.set(t.s, h, t.s)); im.setMatrixAt(i, m4);
      });
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
      return im;
    };
    addMesh(trunkMesh(innerT), true);
    addMesh(trunkMesh(outerT), false);
    if (leafy.length) {
      const im = new THREE.InstancedMesh(G.leaf, M.crown, leafy.length);
      leafy.forEach((t, i) => {
        const h = 2.3 * t.s, r = 2.3 * t.s * (0.85 + rngT() * 0.3);
        q.setFromAxisAngle(v.set(0, 1, 0), rngT() * Math.PI);
        m4.compose(v.set(t.x, h + r * 0.75, t.z), q, sc.set(r, r * 0.9, r)); im.setMatrixAt(i, m4);
        im.setColorAt(i, col.set(pick(rngT, leafCols)).multiplyScalar(0.9 + rngT() * 0.2));
      });
      im.castShadow = true; im.computeBoundingSphere(); addMesh(im, false);
    }
    if (conif.length) {
      const im = new THREE.InstancedMesh(G.cone, M.crown, conif.length);
      conif.forEach((t, i) => {
        const r = 1.7 * t.s, h = 7 * t.s;
        m4.compose(v.set(t.x, 1.0 * t.s, t.z), q.identity(), sc.set(r, h, r)); im.setMatrixAt(i, m4);
        im.setColorAt(i, col.set(pick(rngT, conCols)).multiplyScalar(0.9 + rngT() * 0.2));
      });
      im.castShadow = true; im.computeBoundingSphere(); addMesh(im, false);
    }
    for (const t of innerT) {
      if (Math.abs(t.x) > bound + 1 || Math.abs(t.z) > bound + 1) continue;
      const r = 0.3 * t.s;
      obstacles.push({ minX: t.x - r, maxX: t.x + r, minZ: t.z - r, maxZ: t.z + r, minY: 0, maxY: 3, top: 3 });
    }
  }

  // ---------- Spielgrenze ----------
  if (S.boundary === 'fence') {
    const posts = [];
    for (const [ax, az, horiz] of [[0, -bound, true], [0, bound, true], [-bound, 0, false], [bound, 0, false]]) {
      for (let s = -bound + 1.75; s < bound; s += 3.5) {
        const x = horiz ? s : ax, z = horiz ? az : s;
        if (insideBuilding(x, z, 0.3)) continue;
        posts.push({ x, z, rot: horiz ? 0 : Math.PI / 2 });
      }
    }
    const panels = new THREE.InstancedMesh(G.panel, M.fence, posts.length);
    const feet = new THREE.InstancedMesh(G.foot, M.fenceFoot, posts.length * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), ax = new THREE.Vector3(0, 1, 0);
    posts.forEach((p, i) => {
      q.setFromAxisAngle(ax, p.rot);
      panels.setMatrixAt(i, m4.compose(v.set(p.x, 0, p.z), q, one));
      const dx = Math.cos(p.rot) * 1.75, dz = -Math.sin(p.rot) * 1.75;
      feet.setMatrixAt(i * 2, m4.compose(v.set(p.x - dx, 0, p.z - dz), q, one));
      feet.setMatrixAt(i * 2 + 1, m4.compose(v.set(p.x + dx, 0, p.z + dz), q, one));
    });
    panels.castShadow = true; panels.computeBoundingSphere(); feet.computeBoundingSphere();
    mapGroup.add(panels, feet);
  } else {
    const wb = new Buf();
    const wall = (x0, z0, x1, z1) => {
      const quad = addWallSeg(wb, x0, z0, x1, z1, 2, 8, null);
      obstacles.push({ ...bounds(quad), minY: 0, maxY: 8, top: 8 });
    };
    wall(-bound, -bound, bound, -bound); wall(-bound, bound, bound, bound);
    wall(-bound, -bound, -bound, bound); wall(bound, -bound, bound, bound);
    // Beton-Sperren als Deckung in der Platzmitte
    for (const [x, z, len, rot] of [[-8, -12, 6, 0.3], [10, 10, 7, -0.4], [-14, 14, 8, 1.2], [12, -16, 6, -0.7], [0, -24, 10, 0], [0, 24, 10, 0]]) {
      const dx = Math.cos(rot) * len / 2, dz = -Math.sin(rot) * len / 2;
      const quad = addWallSeg(wb, x - dx, z - dz, x + dx, z + dz, 0.6, 1.25, null);
      obstacles.push({ ...bounds(quad), minY: 0, maxY: 1.3, top: 1.3, poly: signedArea(quad) > 0 ? reverseRing(quad) : quad });
    }
    addMesh(wb.mesh(M.barrier), true);
  }

  // ---------- Spawnpunkt: freie Stelle auf Straße/Platz nahe der Mitte ----------
  const blocked = (x, z, r) => {
    for (const o of obstacles) {
      if (x < o.minX - r || x > o.maxX + r || z < o.minZ - r || z > o.maxZ + r) continue;
      if (!o.poly || pointInPoly(x, z, o.poly) || closestOnPoly(x, z, o.poly, _cp).d2 < r * r) return true;
    }
    return insideBuilding(x, z, r);
  };
  let spawn = null, bestD = Infinity;
  for (const l of roadLines) {
    const p = l.pts;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az, len = Math.hypot(dx, dz);
      for (let s = 0; s <= len; s += 2) {
        const x = ax + dx * s / Math.max(len, 1e-6), z = az + dz * s / Math.max(len, 1e-6);
        if (Math.abs(x) > bound - 8 || Math.abs(z) > bound - 8) continue;
        const d = Math.hypot(x, z) + (l.main ? 0 : 6);
        if (d < bestD && !blocked(x, z, 1.3)) { bestD = d; spawn = { x, z }; }
      }
    }
  }
  if (!spawn) spawn = { x: 0, z: 10 };
  // Blick auf das höchste Gebäude der Spielfläche (in Much: St. Martinus)
  const look = tallest ? tallest.c : [0, 0];
  const ldx = look[0] - spawn.x, ldz = look[1] - spawn.z;
  spawn.yaw = Math.hypot(ldx, ldz) > 1 ? Math.atan2(-ldx, -ldz) : Math.PI;

  console.log(`🌐 OSM-Kulisse "${loc.label}": ${count} Gebäude, ${roadLines.length} Wege, ${obstacles.length} Hindernisse.`);
  return { spawn, isFree: (x, z, r = 1) => !blocked(x, z, r), roads: roadLines };
}
