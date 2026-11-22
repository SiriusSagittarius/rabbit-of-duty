// Waffen-Arsenal von Rabbit of Duty: eigene, aus Code gebaute Waffen (src/weapons/) mit Händen,
// Animationen (Ziehen, Zielen, Nachladen), Rückstoßmuster, Magazinen, Mündungsfeuer und Zielfernrohr.
// Die Schnittstelle (equip, switchSlot, setTrigger, reload, melee, update, render, currentWeapon, ammo …)
// ist dieselbe wie beim früheren Arsenal, damit main.js kaum angepasst werden musste.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createViewmodel } from './weapons/lite.js?v=4';
import { WEAPON_DEFS, buildRecoilPattern } from './weapons/defs.js';
import { Rng } from './weapons/rng.js';
import { buildRifle } from './weapons/models/rifle.js?v=2';
import { buildSmg } from './weapons/models/smg.js';
import { buildPistol } from './weapons/models/pistol.js';
import { buildSniper } from './weapons/models/sniper.js';
import { buildAssault2 } from './weapons/models/assault2.js';
import { buildBullpup } from './weapons/models/bullpup.js';
import { buildKnife } from './weapons/models/knife.js';
import { buildGrenade } from './weapons/models/grenade.js';

const R = WEAPON_DEFS.rifle;
const S = WEAPON_DEFS.smg;
const P = WEAPON_DEFS.pistol;

/* -------------------------------------------------------------------------- */
/*  Hände an neue Modelle anpassen                                            */
/* -------------------------------------------------------------------------- */
// Die Handziele des Grundgewehrs (rifle.js) sind sorgfältig eingemessen. Neue Modelle bekommen
// dieselben Handhaltungen, verschoben um den Abstand ihrer Griff-Oberkante bzw. ihres Handschutzes.
const RIFLE_GRIP_TOP = [0, 0.035, 0.0];   // vordere Oberkante des Pistolengriffs im Grundgewehr
const RIFLE_HG = { axisY: 0.075, r: 0.0271 };
const RIFLE_HAND_Z = -0.235;              // handZ in rifle.js: wo die Knöchel der linken Hand den Handschutz kreuzen

function fitGrips(model, ref, { gripTop, handZ }) {
  const n = model.nodes;
  const d = gripTop.map((v, i) => v - RIFLE_GRIP_TOP[i]);
  n.gripR = { pos: ref.nodes.gripR.pos.map((v, i) => v + d[i]), finger: ref.nodes.gripR.finger, back: ref.nodes.gripR.back };
  const hg = n.handguard;
  const axisY = hg ? hg.axis[1] : n.muzzle[1];
  const r = hg ? hg.r : RIFLE_HG.r;
  const gl = ref.nodes.gripL;
  // Die linke Hand liegt unter dem Handschutz (rifle.js gripL). Bei einem dickeren Handschutz
  // rutscht sie entsprechend tiefer. Zum Knöchelpunkt handZ steht sie wie beim Grundgewehr.
  n.gripL = {
    pos: [gl.pos[0], axisY + (gl.pos[1] - RIFLE_HG.axisY) - (r - RIFLE_HG.r), handZ + (gl.pos[2] - RIFLE_HAND_Z)],
    finger: gl.finger,
    back: gl.back,
  };
}

/**
 * Messer: so gedreht, dass der Griff wie ein Pistolengriff in der Hand liegt (18° nach hinten
 * geneigt, Klinge oben, Schneide nach vorne). Dann passt die eingemessene Pistolen-Handhaltung;
 * die gekippte Haltung (hipRot) bringt die Klinge nach vorne. Linke Hand außer Sicht.
 */
const PISTOL_GRIP_R = { pos: [0.028, 0.003, 0.07], finger: [0, -0.315, -0.949], back: [0.98, 0, -0.2] };
const PISTOL_GRIP_L = { pos: [-0.03, -0.012, 0.076], finger: [0.34, -0.28, -0.9], back: [0.15, 0.93, -0.33] };
function prepareKnife(model) {
  // Rücken oben am Griffanfang (0, 0.014, -0.058) landet im Ursprung (Daumenbeuge wie bei der Pistole)
  const m4 = new THREE.Matrix4().makeRotationX(1.25)
    .premultiply(new THREE.Matrix4().makeTranslation(0, -0.0595, 0.005));
  const body = model.body;
  model.body = {
    name: body.name,
    build: () => {
      const map = body.build();
      for (const g of map.values()) g.applyMatrix4(m4);
      return map;
    },
  };
  const tf = (p) => new THREE.Vector3().fromArray(p).applyMatrix4(m4).toArray();
  const n = model.nodes;
  n.gripR = PISTOL_GRIP_R;
  n.gripL = { pos: [-0.32, -0.34, 0.2], finger: [0.82, 0.5, -0.28], back: [-0.5, 0.32, -0.8] };
  n.tip = tf(n.tip);
  n.muzzle = n.tip;
  n.sight = [0, 0.05, 0];
  n.eject = [0, 0, 0];
  n.magSeat = { pos: [0, 0, 0], rot: [0, 0, 0] };
  n.magDrop = [0, -0.3, 0];
  model.moving = {};
}

/** Linsen (eigene Assembly `glass`) werden als zusätzliches, unbewegtes Teil mitgebaut. */
function attachGlass(model) {
  if (model.glass) model.moving = { ...model.moving, glass: model.glass };
}

/* -------------------------------------------------------------------------- */
/*  Waffen aus GLB-Dateien (z. B. Tripo, Meshy)                               */
/* -------------------------------------------------------------------------- */
/**
 * Lädt eine (vorher verkleinerte) GLB-Waffe und bringt sie in Waffen-Koordinaten: drehen (Mündung nach -Z),
 * skalieren, verschieben (Ursprung vorne am Griff). Ein benanntes Teil kann das Magazin werden; es wird um
 * seinen Sitz (magSeat) gebaut, damit die Nachlade-Animation es herausnehmen kann.
 */
async function loadGlbModel(w) {
  const g = w.glb;
  const gltf = await new GLTFLoader().loadAsync(g.url);
  const m4 = new THREE.Matrix4().makeRotationY(g.rotY)
    .premultiply(new THREE.Matrix4().makeScale(g.scale, g.scale, g.scale))
    .premultiply(new THREE.Matrix4().makeTranslation(g.offset[0], g.offset[1], g.offset[2]));
  const body = [];
  const mag = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    geo.applyMatrix4(m4);
    const src = o.material;
    // Einfaches Standard-Material (Physical/Volume-Erweiterungen der Generatoren sind hier unnötig teuer)
    const mat = new THREE.MeshStandardMaterial({
      color: src.color ?? 0xffffff, map: src.map ?? null, normalMap: src.normalMap ?? null,
      roughnessMap: src.roughnessMap ?? null, metalnessMap: src.metalnessMap ?? null, aoMap: src.aoMap ?? null,
      roughness: src.roughness ?? 0.8, metalness: src.metalness ?? 0,
    });
    if (src.normalScale) mat.normalScale.copy(src.normalScale);
    if (g.magPart && o.name === g.magPart) {
      const s = w.nodes.magSeat.pos;
      geo.translate(-s[0], -s[1], -s[2]);
      mag.push({ geometry: geo, material: mat });
    } else {
      body.push({ geometry: geo, material: mat });
    }
  });
  return {
    id: w.id,
    label: w.name,
    fxClass: w.fxClass ?? 'carbine',
    body: { name: `${w.id}-body`, meshes: body },
    moving: mag.length ? { magazine: { name: `${w.id}-magazine`, meshes: mag } } : {},
    nodes: structuredClone(w.nodes),
    lhandPose: w.lhandPose,
  };
}

/* -------------------------------------------------------------------------- */
/*  Waffenliste                                                               */
/* -------------------------------------------------------------------------- */
function weapon(id, name, cls, role, build, def, extra = {}) {
  return {
    id, name, class: cls, role, build, def,
    fireMode: 'auto', sound: 'rifle', camKick: 1,
    magazineSize: def.magSize, reserveAmmo: def.reserve, roundsPerMinute: def.rpm, damage: def.damage,
    // Bild für die Waffenkammer: Seitenansicht des Spielmodells, gerendert mit Spielmaterialien
    // (960 × 320, transparent). Eigenes Bild: Datei gleichen Namens ersetzen oder cardArt in extra setzen.
    cardArt: `./ui/armory/${id}.webp`,
    ...extra,
  };
}

const CATALOG = [
  weapon('rifle', 'RK-4 Karabiner', 'primary', 'Sturmgewehr', buildRifle, { ...R, label: 'RK-4' }, {
    sound: 'm27', boltHold: true,
  }),
  weapon('assault2', 'Kavkaz-47', 'primary', 'Sturmgewehr', buildAssault2, {
    ...R, id: 'assault2', label: 'Kavkaz-47', rpm: 600, magSize: 30, reserve: 180, damage: 38,
    recoil: { ...R.recoil, pitch: 0.0105, yaw: 0.003, kickBack: 0.022, patternSeed: 0x5a17c3 },
    eyeRelief: 0.34, adsTime: 0.26, viewFov: 0.9, magLen: 0.21,
  }, {
    sound: 'an94', camKick: 1.3,
    prepare: (m, ref) => fitGrips(m, ref, { gripTop: [0, 0.026, -0.002], handZ: -0.235 }),
  }),
  weapon('bullpup', 'Kala-BP55', 'primary', 'Bullpup-Sturmgewehr', buildBullpup, {
    ...R, id: 'bullpup', label: 'Kala-BP55', rpm: 750, magSize: 30, reserve: 210, damage: 32,
    recoil: { ...R.recoil, pitch: 0.0078, patternSeed: 0x2b44e1 },
    eyeRelief: 0.104, viewFov: 0.88, magLen: 0.185,
  }, {
    sound: 'tar21', boltHold: true,
    prepare: (m, ref) => fitGrips(m, ref, { gripTop: [0, 0.010, -0.006], handZ: -0.235 }),
  }),
  weapon('sniper', 'M98 Recon', 'primary', 'Scharfschützengewehr', buildSniper, {
    ...R, id: 'sniper', label: 'M98 Recon', rpm: 50, magSize: 10, reserve: 40, damage: 140,
    recoil: { ...R.recoil, pitch: 0.03, yaw: 0.004, kickBack: 0.04, kickUp: 0.012, patternLength: 10, climbShape: [1] },
    eyeRelief: 0.09, adsTime: 0.32, viewFov: 0.9, reloadTac: 2.6, reloadEmpty: 3.2, magLen: 0.075,
  }, {
    sound: 'sa58', fireMode: 'bolt', boltTime: 1.15, camKick: 3, flashScale: 1.5,
    scope: { zoomFov: 12, overlay: '' },
    prepare: (m, ref) => { fitGrips(m, ref, { gripTop: [0, 0.033, 0.002], handZ: -0.22 }); attachGlass(m); },
  }),
  weapon('smg', 'MK-9', 'primary', 'Maschinenpistole', buildSmg, { ...S, label: 'MK-9' }, {
    sound: 'kard', camKick: 0.75, boltHold: true, flashScale: 0.8,
  }),
  // Tripo-Modell (Pro-Konto), verkleinert von 2 Mio. auf 40.000 Dreiecke; Teil 3 ist das Magazin
  weapon('ak_tripo', 'Taiga-47', 'primary', 'Sturmgewehr (Tripo-Modell)', null, {
    ...R, id: 'ak_tripo', label: 'Taiga-47', rpm: 600, magSize: 30, reserve: 180, damage: 38,
    recoil: { ...R.recoil, pitch: 0.0105, yaw: 0.003, kickBack: 0.022, patternSeed: 0x6b21d5 },
    eyeRelief: 0.34, adsTime: 0.26, viewFov: 0.9, magLen: 0.19,
  }, {
    sound: 'an94', camKick: 1.3,
    glb: { url: './assets/models/weapons/ak_tripo.glb', rotY: Math.PI / 2, scale: 0.89, offset: [0, -0.12085, -0.14885], magPart: 'tripo_part_3' },
    nodes: {
      muzzle: [0, 0.0977, -0.588], chamber: [0, 0.0977, -0.16], eject: [0.0178, 0.106, -0.122], ejectDir: [0.85, 0.45, 0.25],
      sight: [0, 0.1515, -0.1578], ironSight: [0, 0.1515, -0.1578], sightAxis: [0, 0, -1],
      magSeat: { pos: [0, 0.0715, -0.1311], rot: [0, 0, 0] }, magDrop: [0.01, -0.38, 0.018],
      handguard: { axis: [0, 0.0977, 0], dir: [0, 0, 1], r: 0.03, z0: -0.238, z1: -0.416 },
    },
    prepare: (m, ref) => fitGrips(m, ref, { gripTop: [0, 0.026, -0.002], handZ: -0.255 }),
  }),
  weapon('pistol', 'P-19', 'secondary', 'Pistole', buildPistol, { ...P }, {
    sound: 'fiveseven', fireMode: 'semi', camKick: 1.1, boltHold: true, flashScale: 0.7,
  }),
  // Meshy-Modell, verkleinert von 876.000 auf 15.800 Dreiecke; Pistolen-Handhaltung der P-19
  weapon('pistol_meshy', 'Vintage 9', 'secondary', 'Pistole (Meshy-Modell)', null, {
    ...P, id: 'pistol_meshy', label: 'Vintage 9', rpm: 380, magSize: 8, reserve: 48, damage: 34,
  }, {
    sound: 'kard', fireMode: 'semi', camKick: 1.2, flashScale: 0.7, fxClass: 'pistol', lhandPose: 'cup',
    glb: { url: './assets/models/weapons/pistol_meshy.glb', rotY: -Math.PI / 2, scale: 1, offset: [0, -0.088, -0.09] },
    nodes: {
      muzzle: [0, 0.03, -0.204], chamber: [0, 0.03, -0.03], eject: [0.012, 0.045, -0.03], ejectDir: [0.85, 0.45, 0.25],
      sight: [0, 0.052, 0.0], sightAxis: [0, 0, -1],
      magSeat: { pos: [0, -0.05, 0.02], rot: [0, 0, 0] }, magDrop: [0, -0.3, 0.05],
    },
    prepare: (m) => { m.nodes.gripR = PISTOL_GRIP_R; m.nodes.gripL = PISTOL_GRIP_L; },
  }),
  weapon('knife', 'Stalker-17', 'secondary', 'Kampfmesser', buildKnife, {
    ...P, id: 'knife', label: 'Stalker-17', rpm: 90, magSize: 0, reserve: 0, damage: 180,
    hipPos: [0.14, -0.15, -0.38], hipRot: [-0.45, 0.25, -0.3],
    sprintPos: [0.12, -0.22, -0.32], sprintRot: [-0.9, 0.45, -0.25],
    lowReadyPos: [0.12, -0.23, -0.34], lowReadyRot: [-0.85, 0.25, -0.25],
    swayScale: 0.9, bobScale: 1.0, magLen: 0.05,
  }, {
    melee: true, fireMode: 'melee',
    prepare: (m) => prepareKnife(m),
  }),
];

/* -------------------------------------------------------------------------- */
/*  Effekte                                                                   */
/* -------------------------------------------------------------------------- */
let flashTex = null;
function flashTexture() {
  if (flashTex) return flashTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,250,225,1)');
  grd.addColorStop(0.22, 'rgba(255,196,96,0.95)');
  grd.addColorStop(0.55, 'rgba(255,112,32,0.35)');
  grd.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    g.save();
    g.translate(64, 64);
    g.rotate((i / 5) * Math.PI * 2 + 0.3);
    const sg = g.createLinearGradient(0, 0, 62, 0);
    sg.addColorStop(0, 'rgba(255,224,150,0.9)');
    sg.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = sg;
    g.beginPath();
    g.moveTo(0, -5);
    g.lineTo(62, 0);
    g.lineTo(0, 5);
    g.fill();
    g.restore();
  }
  flashTex = new THREE.CanvasTexture(c);
  flashTex.colorSpace = THREE.SRGBColorSpace;
  return flashTex;
}

/** Mündungsfeuer: Stern von hinten gesehen plus zwei Flammenflächen entlang des Laufs. */
function makeMuzzleFlash(entry, scale) {
  const mat = new THREE.MeshBasicMaterial({
    map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
  });
  const group = new THREE.Group();
  const star = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.11), mat);
  const flameH = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.15), mat);
  flameH.rotation.x = Math.PI / 2;
  flameH.position.z = -0.06;
  const flameV = flameH.clone();
  flameV.rotation.set(Math.PI / 2, Math.PI / 2, 0);
  group.add(star, flameH, flameV);
  for (const m of group.children) {
    m.frustumCulled = false;
    m.renderOrder = 30;
  }
  group.position.copy(entry.muzzle);
  group.visible = false;
  entry.group.add(group);
  return { group, star, t: 0, scale };
}

/** Zielfernrohr-Bild: schwarz mit klarem Kreis, Fadenkreuz mit dicken Außenbalken und Mil-Punkten. */
function makeScopeOverlay() {
  const W = 1600;
  const H = Math.round(W * Math.min(1, innerHeight / Math.max(1, innerWidth)));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const cx = W / 2;
  const cy = H / 2;
  const rad = H * 0.46;
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  const hole = g.createRadialGradient(cx, cy, rad * 0.93, cx, cy, rad);
  hole.addColorStop(0, 'rgba(0,0,0,1)');
  hole.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hole;
  g.beginPath();
  g.arc(cx, cy, rad, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'source-over';
  const vig = g.createRadialGradient(cx, cy, rad * 0.6, cx, cy, rad);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = vig;
  g.beginPath();
  g.arc(cx, cy, rad, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#000';
  const thick = Math.max(6, H * 0.008);
  const thin = Math.max(1.5, H * 0.0018);
  const gap = rad * 0.4;
  g.fillRect(cx - rad, cy - thick / 2, rad - gap, thick);
  g.fillRect(cx + gap, cy - thick / 2, rad - gap, thick);
  g.fillRect(cx - thick / 2, cy + gap, thick, rad - gap);
  g.fillRect(cx - thick / 2, cy - rad, thick, rad - gap);
  g.fillRect(cx - gap, cy - thin / 2, gap * 2, thin);
  g.fillRect(cx - thin / 2, cy - gap, thin, gap * 2);
  for (let k = 1; k <= 4; k++) {
    const d = (gap * k) / 5;
    for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
      g.beginPath();
      g.arc(cx + dx, cy + dy, Math.max(2, H * 0.0028), 0, Math.PI * 2);
      g.fill();
    }
  }
  return new Promise((res) => c.toBlob((b) => res(b ? URL.createObjectURL(b) : ''), 'image/png'));
}

const smooth = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
const lerp = (a, b, t) => a + (b - a) * t;
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const SHOULDER_R = new THREE.Vector3(0.205, -0.2, 0.06);   // rechte Schulter im Kamera-Raum (wie viewmodel.js)

/* -------------------------------------------------------------------------- */
/*  Arsenal                                                                   */
/* -------------------------------------------------------------------------- */
export class Arsenal {
  constructor({ renderer, camera, audioManager, onShotFired = null }) {
    this.renderer = renderer;
    this.camera = camera;
    this.audio = audioManager;
    this.onShotFired = onShotFired;
    this.loadout = { primary: 'rifle', secondary: 'pistol' };
    this.slots = new Map();
    this.activeId = null;
    this.activeSlot = null;
    this.ready = false;
    this.loading = false;
    this.triggerHeld = false;
    this.currentCamo = null;
    this.vmCtx = null;
    this.vm = null;
    this.meleeT = 0;
    this.meleeDur = 0.42;
    this.meleeKind = 'bash';
  }

  weaponsOfClass(cls) {
    return CATALOG.filter((w) => w.class === cls && !w.unavailable);
  }

  findWeapon(id) {
    return CATALOG.find((w) => w.id === id) ?? null;
  }

  /** Baut alle Waffen einmal (Geometrie, Abnutzungs-Masken, Hände) und rüstet die Primärwaffe aus. */
  async init() {
    if (this.ready || this.loading) return;
    this.loading = true;
    try {
      const ref = buildRifle();
      const list = [];
      for (const w of CATALOG) {
        let model;
        if (w.glb) {
          // GLB-Waffen sind optional: fehlt die Datei (z. B. frischer Klon), läuft das Spiel ohne sie
          try { model = await loadGlbModel(w); } catch (err) {
            console.warn(`[arsenal] ${w.name} nicht geladen (${w.glb.url}):`, err?.message ?? err);
            w.unavailable = true;
            continue;
          }
        } else {
          model = w.id === 'rifle' ? ref : w.build();
        }
        w.prepare?.(model, ref);
        list.push([model, w.def]);
      }
      this.vmCtx = createViewmodel(this.renderer, this.camera, list);
      this.vm = this.vmCtx.vm;
      this.vm.onClipEvent = (name, clip) => this._onClipEvent(name, clip);
      for (const w of CATALOG) {
        if (w.unavailable) continue;
        const def = this.vmCtx.defs[w.id];
        const entry = this.vmCtx.entries[w.id];
        const state = {
          mag: w.magazineSize, reserve: w.reserveAmmo, cooldown: 0, shots: 0, latch: false,
          reloading: false, reloadEnd: 0, autoT: 0,
          pattern: w.melee ? null : buildRecoilPattern(def, Rng),
        };
        const flash = w.melee ? null : makeMuzzleFlash(entry, w.flashScale ?? 1);
        this.slots.set(w.id, { definition: w, def, entry, state, flash });
      }
      // Lichtblitz beim Schuss: Licht bleibt immer in der Szene (Stärke 0), damit kein Shader neu übersetzt wird
      this.flashLight = new THREE.PointLight('#ffb35c', 0, 1.6, 2);
      this.vmCtx.viewScene.add(this.flashLight);
      makeScopeOverlay().then((url) => {
        for (const w of CATALOG) if (w.scope) w.scope.overlay = url;
      });
      this.equip(this.loadout.primary, true);
      this.ready = true;
    } catch (err) {
      console.error('[arsenal] Fehler beim Aufbau:', err);
    } finally {
      this.loading = false;
    }
  }

  /** Alle Waffen werden beim Start gebaut; bleibt für die Waffenkammer und Test-Skripte erhalten. */
  async loadWeapon(id) {
    return this.slots.get(id) ?? null;
  }

  equip(weaponId, silent = false) {
    const slot = this.slots.get(weaponId);
    if (!slot || !this.vm) return;
    if (this.activeSlot) this.activeSlot.state.reloading = false;
    if (this.activeSlot?.flash) this.activeSlot.flash.group.visible = false;
    this.vm.stopClip();
    this.vm.setActive(weaponId);
    this.activeId = weaponId;
    this.activeSlot = slot;
    this.meleeT = 0;
    this.vm.play('draw');
    if (!silent) this.audio?.play?.('knife', { volume: 0.4, pitch: 1.3 });
  }

  switchSlot(slotType = 'primary') {
    const id = slotType === 'primary' ? this.loadout.primary : this.loadout.secondary;
    if (id !== this.activeId) this.equip(id);
  }

  toggleSlot() {
    this.switchSlot(this.activeId === this.loadout.primary ? 'secondary' : 'primary');
  }

  setTrigger(held) {
    this.triggerHeld = Boolean(held);
    if (!held && this.activeSlot) this.activeSlot.state.latch = false;
  }

  /** Tarnungen gibt es nicht mehr (die alten Muster stammten aus dem kommerziellen Spiel). */
  cycleCamo() {
    return null;
  }

  resetActions() {
    this.vm?.stopClip();
  }

  /** Neue Runde: alle Magazine und Reserven wieder voll. */
  refill() {
    for (const s of this.slots.values()) {
      s.state.mag = s.definition.magazineSize;
      s.state.reserve = s.definition.reserveAmmo;
      s.state.reloading = false;
    }
  }

  /** Munitionskiste: Reserven aller Schusswaffen wieder voll (Magazine bleiben). true, wenn etwas gefehlt hat. */
  resupply() {
    let got = false;
    for (const s of this.slots.values()) {
      if (s.definition.melee || s.state.reserve >= s.definition.reserveAmmo) continue;
      s.state.reserve = s.definition.reserveAmmo;
      got = true;
    }
    return got;
  }

  reload() {
    const s = this.activeSlot;
    if (!s || !this.vm || s.definition.melee) return;
    const st = s.state;
    if (st.reloading || st.mag >= s.definition.magazineSize || st.reserve <= 0) return;
    const dur = this.vm.play(st.mag === 0 ? 'reloadEmpty' : 'reloadTac') || 2;
    st.reloading = true;
    st.reloadEnd = performance.now() + dur * 1000 + 200;
  }

  _finishReload(s) {
    const st = s.state;
    if (!st.reloading) return;
    const take = Math.min(s.definition.magazineSize - st.mag, st.reserve);
    st.mag += take;
    st.reserve -= take;
    st.reloading = false;
  }

  _onClipEvent(name, clip) {
    const s = this.activeSlot;
    if (!s) return;
    if (name === 'magout') this.audio?.reloadStart?.();
    else if (name === 'magin') this.audio?.reloadMid?.();
    else if (name === 'charge' || name === 'boltrelease') this.audio?.reloadBolt?.();
    else if (name === 'end' && (clip === 'reloadTac' || clip === 'reloadEmpty')) this._finishReload(s);
  }

  melee() {
    if (!this.vm || !this.activeSlot || this.meleeT > 0) return false;
    const knife = Boolean(this.activeSlot.definition.melee);
    this.meleeKind = knife ? 'slash' : 'bash';
    this.meleeDur = knife ? 0.4 : 0.45;
    this.meleeT = this.meleeDur;
    return true;
  }

  _fire(s) {
    const w = s.definition;
    const st = s.state;
    st.mag--;
    st.latch = true;
    st.cooldown = w.fireMode === 'bolt' ? w.boltTime : 60 / s.def.rpm;
    const pat = st.pattern;
    const n = pat ? pat.length / 2 : 0;
    const i = n ? st.shots % n : 0;
    this.vm.addRecoil(pat ? pat[i * 2] : 0.01, pat ? pat[i * 2 + 1] : 0, st.shots === 0);
    st.shots++;
    this._flash(s);
    this.audio?.shot?.(w.sound);
    if (w.fireMode === 'bolt') setTimeout(() => this.audio?.reloadBolt?.(), 380);
    this.onShotFired?.(w, s.def);
  }

  _flash(s) {
    const f = s.flash;
    if (!f) return;
    f.group.visible = true;
    f.t = 0.06;
    f.star.rotation.z = Math.random() * Math.PI;
    f.group.scale.setScalar((0.85 + Math.random() * 0.3) * f.scale);
    this.vm.muzzleWorld(this.flashLight.position);
    this.flashLight.intensity = 2.5;
  }

  update(dt, { speed = 0, grounded = true, sprinting = false, moving = false, aiming = false } = {}) {
    const s = this.activeSlot;
    const vm = this.vm;
    if (!s || !vm) return;
    const w = s.definition;
    const st = s.state;
    const meleeing = this.meleeT > 0;

    if (st.reloading && performance.now() > st.reloadEnd) this._finishReload(s);   // Sicherheitsnetz

    st.cooldown = Math.max(0, st.cooldown - dt);
    const drawing = vm.clip && vm.clip.name === 'draw' && vm.clipT < vm.clip.duration * 0.55;
    const canFire = !w.melee && !st.reloading && !meleeing && !sprinting && !drawing;
    if (this.triggerHeld && canFire && st.cooldown <= 0 && !(w.fireMode !== 'auto' && st.latch)) {
      if (st.mag > 0) this._fire(s);
      else if (!st.latch) {
        this.audio?.dryFire?.();
        st.latch = true;
        if (st.reserve > 0) this.reload();
      }
    }
    if (!this.triggerHeld) st.shots = 0;

    vm.boltHold = w.boltHold && st.mag === 0 && !st.reloading ? 1 : 0;
    vm.update(dt, {
      ads: aiming && !w.melee && !meleeing && !st.reloading,
      sprint: sprinting && !meleeing,
      lowReady: false,
      speed: moving ? speed : 0,   // main.js liefert die eingestellte Laufgeschwindigkeit auch im Stand
      airborne: !grounded,
      trigger: this.triggerHeld && canFire && st.mag > 0,
      empty: st.mag === 0,
    });
    this._afterUpdate(s, dt);

    // Leeres Magazin: kurz nach dem Loslassen automatisch nachladen
    if (st.mag === 0 && st.reserve > 0 && !st.reloading && !this.triggerHeld && !w.melee) {
      st.autoT += dt;
      if (st.autoT > 0.25) {
        st.autoT = 0;
        this.reload();
      }
    } else {
      st.autoT = 0;
    }
  }

  _afterUpdate(s, dt) {
    const vm = this.vm;
    const rig = vm.rig;
    // Repetierer: Kammerstängel hochklappen, solange der Verschluss läuft
    const lift = s.entry.model.nodes.boltLift;
    const bolt = s.entry.parts.bolt;
    if (lift && bolt) {
      const cyc = vm.boltCycle;
      const stroke = cyc > 0.55 ? (1 - cyc) / 0.45 : cyc / 0.55;
      bolt.rotation.z = lift * Math.min(1, stroke * 3);
    }
    // Mündungsfeuer nach 50 ms ausblenden
    if (s.flash && s.flash.t > 0) {
      s.flash.t -= dt;
      if (s.flash.t <= 0) {
        s.flash.group.visible = false;
        this.flashLight.intensity = 0;
      }
    }
    // Nahkampf: zusätzliche Bewegung über der fertig gelösten Haltung (Arme hängen am Rig)
    if (this.meleeT > 0) {
      this.meleeT = Math.max(0, this.meleeT - dt);
      const u = 1 - this.meleeT / this.meleeDur;
      if (this.meleeKind === 'slash') {
        // Schnitt um die Schulter (wie ein echter Arm): kurz nach rechts ausholen, nach links unten durchziehen
        const yaw = u < 0.15 ? lerp(0, -0.25, smooth(u / 0.15))
          : u < 0.4 ? lerp(-0.25, 0.45, smooth((u - 0.15) / 0.25))
            : lerp(0.45, 0, smooth((u - 0.4) / 0.6));
        const k = u < 0.15 ? 0 : u < 0.4 ? smooth((u - 0.15) / 0.25) : 1 - smooth((u - 0.4) / 0.6);
        _e.set(-0.18 * k, yaw, 0.25 * k, 'XYZ');
        _q.setFromEuler(_e);
        _v.copy(rig.position).sub(SHOULDER_R).applyQuaternion(_q).add(SHOULDER_R);
        rig.position.copy(_v);
        rig.position.z += -0.05 * k;
        rig.quaternion.premultiply(_q);
      } else {
        // Stoß mit der Waffe nach vorne
        const k = u < 0.3 ? smooth(u / 0.3) : 1 - smooth((u - 0.3) / 0.7);
        rig.position.x += -0.035 * k;
        rig.position.y += 0.02 * k;
        rig.position.z += -0.11 * k;
        _e.set(0.18 * k, 0.25 * k, 0.12 * k, 'XYZ');
        _q.setFromEuler(_e);
        rig.quaternion.multiply(_q);
      }
      rig.updateMatrixWorld(true);
    }
  }

  render(renderer) {
    if (!this.vmCtx || !this.activeSlot || this.isScoped) return;
    renderer.clearDepth();
    renderer.render(this.vmCtx.viewScene, this.vmCtx.viewCamera);
  }

  setSize(w, h) {
    if (!this.vmCtx) return;
    const c = this.vmCtx.viewCamera;
    c.aspect = w / h;
    c.updateProjectionMatrix();
  }

  /** Shader der Waffen vorab übersetzen (beim Laden statt beim ersten Bild). */
  compile(renderer) {
    if (this.vmCtx) renderer.compile(this.vmCtx.viewScene, this.vmCtx.viewCamera);
  }

  get currentWeapon() {
    return this.activeSlot?.definition ?? null;
  }

  get ammo() {
    const s = this.activeSlot;
    if (!s) return { mag: 0, reserve: 0, magSize: 30 };
    return { mag: s.state.mag, reserve: s.state.reserve, magSize: s.definition.magazineSize };
  }

  get isAiming() {
    return (this.vm?.adsT ?? 0) > 0.5;
  }

  get isScoped() {
    return Boolean(this.activeSlot?.definition.scope) && (this.vm?.adsT ?? 0) > 0.9;
  }

  get aimBlend() {
    return this.vm?.adsT ?? 0;
  }
}

/* -------------------------------------------------------------------------- */
/*  Wurfgranate für die Spielwelt                                             */
/* -------------------------------------------------------------------------- */
const WORLD_COLORS = {
  steel_soot: '#3b3a35', steel: '#6a6863', alu_fine: '#4a4d52', steel_black: '#34353a', steel_bright: '#a8abb0',
};

/** Die Granate aus grenade.js als Gruppe mit einfachen Weltmaterialien (Vorlage, wird geklont). */
export function buildGrenadeMesh(scale = 1.4) {
  const model = buildGrenade();
  const root = new THREE.Group();
  const mats = {};
  const add = (asm, place) => {
    const g = new THREE.Group();
    for (const [key, geo] of asm.build()) {
      mats[key] ??= new THREE.MeshStandardMaterial({ color: WORLD_COLORS[key] ?? '#555555', roughness: 0.55, metalness: 0.35 });
      const mesh = new THREE.Mesh(geo, mats[key]);
      mesh.castShadow = true;
      g.add(mesh);
    }
    if (place?.pos) g.position.fromArray(place.pos);
    root.add(g);
  };
  add(model.body);
  add(model.moving.spoon, model.nodes.spoonPivot);
  add(model.moving.pin, model.nodes.pinPivot);
  root.scale.setScalar(scale);
  return root;
}
