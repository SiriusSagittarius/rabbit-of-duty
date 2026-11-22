// Munitionskisten: tauchen im Einzelspieler in der Nähe des Spielers auf (Lichtsäule + gelber Punkt auf dem Radar)
// und füllen beim Drüberlaufen die Reserve aller Waffen auf. Höchstens zwei gleichzeitig; nach 75 s verschwinden sie.
// Einfaches Platzhalter-Modell aus Grundformen – ein eigenes Modell lässt sich später in makeCrate() einsetzen.
import * as THREE from 'three';

const LIFETIME = 75;                 // s
const MAX_CRATES = 2;
const PICK_R = 1.5;                  // m (waagrecht)
const FIRST_DELAY = 20;              // s nach Rundenstart
const NEXT_DELAY = [35, 50];         // s zwischen zwei Kisten

// Gemeinsame Geometrien und Materialien: eine Kiste = 4 Meshes, kein neuer Shader pro Kiste
const G = {
  body: new THREE.BoxGeometry(0.78, 0.42, 0.48),
  lid: new THREE.BoxGeometry(0.82, 0.08, 0.52),
  band: new THREE.BoxGeometry(0.8, 0.07, 0.5),
  beam: new THREE.CylinderGeometry(0.05, 0.22, 7, 10, 1, true),
};
const M = {
  body: new THREE.MeshStandardMaterial({ color: '#4d5a2c', roughness: 0.8, metalness: 0.1 }),
  lid: new THREE.MeshStandardMaterial({ color: '#3b4522', roughness: 0.75, metalness: 0.1 }),
  band: new THREE.MeshStandardMaterial({ color: '#e8b923', roughness: 0.5, emissive: '#e8b923', emissiveIntensity: 0.35 }),
  beam: new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.22, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
};

function makeCrate() {
  const g = new THREE.Group();
  g.name = 'ammoCrate';
  const box = new THREE.Group();
  const body = new THREE.Mesh(G.body, M.body); body.position.y = 0.21; body.castShadow = true;
  const lid = new THREE.Mesh(G.lid, M.lid); lid.position.y = 0.46; lid.castShadow = true;
  const band = new THREE.Mesh(G.band, M.band); band.position.y = 0.3;
  box.add(body, lid, band);
  const beam = new THREE.Mesh(G.beam, M.beam);       // Lichtsäule: auch hinter Häusern zu sehen
  beam.position.y = 3.5;
  beam.renderOrder = 2;
  g.add(box, beam);
  g.userData.box = box;
  return g;
}

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene
 * @param {(x:number,z:number)=>number} o.groundAt   Bodenhöhe
 * @param {(x:number,z:number,r:number)=>boolean} o.blocked   Stelle von Hindernissen belegt?
 * @param {()=>{x:number,z:number}} o.bounds         halbe Kantenlängen der Karte
 * @param {()=>boolean} o.small                      kleine Halle (kürzere Wege)?
 * @param {()=>void} o.onPickup
 */
export function createPickups({ scene, groundAt, blocked, bounds, small, onPickup }) {
  const crates = [];
  let timer = FIRST_DELAY;

  function remove(i) {
    scene.remove(crates[i].g);
    crates.splice(i, 1);
  }

  function spawnNear(px, pz, py) {
    const B = bounds(), bx = B.x - 3, bz = B.z - 3;
    const minR = small() ? 4 : 9, maxR = small() ? 14 : 28;
    for (let t = 0; t < 30; t++) {
      const a = Math.random() * Math.PI * 2, r = minR + Math.random() * (maxR - minR);
      const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      if (Math.abs(x) > bx || Math.abs(z) > bz || blocked(x, z, 0.8)) continue;
      const y = groundAt(x, z);
      if (Math.abs(y - py) > 4) continue;              // nicht weit über oder unter dem Spieler (Hänge, Etagen)
      const g = makeCrate();
      g.position.set(x, y, z);
      g.rotation.y = Math.random() * Math.PI * 2;
      scene.add(g);
      crates.push({ g, life: LIFETIME, t: Math.random() * 6 });
      return true;
    }
    return false;
  }

  return {
    /** Für das Radar. */
    list: crates,
    /**
     * @param {number} dt
     * @param {THREE.Vector3} pos   Kamera (Spieler)
     * @param {number} feetY        Fußhöhe des Spielers
     * @param {boolean} active      Einzelspieler läuft
     * @param {boolean} lowAmmo     Reserve der aktuellen Waffe unter einem Magazin
     */
    update(dt, pos, feetY, active, lowAmmo) {
      for (let i = crates.length - 1; i >= 0; i--) {
        const c = crates[i];
        c.life -= dt; c.t += dt;
        const box = c.g.userData.box;
        box.position.y = 0.06 + Math.sin(c.t * 2.2) * 0.05;
        box.rotation.y += dt * 0.6;
        c.g.visible = !(c.life < 10 && Math.floor(c.life * 4) % 2 === 0);   // blinkt in den letzten 10 s
        const dx = c.g.position.x - pos.x, dz = c.g.position.z - pos.z;
        if (active && dx * dx + dz * dz < PICK_R * PICK_R && Math.abs(feetY - c.g.position.y) < 1.8) {
          remove(i);
          onPickup();
          continue;
        }
        if (c.life <= 0) remove(i);
      }
      if (!active) return;
      timer -= dt;
      if (lowAmmo && crates.length === 0 && timer > 8) timer = 8;   // knapp an Munition → bald Nachschub
      if (timer <= 0) {
        const ok = crates.length >= MAX_CRATES || spawnNear(pos.x, pos.z, feetY);
        timer = ok ? NEXT_DELAY[0] + Math.random() * (NEXT_DELAY[1] - NEXT_DELAY[0]) : 5;
      }
    },
    /** Neue Runde oder neue Karte: alle Kisten weg, Zeitgeber zurück. */
    clear() {
      while (crates.length) remove(crates.length - 1);
      timer = FIRST_DELAY;
    },
  };
}
