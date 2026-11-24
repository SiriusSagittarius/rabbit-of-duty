import * as THREE from 'three';
import { pointInPoly, closestOnPoly } from './poly2d.js';
import { MUCH_SHOPS, SHOP_TOP, drawShopAtlas, loadShopPhotos, shopPhotoOf } from './much-shops.js?v=11';
import { buildMuchLandmarks, muchWallTextures } from './much-landmarks.js?v=1';

/**
 * NRW-Geobasisdaten → echte Kulisse (Daten aus tools/nrw_fetch.py, Ordner assets/nrw/<ort>/):
 *  - Gelände aus DGM1 (1-m-Raster), belegt mit dem Luftbild (DOP)
 *  - Gebäude aus dem 3D-Gebäudemodell LoD2: echte Grundrisse, Höhen und Dachformen;
 *    Dächer zeigen das echte Luftbild, Fassaden sind stilisiert (Gebäudefunktion → Fassadentyp)
 *  - Bäume an den echten Standorten (DOM1 − DGM1), Kronenfarbe aus dem Luftbild
 * Daten: Geobasis NRW, Datenlizenz Deutschland – Zero – 2.0.
 *
 * Leistung (große Spielfläche, schwache GPUs – dort kostet jeder Draw-Call spürbar GPU-Zeit):
 *  - Gelände in 64-m-Kacheln mit 4 Detailstufen (1/2/4/8 m) je nach Abstand; Schürzen verdecken Risse
 *  - Häuser (Wände + Dächer) je 128-m-Kachel in EINEM Mesh: Fassaden aus einem Textur-Array,
 *    Dächer aus dem Luftbild, beides im selben Shader → 1 Draw-Call pro Kachel
 *  - Bäume (Kronen + Stämme) je Kachel zu einem Mesh gebacken, ferne Kacheln mit groben Kronen ohne Stämme
 *  - Lambert- statt PBR-Material für Boden, Häuser, Bäume (matte Flächen sehen gleich aus, kosten weniger)
 *  - Schuss-Treffer gegen unsichtbare Einzelgebäude-Hüllen statt gegen die großen Kachel-Meshes
 *
 * Hilfsfunktionen kommen per Parameter aus osm-level.js (kein Zirkel-Import).
 */
const _cp = { x: 0, z: 0, d2: 0 };
const CACHE = new Map();          // pro Datenordner: Rohdaten, Texturen, Materialien

const CHUNK = 64;                         // Geländekachel (m)
const LOD_STEP = [1, 2, 4, 8];            // Rasterweite je Detailstufe (m)
const LOD_DIST = [40, 110, 220];          // Abstand Kamera → Kachelrand, ab dem die nächste Stufe gilt
const SKIRT = 3;                          // Schürzentiefe (m) gegen Risse zwischen Detailstufen
// Haus-/Baum-Kacheln: ~110–130 m (Teiler des Feinrasters) → wenige Meshes, trotzdem gutes Wegschneiden außerhalb des Blickfelds
const TREE_HI = 120;                      // Bäume mit Stämmen + feinen Kronen bis zu diesem Kachelabstand (m)
const WALL_LAYERS = [
  'house',           // 0
  'house2',          // 1
  'slate',           // 2
  'fachwerk',        // 3
  'plain',           // 4
  'garage',          // 5
  'church',          // 6 (St. Martinus Altrosa)
  'fachwerk_shop',   // 7 (neutrales Fachwerk mit Ladenlokal im EG)
  'slate_shop',      // 8 (neutraler Schiefer mit Ladenlokal im EG)
  'shop_sparkasse',  // 9 (Kreissparkasse, Dr.-Wirtz-Str. 4)
  'brick',           // 10 (Klinker, z. B. Hauptstraße 24)
  'bank_eg',         // 11 (VR-Bank: Glas-Erdgeschoss mit Blende, 3,6-m-Geschosse)
  'bank_og',         // 12 (VR-Bank: Obergeschoss mit mintgrünen Paneelen – nur über bank_eg erreichbar)
];
const L_CHURCH = WALL_LAYERS.indexOf('church'), L_BANK = WALL_LAYERS.indexOf('bank_eg'), L_BANK_OG = WALL_LAYERS.indexOf('bank_og');
/** Geschosshöhe (Texturhöhe) und Achsbreite je Fassadenebene in Metern. */
const storeyOf = (layer) => (layer === L_CHURCH ? 8.0 : layer === L_BANK ? 3.6 : 2.9);
const bayOf = (layer) => (layer === 9 ? 5.5 : layer === L_CHURCH ? 4.0 : 3.0);
// Ebenen 7–9 haben ein Ladenlokal im EG (der Shader teilt EG / Obergeschosse), 9 im breiten 5,5-m-Raster.
// Die echten Läden der Hauptstraße bekommen stattdessen eine eigene Ladenfront (src/much-shops.js).
const ROOF_LAYER = WALL_LAYERS.length;     // Ebene >= ROOF_LAYER = Dach: Farbe aus dem Luftbild
const ROOF_TINT = new THREE.Color('#d2d2d2');   // Luftbild leicht abdunkeln (wie der Boden)

function loadTex(url, aniso) {
  return new Promise((resolve, reject) => new THREE.TextureLoader().load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    resolve(t);
  }, undefined, reject));
}
/** Kleiner Farb-Sampler über ein Luftbild (für Baumkronen). */
function samplerFrom(tex, size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(tex.image, 0, 0, size, size);
  const d = g.getImageData(0, 0, size, size).data;
  return (u, v, out) => {
    const x = Math.min(size - 1, Math.max(0, (u * size) | 0)), y = Math.min(size - 1, Math.max(0, (v * size) | 0));
    const i = (y * size + x) * 4;
    return out.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace);
  };
}

async function loadData(dir) {
  if (CACHE.has(dir)) return CACHE.get(dir);
  const ok = (r) => { if (!r.ok) throw new Error(`${r.url}: HTTP ${r.status}`); return r; };
  const [meta, terrain, bj] = await Promise.all([
    fetch(dir + 'meta.json').then(ok).then(r => r.json()),
    fetch(dir + 'terrain.bin').then(ok).then(r => r.arrayBuffer()),
    fetch(dir + 'buildings.json').then(ok).then(r => r.json()),
  ]);
  const [near, far] = await Promise.all([loadTex(dir + meta.dop.near.file, 8), loadTex(dir + meta.dop.far.file, 4)]);
  const photo = { color: '#d2d2d2' };
  const data = {
    meta, q: new Uint16Array(terrain), buildings: bj.b,
    tex: { near, far },
    sample: { near: samplerFrom(near), far: samplerFrom(far) },
    mat: {
      groundNear: new THREE.MeshLambertMaterial({ map: near, ...photo }),
      groundFar: new THREE.MeshLambertMaterial({ map: far, ...photo }),
      groundOuter: new THREE.MeshLambertMaterial({ map: far, ...photo, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 }),
      trees: new THREE.MeshLambertMaterial({ vertexColors: true }),
      hull: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),     // Trefferhüllen (nie gezeichnet)
    },
  };
  CACHE.set(dir, data);
  return data;
}

/**
 * Häuser-Material: Fassaden (Textur-Array, je 256×256 aus osm-level.js) und Dächer (Luftbild) in EINEM
 * Shader. Bei Ladenlokalen teilt der Shader automatisch: Erdgeschoss = Schaufenster & Tür,
 * Obergeschosse = echter bergischer Schiefer oder Fachwerk.
 */
function buildingMaterial(arr, dop) {
  const dummy = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);   // sorgt nur für UV-Varyings
  dummy.needsUpdate = true;
  const mat = new THREE.MeshLambertMaterial({ map: dummy, vertexColors: true });   // einseitig: Wände sind nach außen ausgerichtet
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.wallArray = { value: arr };
    sh.uniforms.dopMap = { value: dop };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float layer;\nvarying float vLayer;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvLayer = layer;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform highp sampler2DArray wallArray;\nuniform sampler2D dopMap;\nvarying float vLayer;')
      .replace('#include <map_fragment>', [
        'vec4 wallTexel;',
        'if (vLayer >= 6.5 && vLayer < 9.5) {',
        '  // Ladenlokale: Erdgeschoss (0 bis 2,9 m) = Schaufenster und Eingang',
        '  if (vMapUv.y < 1.0) {',
        '    wallTexel = texture( wallArray, vec3( fract(vMapUv.x), clamp(vMapUv.y, 0.0, 0.999), vLayer ) );',
        '  } else {',
        '    // Obergeschosse: bergischer Schiefer (2) oder Fachwerk (3) im 3-m-Raster',
        '    float upperLayer = (vLayer >= 7.5 && vLayer < 8.5) ? 2.0 : 3.0;',
        '    float upperU = (vLayer >= 8.5) ? fract(vMapUv.x * (5.5 / 3.0)) : fract(vMapUv.x);',
        '    wallTexel = texture( wallArray, vec3( upperU, fract(vMapUv.y), upperLayer ) );',
        '  }',
        `} else if (abs(vLayer - ${L_CHURCH}.0) < 0.5) {`,
        '  // Kirche: eine Kachel = 4 m × 8 m ab Sockel, darüber glatter Putz (oberste Zeile)',
        `  wallTexel = texture( wallArray, vec3( vMapUv.x, clamp(vMapUv.y, 0.004, 0.996), ${L_CHURCH}.0 ) );`,
        `} else if (abs(vLayer - ${L_BANK}.0) < 0.5) {`,
        '  // Bank: unterstes Geschoss ab Straßenniveau = Glas-Erdgeschoss, alle anderen = Obergeschoss',
        '  bool eg = vMapUv.y >= 0.0 && vMapUv.y < 1.0;',
        `  wallTexel = texture( wallArray, vec3( vMapUv.x, eg ? clamp(vMapUv.y, 0.0, 0.999) : fract(vMapUv.y), eg ? ${L_BANK}.0 : ${L_BANK_OG}.0 ) );`,
        '} else {',
        `  wallTexel = texture( wallArray, vec3( vMapUv, min( vLayer, ${ROOF_LAYER - 1}.0 ) ) );`,
        '}',
        '\tvec4 roofTexel = texture( dopMap, vMapUv );',
        `\tdiffuseColor *= vLayer > ${ROOF_LAYER - 1}.5 ? roofTexel : wallTexel;`,
      ].join('\n'));
  };
  mat.customProgramCacheKey = () => 'nrw-building';
  return mat;
}

/** Alle Fassaden-Texturen als Textur-Array (eine Ebene je Fassadentyp). */
function wallArrayTexture(T) {
  const S = 256, n = WALL_LAYERS.length;
  const data = new Uint8Array(S * S * 4 * n);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  WALL_LAYERS.forEach((key, li) => {
    g.clearRect(0, 0, S, S);
    const img = T[key]?.image;
    if (img) g.drawImage(img, 0, 0, S, S);
    const src = g.getImageData(0, 0, S, S).data;
    for (let y = 0; y < S; y++) {     // Zeilen spiegeln wie flipY bei Canvas-Texturen
      data.set(src.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), (li * S + y) * S * 4);
    }
  });
  const arr = new THREE.DataArrayTexture(data, S, S, n);
  arr.format = THREE.RGBAFormat; arr.type = THREE.UnsignedByteType;
  arr.colorSpace = THREE.SRGBColorSpace;
  arr.wrapS = arr.wrapT = THREE.RepeatWrapping;
  arr.magFilter = THREE.LinearFilter; arr.minFilter = THREE.LinearMipmapLinearFilter;
  arr.generateMipmaps = true; arr.anisotropy = 4;
  arr.needsUpdate = true;
  return arr;
}

/** Nicht-indizierte Geometrie (Ikosaeder) → indiziert, mit weichen Normalen (= Richtung vom Mittelpunkt). */
function indexedSphere(geo) {
  const p = geo.attributes.position, map = new Map(), pos = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    let k = map.get(key);
    if (k === undefined) { k = pos.length / 3; map.set(key, k); pos.push(x, y, z); }
    idx.push(k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nrm = pos.slice();
  for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

/** Bäume einer Kachel zu einer Geometrie backen: [{geo, m4, col}] → BufferGeometry (Position, Normale, Farbe, Index). */
function bakeParts(parts) {
  let nv = 0, ni = 0;
  for (const pt of parts) { nv += pt.geo.attributes.position.count; ni += pt.geo.index.count; }
  if (!nv) return null;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let vo = 0, io = 0;
  for (const pt of parts) {
    const P = pt.geo.attributes.position, N = pt.geo.attributes.normal, I = pt.geo.index;
    nm.getNormalMatrix(pt.m4);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(pt.m4); pos.set([v.x, v.y, v.z], (vo + i) * 3);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (vo + i) * 3);
      col.set([pt.col.r, pt.col.g, pt.col.b], (vo + i) * 3);
    }
    for (let i = 0; i < I.count; i++) idx[io + i] = I.getX(i) + vo;
    vo += P.count; io += I.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * Feste Fassadentypen für einzelne Gebäude in Much (amtliche ALKIS-Adresse → Ebene aus WALL_LAYERS).
 * Die Läden der Hauptstraße mit eigener Ladenfront stehen in src/much-shops.js.
 */
export const MUCH_BY_ADDRESS = {
  // St. Martinus Kirche: Altrosa, romanische Rundbogenfenster (der Turm kommt aus src/much-landmarks.js)
  'Kirchplatz 1': { style: 'church', name: 'St. Martinus' },

  // Kreissparkasse
  'Dr.Wirtz-Straße 4': { style: 'shop_sparkasse', name: 'Kreissparkasse' },
  'Dr. Wirtz-Straße 4': { style: 'shop_sparkasse', name: 'Kreissparkasse' },

};

/** ALKIS-Gebäudefunktion (LoD2 "function") + Adress-Matching → Fassadentyp. */
function styleFor(b, rng) {
  // 1. Zuerst exakte Adresse prüfen (nur dort, wo der echte Laden steht!)
  const addr = typeof b === 'object' ? b?.addr : null;
  if (addr) {
    const normAddr = addr.replace('Dr. ', 'Dr.');
    if (MUCH_BY_ADDRESS[normAddr] || MUCH_BY_ADDRESS[addr]) {
      const cfg = MUCH_BY_ADDRESS[normAddr] || MUCH_BY_ADDRESS[addr];
      return typeof cfg === 'string' ? cfg : cfg.style;
    }
  }

  const fn = typeof b === 'string' ? b : (b?.fn || '');
  const [cls, code] = fn.split('_');
  const c = parseInt(code, 10) || 0;

  if (cls !== '31001') return 'plain';                       // Überdachungen, Carports, Bauwerke
  if (c >= 2460 && c <= 2465) return 'garage';
  if (c >= 3040 && c <= 3049) return 'church';

  // 2. Gebäude auf der Hauptstraße:
  // Wie in der Realität: Fast alles Bergisches Fachwerk mit Ladenlokal im EG (Schaufenster & Tür),
  // aber neutral gestaltet ohne Duplikate von Geschäftsnamen!
  const street = typeof b === 'object' ? b?.street : null;
  if (street === 'Hauptstraße' || street === 'Hauptstrasse') {
    if (c === 3010 || c === 3012) return 'slate';            // Rathaus / Verwaltung (Schiefer)
    // ~78% Bergisches Fachwerk mit Ladenlokal, ~22% Bergischer Schiefer mit Ladenlokal
    return rng() < 0.78 ? 'fachwerk_shop' : 'slate_shop';
  }

  // 3. Andere Straßen: Typische bergische Wohnhäuser (überwiegend Fachwerk & Schiefer)
  const resi = () => {
    const w = rng();
    return w < 0.45 ? 'fachwerk' : w < 0.75 ? 'slate' : w < 0.88 ? 'house' : 'house2';
  };

  if (c >= 1100 && c < 1200) return 'fachwerk_shop';         // Wohnen + Gewerbe (neutrales Ladenlokal)
  if (c >= 1000 && c < 2000) return resi();
  if (c >= 2700 && c < 2800) return 'plain';                 // Landwirtschaft
  if (c >= 2000) return 'plain';
  return 'house2';
}

function newell(p) {
  let nx = 0, ny = 0, nz = 0;
  const n = p.length / 3;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = p[i * 3], yi = p[i * 3 + 1], zi = p[i * 3 + 2], xj = p[j * 3], yj = p[j * 3 + 1], zj = p[j * 3 + 2];
    nx += (yi - yj) * (zi + zj); ny += (zi - zj) * (xi + xj); nz += (xi - xj) * (yi + yj);
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}
function triangulate3D(p, nrm) {
  const ax = Math.abs(nrm[0]), ay = Math.abs(nrm[1]), az = Math.abs(nrm[2]);
  const pts = [];
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    pts.push(ay >= ax && ay >= az ? new THREE.Vector2(x, z) : ax >= az ? new THREE.Vector2(z, y) : new THREE.Vector2(x, y));
  }
  return THREE.ShapeUtils.triangulateShape(pts, []);
}
const vtx = (p, i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];

/** Dreiecke sammeln (Position, UV, Farbe, optional Textur-Ebene) → BufferGeometry. */
class TBuf {
  constructor(layered = false) { this.p = []; this.u = []; this.c = []; this.l = layered ? [] : null; }
  tri(a, b, c, ua, ub, uc, col, hint, layer = 0) {
    if (hint) {   // Wicklung an der Polygon-Normale ausrichten
      const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
      const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; }
    }
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.u.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    const r = col ? col.r : 1, g = col ? col.g : 1, bl = col ? col.b : 1;
    this.c.push(r, g, bl, r, g, bl, r, g, bl);
    if (this.l) this.l.push(layer, layer, layer);
  }
  mesh(material) {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.l) g.setAttribute('layer', new THREE.Float32BufferAttribute(this.l, 1));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
}

/** Wandpolygon: Fensterraster passend zur Wandbreite, Geschosse ab Gebäudesockel. flip = Normale umdrehen (nach außen). */
function addWall(buf, hull, p, y0, tint, layer, flip) {
  const nrm = newell(p);
  if (flip) { nrm[0] = -nrm[0]; nrm[1] = -nrm[1]; nrm[2] = -nrm[2]; }
  const hx = nrm[2], hz = -nrm[0], hl = Math.hypot(hx, hz);
  const n = p.length / 3;
  const us = new Array(n);
  let umin = Infinity, umax = -Infinity;
  for (let i = 0; i < n; i++) {
    us[i] = hl > 0.2 ? (p[i * 3] * hx + p[i * 3 + 2] * hz) / hl : 0;
    if (us[i] < umin) umin = us[i]; if (us[i] > umax) umax = us[i];
  }
  const W = umax - umin;
  // Sparkasse: breiteres Raster (5,5 m), damit Schild und Front auf der Wand natürlich sitzen; Kirche 4 m × 8 m
  const bays = Math.max(1, Math.round(W / bayOf(layer))), storey = storeyOf(layer);
  const uvOf = (i) => [W >= 2.2 ? (us[i] - umin) / W * bays : 0.02 + (us[i] - umin) / Math.max(W, 0.01) * 0.06,
    (p[i * 3 + 1] - y0) / storey];
  for (const f of triangulate3D(p, nrm)) {
    buf.tri(vtx(p, f[0]), vtx(p, f[1]), vtx(p, f[2]), uvOf(f[0]), uvOf(f[1]), uvOf(f[2]), tint, nrm, layer);
    for (const k of f) hull.push(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]);
  }
}
/** Dachpolygon mit Luftbild (Planprojektion von oben). Oberseite nach oben, Unterseite zusätzlich (Carports, Vordächer). */
function addRoof(buf, hull, p, dh) {
  const nrm = newell(p);
  if (nrm[1] < 0) { nrm[0] = -nrm[0]; nrm[1] = -nrm[1]; nrm[2] = -nrm[2]; }
  const down = [-nrm[0], -nrm[1], -nrm[2]];
  const uvOf = (i) => [(p[i * 3] + dh) / (2 * dh), 1 - (p[i * 3 + 2] + dh) / (2 * dh)];
  for (const f of triangulate3D(p, nrm)) {
    const a = vtx(p, f[0]), b = vtx(p, f[1]), c = vtx(p, f[2]), ua = uvOf(f[0]), ub = uvOf(f[1]), uc = uvOf(f[2]);
    buf.tri(a, b, c, ua, ub, uc, ROOF_TINT, nrm, ROOF_LAYER);
    buf.tri(a, b, c, ua, ub, uc, ROOF_TINT, down, ROOF_LAYER);
    for (const k of f) hull.push(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]);
  }
}
/** Zeigt die Wand nach außen? Ein Punkt knapp vor der Wand darf nicht im Grundriss liegen. */
function facesOut(p, rings) {
  const n = newell(p), hl = Math.hypot(n[0], n[2]);
  if (hl < 0.3) return true;
  let mx = 0, mz = 0;
  const k = p.length / 3;
  for (let i = 0; i < p.length; i += 3) { mx += p[i]; mz += p[i + 2]; }
  const tx = mx / k + n[0] / hl * 0.3, tz = mz / k + n[2] / hl * 0.3;
  return !rings.some(r => pointInPoly(tx, tz, r));
}

/** Startwert je Gebäude-ID (FNV-1a): Zufallsfassaden bleiben gleich, auch wenn sich andere Häuser ändern. */
function seedOf(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Nächster Punkt auf den Straßenlinien (aus OpenStreetMap). */
function nearestRoad(lines, x, z) {
  let best = null, bd = Infinity;
  for (const l of lines) {
    const p = l.pts;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az, ll = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / ll));
      const qx = ax + dx * t, qz = az + dz * t, d = (qx - x) ** 2 + (qz - z) ** 2;
      if (d < bd) { bd = d; best = { x: qx, z: qz, d: Math.sqrt(d) }; }
    }
  }
  return best;
}

const FACE_DIR = { N: [0, -1], S: [0, 1], O: [1, 0], E: [1, 0], W: [-1, 0] };   // Spielkoordinaten: x = Osten, z = Süden

/**
 * Straßenfront eines Gebäudes: die nach außen zeigende senkrechte Wand, die am besten zur nächsten Straße
 * schaut (Länge × Ausrichtung, nahe Straßen zählen mehr), plus fluchtende, anschließende Wände derselben Front.
 * Ergebnis in einer Wandbasis: r = nach rechts (von der Straße aus gesehen), n = nach außen,
 * u0..u1 = Ausdehnung entlang r, off = Lage der Wandebene entlang n, eave = Traufhöhe der Front.
 * Optionen (aus dem Ladeneintrag): face = Himmelsrichtung statt Straße (z. B. Laden im Giebel zum Platz),
 * near = [x, z] in Spielkoordinaten, bevorzugt die Wand nahe diesem Punkt (Häuser mit mehreren Straßenwänden).
 * jog = größter Vor- oder Rücksprung (m), bis zu dem anschließende Wandstücke zur Front gehören (Standard 0,6);
 * die Front steht vor dem vordersten Stück, Seitenteile schließen die Lücke.
 * gap = größte Lücke (m) entlang der Front zwischen zwei Stücken (Standard 0,5) – größer, wenn schräge Erkerwände
 * dazwischenliegen.
 */
function streetFront(b, roads, opt = {}) {
  const jog = opt.jog ?? 0.6, gap = opt.gap ?? 0.5;
  const walls = [];
  for (const p of b.w) {
    const nrm = newell(p);
    if (!facesOut(p, b.g)) { nrm[0] = -nrm[0]; nrm[2] = -nrm[2]; }
    const hl = Math.hypot(nrm[0], nrm[2]);
    if (hl < 0.95) continue;                                   // nur senkrechte Wände
    const nx = nrm[0] / hl, nz = nrm[2] / hl, rx = nz, rz = -nx;
    let u0 = Infinity, u1 = -Infinity, ia = 0, ib = 0;
    for (let i = 0; i < p.length; i += 3) {
      const u = p[i] * rx + p[i + 2] * rz;
      if (u < u0) { u0 = u; ia = i; }
      if (u > u1) { u1 = u; ib = i; }
    }
    const ax = p[ia], az = p[ia + 2], bx = p[ib], bz = p[ib + 2], cx = (ax + bx) / 2, cz = (az + bz) / 2;
    if (b.g.some(r => pointInPoly(cx + nx * 0.3, cz + nz * 0.3, r))) continue;   // Innenwand zwischen Gebäudeteilen
    let yl = -Infinity, yr = -Infinity;                       // Traufe = niedrigeres der beiden Wandenden (Giebelspitze zählt nicht)
    for (let i = 0; i < p.length; i += 3) {
      const u = p[i] * rx + p[i + 2] * rz;
      if (u - u0 < 0.2) yl = Math.max(yl, p[i + 1]);
      if (u1 - u < 0.2) yr = Math.max(yr, p[i + 1]);
    }
    walls.push({ nx, nz, rx, rz, u0, u1, off: cx * nx + cz * nz, ax, az, bx, bz, cx, cz, eave: Math.min(yl, yr), p });
  }
  let best = null, bestS = 0;
  const fd = opt.face && FACE_DIR[opt.face];
  for (const w of walls) {
    const L = w.u1 - w.u0;
    if (L < 2) continue;
    let s;
    if (fd) {
      const f = w.nx * fd[0] + w.nz * fd[1];
      if (f < 0.8) continue;
      s = L * f * f;
    } else {
      const q = nearestRoad(roads, w.cx, w.cz);
      if (!q || q.d < 0.01) continue;
      const f = ((q.x - w.cx) * w.nx + (q.z - w.cz) * w.nz) / q.d;
      if (f < 0.5) continue;
      s = L * f * f / (1 + q.d / 15);
    }
    if (opt.near) s /= 1 + (w.cx - opt.near[0]) ** 2 + (w.cz - opt.near[1]) ** 2;
    if (s > bestS) { bestS = s; best = w; }
  }
  if (!best) return null;
  // Anschließende Stücke derselben Front dazunehmen (auch mit kleinem Vor- oder Rücksprung bis jog) –
  // gemessen in der Basis der besten Wand: die eigenen Normalen weichen leicht ab, das verfälscht Abstände.
  const F = { nx: best.nx, nz: best.nz, rx: best.rx, rz: best.rz, u0: best.u0, u1: best.u1, off: best.off, eave: best.eave,
    parts: [{ u0: best.u0, u1: best.u1, off: best.off }] };
  for (let grown = true; grown;) {
    grown = false;
    for (const w of walls) {
      if (w.nx * F.nx + w.nz * F.nz < 0.985) continue;
      const off = w.cx * F.nx + w.cz * F.nz;
      if (Math.abs(off - best.off) > jog) continue;
      const ua = w.ax * F.rx + w.az * F.rz, ub = w.bx * F.rx + w.bz * F.rz;
      const wu0 = Math.min(ua, ub), wu1 = Math.max(ua, ub);
      if (wu1 < F.u0 - gap || wu0 > F.u1 + gap || (wu0 >= F.u0 - 0.01 && wu1 <= F.u1 + 0.01)) continue;
      F.u0 = Math.min(F.u0, wu0); F.u1 = Math.max(F.u1, wu1);
      F.off = Math.max(F.off, off); F.eave = Math.min(F.eave, w.eave);
      F.parts.push({ u0: wu0, u1: wu1, off });
      grown = true;
    }
  }
  F.parts.sort((a, b) => a.u0 - b.u0);
  for (let i = 0; i + 1 < F.parts.length; i++) F.parts[i].u1 = Math.max(F.parts[i].u1, F.parts[i + 1].u0);   // kleine Lücken schließen
  // Alle Wandflächen dieser Ebene samt Giebeldreiecken als Umrisse [u, y, …] – für Fronten über die ganze Wand (full)
  F.polys = [];
  for (const w of walls) {
    if (w.nx * F.nx + w.nz * F.nz < 0.985 || Math.abs(w.cx * F.nx + w.cz * F.nz - best.off) > jog) continue;
    const ua = w.ax * F.rx + w.az * F.rz, ub = w.bx * F.rx + w.bz * F.rz;
    if (Math.max(ua, ub) < F.u0 - 0.05 || Math.min(ua, ub) > F.u1 + 0.05) continue;
    const q = [];
    for (let i = 0; i < w.p.length; i += 3) q.push(w.p[i] * F.rx + w.p[i + 2] * F.rz, w.p[i + 1]);
    F.polys.push(q);
  }
  return F;
}

/** Teil eines 2D-Umrisses [u, y, …] oberhalb von ymin (Sutherland-Hodgman an einer waagerechten Kante). */
function clipBelow(q, ymin) {
  const out = [], n = q.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = q[2 * i], ay = q[2 * i + 1], bx = q[2 * j], by = q[2 * j + 1];
    if (ay >= ymin) out.push(ax, ay);
    if ((ay >= ymin) !== (by >= ymin)) out.push(ax + (bx - ax) * (ymin - ay) / (by - ay), ymin);
  }
  return out;
}

/** Straßenniveau vor einer Front: Gelände 0,8 m vor der Wand an 9 Stellen. base = 35-%-Wert, bottom = tiefste Stelle. */
function streetLevel(F, H, y0) {
  const hs = [], a = F.u0 + 0.4, b = Math.max(a, F.u1 - 0.4), d = F.off + 0.8;
  for (let i = 0; i < 9; i++) { const u = a + (b - a) * i / 8; hs.push(H(F.rx * u + F.nx * d, F.rz * u + F.nz * d)); }
  hs.sort((p, q) => p - q);
  const base = Math.max(y0, hs[3]);
  return { base, bottom: Math.min(base, Math.max(y0, hs[0] - 0.25)) };
}

/**
 * Foto-Mesh laden (assets/nrw/<ort>/mesh/, gebaut mit tools/nrw_mesh_fetch.py): je Kachel Uint16-Ecken (x y z u v,
 * auf lo + ext quantisiert, Dreiecksliste) und ein JPG. Unbeleuchtet wie ein Foto. null, wenn nicht vorhanden.
 */
async function loadPhotoMesh(dir) {
  let info;
  try { info = await fetch(dir + 'mesh.json').then(r => (r.ok ? r.json() : null)); } catch { info = null; }
  if (!info) return null;
  const loader = new THREE.TextureLoader();
  const group = new THREE.Group(); group.name = 'photoMesh';
  await Promise.all(info.tiles.map(async (t) => {
    const [buf, tex] = await Promise.all([
      fetch(dir + t.file + '.bin').then(r => r.arrayBuffer()),
      loader.loadAsync(dir + t.file + '.jpg'),
    ]);
    const q = new Uint16Array(buf), n = t.count, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) pos[i * 3 + k] = t.lo[k] + q[i * 5 + k] / 65535 * t.ext[k];
      uv[i * 2] = q[i * 5 + 3] / 65535; uv[i * 2 + 1] = q[i * 5 + 4] / 65535;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.flipY = false;
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    m.userData.dispose = () => { g.dispose(); tex.dispose(); m.material.dispose(); };
    group.add(m);
  }));
  return { group, half: [480, 290] };
}

/** Alle Ladenfronten (Much) als ein Mesh, Bilder in einem Atlas → ein Draw-Call. Atlas und Material bleiben im Cache. */
function shopFrontMesh(D, fronts) {
  const list = fronts.filter(f => f.top >= 2.6 && f.width >= 2);
  if (!list.length) return null;
  // Wandumriss je Front in Bildkoordinaten (x ab linkem Rand, h über Straßenniveau) – fürs Zeichnen des Giebels
  for (const f of list) f.outline = f.full ? f.front.polys.map(q => q.map((v, i) => (i % 2 ? v - f.base : v - f.front.u0))) : null;
  const key = list.map(f => `${f.shop.name}:${f.width.toFixed(2)}:${f.top.toFixed(2)}:${f.plinth.toFixed(2)}${f.full ? ':G' + f.eave.toFixed(2) : ''}${f.photo ? ':P' + f.photo : ''}`).join('|');
  if (D.shopAtlas?.key !== key) {
    D.shopAtlas?.tex.dispose();
    const { canvas, rects } = drawShopAtlas(list);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    D.shopAtlas = { key, tex, rects };
    D.mat.shopFront ||= new THREE.MeshLambertMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    D.mat.shopFront.map = tex; D.mat.shopFront.needsUpdate = true;
  }
  const { rects } = D.shopAtlas;
  const pos = [], nor = [], uv = [], idx = [];
  const quad = (P4, n, T4) => {                      // drei oder vier Ecken der Reihe nach; Wicklung passend zur Normale
    const [a, b, c] = P4;
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2], e2x = c[0] - b[0], e2y = c[1] - b[1], e2z = c[2] - b[2];
    const front = (e1y * e2z - e1z * e2y) * n[0] + (e1z * e2x - e1x * e2z) * n[1] + (e1x * e2y - e1y * e2x) * n[2] >= 0;
    const k = pos.length / 3;
    for (let j = 0; j < P4.length; j++) { pos.push(...P4[j]); nor.push(...n); uv.push(...T4[j]); }
    if (P4.length === 3) idx.push(...(front ? [k, k + 1, k + 2] : [k, k + 2, k + 1]));
    else idx.push(...(front ? [k, k + 1, k + 2, k, k + 2, k + 3] : [k, k + 2, k + 1, k, k + 3, k + 2]));
  };
  list.forEach((f, i) => {
    const F = f.front, R = rects[i], y0 = f.base - f.plinth, y1 = f.base + f.top;
    const at = (u, o, y) => [F.rx * u + F.nx * o, y, F.rz * u + F.nz * o];
    const e = F.off + 0.04;                          // eine Ebene vor dem vordersten Wandstück
    if (f.full) {                                    // ganze Wand: die Wandflächen selbst (auch Giebel) mit dem Bild belegen
      const tu = (u) => R.u0 + Math.min(1, Math.max(0, (u - F.u0) / (F.u1 - F.u0))) * (R.u1 - R.u0);
      const tv = (y) => R.vBot + Math.min(1, Math.max(0, (y - y0) / (y1 - y0))) * (R.vTop - R.vBot);
      for (const q of F.polys) {
        const c = clipBelow(q, y0), pts = [];
        for (let j = 0; j < c.length; j += 2) {
          const last = pts[pts.length - 1];
          if (!last || Math.abs(last.x - c[j]) > 1e-3 || Math.abs(last.y - c[j + 1]) > 1e-3) pts.push(new THREE.Vector2(c[j], c[j + 1]));
        }
        if (pts.length < 3) continue;
        for (const t of THREE.ShapeUtils.triangulateShape(pts, [])) {
          const v = t.map(k => pts[k]);
          quad(v.map(p => at(p.x, e, p.y)), [F.nx, 0, F.nz], v.map(p => [tu(p.x), tv(p.y)]));
        }
      }
      return;
    }
    quad([at(F.u0, e, y0), at(F.u1, e, y0), at(F.u1, e, y1), at(F.u0, e, y1)], [F.nx, 0, F.nz],
      [[R.u0, R.vBot], [R.u1, R.vBot], [R.u1, R.vTop], [R.u0, R.vTop]]);
    // Steht die Front vor einem zurückgesetzten Endstück, schließt ein Seitenteil die Lücke (Randfarbe des Bildes)
    const ends = [[F.u0, F.parts[0].off, -1, R.u0 + 0.0002], [F.u1, F.parts[F.parts.length - 1].off, 1, R.u1 - 0.0002]];
    for (const [u, back, s, tu] of ends) {
      if (e - back < 0.08) continue;
      quad([at(u, back, y0), at(u, e, y0), at(u, e, y1), at(u, back, y1)], [s * F.rx, 0, s * F.rz],
        [[tu, R.vBot], [tu, R.vBot], [tu, R.vTop], [tu, R.vTop]]);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, D.mat.shopFront);
  m.name = 'shopFronts';
  m.receiveShadow = true;
  m.userData.shops = list.map(f => ({ name: f.shop.name, width: +f.width.toFixed(2), top: +f.top.toFixed(2), plinth: +f.plinth.toFixed(2),
    base: +f.base.toFixed(2), eave: +f.eave.toFixed(2), full: f.full, photo: f.photo,
    outline: f.outline && f.outline.map(q => q.map(v => +v.toFixed(2))), center: [+(f.front.rx * (f.front.u0 + f.front.u1) / 2 + f.front.nx * f.front.off).toFixed(1),
      +(f.front.rz * (f.front.u0 + f.front.u1) / 2 + f.front.nz * f.front.off).toFixed(1)], normal: [+f.front.nx.toFixed(2), +f.front.nz.toFixed(2)] }));
  m.userData.skipped = fronts.filter(f => !list.includes(f)).map(f => `${f.shop.name} (Höhe ${f.top.toFixed(2)} m)`);
  return m;
}

/** Gelände-Ring außen (grobes Raster) mit Loch für die fein gekachelte Mitte. */
function terrainMesh(H, ext, step, hole, dh, mat, yOff) {
  const cnt = Math.round(2 * ext / step) + 1;
  const pos = new Float32Array(cnt * cnt * 3), uv = new Float32Array(cnt * cnt * 2);
  for (let j = 0; j < cnt; j++) for (let i = 0; i < cnt; i++) {
    const x = -ext + i * step, z = -ext + j * step, k = j * cnt + i;
    pos[k * 3] = x; pos[k * 3 + 1] = H(x, z) + yOff; pos[k * 3 + 2] = z;
    uv[k * 2] = (x + dh) / (2 * dh); uv[k * 2 + 1] = 1 - (z + dh) / (2 * dh);
  }
  const idx = [];
  for (let j = 0; j < cnt - 1; j++) for (let i = 0; i < cnt - 1; i++) {
    const x0 = -ext + i * step, z0 = -ext + j * step;
    if (hole && x0 >= -hole && x0 + step <= hole && z0 >= -hole && z0 + step <= hole) continue;
    const a = j * cnt + i, b = a + 1, c = a + cnt, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals(); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

/** Index einer Geländekachel mit s×s Zellen + Schürze (für alle Kacheln derselben Stufe geteilt). */
function chunkIndex(s) {
  const cnt = s + 1, idx = [];
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    const a = j * cnt + i, b = a + 1, c = a + cnt, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const ring = [];                  // Rand umlaufend: unten (+x), rechts (+z), oben (−x), links (−z)
  for (let i = 0; i < s; i++) ring.push(i);
  for (let j = 0; j < s; j++) ring.push(j * cnt + s);
  for (let i = s; i > 0; i--) ring.push(s * cnt + i);
  for (let j = s; j > 0; j--) ring.push(j * cnt);
  const base = cnt * cnt, nb = ring.length;
  for (let k = 0; k < nb; k++) {    // Schürzen-Vierecke zeigen nach außen
    const k2 = (k + 1) % nb;
    idx.push(ring[k], ring[k2], base + k, ring[k2], base + k2, base + k);
  }
  const n = base + nb;
  return new THREE.BufferAttribute(n > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1);
}

/**
 * @returns {Promise<null | {spawn, isFree, terrainAt, tick}>}  null = Daten fehlen → Aufrufer baut flach weiter
 */
export async function buildNrwLevel(ctx, loc, osm, U) {
  const { mapGroup, obstacles, worldColliders, ground, ARENA, isActive = () => true, setTerrain, setTick } = ctx;
  let D;
  try { D = await loadData(loc.nrw); }
  catch (err) { console.warn('NRW-Daten nicht ladbar – flache OSM-Kulisse wird gebaut:', err); return null; }
  if (D.meta.name === 'much') await loadShopPhotos();     // eigene Fassadenfotos (fehlende → gezeichnete Front)
  if (!isActive()) return null;

  const M = U.getMats(), G = U.shared();
  const bx = ctx.bounds?.x ?? ARENA, bz = ctx.bounds?.z ?? ARENA;   // Spielfläche: Halbkanten Ost-West / Nord-Süd (m)
  const bound = Math.max(bx, bz);
  const { meta, q } = D;
  const T = meta.terrain, n = T.n, half = T.half, hmin = T.hmin, sc = T.scale;
  const H = (x, z) => {
    let gx = x + half, gz = z + half;
    gx = gx < 0 ? 0 : gx > n - 1.001 ? n - 1.001 : gx;
    gz = gz < 0 ? 0 : gz > n - 1.001 ? n - 1.001 : gz;
    const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz, i = iz * n + ix;
    return hmin + sc * ((q[i] * (1 - fx) + q[i + 1] * fx) * (1 - fz) + (q[i + n] * (1 - fx) + q[i + n + 1] * fx) * fz);
  };
  U.showOsmCredit(`Gelände, Gebäude, Luftbild: Geobasis NRW (dl-de/zero-2-0) · Wege © OpenStreetMap-Mitwirkende (ODbL) · ${loc.label}`);
  const nearDH = meta.dop.near.half, farDH = meta.dop.far.half;
  const disposables = [];            // Geometrien, die nicht direkt an einem Mesh in mapGroup hängen

  // ---------- Gelände: fein gekachelte Mitte (deckt die Spielfläche) + grober Außenring ----------
  ground.visible = false;
  const gi = worldColliders.indexOf(ground); if (gi >= 0) worldColliders.splice(gi, 1);
  const FINE = Math.min(Math.floor((half - 8) / CHUNK) * CHUNK,
    Math.max(Math.ceil((bound + 6) / CHUNK) * CHUNK, Math.floor(nearDH / CHUNK) * CHUNK));
  const NF = 2 * FINE + 1;
  const nrmF = new Float32Array(NF * NF * 3);        // Normalen fürs ganze feine Raster (alle Stufen nutzen dieselben → kein Licht-Springen)
  for (let j = 0; j < NF; j++) for (let i = 0; i < NF; i++) {
    const x = i - FINE, z = j - FINE, k = (j * NF + i) * 3;
    const hx = H(x - 1, z) - H(x + 1, z), hz = H(x, z - 1) - H(x, z + 1), l = Math.hypot(hx, 2, hz);
    nrmF[k] = hx / l; nrmF[k + 1] = 2 / l; nrmF[k + 2] = hz / l;
  }
  const TILE = FINE / Math.max(2, Math.round(FINE / 120));     // ~110–130 m, Kachelgrenzen fallen auf den Rand des scharfen Luftbilds
  const lodIndex = LOD_STEP.map(st => chunkIndex(CHUNK / st));
  const chunks = [];
  for (let z0 = -FINE; z0 < FINE; z0 += CHUNK) for (let x0 = -FINE; x0 < FINE; x0 += CHUNK) {
    const inNear = Math.max(Math.abs(x0), Math.abs(z0), Math.abs(x0 + CHUNK), Math.abs(z0 + CHUNK)) <= nearDH;
    const dh = inNear ? nearDH : farDH;
    const geos = LOD_STEP.map((st, li) => {
      const s = CHUNK / st, cnt = s + 1, nv = cnt * cnt + 4 * s;
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
      const put = (k, x, z, yOff) => {
        pos[k * 3] = x; pos[k * 3 + 1] = H(x, z) + yOff; pos[k * 3 + 2] = z;
        const f = ((z + FINE) * NF + (x + FINE)) * 3;
        nor[k * 3] = nrmF[f]; nor[k * 3 + 1] = nrmF[f + 1]; nor[k * 3 + 2] = nrmF[f + 2];
        uv[k * 2] = (x + dh) / (2 * dh); uv[k * 2 + 1] = 1 - (z + dh) / (2 * dh);
      };
      for (let j = 0; j < cnt; j++) for (let i = 0; i < cnt; i++) put(j * cnt + i, x0 + i * st, z0 + j * st, 0);
      let k = cnt * cnt;                // Schürze: Randpunkte in derselben Reihenfolge wie chunkIndex, abgesenkt
      for (let i = 0; i < s; i++) put(k++, x0 + i * st, z0, -SKIRT);
      for (let j = 0; j < s; j++) put(k++, x0 + CHUNK, z0 + j * st, -SKIRT);
      for (let i = s; i > 0; i--) put(k++, x0 + i * st, z0 + CHUNK, -SKIRT);
      for (let j = s; j > 0; j--) put(k++, x0, z0 + j * st, -SKIRT);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(lodIndex[li]);
      g.computeBoundingSphere();
      return g;
    });
    const m = new THREE.Mesh(geos[3], inNear ? D.mat.groundNear : D.mat.groundFar);
    m.receiveShadow = true;
    m.userData.dispose = () => geos.forEach(g => g.dispose());
    m.userData.lodGeos = geos;                       // alle Detailstufen beim Laden vorab hochladen (main.js)
    mapGroup.add(m);
    chunks.push({ m, geos, cx: x0 + CHUNK / 2, cz: z0 + CHUNK / 2, lod: 3 });
  }
  mapGroup.add(terrainMesh(H, half, 8, FINE, farDH, D.mat.groundOuter, -0.15));
  {   // Boden hinter dem Geländeraster (im Nebel)
    const size = 2400, g = new THREE.PlaneGeometry(size, size);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size / 8, uv.getY(i) * size / 8);
    M.farGround.color.set('#b9bfa8');
    const far = new THREE.Mesh(g, M.farGround);
    far.rotation.x = -Math.PI / 2; far.position.y = hmin - 1.5;
    mapGroup.add(far);
  }
  // Schuss-Treffer auf dem Gelände: Strahl gegen das Höhenraster abtasten (statt Hunderttausender Dreiecke)
  const terrainHit = new THREE.Object3D();
  terrainHit.name = 'terrain';
  terrainHit.raycast = function (raycaster, intersects) {
    const o = raycaster.ray.origin, d = raycaster.ray.direction;
    if (o.y < H(o.x, o.z)) return;
    const far = Math.min(raycaster.far, 450);
    for (let t = 0.5; t <= far; t += 0.5) {
      const x = o.x + d.x * t, z = o.z + d.z * t;
      if (o.y + d.y * t < H(x, z)) {
        let a = t - 0.5, b = t;
        for (let k = 0; k < 10; k++) { const m = (a + b) / 2; if (o.y + d.y * m < H(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
        const tt = (a + b) / 2;
        if (tt >= raycaster.near) intersects.push({ distance: tt, point: new THREE.Vector3(o.x + d.x * tt, o.y + d.y * tt, o.z + d.z * tt), object: this });
        return;
      }
    }
  };
  worldColliders.push(terrainHit);

  // ---------- Kacheln für Häuser und Bäume ----------
  const tiles = new Map();
  const tileAt = (x, z) => {
    const ix = Math.floor(x / TILE), iz = Math.floor(z / TILE), key = ix + '_' + iz;
    let t = tiles.get(key);
    if (!t) {
      const cx = (ix + 0.5) * TILE, cz = (iz + 0.5) * TILE, hs = TILE / 2;
      const near = Math.max(Math.abs(cx), Math.abs(cz)) + hs <= nearDH;     // ganz im scharfen Luftbild?
      t = { cx, cz, hs, near, dh: near ? nearDH : farDH, buf: new TBuf(true), leafy: [], conif: [], trees: null };
      tiles.set(key, t);
    }
    return t;
  };

  // ---------- Gebäude (LoD2) ----------
  // Kirchenschiff und Bank: eigene Ebenen aus src/much-landmarks.js (die Kirchen-Ebene gilt für alle NRW-Orte)
  D.mat.wallArray ||= wallArrayTexture({ ...M.T, ...muchWallTextures() });
  D.mat.bNear ||= buildingMaterial(D.mat.wallArray, D.tex.near);
  D.mat.bFar ||= buildingMaterial(D.mat.wallArray, D.tex.far);
  const buildingRings = [];
  const tallBuildings = [];
  // Läden in Much (src/much-shops.js): echter Haustyp + gezeichnete Ladenfront zur Straße
  const shopOf = (b) => (meta.name === 'much' ? (MUCH_SHOPS[b.addr] || MUCH_SHOPS['id:' + b.id] || null) : null);
  const mainRoads = osm.roadLines.filter(l => l.main);
  const shopRoads = mainRoads.length ? mainRoads : osm.roadLines;
  const roadsNamed = (street) => { const r = osm.roadLines.filter(l => l.name === street); return r.length ? r : shopRoads; };
  const shopFronts = [];
  let count = 0;
  const within = (b, dx, dz = dx) => b.maxX > -dx && b.minX < dx && b.maxZ > -dz && b.minZ < dz;
  for (const b of D.buildings) {
    let bb = null;
    for (const g of b.g) {
      const r = U.bounds(g);
      bb = bb ? { minX: Math.min(bb.minX, r.minX), maxX: Math.max(bb.maxX, r.maxX), minZ: Math.min(bb.minZ, r.minZ), maxZ: Math.max(bb.maxZ, r.maxZ) } : r;
    }
    if (!bb) continue;
    const t = tileAt((bb.minX + bb.maxX) / 2, (bb.minZ + bb.maxZ) / 2);
    const rng = U.mulberry32(seedOf(b.id || ''));
    const shop = shopOf(b);
    let floorY = b.y0;                       // Geschossraster ab hier; bei Läden ab dem Straßenniveau vor der Front
    if (shop) {
      const roads = roadsNamed(shop.street || b.street || 'Hauptstraße');   // Front zeigt zur eigenen Straße, nicht zur nächstbesten
      // Hauptfront plus weitere Fronten desselben Hauses (shop.more, z. B. die Straßenseite eines Eckladens)
      [shop, ...(shop.more || [])].forEach((spec, k) => {
        const name = spec.name || shop.name;
        const F = roads.length ? streetFront(b, roads, spec) : null;
        if (!F) { console.warn('Ladenfront nicht gefunden:', name); return; }
        const lv = streetLevel(F, H, b.y0);
        if (k === 0) floorY = lv.base;
        // full: Bild über die ganze Wand bis in den Giebel (Höhe = höchster Punkt der Wand), sonst nur Erdgeschoss.
        // Ein eigenes Foto der Wand (photo) bedeckt immer die ganze Wand.
        const photo = shopPhotoOf(spec), full = !!spec.full || !!photo;
        if (!photo && !spec.draw) return;                  // Wohnhaus nur mit Foto: ohne Foto keine Front
        let top = Math.min(SHOP_TOP, F.eave - 0.05 - lv.base + (spec.above || 0));   // above: Schild ragt über die Traufe
        if (full) for (const q of F.polys) for (let j = 1; j < q.length; j += 2) top = Math.max(top, q[j] - lv.base);
        shopFronts.push({ shop: { name, draw: spec.draw, tint: spec.tint || shop.tint }, photo, front: F, base: lv.base,
          plinth: lv.base - lv.bottom, width: F.u1 - F.u0, top, full, eave: F.eave - lv.base });
      });
    }
    const style = shop ? shop.wall : styleFor(b, rng);
    const isSpecial = style.startsWith('shop') || style === 'church' || style.endsWith('_shop');
    const tint = new THREE.Color(
      shop ? (shop.tint || '#ffffff')
      : isSpecial ? '#ffffff'
      : style === 'slate' ? U.pick(rng, ['#ffffff', '#eef0f4', '#e4e8ee'])
      : style === 'fachwerk' ? U.pick(rng, ['#ffffff', '#fbf6ec'])
      : U.pick(rng, U.PLASTER)
    );
    const layer = Math.max(0, WALL_LAYERS.indexOf(style));
    const hull = [];
    for (const p of b.w) addWall(t.buf, hull, p, floorY, tint, layer, !facesOut(p, b.g));
    for (const p of b.r) addRoof(t.buf, hull, p, t.dh);
    if (hull.length) {   // unsichtbare Trefferhülle je Gebäude: Schüsse prüfen nur Häuser in Strahlnähe
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(hull, 3));
      g.computeBoundingSphere();
      const hm = new THREE.Mesh(g, D.mat.hull);
      hm.name = 'building';
      hm.userData = { id: b.id, addr: b.addr, street: b.street, nr: b.nr };
      worldColliders.push(hm); disposables.push(g);
    }
    for (const g of b.g) {
      const ring = U.signedArea(g) > 0 ? U.reverseRing(g) : g.slice();
      const gb = U.bounds(ring);
      buildingRings.push({ ring, b: gb });
      if (within(gb, bx + 2, bz + 2)) obstacles.push({ ...gb, minY: b.y0 - 2, maxY: b.y1, top: b.y1 - b.y0, poly: ring });
    }
    const h = b.y1 - b.y0;
    if (within(bb, bx - 6, bz - 6) && h > 9) tallBuildings.push({ h, c: [(bb.minX + bb.maxX) / 2, (bb.minZ + bb.maxZ) / 2] });
    count++;
  }

  // ---------- Hilfstests ----------
  const insideBuilding = (x, z, pad) => {
    for (const r of buildingRings) {
      const b = r.b;
      if (x < b.minX - pad || x > b.maxX + pad || z < b.minZ - pad || z > b.maxZ + pad) continue;
      if (pointInPoly(x, z, r.ring)) return true;
      if (pad > 0 && closestOnPoly(x, z, r.ring, _cp).d2 < pad * pad) return true;
    }
    return false;
  };

  // ---------- Bäume (echte Standorte, Kronenfarbe aus dem Luftbild), je Kachel zu einem Mesh gebacken ----------
  D.geo ||= {
    leafHi: indexedSphere(new THREE.IcosahedronGeometry(1, 1)),    // nahe Kronen: 80 Dreiecke
    leafLo: indexedSphere(new THREE.IcosahedronGeometry(1, 0)),    // ferne Kronen: 20 Dreiecke, weich schattiert
    cone: new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0),
    trunk: new THREE.CylinderGeometry(0.14, 0.22, 1, 5, 1, true).translate(0, 0.5, 0),
    trunkHit: new THREE.CylinderGeometry(0.2, 0.25, 1, 5).translate(0, 0.5, 0),
  };
  const trees = (meta.trees || []).filter(t => !insideBuilding(t[0], t[1], 0.3));
  for (const t of trees) { const tl = tileAt(t[0], t[1]); (t[3] < 0.24 * t[2] ? tl.conif : tl.leafy).push(t); }
  {
    const qt = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 }, trunkCol = new THREE.Color('#5a4330');
    // Kronenfarbe aus dem Luftbild, auf plausible Laubtöne begrenzt (Blutbuchen dürfen rot bleiben)
    const tint = (x, z) => {
      const inNear = Math.abs(x) < nearDH && Math.abs(z) < nearDH, dh = inNear ? nearDH : farDH;
      (inNear ? D.sample.near : D.sample.far)((x + dh) / (2 * dh), (z + dh) / (2 * dh), col);
      col.getHSL(hsl, THREE.SRGBColorSpace);
      const reddish = (hsl.h > 0.85 || hsl.h < 0.04) && hsl.s > 0.18;
      const h = reddish ? hsl.h : (hsl.h > 0.13 && hsl.h < 0.45 ? hsl.h : 0.26);
      return col.setHSL(h, THREE.MathUtils.clamp(hsl.s * 1.25, reddish ? 0.25 : 0.32, 0.62),
        THREE.MathUtils.clamp(hsl.l, 0.2, 0.34), THREE.SRGBColorSpace);
    };
    const rr = U.mulberry32(77);
    for (const tl of tiles.values()) {
      if (!tl.leafy.length && !tl.conif.length) continue;
      const hi = [], lo = [], trunks = [];
      for (const t of tl.leafy) {
        const [x, z, h, r] = t, ry = Math.max(0.8, Math.min(r * 0.9, (h - 2.6) / 2));   // Krone erst ab ~2,6 m
        qt.setFromAxisAngle(up, rr() * Math.PI);
        const m4 = new THREE.Matrix4().compose(v.set(x, H(x, z) + h - ry, z), qt, s.set(r, ry, r));
        const c = tint(x, z).clone();
        hi.push({ geo: D.geo.leafHi, m4, col: c }); lo.push({ geo: D.geo.leafLo, m4, col: c });
      }
      for (const t of tl.conif) {
        const [x, z, h, r] = t;
        const part = { geo: D.geo.cone, m4: new THREE.Matrix4().compose(v.set(x, H(x, z) + h * 0.22, z), qt.identity(), s.set(r * 1.15, h * 0.8, r * 1.15)), col: tint(x, z).clone() };
        hi.push(part); lo.push(part);
      }
      for (const t of tl.leafy.concat(tl.conif)) {   // Stämme nur in der nahen Stufe
        const [x, z, h, r] = t, th = Math.max(2.8, h * 0.45), rad = 0.7 + r * 0.12;
        const m4 = new THREE.Matrix4().compose(v.set(x, H(x, z) - 0.2, z), qt.identity(), s.set(rad, th, rad));
        hi.push({ geo: D.geo.trunk, m4, col: trunkCol }); trunks.push(m4);
      }
      const gHi = bakeParts(hi), gLo = bakeParts(lo);
      const mesh = new THREE.Mesh(gLo, D.mat.trees);
      mesh.castShadow = true;
      mesh.userData.dispose = () => { gHi.dispose(); gLo.dispose(); };
      mesh.userData.lodGeos = [gLo, gHi];
      mapGroup.add(mesh);
      tl.trees = { mesh, hi: gHi, lo: gLo };
      // Stämme auf der Spielfläche fangen Kugeln: unsichtbare Hüllen (werden nie gezeichnet)
      if (Math.abs(tl.cx) - tl.hs < bx + 8 && Math.abs(tl.cz) - tl.hs < bz + 8) {
        const im = new THREE.InstancedMesh(D.geo.trunkHit, D.mat.hull, trunks.length);
        trunks.forEach((m4, i) => im.setMatrixAt(i, m4));
        im.computeBoundingSphere(); im.name = 'trunks';
        worldColliders.push(im);
      }
    }
    for (const t of trees) {
      const [x, z, h] = t;
      if (Math.abs(x) > bx + 1 || Math.abs(z) > bz + 1) continue;
      const gy = H(x, z), r = 0.35;
      obstacles.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, minY: gy - 1, maxY: gy + h, top: Math.max(3, h * 0.4) });
    }
  }

  // ---------- Kachel-Meshes der Häuser (Wände + Dächer in einem) ----------
  for (const tl of tiles.values()) {
    const m = tl.buf.mesh(tl.near ? D.mat.bNear : D.mat.bFar);
    if (m) mapGroup.add(m);
    tl.buf = null;                                    // Rohdaten freigeben
  }
  // ---------- Ladenfronten (Much): ein zusätzlicher Draw-Call ----------
  const shopMesh = shopFrontMesh(D, shopFronts);
  if (shopMesh) mapGroup.add(shopMesh);
  // ---------- Wahrzeichen in Much (Kirchturm, Kugelbrunnen): ein Draw-Call ----------
  let landmarks = null;
  if (meta.name === 'much') {
    landmarks = buildMuchLandmarks(H, D.mat.hull);
    mapGroup.add(landmarks.mesh);
    worldColliders.push(landmarks.hull); disposables.push(landmarks.hull.geometry);
    for (const o of landmarks.obstacles) {
      const ring = U.signedArea(o.poly) > 0 ? U.reverseRing(o.poly) : o.poly;
      obstacles.push({ ...o, poly: ring });
    }
    tallBuildings.push(landmarks.tall);
  }

  // ---------- Foto-Mesh von Geobasis NRW (tools/nrw_mesh_fetch.py), Probe: localStorage rod.mesh = '1' ----------
  // Ersetzt nur das Bild – Gelände-Höhen, Häuser-Kollision und Treffer bleiben die bisherigen Daten.
  if (localStorage.getItem('rod.mesh') === '1') {
    const pm = await loadPhotoMesh(loc.nrw + 'mesh/');
    if (!isActive()) return null;
    if (pm) {
      mapGroup.add(pm.group);
      const [ex, ez] = pm.half;
      for (const c of chunks) {                     // Geländekacheln ganz im Mesh ausblenden, Randkacheln absenken
        const inside = Math.abs(c.cx) + CHUNK / 2 < ex && Math.abs(c.cz) + CHUNK / 2 < ez;
        if (inside) c.m.visible = false; else c.m.position.y = -0.5;
      }
      for (const o of mapGroup.children) {           // gebaute Häuser, Bäume und Ladenfronten zeigt jetzt das Foto
        if (o.isMesh && (o.material === D.mat.bNear || o.material === D.mat.bFar || o.material === D.mat.trees || o === shopMesh || o === landmarks?.mesh)) o.visible = false;
      }
    }
  }

  // ---------- Bauzaun als Spielgrenze (folgt dem Gelände) ----------
  {
    const posts = [];
    for (const [ax, az, horiz] of [[0, -bz, true], [0, bz, true], [-bx, 0, false], [bx, 0, false]]) {
      const hl = horiz ? bx : bz;                    // halbe Länge dieser Zaunseite
      for (let s = -hl + 1.75; s < hl; s += 3.5) {
        const x = horiz ? s : ax, z = horiz ? az : s;
        if (insideBuilding(x, z, 0.3)) continue;
        posts.push({ x, z, rot: horiz ? 0 : Math.PI / 2 });
      }
    }
    const panels = new THREE.InstancedMesh(G.panel, M.fence, posts.length);
    const feet = new THREE.InstancedMesh(G.foot, M.fenceFoot, posts.length * 2);
    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    posts.forEach((p, i) => {
      qt.setFromAxisAngle(up, p.rot);
      const dx = Math.cos(p.rot) * 1.75, dz = -Math.sin(p.rot) * 1.75;
      const ya = H(p.x - dx, p.z - dz), yb = H(p.x + dx, p.z + dz);
      panels.setMatrixAt(i, m4.compose(v.set(p.x, Math.min(ya, yb) - 0.05, p.z), qt, one));
      feet.setMatrixAt(i * 2, m4.compose(v.set(p.x - dx, ya, p.z - dz), qt, one));
      feet.setMatrixAt(i * 2 + 1, m4.compose(v.set(p.x + dx, yb, p.z + dz), qt, one));
    });
    panels.castShadow = true; panels.computeBoundingSphere(); feet.computeBoundingSphere();
    mapGroup.add(panels, feet);
  }

  // ---------- Spawn: freie Stelle auf einer Straße nahe der Mitte ----------
  const blocked = (x, z, r) => {
    for (const o of obstacles) {
      if (x < o.minX - r || x > o.maxX + r || z < o.minZ - r || z > o.maxZ + r) continue;
      if (!o.poly || pointInPoly(x, z, o.poly) || closestOnPoly(x, z, o.poly, _cp).d2 < r * r) return true;
    }
    return insideBuilding(x, z, r);
  };
  let spawn = null, bestD = Infinity;
  const [shx, shz] = osm.spawnHint || [0, 0];         // gewünschter Startpunkt (z. B. Kirchplatz), sonst die Mitte
  // Mit spawnStreet nur auf Straßen dieses Namens suchen. Gibt es keine, dann wie bisher auf allen.
  const named = osm.spawnStreet ? osm.roadLines.filter((l) => l.name === osm.spawnStreet) : [];
  for (const l of (named.length ? named : osm.roadLines)) {
    const p = l.pts;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az, len = Math.hypot(dx, dz) || 1e-6;
      for (let s = 0; s <= len; s += 2) {
        const x = ax + dx * s / len, z = az + dz * s / len;
        if (Math.abs(x) > bx - 8 || Math.abs(z) > bz - 8) continue;
        const d = Math.hypot(x - shx, z - shz) + (l.main ? 0 : 6);
        if (d < bestD && !blocked(x, z, 1.3)) { bestD = d; spawn = { x, z }; }
      }
    }
  }
  if (!spawn) spawn = { x: 0, z: 0 };
  // Blick zum vorgegebenen Ziel (spawnLook), sonst zum höchsten Gebäude in der Nähe des Starts, sonst zur Mitte
  const nearTall = tallBuildings.filter(b => Math.hypot(b.c[0] - spawn.x, b.c[1] - spawn.z) < 160).sort((a, b) => b.h - a.h)[0];
  const look = osm.spawnLook || (nearTall ? nearTall.c : [0, 0]);
  const ldx = look[0] - spawn.x, ldz = look[1] - spawn.z;
  spawn.yaw = Math.hypot(ldx, ldz) > 1 ? Math.atan2(-ldx, -ldz) : Math.PI;

  // ---------- Detailstufen je Bild: Gelände-Raster, Baumkronen, Stämme ----------
  const tileList = [...tiles.values()];
  const edgeDist = (cx, cz, hs, px, pz) => Math.hypot(Math.max(0, Math.abs(cx - px) - hs), Math.max(0, Math.abs(cz - pz) - hs));
  const tick = (cam) => {
    const px = cam.position.x, pz = cam.position.z;
    for (const c of chunks) {
      const d = edgeDist(c.cx, c.cz, CHUNK / 2, px, pz);
      const lod = d < LOD_DIST[0] ? 0 : d < LOD_DIST[1] ? 1 : d < LOD_DIST[2] ? 2 : 3;
      if (lod !== c.lod) { c.lod = lod; c.m.geometry = c.geos[lod]; }
    }
    for (const tl of tileList) {
      if (!tl.trees) continue;
      const g = edgeDist(tl.cx, tl.cz, tl.hs, px, pz) < TREE_HI ? tl.trees.hi : tl.trees.lo;
      if (tl.trees.mesh.geometry !== g) tl.trees.mesh.geometry = g;
    }
  };
  tick({ position: new THREE.Vector3(spawn.x, 0, spawn.z) });
  {   // Aufräumen beim Kartenwechsel (Geometrien, die nicht direkt an einem mapGroup-Mesh hängen)
    const holder = new THREE.Object3D();
    holder.userData.dispose = () => disposables.forEach(g => g.dispose());
    mapGroup.add(holder);
  }

  if (setTerrain) setTerrain(H);
  if (setTick) setTick(tick);
  console.log(`🏔️ NRW-Kulisse "${loc.label}": ${count} LoD2-Gebäude, ${(meta.trees || []).length} Bäume, ${tiles.size} Kacheln, ` +
    `Gelände ±${half} m (fein ±${FINE} m), Spielfläche ${2 * bx} × ${2 * bz} m.`);
  return { spawn, isFree: (x, z, r = 1) => !blocked(x, z, r), terrainAt: H, tick,
    mapLayers: [{ image: D.tex.far.image, half: farDH }, { image: D.tex.near.image, half: nearDH }],   // Luftbild für die Karte (N)
    roads: osm.roadLines };
}
