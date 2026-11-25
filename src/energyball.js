// Energiebälle zum Spucken (Erkundungsflug): leuchtende Kugel, fliegt geradeaus in Blickrichtung.
//
// Eigene Bälle (local) prüfen Treffer an den Mitfliegern; was der Ball trifft, meldet main.js übers Netz.
// Bälle der anderen sind nur zum Ansehen: Sie verschwinden an Boden, Gebäuden oder wenn die Treffermeldung kommt.
// Pro Ball zwei Draw-Calls (Kern + Leuchtsprite), höchstens MAX gleichzeitig.
import * as THREE from 'three';

const SPEED = 38;          // m/s
const LIFE = 2.4;          // s
const MAX = 24;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(160,240,255,0.85)');
  grd.addColorStop(0.6, 'rgba(60,170,255,0.25)');
  grd.addColorStop(1, 'rgba(40,120,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * scene, groundAt(x, z), solidAt(x, y, z) → true in Gebäuden, onImpact(pos) für die Funken.
 */
export function createEnergyBalls({ scene, groundAt, solidAt, onImpact }) {
  const coreGeo = new THREE.SphereGeometry(0.16, 12, 8);
  const coreMat = new THREE.MeshBasicMaterial({ color: '#eafcff' });
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#7fe0ff', blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false });
  const balls = [];
  const seg = new THREE.Vector3(), p = new THREE.Vector3();

  function make() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(coreGeo, coreMat); core.raycast = () => {};
    const glow = new THREE.Sprite(glowMat); glow.scale.setScalar(1.1); glow.raycast = () => {};
    g.add(core, glow);
    return { g, glow, pos: g.position, prev: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, owner: '', id: 0, local: false, alive: false };
  }

  function kill(b, burst) {
    if (!b.alive) return;
    b.alive = false; scene.remove(b.g);
    if (burst) onImpact?.(b.pos.clone());
  }

  return {
    /** Ball abschießen. pos, dir: Vector3 (dir wird normiert). */
    spawn({ pos, dir, owner = '', id = 0, local = false }) {
      let b = balls.find((x) => !x.alive);
      if (!b) {
        if (balls.length < MAX) balls.push(b = make());
        else b = balls.reduce((a, x) => (x.age > a.age ? x : a));   // ältesten ersetzen
      }
      b.pos.copy(pos); b.prev.copy(pos); b.vel.copy(dir).normalize().multiplyScalar(SPEED);
      b.age = 0; b.owner = owner; b.id = id; b.local = local; b.alive = true;
      scene.add(b.g);
      return b;
    },
    /**
     * Ein Bild. targets (nur für eigene Bälle): [{ id, test(point) → true bei Treffer }].
     * Gibt die Treffer zurück: [{ id: Ziel, ball: Ball-Nummer, point }].
     */
    update(dt, targets = []) {
      const hits = [];
      for (const b of balls) {
        if (!b.alive) continue;
        b.age += dt;
        b.prev.copy(b.pos);
        b.pos.addScaledVector(b.vel, dt);
        b.glow.scale.setScalar(1.0 + 0.18 * Math.sin(b.age * 30));
        if (b.local && targets.length) {
          // Drei Stichproben auf dem Weg dieses Bildes (bei 38 m/s gut 0,6 m pro Bild)
          seg.subVectors(b.pos, b.prev);
          let hit = null;
          for (let k = 1; k <= 3 && !hit; k++) {
            p.copy(b.prev).addScaledVector(seg, k / 3);
            for (const t of targets) if (t.test(p)) { hit = t; break; }
          }
          if (hit) { b.pos.copy(p); hits.push({ id: hit.id, ball: b.id, point: p.clone() }); kill(b, false); continue; }
        }
        if (b.age > LIFE) { kill(b, false); continue; }
        if (b.pos.y < groundAt(b.pos.x, b.pos.z) + 0.05 || solidAt(b.pos.x, b.pos.y, b.pos.z)) kill(b, true);
      }
      return hits;
    },
    /** Ball eines anderen entfernen (Treffermeldung kam übers Netz). */
    remove(owner, id, burst = true) {
      const b = balls.find((x) => x.alive && x.owner === owner && x.id === id);
      if (b) kill(b, burst);
    },
    clear() { for (const b of balls) kill(b, false); },
    get count() { return balls.filter((b) => b.alive).length; },
  };
}
