// Brücke: das übernommene Gewehr-Viewmodel (Modell, Hände, Animationen — MIT, siehe
// LICENSE in diesem Ordner) OHNE die schwere Textur-Engine des Original-Projekts.
//
// Statt GPU-gebackener Triplanar-Texturen bekommt jede Oberfläche ein einfaches
// MeshStandardMaterial plus einen kleinen Shader-Zusatz, der die beim Bau gebackenen
// Krümmungs-Masken (vColor: r = Kantenabrieb, g = Schmutz in Ritzen, b = Kontakt-AO)
// und eine prozedurale Objekt-Raum-Körnung auswertet. Kostet nur ein paar ALU-Takte
// pro Pixel, keine einzige Textur → passt auf 2 GB VRAM.
import * as THREE from 'three';
import { bakeMasks } from './masks.js';
import { WeaponMaterials } from './materials.js';
import { Viewmodel } from './viewmodel.js?v=3';
import { WEAPON_DEFS } from './defs.js';
import { buildRifle } from './models/rifle.js';
import { buildSmg } from './models/smg.js';
import { buildPistol } from './models/pistol.js';
import { Rng } from './rng.js';

/**
 * key -> Look. Farben sRGB. wear* = blankes Material an abgegriffenen Kanten,
 * grain = Körnung (Frequenz pro Meter, Stärke).
 */
const LOOK = {
  alu:          { color: '#2b2e34', rough: 0.62, metal: 0.0,  wear: '#6c7076', wearRough: 0.36, wearMetal: 0.8, grain: [190, 0.30] },
  alu_fine:     { color: '#1f2125', rough: 0.55, metal: 0.0,  wear: '#5c6066', wearRough: 0.36, wearMetal: 0.8, grain: [260, 0.22] },
  steel:        { color: '#33322f', rough: 0.48, metal: 0.7,  wear: '#9a9da1', wearRough: 0.26, wearMetal: 1.0,  grain: [150, 0.25] },
  steel_soot:   { color: '#141312', rough: 0.72, metal: 0.12, wear: '#4a4b4c', wearRough: 0.5,  wearMetal: 0.6,  grain: [220, 0.40] },
  steel_bright: { color: '#77797e', rough: 0.40, metal: 1.0,  wear: '#a9acb0', wearRough: 0.25, wearMetal: 1.0,  grain: [300, 0.15] },
  steel_black:  { color: '#28292c', rough: 0.40, metal: 0.8,  wear: '#868b92', wearRough: 0.25, wearMetal: 1.0,  grain: [200, 0.20] },
  polymer:      { color: '#302e2b', rough: 0.70, metal: 0.0,  wear: '#4d5054', wearRough: 0.55, wearMetal: 0.0,  grain: [330, 0.45] },
  polymer_tan:  { color: '#9a8364', rough: 0.70, metal: 0.0,  wear: '#b4a284', wearRough: 0.55, wearMetal: 0.0,  grain: [330, 0.35] },
  rubber:       { color: '#272523', rough: 0.90, metal: 0.0,  wear: '#3a3836', wearRough: 0.8,  wearMetal: 0.0,  grain: [280, 0.45] },
  brass:        { color: '#b58c47', rough: 0.34, metal: 1.0,  wear: '#e6c88c', wearRough: 0.2,  wearMetal: 1.0,  grain: [300, 0.12] },
  copper:       { color: '#b3714f', rough: 0.36, metal: 1.0,  wear: '#d9a271', wearRough: 0.2,  wearMetal: 1.0,  grain: [300, 0.12] },
  glove:        { color: '#4d4034', rough: 0.92, metal: 0.0,  wear: '#2c241c', wearRough: 0.95, wearMetal: 0.0,  grain: [420, 0.40] },
  glove_pad:    { color: '#2b231d', rough: 0.95, metal: 0.0,  wear: '#3b3026', wearRough: 0.9,  wearMetal: 0.0,  grain: [380, 0.35] },
  glove_seam:   { color: '#5e4e3d', rough: 0.90, metal: 0.0,  wear: '#3a2d20', wearRough: 0.9,  wearMetal: 0.0,  grain: [500, 0.30] },
  sleeve:       { color: '#46412f', rough: 0.95, metal: 0.0,  wear: '#5c5442', wearRough: 0.95, wearMetal: 0.0,  grain: [160, 0.40] },
};

const GRIME = new THREE.Color('#0b0a08');

function patchShader(mat, look) {
  const u = {
    uWearCol: { value: new THREE.Color(look.wear) },
    uWearRough: { value: look.wearRough },
    uWearMetal: { value: look.wearMetal },
    uGrimeCol: { value: GRIME },
    uGrain: { value: new THREE.Vector2(look.grain[0], look.grain[1]) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        #ifndef USE_COLOR
        attribute vec3 color;
        #endif
        varying vec3 vMask; varying vec3 vObj;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vMask = color; vObj = position;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uWearCol; uniform float uWearRough; uniform float uWearMetal;
        uniform vec3 uGrimeCol; uniform vec2 uGrain;
        varying vec3 vMask; varying vec3 vObj;
        float rodH(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float rodN(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(rodH(i),rodH(i+vec3(1,0,0)),f.x), mix(rodH(i+vec3(0,1,0)),rodH(i+vec3(1,1,0)),f.x), f.y),
                     mix(mix(rodH(i+vec3(0,0,1)),rodH(i+vec3(1,0,1)),f.x), mix(rodH(i+vec3(0,1,1)),rodH(i+vec3(1,1,1)),f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float rodG = rodN(vObj*uGrain.x)*0.62 + rodN(vObj*uGrain.x*3.7+7.1)*0.38;   // Körnung 0..1
        float rodWear = clamp(vMask.r*(0.3+0.8*rodG), 0.0, 0.9);                   // Abrieb bricht unregelmäßig durch
        diffuseColor.rgb *= 1.0 + (rodG-0.5)*uGrain.y;
        diffuseColor.rgb = mix(diffuseColor.rgb, uGrimeCol, clamp(vMask.g*0.6, 0.0, 0.85));
        diffuseColor.rgb = mix(diffuseColor.rgb, uWearCol, rodWear);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(clamp(roughnessFactor*(1.0+(rodG-0.5)*0.45), 0.04, 1.0), uWearRough, rodWear);
        roughnessFactor = mix(roughnessFactor, 1.0, clamp(vMask.g*0.5, 0.0, 1.0));`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, uWearMetal, rodWear);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        float rodAo = 1.0 - clamp(vMask.b, 0.0, 1.0)*0.5 - clamp(vMask.g, 0.0, 1.0)*0.25;
        reflectedLight.indirectDiffuse *= rodAo; reflectedLight.indirectSpecular *= rodAo;
        reflectedLight.directDiffuse *= mix(1.0, rodAo, 0.6);`);
  };
  mat.customProgramCacheKey = () => 'rod-weapon-lite';
}

/** Gleiches Material-Interface wie das Original, nur mit leichten Materialien. */
class LiteWeaponMaterials extends WeaponMaterials {
  constructor(ctx) {
    super(ctx);
    // Nur der Masken-Bäcker wird von der Bibliothek gebraucht (reine CPU-Arbeit beim Laden).
    this.lib = { bakeMasks: (geo, opts) => bakeMasks(geo, opts) };
  }

  get(key) {
    const look = LOOK[key];
    if (!look) return super.get(key);   // cavity, optic_tube, lens_*, reticle …
    let m = this.cache.get(key);
    if (m) return m;
    m = new THREE.MeshStandardMaterial({ color: look.color, roughness: look.rough, metalness: look.metal });
    m.name = `rod-${key}`;
    patchShader(m, look);
    this.cache.set(key, m);
    this.owned.push(m);
    return m;
  }

  /** Optik-Glas: schlichtes, transparentes Standard-Material statt Iridescence/Sheen. */
  glass() {
    let m = this.cache.get('glass');
    if (m) return m;
    m = new THREE.MeshStandardMaterial({
      color: 0x1a2c36, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0,
      envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false,
    });
    m.name = 'rod-optic-glass';
    this.cache.set('glass', m);
    this.owned.push(m);
    return m;
  }
}

/** Kleine Dämmerungs-Umgebung (PMREM, einmalig) — damit Metall etwas zu spiegeln hat. */
function makeEnvironment(renderer) {
  const s = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vD; void main(){
        vec3 d = normalize(vD);
        vec3 top = vec3(0.10,0.13,0.26), mid = vec3(0.42,0.25,0.36), hor = vec3(0.95,0.58,0.32), gnd = vec3(0.10,0.08,0.07);
        vec3 c = d.y > 0.0 ? mix(hor, mix(mid, top, smoothstep(0.25,1.0,d.y)), smoothstep(0.0,0.25,d.y))
                           : mix(hor*0.5, gnd, smoothstep(0.0,0.3,-d.y));
        c += vec3(1.0,0.86,0.66) * pow(max(dot(d, normalize(vec3(-0.42,0.12,-0.9))),0.0), 24.0) * 3.0;
        gl_FragColor = vec4(c,1.0); }`,
    })
  );
  s.add(dome);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(s, 0.02, 0.1, 20);
  pmrem.dispose();
  dome.geometry.dispose(); dome.material.dispose();
  return rt.texture;
}

/**
 * Baut die Viewmodel-Szene: eigene Kamera (Near 5 mm → Hände/Gewehr werden nie vom
 * Near-Plane abgeschnitten und stecken nie in Wänden), kamera-feste Lichter wie im
 * Original (Key oben-links, kühles Fill, warmer Rim von hinten, Boden-Bounce).
 */
export function createViewmodel(renderer, camera, entries = null) {
  const viewScene = new THREE.Scene();
  const viewCamera = new THREE.PerspectiveCamera(60, camera.aspect, 0.005, 12);
  viewScene.add(viewCamera);

  const rig = [
    ['#ffd9b0', 2.2, [-0.45, 0.75, 0.55]],   // Key (warm, Dämmerung)
    ['#9ec4ff', 0.55, [0.6, -0.15, 0.5]],    // Fill (kühl)
    ['#ffb070', 1.3, [0.2, 0.35, -0.9]],     // Rim (Sonne von hinten)
    ['#ff9a5c', 0.45, [-0.2, -0.86, 0.47]],  // Bounce vom warmen Boden
  ];
  for (const [col, int, dir] of rig) {
    const l = new THREE.DirectionalLight(col, int);
    l.position.fromArray(dir);
    l.target.position.set(0, 0, 0);
    viewCamera.add(l, l.target);
  }
  viewScene.add(new THREE.HemisphereLight('#8ea0cc', '#3a2c26', 0.35));
  viewScene.environment = makeEnvironment(renderer);
  viewScene.environmentIntensity = 0.5;

  const ctx = {
    camera, viewCamera, viewScene,
    rng: new Rng(0x7ab1d00d),
    peek: () => null, get: () => null, has: () => false,
  };
  const mats = new LiteWeaponMaterials(ctx);
  const vm = new Viewmodel(ctx, mats);
  vm.trackCamera = true;

  // entries: [[model, def], …]; ohne Angabe die drei Grundwaffen
  const list = entries ?? [
    [buildRifle(), WEAPON_DEFS.rifle],
    [buildSmg(), WEAPON_DEFS.smg],
    [buildPistol(), WEAPON_DEFS.pistol],
  ];
  const defs = {};
  const entriesById = {};
  for (const [model, base] of list) {
    const def = { ...base };
    def.cycleTime = 60 / def.rpm;
    entriesById[model.id] = vm.addWeapon(model, def);
    defs[model.id] = def;
  }
  const firstId = list[0][0].id;
  vm.setActive(firstId);
  return { vm, viewScene, viewCamera, mats, defs, entries: entriesById, def: defs[firstId] };
}
