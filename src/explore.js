// Erkundungsflug: Orte der Karte finden, ohne Gegner.
//
// Jeder Ort hat eine goldene Lichtsäule (alle zusammen ein InstancedMesh, ein Draw-Call). Wer nah genug und nicht zu
// hoch darüber fliegt, entdeckt ihn: Punkte, Banner, Ton, die Säule verschwindet. Oben in der Mitte zeigt ein Kompass
// zum nächsten offenen Ort, darunter stehen Funde, Punkte und Zeit. Sind alle Orte gefunden, gibt es einen Bonus
// (schneller = mehr) und der Flug endet. Im Team teilen sich alle die Funde (main.js meldet sie über net.js).
//
// Orte gibt es bisher nur für Much (Lage aus den amtlichen Gebäudedaten, Turm aus much-landmarks.js). Auf anderen
// Karten ist der Erkundungsflug ein freier Flug ohne Punkte.
import * as THREE from 'three';
import { MUCH_TOWER } from './much-landmarks.js?v=1';

const PTS = 100;                 // Punkte je Ort (Sonderorte haben eigene)
const MAX_ABOVE = 45;            // m: höchstens so hoch über dem Boden zählt ein Fund
const BONUS_ALL = 500;           // alle Orte gefunden …
const BONUS_TIME = 900;          // … plus (900 − Sekunden), wenn es schneller ging

const towerTip = () => {
  const c = MUCH_TOWER.corners, x = c.reduce((s, p) => s + p[0], 0) / c.length, z = c.reduce((s, p) => s + p[1], 0) / c.length;
  return { x, z, y: MUCH_TOWER.apex + 0.6 };
};

/** Orte je Karte: x/z in Spielkoordinaten, r = Fundradius (m). tip = Punkt in der Luft, peak = höchster Geländepunkt. */
const PLACES = {
  much: () => [
    { id: 'kirche', name: 'Kirche St. Martinus', x: 388.5, z: -18.3, r: 22 },
    { id: 'turm', name: 'Kirchturmspitze', ...towerTip(), r: 7, tip: true, pts: 250 },
    { id: 'brunnen', name: 'Kugelbrunnen', x: 383.5, z: -67, r: 10 },
    { id: 'vrbank', name: 'VR-Bank', x: 374.4, z: -86.4, r: 14 },
    { id: 'sparkasse', name: 'Kreissparkasse', x: 343.1, z: -70.6, r: 14 },
    { id: 'touri', name: 'Tourist-Info', x: 225.9, z: -60.3, r: 12 },
    { id: 'baecker', name: 'Café-Bäckerei Heimann', x: 233.8, z: -20.0, r: 10 },
    { id: 'hazal', name: 'Hazal Grill & Pizzeria', x: 210.1, z: -30.7, r: 12 },
    { id: 'haus44', name: 'Haus 44', x: 98.5, z: -28.8, r: 16 },
    { id: 'fahrschule', name: 'Fahrschule Neukirchen', x: 85.9, z: -58.9, r: 10 },
    { id: 'rathausgrill', name: 'Rathaus-Grill', x: 50.5, z: -33.8, r: 10 },
    { id: 'rathaus', name: 'Rathaus', x: 1.7, z: -103, r: 18 },
    { id: 'nak', name: 'Neuapostolische Kirche', x: -21.5, z: 121.9, r: 12 },
    { id: 'schule', name: 'Schule an der Schulstraße', x: 73.5, z: 149, r: 16 },
    { id: 'gipfel', name: 'Höchster Punkt', peak: true, r: 14, pts: 150 },
  ],
};

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function createExplore({ scene, groundAt, banner, chime }) {
  let places = [], active = false, t = 0, done = false, mesh = null, hud = null;
  const found = new Map();                       // id → Finder ('' = ich)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();

  // ---------- HUD (oben in der Mitte) ----------
  function makeHud() {
    const el = document.createElement('div');
    el.id = 'exploreHud';
    el.innerHTML = '<div class="ex-compass"><span class="ex-arrow">➤</span><span class="ex-target"></span></div><div class="ex-stats"></div>';
    document.getElementById('hud')?.appendChild(el) || document.body.appendChild(el);
    return { el, arrow: el.querySelector('.ex-arrow'), target: el.querySelector('.ex-target'), stats: el.querySelector('.ex-stats') };
  }

  // ---------- Lichtsäulen ----------
  function buildMarkers() {
    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); mesh = null; }
    if (!places.length) return;
    const geo = new THREE.CylinderGeometry(1, 1, 1, 14, 6, true).translate(0, 0.5, 0);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {                    // unten kräftig, nach oben ausblenden
      const a = 0.12 + Math.pow(1 - pos.getY(i), 1.4) * 0.6;
      col.set([1, 1, 1, a], i * 4);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    mesh = new THREE.InstancedMesh(geo, mat, places.length);
    mesh.name = 'exploreMarkers';
    mesh.frustumCulled = false;
    mesh.raycast = () => {};                                  // Schüsse und Kollision ignorieren die Säulen
    places.forEach((p, i) => mesh.setColorAt(i, new THREE.Color(p.tip ? '#4fd2ff' : '#ffb400')));
    scene.add(mesh);
    placeMarkers();
  }
  function placeMarkers() {
    if (!mesh) return;
    places.forEach((p, i) => {
      const hidden = found.has(p.id) || !active;
      const y0 = p.tip ? p.y + 1 : groundAt(p.x, p.z) - 1;
      const h = p.tip ? 26 : 90, r = p.tip ? 0.9 : Math.min(3.2, 1.2 + p.r * 0.08);
      v.set(p.x, y0, p.z); sc.set(hidden ? 1e-4 : r, hidden ? 1e-4 : h, hidden ? 1e-4 : r);
      mesh.setMatrixAt(i, m4.compose(v, q, sc));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Höchster Geländepunkt der Spielfläche (Raster 8 m, 20 m Abstand zum Rand). */
  function peakOf(bounds) {
    let best = { x: 0, z: 0, y: -Infinity };
    for (let x = -bounds.x + 20; x <= bounds.x - 20; x += 8) {
      for (let z = -bounds.z + 20; z <= bounds.z - 20; z += 8) {
        const y = groundAt(x, z);
        if (y > best.y) best = { x, z, y };
      }
    }
    return best;
  }

  const score = () => {
    let s = 0;
    for (const p of places) if (found.has(p.id)) s += p.pts || PTS;
    return s;
  };

  function finishBonus() {
    return BONUS_ALL + Math.max(0, Math.round(BONUS_TIME - t));
  }

  function discover(p, by) {
    if (found.has(p.id)) return false;
    found.set(p.id, by || '');
    placeMarkers();
    const pts = p.pts || PTS;
    banner?.(by ? `${by}: ${p.name.toUpperCase()} +${pts}` : `ENTDECKT: ${p.name.toUpperCase()} +${pts}`);
    chime?.();
    if (found.size === places.length && !done) {
      done = true;
      setTimeout(() => api.onComplete?.(), 1600);              // Banner erst lesen lassen
    }
    return true;
  }

  const api = {
    /** Wird bei einem eigenen Fund gerufen (Team: an den Server melden). */
    onFound: null,
    /** Alle Orte gefunden. */
    onComplete: null,

    get active() { return active; },
    get hasPlaces() { return places.length > 0; },
    get total() { return places.length; },
    get count() { return found.size; },
    get time() { return t; },
    get complete() { return done; },
    /** Punkte: Orte plus, wenn alle gefunden sind, der Abschlussbonus. */
    get score() { return score() + (done ? finishBonus() : 0); },

    /** Orte für eine Karte anlegen (nach dem Laden der Karte). bounds = Halbkanten der Spielfläche. */
    setup(mapId, bounds) {
      places = (PLACES[mapId] ? PLACES[mapId]() : []).map((p) => ({ ...p }));
      for (const p of places) if (p.peak) Object.assign(p, peakOf(bounds));
      hud ||= makeHud();
      buildMarkers();
    },
    start() {
      active = true; done = false; t = 0; found.clear();
      hud ||= makeHud();
      hud.el.style.display = 'flex';
      placeMarkers();
    },
    stop() {
      active = false;
      if (hud) hud.el.style.display = 'none';
      placeMarkers();
    },
    /** Noch nicht gefundene Orte (fürs Radar). */
    forEachOpen(fn) { if (active) for (const p of places) if (!found.has(p.id)) fn(p); },
    /** Fund eines Mitspielers (oder Echo des eigenen) übernehmen; by = Name des Finders. */
    markFound(id, by) {
      const p = places.find((x) => x.id === id);
      if (p && active) discover(p, by);
    },

    update(dt, pos, yaw) {
      if (!active) return;
      if (!done) t += dt;
      let near = null, nd = Infinity;
      const g = groundAt(pos.x, pos.z);
      for (const p of places) {
        if (found.has(p.id)) continue;
        const dx = p.x - pos.x, dz = p.z - pos.z, d = Math.hypot(dx, dz);
        const hit = p.tip ? Math.hypot(d, p.y - pos.y) <= p.r : d <= p.r && pos.y - g <= MAX_ABOVE;
        if (hit) { if (discover(p, '')) api.onFound?.(p); continue; }
        if (d < nd) { nd = d; near = p; }
      }
      // Kompass: Winkel zum Ziel relativ zur Blickrichtung (0 = geradeaus, positiv = rechts)
      if (near) {
        const ang = Math.atan2(near.x - pos.x, -(near.z - pos.z)) + yaw;
        hud.arrow.style.transform = `rotate(${(ang * 180 / Math.PI - 90).toFixed(1)}deg)`;
        hud.target.textContent = `${near.name} · ${nd < 1000 ? Math.round(nd) + ' m' : (nd / 1000).toFixed(1) + ' km'}`;
        hud.arrow.style.visibility = 'visible';
      } else {
        hud.arrow.style.visibility = 'hidden';
        hud.target.textContent = places.length ? 'Alle Orte entdeckt!' : 'Freier Flug – auf dieser Karte gibt es keine Orte';
      }
      hud.stats.textContent = places.length
        ? `📍 ${found.size}/${places.length} · ${api.score.toLocaleString('de-DE')} Punkte · ⏱ ${fmtTime(t)}`
        : `⏱ ${fmtTime(t)}`;
    },
  };
  return api;
}
