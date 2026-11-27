// Mitflieger im Erkundungsflug: Soldat auf dem Hexenbesen (assets/models/soldier/SoldierBesen.glb, in Blender gebaut,
// Quelle blender/SoldierBesen.blend). Der Besen ist fest im Modell an der Hüfte, darunter hängt eine Minigun.
//
// Aufbau:  g     Position (Ursprung = gemeldete Augenhöhe − HEAD), dreht sich nicht (Namensschild hängt hier)
//          body  dreht sich um die Hüfte: Blickrichtung des Mitspielers, dazu seine Manöver (flight-moves.js)
//          model die Figur mit Animationen, den Punkten „Mund“ (Energiebälle) und „Muendung“ (Minigun) und der Kugel
//                „Schild“ (shield.js)
//
// Animationen: Ride im Flug, Hover im Stillstand (0,3 s Übergang), LeanLeft/LeanRight nach Lenkeinschlag, Boost,
// HoldTight (Looping) und Roll (Rolle, Spirale) mit 0,2 s Übergang. Trick, Spit und die Fidgets (Strecken, Gähnen,
// Klopfen) laufen einmal und blenden zurück. Shoot (Rückstoß) legt sich beim Dauerfeuer mit Gewicht 0,6 darüber,
// MinigunSpin dreht die Läufe parallel dazu (Tempo über timeScale).
//
// Minigun-Modell: „M134 handheld (Minigun)“ von Alexander_Borisevich, CC BY 4.0 (Hinweis in credits.html).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { createShield } from './shield.js?v=1';
import { MOVE_ANIM, isMove, moveDur, moveQuat } from './flight-moves.js?v=2';

/**
 * Spielfiguren. head: Kopfhöhe über dem Ursprung in der Ride-Haltung (Kopf = Kamera des Mitspielers).
 * muzzle: Mündung relativ zum Auge (vor / unter der Kamera), so starten die eigenen Schüsse.
 * bodyCenter / bodyAxes: Treff-Ellipsoid in Koordinaten der Schild-Kugel (ohne Schild).
 */
export const CHARACTERS = {
  soldat: {
    name: 'Soldat', glb: 'assets/models/soldier/SoldierBesen.glb', img: 'ui/besen.webp',
    head: 1.52, muzzle: { fwd: 1.386, down: 0.407 },
    bodyCenter: [0, 0, 0], bodyAxes: [0.72, 0.714, 1.534].map((v) => v * Math.sqrt(0.8)),
  },
  hexe: {
    name: 'Hexe', glb: 'assets/models/hexe/HexeBesen.glb', img: 'ui/armory/hexe.webp',
    head: 1.655, muzzle: { fwd: 1.05, down: 0.728 },
    bodyCenter: [-0.102, 0.148, 0.221], bodyAxes: [0.477, 0.912, 0.338],
  },
};
export const CHAR_IDS = Object.keys(CHARACTERS);
/** Unbekannte Kennung → Soldat. */
export function charId(id) { return CHAR_IDS.includes(id) ? id : 'soldat'; }
export const FIDGETS = ['FidgetStretch', 'FidgetYawn', 'FidgetTap'];
/** Minigun: volle Drehzahl (timeScale von MinigunSpin), Anlaufen und Auslaufen in Sekunden. */
export const SPIN_MAX = 5, SPIN_UP = 0.3, SPIN_DOWN = 1.0;
export const MINIGUN_PARTS = ['Minigun', 'Minigun_Laeufe', 'Halterung'];
const PIVOT = 1.06;                    // Hüfthöhe: Drehpunkt bei Manövern
const LOOPS = ['Ride', 'Hover', 'LeanLeft', 'LeanRight', 'HoldTight', 'Roll', 'Boost'];
export const ONCE = ['Trick', 'Spit', 'Wave', 'Handstand', 'LieDown', 'Dance', ...FIDGETS];
const FADE = 0.2, FADE_HOVER = 0.3;    // s Überblenden (von und zu Hover etwas weicher)
const SHOOT_W = 0.6;                   // Gewicht der Rückstoß-Animation beim Dauerfeuer
// Treffer-Ellipsoide in Koordinaten der Schild-Kugel. Mit Schild: die Kugel selbst (Größe und Mitte aus der Geometrie
// im Modell, createFlyer). Ohne Schild: festes Ellipsoid um Reiter und Besen (Halbachsen 0,72 / 0,714 / 1,534 der
// früheren Kugel × √0,8, etwas großzügig, sonst trifft man kaum). Es bleibt fest, damit eine größere Kugel im Modell
// die Figur nicht leichter treffbar macht.

const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);

/** Modell laden; die Schild-Kugel ist zunächst unsichtbar (shield.js schaltet sie). minigun: false blendet sie aus. */
export async function loadFlyerTemplate(loader, { minigun = true, url = CHARACTERS.soldat.glb } = {}) {
  const gltf = await loader.loadAsync(url);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.userData.sharedGeo = true;
    o.castShadow = o.name !== 'Schild';
    if (o.name === 'Schild') o.visible = false;
  });
  if (!minigun) for (const n of MINIGUN_PARTS) { const o = gltf.scene.getObjectByName(n); if (o) o.visible = false; }
  const anims = gltf.animations || [];
  const dur = (n) => THREE.AnimationClip.findByName(anims, n)?.duration || 2.4;
  return { scene: gltf.scene, animations: anims, fidgetDur: Object.fromEntries(FIDGETS.map((n) => [n, dur(n)])) };
}

// Mündungsblitz: ein Sprite mit gezeichnetem Stern (für die Mitflieger und die eigene Minigun)
let flashMat = null;
function flashMaterial() {
  if (flashMat) return flashMat;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,230,1)'); grd.addColorStop(0.3, 'rgba(255,210,110,0.9)'); grd.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,230,160,0.8)';
  for (let k = 0; k < 4; k++) { g.save(); g.translate(32, 32); g.rotate(k * Math.PI / 4); g.fillRect(-30, -2, 60, 4); g.restore(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  flashMat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  return flashMat;
}
export function createMuzzleFlash() {
  const s = new THREE.Sprite(flashMaterial());
  s.visible = false; s.renderOrder = 5; s.raycast = () => {};
  return s;
}
/** Blitz flackern lassen (jedes Bild aufrufen, solange gefeuert wird). size: 1 bei den Mitfliegern, kleiner für die
 *  eigene Minigun, deren Mündung nur gut einen Meter vor der Kamera sitzt. */
export function flickerFlash(s, on, size = 1) {
  s.visible = on && Math.random() > 0.25;
  if (s.visible) s.scale.setScalar((0.35 + Math.random() * 0.45) * size);
}

/** Gewichte der Animationen: Schleifen teilen sich das Gewicht, Shoot und Einmal-Animationen legen sich darüber. */
function createRig(mixer, clips) {
  const act = {};
  for (const n of [...LOOPS, ...ONCE, 'Shoot', 'MinigunSpin']) {
    const clip = THREE.AnimationClip.findByName(clips, n);
    if (!clip) continue;
    const a = mixer.clipAction(clip);
    if (ONCE.includes(n)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    else { a.setEffectiveWeight(n === 'Ride' || n === 'MinigunSpin' ? 1 : 0); a.play(); }
    act[n] = a;
  }
  if (act.MinigunSpin) act.MinigunSpin.timeScale = 0;   // Läufe stehen, bis gefeuert wird
  const share = Object.fromEntries(LOOPS.map((n) => [n, n === 'Ride' ? 1 : 0]));
  let once = null, sinceOnce = 9, shootBlend = 0;

  return {
    get once() { return once ? once.name : ''; },
    get sinceOnce() { return sinceOnce; },
    weights() { return Object.fromEntries(Object.entries(act).map(([n, a]) => [n, +(a.isRunning() || LOOPS.includes(n) ? a.getEffectiveWeight() : 0).toFixed(2)])); },
    get spin() { return act.MinigunSpin ? act.MinigunSpin.timeScale : 0; },
    playOnce(name) {
      const a = act[name]; if (!a) return;
      if (once && once.name !== name) act[once.name].stop();
      a.reset(); a.setEffectiveWeight(0); a.play();
      once = { name, t: 0, dur: a.getClip().duration };
      sinceOnce = 0;
    },
    /** Einmal-Animation schnell ausblenden (z. B. Fidget, weil der Spieler losfliegt). */
    abortOnce(fade = 0.15) { if (once) once.t = Math.max(once.t, once.dur - fade); },
    /** base: Grund-Schleife, lean: -1 … 1, shoot: Dauerfeuer an, spin: Drehzahl der Läufe (timeScale). */
    update(dt, base, lean, shoot, spin) {
      sinceOnce += dt;
      if (!act[base]) base = 'Ride';
      const lw = base === 'Ride' ? Math.min(1, Math.abs(lean)) : 0;
      const leanName = lean > 0 ? 'LeanLeft' : 'LeanRight';
      const step = dt / (base === 'Hover' || share.Hover > 0.001 ? FADE_HOVER : FADE);
      let sum = 0;
      for (const n of LOOPS) {
        const tgt = n === base ? 1 - lw : (n === leanName ? lw : 0);
        const s = share[n];
        share[n] = s < tgt ? Math.min(tgt, s + step) : Math.max(tgt, s - step);
        if (act[n]) sum += share[n];
      }
      let ow = 0;
      if (once) {
        once.t += dt;
        if (once.t >= once.dur) { act[once.name].stop(); once = null; }
        else { ow = Math.max(0, Math.min(1, once.t / 0.12, (once.dur - once.t) / FADE)); act[once.name].setEffectiveWeight(ow); }
      }
      shootBlend += ((shoot && act.Shoot ? 1 : 0) - shootBlend) * Math.min(1, dt / 0.12);
      const sw = SHOOT_W * shootBlend * (1 - ow);
      if (act.Shoot) act.Shoot.setEffectiveWeight(sw);
      // Summe auf 1 bringen, sonst schimmert die Grundhaltung (T-Pose) durch
      for (const n of LOOPS) if (act[n]) act[n].setEffectiveWeight(sum > 1e-4 ? (share[n] / sum) * (1 - ow) * (1 - SHOOT_W * shootBlend) : 0);
      if (act.MinigunSpin) act.MinigunSpin.timeScale = spin;
      mixer.update(dt);
    },
  };
}

export function createFlyer(template, char = 'soldat') {
  const ch = CHARACTERS[charId(char)];
  const bodyAxes = new THREE.Vector3(...ch.bodyAxes), bodyCenter = new THREE.Vector3(...ch.bodyCenter);
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = PIVOT;
  g.add(body);
  const model = cloneSkinned(template.scene);
  model.position.y = -PIVOT;
  body.add(model);

  const shield = createShield(model);
  shield.setEnergy(1);
  shield.setVisible(false);
  shield.update(10);                   // sofort ganz ausgeblendet statt kurz aufzublitzen
  const mouth = model.getObjectByName('Mund') || model;
  const muzzle = model.getObjectByName('Muendung') || mouth;
  const hasGun = !!model.getObjectByName('Minigun')?.visible;
  const flash = createMuzzleFlash();
  muzzle.add(flash);                   // Muendung hat Weltmaßstab 1 (Character 0,01 × Muendung 100)
  const mixer = new THREE.AnimationMixer(model);
  const rig = createRig(mixer, template.animations);

  const qY = new THREE.Quaternion(), qP = new THREE.Quaternion(), qPi = new THREE.Quaternion(), qM = new THREE.Quaternion();
  const loc = new THREE.Vector3(), ro = new THREE.Vector3(), rd = new THREE.Vector3(), inv = new THREE.Matrix4();
  // Schild-Kugel: Mitte und Halbachsen aus der Geometrie (lokal; Maßstab und Lage des Knotens kommen über die Matrix)
  const sg = shield.mesh.geometry;
  if (!sg.boundingBox) sg.computeBoundingBox();
  const shC = sg.boundingBox.getCenter(new THREE.Vector3());
  const shAx = sg.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  /** Punkt bzw. Richtung (lokal) in die Einheitskugel des gewählten Ellipsoids umrechnen. */
  const toUnit = (p, shieldOn, isDir) => (shieldOn ? (isDir ? p : p.sub(shC)).divide(shAx)
    : (isDir ? p : p.sub(bodyCenter)).divide(bodyAxes));
  let rp = null;                       // nachgespieltes Manöver
  let lastAnim = 'Ride', spin = 0;

  return {
    g, body, model, shield, mouth, muzzle, mixer, rig, char: charId(char), head: ch.head,
    ownMats: [shield.mesh.material],
    get replaying() { return rp ? rp.move : ''; },
    /** Läufe voll angelaufen und Abzug gedrückt: es wird geschossen (Mündungsfeuer, Leuchtspur). */
    firing: false,

    /** Manöver des Mitspielers nachspielen (Nachricht „move“). pitch = sein Blick beim Start. */
    playMove(move, dir, pitch = 0) {
      if (!isMove(move, dir)) return;
      if (ONCE.includes(MOVE_ANIM[move])) rig.playOnce(MOVE_ANIM[move]);   // Trick, Winken, Handstand, Hinlegen, Tanzen
      rp = { move, dir, t: 0, dur: moveDur(move, dir), p0: pitch };
    },
    /** Einmal-Animation (Spit, Trick). */
    playOnce(name) { rig.playOnce(name); },

    /** Ein Bild. s = Zustand des Mitspielers vom Server: ry, anim, lean, sh, she, mg (Abzug). */
    update(dt, s) {
      if (rp && (rp.t += dt) >= rp.dur) rp = null;
      body.quaternion.copy(qY.setFromAxisAngle(AY, s.ry || 0));
      if (rp) {
        qP.setFromAxisAngle(AX, rp.p0); qPi.copy(qP).invert();
        body.quaternion.multiply(qP).multiply(moveQuat(rp.move, rp.dir, rp.t / rp.dur, qM)).multiply(qPi);
      }
      const anim = s.anim || 'Ride';
      // Einmal-Animation verpasst (z. B. kurz vor dem Beitritt gestartet) oder Fidget: aus dem Zustand nachholen
      if (anim !== lastAnim && ONCE.includes(anim) && rig.once !== anim && rig.sinceOnce > 0.6) rig.playOnce(anim);
      // Fidget läuft, aber der Mitspieler fliegt los (oder macht etwas anderes): sofort abbrechen
      if (FIDGETS.includes(rig.once) && anim !== rig.once) rig.abortOnce();
      lastAnim = anim;
      const moveAnim = rp ? MOVE_ANIM[rp.move] : '';
      return this.animate(dt, moveAnim, anim, s);
    },
    /** Animation, Schild und Minigun (auch für die eigene Figur in der Ich-Ansicht, dort ohne Drehung). */
    animate(dt, moveAnim, anim, s) {
      const base = LOOPS.includes(moveAnim) ? moveAnim : (LOOPS.includes(anim) ? anim : (anim === 'Spit' || FIDGETS.includes(anim) ? 'Hover' : 'Ride'));
      // Minigun: anlaufen, solange der Abzug gedrückt ist, sonst langsam auslaufen
      const trig = hasGun && !!s.mg;
      spin = trig ? Math.min(SPIN_MAX, spin + dt * SPIN_MAX / SPIN_UP) : Math.max(0, spin - dt * SPIN_MAX / SPIN_DOWN);
      this.firing = trig && spin >= SPIN_MAX * 0.9;
      rig.update(dt, base, s.lean || 0, this.firing, spin);
      flickerFlash(flash, this.firing, s.fs || 1);
      shield.setVisible(!!s.sh);
      if (s.sh) shield.setEnergy(typeof s.she === 'number' ? s.she : 1);
      shield.update(dt);
    },

    /** Startpunkt der Energiebälle (Weltkoordinaten). */
    mouthPos(out) { model.updateWorldMatrix(true, true); return mouth.getWorldPosition(out); },
    /** Mündung der Minigun (Weltkoordinaten). */
    muzzlePos(out) { model.updateWorldMatrix(true, true); return muzzle.getWorldPosition(out); },
    /** Mitte der Figur (Hüfte). */
    center(out) { return body.getWorldPosition(out); },
    /** Trifft ein Punkt die Figur (ohne Schild) bzw. die Schild-Kugel (mit Schild)? */
    hitTest(point, shieldOn) {
      loc.copy(point);
      shield.mesh.worldToLocal(loc);
      return toUnit(loc, shieldOn, false).lengthSq() <= 1;
    },
    /** Strahl (origin, dir normiert) gegen dasselbe Ellipsoid: Abstand bis zum Eintritt oder -1. */
    rayHit(origin, dir, shieldOn) {
      inv.copy(shield.mesh.matrixWorld).invert();
      ro.copy(origin).applyMatrix4(inv);
      rd.copy(origin).add(dir).applyMatrix4(inv).sub(ro);          // Richtung mit, nicht normieren: t bleibt in Metern
      toUnit(ro, shieldOn, false); toUnit(rd, shieldOn, true);
      const a = rd.dot(rd), b = 2 * ro.dot(rd), c = ro.dot(ro) - 1, disc = b * b - 4 * a * c;
      if (disc < 0) return -1;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      return t > 0 ? t : (c < 0 ? 0 : -1);                            // c < 0: Start schon innen
    },
  };
}
