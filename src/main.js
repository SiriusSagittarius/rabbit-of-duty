// Rabbit of Duty — schlanker Three.js-FPS.
// Forward-Renderer + gebackenes-Look-Licht + billige FX = läuft auch auf schwacher GPU.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Net } from './net.js?v=2';
import { AudioManager } from './audio.js?v=5';
import { Music } from './music.js?v=3';
import { Arsenal, buildGrenadeMesh } from './arsenal.js?v=7';
import { createBroom } from './broom.js?v=2';
import { buildAtriumLevel } from './atrium-level.js?v=3';
import { buildOsmLevel, showOsmCredit } from './osm-level.js?v=24';
import { pointInPoly, closestOnPoly, segHitsPoly } from './poly2d.js';
import { NavMap } from './navmap.js?v=3';
import { loadPak } from './zombie-pak.js?v=1';
import { createPickups } from './pickups.js?v=1';
import { fetchTop, submitScore, renderTop } from './highscore.js?v=1';

// 3D-Shooter Soldaten-Template (GLTF-Modell mit Skelett & Animationen)
let soldierTemplate = null;
let zombieTemplate = null;     // echtes Zombie-Modell (verschlüsselt in assets/models/zombie/, siehe README) – fehlt es, gibt es Ersatz-Zombies

// ----------------------------------------------------------------------------
// DOM
// ----------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const boot = {
  el: $('boot'), bar: $('boot-bar'), status: $('boot-status'),
  say(t){ this.status.textContent = t; },
  prog(f){ this.bar.style.width = Math.round(Math.max(0,Math.min(1,f))*100) + '%'; },
  done(){ this.el.classList.add('hide'); setTimeout(()=>this.el.remove(), 700); },
};
const ui = {
  start: $('start'), pause: $('pause'), gameover: $('gameover'),
  score: $('score'), combo: $('combo'),
  healthNum: $('healthNum'), healthFill: $('healthFill'),
  ammoNum: $('ammoNum'), ammoRes: $('ammoRes'), wave: $('wave').querySelector('.num'),
  weaponName: $('weaponName'), grenadeNum: $('grenadeNum'),
  reloadHint: $('reloadHint'), crosshair: $('crosshair'), banner: $('banner'), damageFlash: $('damageFlash'),
  popups: $('popups'), hitmarker: $('hitmarker'), finalScore: $('finalScore'), record: $('record'),
  sniperScope: $('sniperScope'), sniperScopeImg: $('sniperScopeImg'),
  stanceWrap: $('stanceWrap'), stanceIcon: $('stanceIcon'), stanceLabel: $('stanceLabel'),
};
const audio = new AudioManager();
const music = new Music();   // Menü-Track + Hauptspiel-Schleife (src/music.js)
// Browser erlauben Ton erst nach einer Nutzer-Geste → beim ersten Klick/Tastendruck freischalten
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { audio.ensure(); music.unlock(audio.ctx); }, true);

// ----------------------------------------------------------------------------
// Renderer / Szene / Kamera  (leicht: kein Deferred, kein teures Post)
// ----------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// Auflösung: Start mit höchstens 1 Pixel je CSS-Pixel; danach regelt resCtl (unten) nach gemessener GPU-Zeit nach
const MAX_PR = Math.min(window.devicePixelRatio || 1, 2);
const MIN_PR = Math.min(MAX_PR, 0.6);
const FIXED_PR = parseFloat(localStorage.getItem('rod.res'));      // optional fest: localStorage 'rod.res' = z. B. 1
renderer.setPixelRatio(FIXED_PR > 0 ? Math.min(FIXED_PR, 2) : Math.min(MAX_PR, 1));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // r183 stellt PCFSoft beim ersten Bild ohnehin hierauf um (sonst passen vorab übersetzte Shader nicht)

const scene = new THREE.Scene();
const HORIZON = new THREE.Color('#f0a24e');           // Dämmerungs-Horizont (Sky-Bottom)
const FOGC = new THREE.Color('#e0894e');
scene.fog = new THREE.FogExp2(FOGC, 0.0108);          // Dunst vereinheitlicht Palette + blendet Horizont weich

const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.05, 500);
camera.position.set(0, 1.7, 8);
scene.add(camera);

// Himmelskuppel (Gradient-Shader, sehr billig)
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(300, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top:{value:new THREE.Color('#1a2452')}, mid:{value:new THREE.Color('#7a3b6e')}, bot:{value:FOGC},
      sunDir:{value:new THREE.Vector3(-0.42,0.06,-0.9).normalize()}, sunCol:{value:new THREE.Color('#ffdca6')},
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vDir; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol;
      void main(){
        float h = vDir.y;
        vec3 col = h < 0.32 ? mix(bot, mid, smoothstep(-0.05,0.32,h)) : mix(mid, top, smoothstep(0.32,1.0,h));
        float glow = pow(max(dot(vDir, sunDir),0.0), 7.0);
        col += sunCol * glow * 0.7;
        col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453)-0.5)/255.0; // Dither gegen Banding
        gl_FragColor = vec4(col,1.0);
      }`,
  })
);
scene.add(sky);

// Mini-Sonnenscheibe am Horizont (additiver Glow-Sprite) → Blickzentrum + Licht-Motivation
const glowTex = (()=>{ const c=document.createElement('canvas'); c.width=c.height=128; const g=c.getContext('2d');
  const gr=g.createRadialGradient(64,64,0,64,64,64); gr.addColorStop(0,'rgba(255,242,214,1)'); gr.addColorStop(0.22,'rgba(255,208,150,0.75)'); gr.addColorStop(1,'rgba(255,170,110,0)');
  g.fillStyle=gr; g.fillRect(0,0,128,128); return new THREE.CanvasTexture(c); })();
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, fog:false }));
sunSprite.position.set(-0.42,0.055,-0.9).normalize().multiplyScalar(260); sunSprite.scale.set(130,130,1);
scene.add(sunSprite);
// Himmel + Sonnenscheibe wandern mit der Kamera (große Karten: sonst verlässt man die Himmelskugel)
const skyRig = new THREE.Group();
scene.add(skyRig); skyRig.add(sky, sunSprite);
sky.renderOrder = -1;

// Licht: Hemisphäre (Ambient-Look) + warme Sonne mit Schatten
const hemi = new THREE.HemisphereLight('#8ea0cc', '#2a2438', 0.62);
scene.add(hemi);
const amb = new THREE.AmbientLight('#2a2438', 0.34); scene.add(amb);   // kühles Füll-Ambient → farbige Schatten
const sun = new THREE.DirectionalLight('#ff9d5c', 3.0);
sun.position.set(-60, 22, -40);   // flach von hinten-links → lange Schatten, Kantenlicht
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

// ----------------------------------------------------------------------------
// Prozedurale Texturen (Canvas → keine Dateien, kein Copyright)
// ----------------------------------------------------------------------------
function noiseCanvas(size, base, spec, cb){
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0,0,size,size);
  cb(g, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
const groundTex = noiseCanvas(256, '#c68a4e', null, (g,s)=>{
  // weiche, tonwertarme Flecken (±~8% Helligkeit), große Skala statt buntem Rauschen
  for(let i=0;i<260;i++){ const x=Math.random()*s,y=Math.random()*s,r=6+Math.random()*22;
    g.fillStyle = Math.random()<0.5 ? 'rgba(90,60,30,0.10)' : 'rgba(235,195,140,0.10)';
    g.beginPath(); g.arc(x,y,r,0,7); g.fill(); }
  for(let i=0;i<420;i++){ g.fillStyle='rgba(70,50,28,0.16)'; const x=Math.random()*s,y=Math.random()*s;
    g.beginPath(); g.arc(x,y,Math.random()*1.2,0,7); g.fill(); }
});
groundTex.repeat.set(18,18);
// Gebäude-Diffus: dunkel, ruhige großflächige Variation (kein Camo-Rauschen)
const wallDiff = noiseCanvas(128, '#3a3230', null, (g,s)=>{
  for(let i=0;i<44;i++){ g.fillStyle = Math.random()<0.5?'rgba(20,16,15,0.28)':'rgba(84,72,64,0.14)';
    const x=Math.random()*s,y=Math.random()*s,r=10+Math.random()*30; g.beginPath(); g.arc(x,y,r,0,7); g.fill(); }
});
// Emissive-Map: schwarz + orange glühende Fenster-Reihen (Theme-Wärme + Fokuspunkte)
const wallEmis = noiseCanvas(128, '#000000', null, (g,s)=>{
  const cols=5, rows=5, pad=12, w=(s-pad*2)/cols, h=(s-pad*2)/rows;
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){ if(Math.random()<0.45) continue;   // ~45% aus → Rhythmus statt Raster
    const ww=w*(0.5+Math.random()*0.28), hh=h*(0.55+Math.random()*0.3);
    const x=pad+c*w+(w-ww)/2, y=pad+r*h+(h-hh)/2;
    let core='rgba(255,158,61,1)', frame='rgba(150,70,15,1)';                          // sattes Warm-Orange, dunkler Rahmen (nicht ausgebrannt)
    const t=Math.random(); if(t<0.03){ core='rgba(130,180,110,1)'; frame='rgba(34,72,30,1)'; } else if(t<0.05){ core='rgba(225,110,150,1)'; frame='rgba(100,32,64,1)'; }  // grün/pink seltener + entsättigt (Fix #3)
    g.fillStyle=frame; g.fillRect(x,y,ww,hh);
    g.fillStyle=core;  g.fillRect(x+ww*0.18,y+hh*0.18,ww*0.64,hh*0.64); }
});
// Kontakt-Schatten-Textur (Feinde + Props) — früh definiert, damit die Welt sie nutzen kann
const blobTex = (()=>{ const c=document.createElement('canvas'); c.width=c.height=64; const g=c.getContext('2d');
  const grd=g.createRadialGradient(32,32,2,32,32,32); grd.addColorStop(0,'rgba(0,0,0,.5)'); grd.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=grd; g.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); })();
const matBarrel = new THREE.MeshStandardMaterial({ color:'#5a4a2e', roughness:.6, metalness:.4 });

// ----------------------------------------------------------------------------
// Welt & Karten-System (6 verschiedene Einsatzgebiete inkl. Atrium & OSM)
// ----------------------------------------------------------------------------
export const MAP_CONFIGS = [
  {
    id: 'much',                       // interne Kennung bleibt 'much' (Datenordner assets/nrw/much, Bestenliste)
    name: 'Muchtown',
    type: 'Ortskern Much, Bergisches Land (Standard)',
    badge: 'Echte Welt · Heimat',
    desc: 'Muchtown ist der echte Ortskern von Much, von der Zanderstraße über Hauptstraße und Talstraße bis zur Schulstraße (930 × 540 m): echtes Gelände mit allen Hügeln, alle Häuser in echter Form, Höhe und Dachform (3D-Gebäudemodell NRW), Dächer und Boden aus dem Luftbild, Bäume an ihren echten Standorten.',
    thumb: 'ui/map_much.svg',
  },
  {
    id: 'sunset',
    name: 'Dämmerungs-Stadt',
    type: 'Stadt-Arena',
    badge: 'Klassiker',
    desc: 'Wolkenkratzer im warmen Abendrot mit leuchtenden Fensterfronten, Kisten & Sandsack-Stellungen.',
    thumb: 'ui/maps/sunset.png',
  },
  {
    id: 'atrium',
    name: 'Luxus-Atrium',
    type: 'Wolkenkratzer (4 Etagen & Antigrav)',
    badge: 'Luxus & Auftrieb',
    desc: 'Mehrstöckiges Atrium mit poliertem Carrara-Marmor, Gold-Geländern, 4 Galerie-Etagen, Säulen-Deckung und 2 Antigravity-Aufzugsschächten.',
    thumb: 'ui/maps/atrium.png',
  },
  {
    id: 'osm',
    name: 'OpenStreetMap 3D',
    type: 'Potsdamer Platz Berlin (Overpass API)',
    badge: 'Echte Welt · OSM',
    desc: 'Reale 3D-Stadtkulisse aus echten OpenStreetMap-Daten mit originalen Berliner Wolkenkratzern wie dem 103m Bahntower.',
    thumb: 'ui/maps/osm.png',
  },
  {
    id: 'warehouse',
    name: 'Industrie-Lagerhalle',
    type: 'CQB-Hangar (aus 3D-Shooter)',
    badge: 'Nahkampf',
    desc: 'Überdachte Fabrikhalle mit glattem Betonboden, Deckenlampen, Kisten-Labyrinthen, Regalen & Fässern.',
    thumb: 'ui/maps/warehouse.png',
  },
  {
    id: 'desert',
    name: 'Wüsten-Außenposten',
    type: 'Offroad-Dünen (aus 3D-Shooter)',
    badge: 'Scharfschütze',
    desc: 'Weitläufige Wüste mit Sanddünen, Betonbunkern, Wachtürmen und langen Sichtachsen für Scharfschützen.',
    thumb: 'ui/maps/desert.png',
  },
  {
    id: 'night',
    name: 'Nacht-Einsatz',
    type: 'Taktische Mitternacht',
    badge: 'Nachtsicht',
    desc: 'Dunkle urbane Stadt bei Mitternacht mit blauem Mondschein, Mitternachtsnebel und dramatischem Licht.',
    thumb: 'ui/maps/night.png',
  },
];

// Standardkarte ist Muchtown. Einmalig auch für alle, die sich schon eine andere Karte gemerkt hatten;
// danach bleibt die eigene Wahl erhalten.
if (localStorage.getItem('rod.defaultMap') !== 'much') {
  localStorage.setItem('rod.map', 'much');
  localStorage.setItem('rod.defaultMap', 'much');
}
let currentMapId = localStorage.getItem('rod.map') || 'much';
let yaw = Math.PI, pitch = 0, ads = false, firing = false;
let stance = 'stand'; // 'stand' | 'crouch' | 'prone'
const STAND_HEIGHT = 1.70;
const CROUCH_HEIGHT = 1.08;
const PRONE_HEIGHT = 0.45;
const player = { hp: 100, maxHp: 100, vy: 0, onGround: true, height: STAND_HEIGHT, targetHeight: STAND_HEIGHT, radius: 0.4 };
let mapSpawn = { x: 0, z: 8, yaw: Math.PI };   // Startpunkt der aktuellen Karte (auch für Neustart)
let mapLoadToken = 0;
let terrainAt = null;                         // (x,z) => Geländehöhe der aktuellen Karte (NRW-Kulissen), null = flach
function groundAt(x, z) { return terrainAt ? terrainAt(x, z) : 0; }
let mapTick = null;                           // (camera) => void, z. B. Detailstufen der Much-Kulisse, je Bild
let nav = null;                               // Karte & Navi (src/navmap.js), wird unten angelegt
const obstacles = []; // {minX,maxX,minZ,maxZ,minY,maxY,top} — alle Deckung, für 3D-Kollision
const floorPlates = []; // {minX,maxX,minZ,maxZ,y,label} — begehbare Etagen-Böden
const liftZones = []; // {minX,maxX,minZ,maxZ,minY,maxY,liftForce,label} — Antigravity-Auftriebszonen
const ARENA = 70;
const LOS_MIN_H = 1.4; // Hindernisse ab ~Schulterhöhe blocken die Sichtlinie; kleine Kisten nicht

// Spielflächen als Rechteck: halbe Kantenlängen Ost-West (x) und Nord-Süd (z) in Metern
const BIG_BOUND = { much: { x: 465, z: 270 } };   // 930 × 540 m: Zanderstraße – Hauptstraße – Talstraße – Schulstraße (Much)
function getMapBounds() {
  if (currentMapId === 'atrium') return { x: 26, z: 26 };
  if (currentMapId === 'warehouse') return { x: 30, z: 30 };
  return BIG_BOUND[currentMapId] || { x: ARENA, z: ARENA };
}
function getMapBound() { const b = getMapBounds(); return Math.max(b.x, b.z); }   // größere Halbkante (z. B. für „große Karte?“)

function getFloorHeight(x, z, footY) {
  let highest = groundAt(x, z);
  for (const f of floorPlates) {
    if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ) {
      if (f.y <= footY + 0.45) {
        if (f.y > highest) highest = f.y;
      }
    }
  }
  return highest;
}

const mapGroup = new THREE.Group();
scene.add(mapGroup);

function addObstacle(mesh){
  const b = new THREE.Box3().setFromObject(mesh);
  const o = { minX:b.min.x-0.3, maxX:b.max.x+0.3, minZ:b.min.z-0.3, maxZ:b.max.z+0.3, top:b.max.y };
  obstacles.push(o); return o;
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA*2+40, ARENA*2+40),
  new THREE.MeshStandardMaterial({ map:groundTex, roughness:1, metalness:0 })
);
ground.rotation.x = -Math.PI/2; ground.receiveShadow = true;
scene.add(ground);
const worldColliders = [ground];   // statische Trefferziele fürs Schießen

function groundBlob(x,z,r=0.8){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(r*2.4,r*2.4),
    new THREE.MeshBasicMaterial({ map:blobTex, transparent:true, depthWrite:false }));
  m.rotation.x=-Math.PI/2; m.position.set(x,0.02,z); mapGroup.add(m);
}

const matWall = new THREE.MeshStandardMaterial({ map:wallDiff, emissiveMap:wallEmis, emissive:'#ffffff', emissiveIntensity:0.85, roughness:.9, metalness:0, color:'#4a4038' });
const matPerimeter = new THREE.MeshStandardMaterial({ map:wallDiff, roughness:.95, metalness:0, color:'#2b2622' });
const matCrate = new THREE.MeshStandardMaterial({ color:'#7a5330', roughness:.8, metalness:0 });
const matBag = new THREE.MeshStandardMaterial({ color:'#8a7a4a', roughness:1, metalness:0 });
const matBag2 = new THREE.MeshStandardMaterial({ color:'#6e5f36', roughness:1, metalness:0 });

function building(x,z,w,h,d,rot=0,mat=matWall){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x, h/2, z); m.rotation.y = rot; m.castShadow = m.receiveShadow = true;
  mapGroup.add(m); addObstacle(m); worldColliders.push(m);
  if(mat===matWall){
    const base=new THREE.Mesh(new THREE.BoxGeometry(w+0.4,0.7,d+0.4), matPerimeter); base.position.set(x,0.35,z); base.rotation.y=rot; base.castShadow=base.receiveShadow=true; mapGroup.add(base); worldColliders.push(base);
    const para=new THREE.Mesh(new THREE.BoxGeometry(w+0.5,0.5,d+0.5), matPerimeter); para.position.set(x,h+0.1,z); para.rotation.y=rot; para.castShadow=true; mapGroup.add(para); worldColliders.push(para);
  }
  return m;
}

function crate(x,z,s=1.4){
  const m = new THREE.Mesh(new THREE.BoxGeometry(s,s,s), matCrate);
  m.position.set(x, s/2, z); m.rotation.y = Math.random()*0.5; m.castShadow = m.receiveShadow = true;
  mapGroup.add(m); addObstacle(m); worldColliders.push(m); groundBlob(x,z,s*0.85); return m;
}

function barrel(x,z){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.46,1.4,12), matBarrel);
  m.position.set(x,0.7,z); m.rotation.y=Math.random()*0.6; m.castShadow=m.receiveShadow=true;
  mapGroup.add(m); addObstacle(m); worldColliders.push(m); groundBlob(x,z,0.85); return m;
}

function sandbags(x,z,len=5,rot=0){
  const g = new THREE.Group();
  for(let i=0;i<len;i++){ const b=new THREE.Mesh(new THREE.CapsuleGeometry(0.45,0.7,4,8), i%2?matBag2:matBag);
    b.rotation.z=Math.PI/2; b.position.set(i*0.9-len*0.45,0.45,0); b.castShadow=b.receiveShadow=true; g.add(b);
    const b2=b.clone(); b2.material = i%2?matBag:matBag2; b2.position.y=1.2; b2.position.x+=0.4; g.add(b2); }
  g.position.set(x,0,z); g.rotation.y=rot; mapGroup.add(g); addObstacle(g); worldColliders.push(g); groundBlob(x,z,len*0.5); return g;
}

// Munitionskisten (src/pickups.js): nur im Einzelspieler, füllen die Reserven auf
const crates = createPickups({
  scene, groundAt,
  blocked: (x, z, r) => pointBlocked(x, z, r),
  bounds: () => getMapBounds(),
  small: () => currentMapId === 'warehouse' || currentMapId === 'atrium',
  onPickup: () => onCratePickup(),
});

const pickups = [];
function carrot(x,z){
  return null;
}

function loadMap(mapId = 'much') {
  currentMapId = mapId;
  broom.reset();
  localStorage.setItem('rod.map', mapId);

  // Vorherige Objekte aufräumen
  while (mapGroup.children.length > 0) {
    const obj = mapGroup.children[0];
    mapGroup.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.userData.dispose) obj.userData.dispose();     // z. B. weitere Detailstufen der Geländekacheln
  }
  mapTick = null;
  nav?.reset();                                         // Ziel/Route gehören zur alten Karte
  obstacles.length = 0;
  floorPlates.length = 0;
  liftZones.length = 0;
  worldColliders.length = 0;
  worldColliders.push(ground);
  for (const p of pickups) scene.remove(p);
  pickups.length = 0;
  crates.clear();
  showOsmCredit(null);
  terrainAt = null;
  ground.visible = true;
  const loadToken = ++mapLoadToken;

  if (mapId === 'atrium') {
    // -------------------------------------------------------------
    // MAP 5: Mehrstöckiges Luxus-Wolkenkratzer-Atrium (4 Etagen + Antigrav)
    // -------------------------------------------------------------
    buildAtriumLevel({
      scene, mapGroup, obstacles, worldColliders, floorPlates, liftZones,
      hemi, amb, sun, sunSprite, sky, ground, camera, player
    });

  } else if (mapId === 'osm' || mapId === 'much') {
    // -------------------------------------------------------------
    // MAP 6/7: OpenStreetMap-Kulissen (Potsdamer Platz Berlin / Much) – Daten aus assets/osm/
    // -------------------------------------------------------------
    buildOsmLevel({
      scene, mapGroup, obstacles, worldColliders, floorPlates,
      hemi, amb, sun, sunSprite, sky, ground, camera, player, ARENA: getMapBound(), bounds: getMapBounds(),
      isActive: () => loadToken === mapLoadToken,
      setTerrain: (fn) => { if (loadToken === mapLoadToken) terrainAt = fn; },
      setTick: (fn) => { if (loadToken === mapLoadToken) mapTick = fn; },
    }, mapId === 'much' ? 'much' : 'potsdamer').then(info => {
      if (!info || loadToken !== mapLoadToken) return;
      mapSpawn = { ...info.spawn };
      camera.position.set(mapSpawn.x, groundAt(mapSpawn.x, mapSpawn.z) + player.height, mapSpawn.z); yaw = mapSpawn.yaw; pitch = 0;
      player.vy = 0;
      nav?.setLevel({ layers: info.mapLayers, roads: info.roads });   // Luftbild + Straßen für Karte & Navi
      // Gegner der laufenden Welle an den Startpunkt holen (große Karten: alle, sonst nur die in Häusern)
      const big = getMapBound() > 120;
      for (const e of enemies) {
        if (e.dead || (!big && !pointBlocked(e.g.position.x, e.g.position.z, 1.2))) continue;
        const p = freeSpotNear(mapSpawn.x, mapSpawn.z); e.g.position.set(p.x, groundAt(p.x, p.z), p.z);
      }
      warmUpGpu(true);                                    // inkl. Geometrie aller Kacheln (große Karten)
    });

  } else if (mapId === 'warehouse') {
    floorPlates.push({ minX: -60, maxX: 60, minZ: -60, maxZ: 60, y: 0, label: 'Lagerhalle Boden' });
    // -------------------------------------------------------------
    // MAP 2: Industrie-Lagerhalle CQB (aus 3D-Shooter)
    // -------------------------------------------------------------
    ground.material.map = null;
    ground.material.color.set('#3a3e47');
    ground.material.roughness = 0.85;

    scene.fog = new THREE.FogExp2('#202532', 0.005);
    hemi.color.set('#c0d2ee');
    hemi.groundColor.set('#3a3e47');
    hemi.intensity = 1.4;
    amb.color.set('#4a5266');
    amb.intensity = 1.1;
    sun.color.set('#fff2d8');
    sun.intensity = 2.4;
    sun.position.set(0, 12, 0);
    sunSprite.visible = false;

    sky.material.uniforms.top.value.set('#161a24');
    sky.material.uniforms.mid.value.set('#202532');
    sky.material.uniforms.bot.value.set('#2a3040');

    const H = 14, W = 64;
    // 4 Hallenwände
    building(0, -W/2, W, H, 2, 0, matPerimeter);
    building(0,  W/2, W, H, 2, 0, matPerimeter);
    building(-W/2, 0, 2, H, W, 0, matPerimeter);
    building( W/2, 0, 2, H, W, 0, matPerimeter);

    // Decke
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(W, 1, W), new THREE.MeshStandardMaterial({ color: '#1e2126', roughness: 1 }));
    ceil.position.y = H + 0.5; mapGroup.add(ceil);

    // Decken-Lichtpaneele
    const panelMat = new THREE.MeshStandardMaterial({ color: '#fff4d0', emissive: '#ffdca0', emissiveIntensity: 1.2 });
    for (let gx = -1; gx <= 1; gx++) {
      for (let gz = -1; gz <= 1; gz++) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(7, 0.4, 7), panelMat);
        panel.position.set(gx * 18, H - 0.3, gz * 18);
        mapGroup.add(panel);
      }
    }

    const whLight1 = new THREE.PointLight('#ffe4b5', 2.8, 48, 1.2);
    whLight1.position.set(-10, 11, -8); mapGroup.add(whLight1);
    const whLight2 = new THREE.PointLight('#ffe4b5', 2.8, 48, 1.2);
    whLight2.position.set(10, 11, 8); mapGroup.add(whLight2);

    // Stützpfeiler
    const matPillar = new THREE.MeshStandardMaterial({ color: '#383c44', roughness: 0.8, metalness: 0.3 });
    for (const px of [-16, 16]) {
      for (const pz of [-16, 16]) {
        building(px, pz, 1.6, H, 1.6, 0, matPillar);
      }
    }

    // Regale & Kisten-Labyrinth
    for (let i = -18; i <= 18; i += 12) {
      if (Math.abs(i) < 4) continue;
      building(i, -6, 2, 6, 14, 0, matWall);
      building(i, 12, 2, 6, 14, 0, matWall);
    }
    crate(-6, -2, 1.8); crate(-6, 3, 1.5); crate(8, -10, 1.6); crate(12, 4, 2.0); crate(-14, 8, 1.5);
    barrel(-2, -6); barrel(-3, -7); barrel(5, 2); barrel(6, 3); barrel(-8, 10);
    sandbags(0, -14, 6, 0); sandbags(0, 14, 6, 0);

  } else if (mapId === 'desert') {
    // -------------------------------------------------------------
    // MAP 3: Wüsten-Außenposten (aus 3D-Shooter Offroad)
    // -------------------------------------------------------------
    ground.material.map = null;
    ground.material.color.set('#c89852');
    ground.material.roughness = 1.0;

    scene.fog = new THREE.FogExp2('#c49454', 0.0032);
    hemi.color.set('#ffdca0');
    hemi.groundColor.set('#5a3a18');
    hemi.intensity = 0.85;
    amb.color.set('#6a4820');
    amb.intensity = 0.4;
    sun.color.set('#fff2c8');
    sun.intensity = 3.4;
    sun.position.set(40, 50, -40);
    sunSprite.visible = true;
    sunSprite.material.color.set('#ffffff');
    sunSprite.position.set(0.3, 0.4, -0.85).normalize().multiplyScalar(260);

    sky.material.uniforms.top.value.set('#3a6cb0');
    sky.material.uniforms.mid.value.set('#c4924a');
    sky.material.uniforms.bot.value.set('#d8a860');

    // Umfassungswälle
    building(0, -ARENA, ARENA*2, 6, 3, 0, matBag);
    building(0,  ARENA, ARENA*2, 6, 3, 0, matBag);
    building(-ARENA, 0, 3, 6, ARENA*2, 0, matBag);
    building( ARENA, 0, 3, 6, ARENA*2, 0, matBag);

    // Bunker & Wachtürme
    const matBunker = new THREE.MeshStandardMaterial({ color: '#7a7062', roughness: 0.95 });
    building(-24, -20, 14, 5, 12, 0.2, matBunker);
    building( 26,  22, 16, 5, 14, -0.3, matBunker);
    building( 28, -24, 6, 12, 6, 0, matBunker);
    building(-28,  26, 6, 12, 6, 0, matBunker);

    sandbags(-8, -8, 7, 0.4); sandbags(10, 8, 8, -0.6); sandbags(-14, 16, 6, 1.1);
    sandbags(16, -14, 6, -0.8); sandbags(0, -22, 9, 0); sandbags(0, 22, 9, 0);

    for (let i = 0; i < 22; i++) {
      const rx = (Math.random()*2-1)*ARENA*0.75, rz = (Math.random()*2-1)*ARENA*0.75;
      if (Math.hypot(rx, rz) < 12) continue;
      crate(rx, rz, 1.2 + Math.random()*1.0);
    }
    barrel(-10, -5); barrel(-12, -4); barrel(12, 6); barrel(14, 7);

  } else if (mapId === 'night') {
    // -------------------------------------------------------------
    // MAP 4: Nacht-Einsatz
    // -------------------------------------------------------------
    ground.material.map = null;
    ground.material.color.set('#141720');
    ground.material.roughness = 0.6;

    scene.fog = new THREE.FogExp2('#060a14', 0.007);
    hemi.color.set('#3a5488');
    hemi.groundColor.set('#060912');
    hemi.intensity = 0.55;
    amb.color.set('#080d1a');
    amb.intensity = 0.35;
    sun.color.set('#6a8cc8');
    sun.intensity = 1.4;
    sun.position.set(-30, 40, -30);
    sunSprite.visible = true;
    sunSprite.material.color.set('#aaccff');
    sunSprite.position.set(-0.35, 0.65, -0.68).normalize().multiplyScalar(260);

    sky.material.uniforms.top.value.set('#010308');
    sky.material.uniforms.mid.value.set('#090e20');
    sky.material.uniforms.bot.value.set('#060a14');

    building(0, -ARENA, ARENA*2, 8, 2, 0, matPerimeter);
    building(0,  ARENA, ARENA*2, 8, 2, 0, matPerimeter);
    building(-ARENA, 0, 2, 8, ARENA*2, 0, matPerimeter);
    building( ARENA, 0, 2, 8, ARENA*2, 0, matPerimeter);

    building(-28,-24,16,14,14); building(30,-30,20,18,16); building(34,28,14,12,20);
    building(-34,30,18,16,12); building(-6,38,10,11,10); building(20,6,8,9,8);

    for (let i = 0; i < 20; i++) {
      const rx = (Math.random()*2-1)*ARENA*0.75, rz = (Math.random()*2-1)*ARENA*0.75;
      if (Math.hypot(rx, rz) < 10) continue;
      crate(rx, rz, 1.2 + Math.random()*1.0);
    }
    sandbags(-10,-14,6,0.3); sandbags(14,10,5,-0.5); sandbags(-20,18,7,0.9); sandbags(8,-26,6,0);
    barrel(-6,-8); barrel(-4.5,-9); barrel(10,-6); barrel(9,-4.5);

  } else {
    // -------------------------------------------------------------
    // MAP 1: Dämmerungs-Stadt (Standard)
    // -------------------------------------------------------------
    ground.material.map = groundTex;
    ground.material.color.set('#ffffff');
    ground.material.roughness = 1.0;

    scene.fog = new THREE.FogExp2('#e0894e', 0.0108);
    hemi.color.set('#8ea0cc');
    hemi.groundColor.set('#2a2438');
    hemi.intensity = 0.62;
    amb.color.set('#2a2438');
    amb.intensity = 0.34;
    sun.color.set('#ff9d5c');
    sun.intensity = 3.0;
    sun.position.set(-60, 22, -40);
    sunSprite.visible = true;
    sunSprite.material.color.set('#ffffff');
    sunSprite.position.set(-0.42, 0.055, -0.9).normalize().multiplyScalar(260);

    sky.material.uniforms.top.value.set('#1a2452');
    sky.material.uniforms.mid.value.set('#7a3b6e');
    sky.material.uniforms.bot.value.set('#e0894e');

    building(0, -ARENA, ARENA*2, 8, 2, 0, matPerimeter);
    building(0,  ARENA, ARENA*2, 8, 2, 0, matPerimeter);
    building(-ARENA, 0, 2, 8, ARENA*2, 0, matPerimeter);
    building( ARENA, 0, 2, 8, ARENA*2, 0, matPerimeter);

    building(-28,-24,16,12,14); building(30,-30,20,16,16); building(34,28,14,10,20);
    building(-34,30,18,14,12); building(-6,38,10,9,10); building(20,6,8,7,8);

    const sRng = (()=>{ let s=1337; return ()=> (s=(s*1103515245+12345)&0x7fffffff)/0x7fffffff; })();
    for(let i=0;i<26;i++){ const x=(sRng()*2-1)*ARENA*0.8, z=(sRng()*2-1)*ARENA*0.8;
      if(Math.hypot(x,z)<10) continue; crate(x,z, 1.1+sRng()*1.1); }
    sandbags(-10,-14,6,0.3); sandbags(14,10,5,-0.5); sandbags(-20,18,7,0.9); sandbags(8,-26,6,0);
    barrel(-6,-8); barrel(-4.5,-9); barrel(10,-6); barrel(9,-4.5); barrel(-13,3); barrel(15,3); barrel(2,-16); barrel(-2,-15);
    crate(-9,-6,1.5); crate(12,-6,1.6); crate(-15,-2,1.3);
  }

  if (floorPlates.length === 0 && mapId !== 'osm' && mapId !== 'much') {   // OSM-Karten setzen ihren Boden selbst
    floorPlates.push({ minX: -ARENA*2, maxX: ARENA*2, minZ: -ARENA*2, maxZ: ARENA*2, y: 0, label: 'Boden' });
  }

  if (mapId === 'warehouse' || mapId === 'atrium') mapSpawn = { x: 0, z: 12, yaw: 0 };
  else if (mapId === 'osm' || mapId === 'much') mapSpawn = { x: 0, z: 10, yaw: Math.PI };   // nach dem Laden der OSM-Daten ersetzt
  else mapSpawn = { x: 0, z: 8, yaw: Math.PI };
  camera.position.set(mapSpawn.x, 1.7, mapSpawn.z);
  yaw = mapSpawn.yaw;
  pitch = 0;
  player.vy = 0;
  player.onGround = true;
  setTimeout(warmUpGpu, 0);         // nach dem Aufbau (OSM-/NRW-Karten wärmen nach dem Laden nochmals vor)
}
// Vor dem ersten loadMap() anlegen: loadMap, resetRun und gameOver räumen den Besen auf.
// Flugbesen (Taste B, siehe broom.js). Die Ich-Ansicht ist das Bild des Users, ui/besen.webp.
const broom = createBroom({
  camera, audio, groundAt, player,
  overlay: $('broomView'), help: $('broomHelp'),
  onCast: (from) => hitscanShot(34, { from, color: '#8fe3ff', thick: 1.8, worldColor: '#8fe3ff', life: 0.14 }),
});
function toggleBroom() {
  if (state !== 'playing') return;
  if (mpActive) { showBanner('BESEN NUR IM EINZELSPIEL'); return; }
  if (broom.active) {
    player.vy = THREE.MathUtils.clamp(broom.dismount(), -4, 4);   // weiterfallen statt in der Luft stehen
    player.onGround = false;
  } else {
    if (stance !== 'stand') setStance('stand');
    firing = false; ads = false; arsenal.setTrigger(false);
    broom.mount();
  }
}

loadMap(currentMapId);

// ----------------------------------------------------------------------------
// Waffen-Arsenal: eigene Waffenmodelle mit Händen und Animationen (src/arsenal.js, src/weapons/)
// ----------------------------------------------------------------------------
renderer.autoClear = false;

// Weiches Fülllicht an der Kamera
const fill = new THREE.PointLight('#ffd2a0', 2.8, 58, 1.4);
fill.position.set(0, 0.4, -3); camera.add(fill);

const arsenal = new Arsenal({
  renderer,
  camera,
  audioManager: audio,
  onShotFired: (def, ballistics) => {
    // Rückstoß
    const ck = def.camKick ?? 1, kp = (0.007 + Math.random() * 0.005) * ck, ky = (Math.random() * 2 - 1) * 0.004 * ck;
    recoil.x += kp; recoil.y += ky;
    pitch += recoil.x * 0.35;

    const muzzle = hitscanShot(def.damage || 35);

    if (mpActive && net.connected) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      net.sendShoot(muzzle.x, muzzle.y, muzzle.z, dir.x, dir.y, dir.z);
    }
    updateAmmo();
  }
});

/**
 * Treffer-Strahl aus der Bildschirmmitte, für die Waffen und den Zauber des Flugbesens.
 * Trifft den nächsten Gegner (Kopf zählt 2,2-fach; im Mehrspieler die Mitspieler) oder die Welt,
 * zeichnet Einschlag und Leuchtspur und gibt den Startpunkt der Spur zurück.
 * o: { from, color, thick, worldColor }
 */
function hitscanShot(dmg, o = {}) {
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const foes = mpActive ? remoteHitboxes : enemyMeshes;
  const hitsE = ray.intersectObjects(foes, false);
  const hitsW = ray.intersectObjects(worldColliders, true);
  let eHit = hitsE[0]; const wHit = hitsW[0];
  // Strahl trifft denselben Gegner knapp dahinter auch am Kopf (z. B. vorgebeugt) → Kopftreffer zählt
  if (eHit && !eHit.object.userData.isHead) {
    const hh = hitsE.find(h => h.object.userData.isHead && h.object.userData.enemyRef === eHit.object.userData.enemyRef && h.distance - eHit.distance < 0.4);
    if (hh) eHit = hh;
  }
  let end;
  if (eHit && (!wHit || eHit.distance < wHit.distance)) {
    end = eHit.point;
    if (eHit.object.userData.remoteId) {
      net.sendHit(eHit.object.userData.remoteId, MP_HIT_DMG);
      impact(end, '#ff6a5a', 12);
      showHitmarker(false);
      audio.hit(true);
    } else {
      const e = eHit.object.userData.enemyRef?.userData.rec;
      const head = !!eHit.object.userData.isHead || (eHit.object.geometry?.type === 'SphereGeometry' && eHit.object.position.y > 1.4);
      if (e && !e.dead) damageEnemy(e, head ? dmg * 2.2 : dmg, head);
      impact(end, '#ff6a5a', 12);
      showHitmarker(head);
      audio.hit(true);
    }
  } else if (wHit) {
    end = wHit.point;
    impact(end, o.worldColor || '#ffcf7a', 8);
    audio.hit(false);
  } else {
    end = ray.ray.at(120, new THREE.Vector3());
  }
  const from = o.from ? o.from.clone() : camera.position.clone().addScaledVector(fwd, 0.4);
  tracer(from, end, o.color, o.thick, o.life);
  return from;
}

// ----------------------------------------------------------------------------
// FX: Tracer + Impact-Partikel  (kleiner Pool)
// ----------------------------------------------------------------------------
const UP = new THREE.Vector3(0,1,0);
// Tracer-Pool: ein Einheits-Zylinder wird pro Schuss wiederverwendet (kein Neu-Alloc/Dispose)
const tracerGeo = new THREE.CylinderGeometry(0.02,0.02,1,6);
const tracerPool = [];
for(let i=0;i<24;i++){ const m=new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color:'#ffd98a', transparent:true, opacity:0, fog:false }));
  m.visible=false; m.renderOrder=5; m.userData.life=0; scene.add(m); tracerPool.push(m); }
let tracerIdx=0;
function tracer(from, to, color = '#ffd98a', thick = 1, life = 0.08){   // Besen-Zauber: blau, breiter, leuchtet länger
  const m = tracerPool[tracerIdx=(tracerIdx+1)%tracerPool.length];
  const dir = new THREE.Vector3().subVectors(to,from); const len = dir.length()||0.001;
  m.position.copy(from).addScaledVector(dir,0.5);
  m.quaternion.setFromUnitVectors(UP, dir.multiplyScalar(1/len));
  m.material.color.set(color);
  m.scale.set(thick,len,thick); m.material.opacity=0.9; m.visible=true; m.userData.life=life;
}
// Impact-Pool: feste Anzahl Points-Objekte, wiederverwendet
const SPARK_N=18; const sparkPool=[];
for(let i=0;i<16;i++){ const geo=new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_N*3),3));
  const pts=new THREE.Points(geo, new THREE.PointsMaterial({ color:'#ffcf7a', size:0.14, transparent:true, opacity:0, depthWrite:false, fog:false }));
  pts.visible=false; scene.add(pts); sparkPool.push({ pts, geo, v:[], life:0 }); }
let sparkIdx=0;
function impact(pos, color='#ffcf7a', n=SPARK_N){
  n = Math.max(1, Math.min(n|0, SPARK_N));                        // Count wieder ehren → Todes-Burst (18) > Wand-Ping (8) (Fix R4 #1)
  const s = sparkPool[sparkIdx=(sparkIdx+1)%sparkPool.length];
  const p = s.geo.attributes.position.array; s.v.length=0;
  for(let i=0;i<SPARK_N;i++){
    if(i<n){ p[i*3]=pos.x; p[i*3+1]=pos.y; p[i*3+2]=pos.z;
      s.v.push(new THREE.Vector3((Math.random()*2-1),Math.random()*1.4,(Math.random()*2-1)).multiplyScalar(4+Math.random()*4)); }
    else { p[i*3]=0; p[i*3+1]=-9999; p[i*3+2]=0; }              // überzählige Partikel wegparken (unsichtbar)
  }
  s.geo.attributes.position.needsUpdate=true; s.pts.material.color.set(color); s.pts.material.opacity=1; s.pts.visible=true; s.life=0.5;
}

// ----------------------------------------------------------------------------
// Feinde (Bots)
// ----------------------------------------------------------------------------
const enemies = [];
const enemyMeshes = [];
const bodyMat = new THREE.MeshStandardMaterial({ color:'#6b7789', roughness:.6, metalness:.12, emissive:'#2a3340', emissiveIntensity:.35 });  // heller + leichtes Self-Fill → nie fast-schwarz, Arme/Waffe lesbar (Fix #1)
const headMat = new THREE.MeshStandardMaterial({ color:'#7d8a9c', roughness:.58, metalness:.12, emissive:'#2a3340', emissiveIntensity:.35 });  // Kopf heller → Value-Stufe
const earMat  = new THREE.MeshStandardMaterial({ color:'#565062', roughness:.85, emissive:'#ff4d6d', emissiveIntensity:.22 });
const eyeMat  = new THREE.MeshStandardMaterial({ color:'#ff4d6d', emissive:'#ff4d6d', emissiveIntensity:1.7 });
const outlineMat = new THREE.MeshBasicMaterial({ color:'#ffcf9a', side:THREE.BackSide }); // Inverted-Hull-Rim
// blobTex wird oben (Welt-Sektion) definiert und hier wiederverwendet

function outlineShell(mesh, scale=1.07){ const o=new THREE.Mesh(mesh.geometry, outlineMat); o.scale.setScalar(scale); mesh.add(o); }
// Gegner-Typen: Verschiedene Rollen (Klassische Söldner vs. wilde gefräßige Zombies)
// Der Söldner-Modus ist vorerst ausgeblendet. Der User hat am 22.11.2026 gesagt: „verstecke den Söldnermodus,
// wir machen da später noch was“. Der Code bleibt vollständig. Mit true kommen die Modus-Wahl im Startmenü,
// die Umschalter in Pause und Game Over und die Söldner-Spalte der Bestenliste zurück.
const SOELDNER_SICHTBAR = false;
let gameMode = SOELDNER_SICHTBAR ? (localStorage.getItem('rod.gameMode') || 'classic') : 'zombies'; // 'classic' | 'zombies'

function pickEnemyType(){
  if (gameMode === 'zombies') {
    const r = Math.random();
    if (r < 0.28) {
      // Wilder Zombie (Runner) - schnellste Zombie-Art, aber mit 4.3 m/s IMMER NOCH langsamer als Spieler-Gehen (5.2) & Sprint (8.5)
      return {
        key: 'zombie_runner',
        name: 'Wilder Zombie',
        hp: 70 + wave * 8,
        speed: 4.3,
        scale: 1.22,
        tint: '#3b4530',      // Faulig-grünliches Verwesungsfleisch
        visor: '#ff3300',     // Blutrote dämonisch glühende Augen
        scoreMul: 1.5,
        isZombie: true
      };
    }
    if (r < 0.48) {
      // Gefräßiger Koloss (Brute) - massiv & zäh, aber langsam (2.5 m/s)
      return {
        key: 'zombie_brute',
        name: 'Gefräßiger Koloss',
        hp: 190 + wave * 22,
        speed: 2.5,
        scale: 1.58,
        tint: '#283024',      // Dunkles modriges Fleisch
        visor: '#39ff14',     // Toxisch leuchtende Augen
        scoreMul: 2.2,
        isZombie: true
      };
    }
    // Normaler Zombie (Shambler) - gemächlicher Zombielauf (3.3 m/s)
    return {
      key: 'zombie_shambler',
      name: 'Verwesender Zombie',
      hp: 55 + wave * 6,
      speed: 3.3,
      scale: 1.30,
      tint: '#444d3b',      // Verrotteter Graugrünton
      visor: '#ff6600',     // Glühende Zombie-Augen
      scoreMul: 1,
      isZombie: true
    };
  }

  // Klassischer Söldner-Modus
  const r = Math.random();
  if (r < 0.25) {
    return {
      key: 'scout',
      name: 'Späher',
      hp: 65,
      speed: 4.2,
      scale: 1.15,
      tint: '#4ea8de',       // Blaue taktische Markierung
      visor: '#64dfdf',      // Helles Cyber-/Visor-Visier
      scoreMul: 1,
      isZombie: false
    };
  }
  if (r < 0.45) {
    return {
      key: 'heavy',
      name: 'Schwerer Soldat',
      hp: 220,
      speed: 1.6,
      scale: 1.55,
      tint: '#c1121f',       // Rote Rüstungs-/Tarnungs-Markierung
      visor: '#ff4d6d',      // Rotes Kampf-Visier
      scoreMul: 2,
      isZombie: false
    };
  }
  return {
    key: 'normal',
    name: 'Sturmsoldat',
    hp: 100,
    speed: 2.5 + Math.random() * 1.0,
    scale: 1.32,
    tint: null,            // Original Urban Tactical Uniform
    visor: null,
    scoreMul: 1,
    isZombie: false
  };
}

function makeEnemy(x, z){
  const cfg = pickEnemyType();
  const ownMats = [];
  const flashMats = [];
  const g = new THREE.Group();
  g.name = 'enemy';

  let mixer = null;
  let idleAction = null;
  let runAction = null;
  let walkAction = null;
  let zombie = null, hit = null;

  if (cfg.isZombie && zombieTemplate) {
    ({ zombie, hit, mixer } = buildZombie(cfg, g, ownMats, flashMats));
  } else if (soldierTemplate) {
    const inst = cloneSkinned(soldierTemplate.scene);
    inst.scale.setScalar(cfg.scale);
    // Soldat schaut im Original in die entgegengesetzte Richtung (-Z); 180° drehen,
    // damit seine Front sauber zur Lauf-/Zielrichtung (to.x, to.z) passt:
    inst.rotation.y = Math.PI;
    g.add(inst);

    if (soldierTemplate.animations && soldierTemplate.animations.length > 0) {
      mixer = new THREE.AnimationMixer(inst);
      const findClip = (name, re) =>
        THREE.AnimationClip.findByName(soldierTemplate.animations, name) ||
        soldierTemplate.animations.find(c => re.test(c.name)) ||
        soldierTemplate.animations[0];

      const idleClip = findClip('Idle', /idle|stand/i);
      const runClip  = findClip('Run',  /run/i);
      const walkClip = findClip('Walk', /walk/i);

      if (idleClip) idleAction = mixer.clipAction(idleClip);
      if (runClip)  runAction  = mixer.clipAction(runClip);
      if (walkClip) walkAction = mixer.clipAction(walkClip);

      if (runAction && idleAction) {
        runAction.time = Math.random() * (runClip ? runClip.duration : 1);
        runAction.play();
      } else if (idleAction) {
        idleAction.play();
      }
      mixer.update(0.01);
    }

    inst.traverse(obj => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      // Raycast auf SkinnedMesh deaktivieren: Three.js testet gegen die unbewegte
      // statische Bind-Pose. Die präzisen Hitboxen übernehmen die Treffererkennung.
      obj.raycast = () => {};

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      obj.material = mats.map(m => {
        const cloned = m.clone();
        ownMats.push(cloned);
        if (cloned.isMeshStandardMaterial) {
          if (cfg.isZombie) {
            cloned.roughness = 0.95;
            cloned.metalness = 0.05;
          }
          if (cfg.tint && (obj.name.toLowerCase().includes('mesh') || !obj.name.toLowerCase().includes('visor'))) {
            cloned.color.lerp(new THREE.Color(cfg.tint), cfg.isZombie ? 0.75 : 0.5);
          }
          if (cfg.visor && obj.name.toLowerCase().includes('visor')) {
            cloned.color.set(cfg.visor);
            cloned.emissive.set(cfg.visor);
            cloned.emissiveIntensity = cfg.isZombie ? 2.5 : 0.9;
          }
          flashMats.push({
            mat: cloned,
            emissive: cloned.emissive.clone(),
            intensity: cloned.emissiveIntensity
          });
        }
        return cloned;
      });
      if (Array.isArray(obj.material) && obj.material.length === 1) obj.material = obj.material[0];
    });
  } else {
    // Prozedurales Fallback, falls Modell noch lädt
    let bMat = bodyMat, hMat = headMat;
    if(cfg.tint){ bMat = bodyMat.clone(); bMat.color.set(cfg.tint); ownMats.push(bMat); }
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.35,0.7,4,10), bMat); torso.position.y=1.05; torso.castShadow=true; g.add(torso);
    const head  = new THREE.Mesh(new THREE.SphereGeometry(0.28,14,12), hMat); head.position.y=1.75; head.castShadow=true; g.add(head);
  }

  // Unsichtbare, performante Trefferboxen (Körper-Kapsel + Kopf-Kugel für Headshots)
  if (!hit) {
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    ownMats.push(hitMat);

    const torsoHb = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.38 * cfg.scale, 1.15 * cfg.scale, 4, 8),
      hitMat
    );
    torsoHb.position.y = 0.88 * cfg.scale;
    torsoHb.userData.enemyRef = g;
    g.add(torsoHb);

    const headHb = new THREE.Mesh(
      new THREE.SphereGeometry(0.25 * cfg.scale, 8, 8),
      hitMat
    );
    headHb.position.y = 1.72 * cfg.scale;
    headHb.userData.enemyRef = g;
    headHb.userData.isHead = true;
    g.add(headHb);

    hit = [torsoHb, headHb];
  }

  // Dynamischer Bodenschatten
  if (typeof blobTex !== 'undefined' && blobTex) {
    const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
    ownMats.push(blobMat);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.4 * cfg.scale, 1.4 * cfg.scale), blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    blob.raycast = () => {};
    g.add(blob);
  }

  g.position.set(x, groundAt(x, z), z);

  const e = {
    g,
    hp: cfg.hp,
    maxHp: cfg.hp,
    speed: cfg.speed,
    scoreMul: cfg.scoreMul,
    type: cfg.key,
    name: cfg.name,
    isZombie: Boolean(cfg.isZombie),
    groanCd: 2.0 + Math.random() * 3.5,
    scale: cfg.scale,
    dead: false,
    cd: 1 + Math.random(),
    deathT: 0,
    bob: Math.random() * 6,
    losT: 0,
    blocked: false,
    walk: Math.random() * 6,
    mixer,
    idleAction,
    runAction,
    walkAction,
    curAction: 'run',
    z: zombie,                 // echtes Zombie-Modell: Animations-Zustand (siehe zombieAnimate)
    hitboxes: hit,
    flashMats,
    flashUntil: 0,
    ownMats
  };
  g.userData.rec = e;
  if (zombie && Math.random() < 0.35) { zombie.roarT = 2.4; audio.zombieGroan(); }   // mancher Zombie brüllt erst einmal

  scene.add(g);
  enemies.push(e);
  enemyMeshes.push(...hit);
  return e;
}

// ----------------------------------------------------------------------------
// Echte Zombies (CGTrader-Modell, umgewandelt mit tools/zombie_convert.html + tools/zombie_textures.py)
// Ein Mesh (1 Draw-Call), 124 Knochen, 12 Animationen, 3 Hautvarianten, leuchtende Augen.
// Die Lizenz verlangt, dass Spieler das Modell nicht herausholen können: Modell und Texturen kommen deshalb nur
// verschlüsselt an (zombie.pak, gepackt mit tools/zombie_pack.mjs) und werden erst hier im Speicher geöffnet.
// ----------------------------------------------------------------------------
const ZOMBIE_DIR = 'assets/models/zombie/';
const ZOMBIE_RUN_SPEED = 1.25;      // m/s, die die Lauf-Animation bei 1,82 m Körpergröße ohne Rutschen darstellt
async function loadZombieTemplate(){
  const files = await loadPak(ZOMBIE_DIR + 'zombie.pak', ZOMBIE_DIR + 'zombie.key');
  const file = (f) => { const b = files.get(f); if (!b) throw new Error('Zombie-Paket ohne ' + f); return b; };
  const glb = file('zombie.glb');
  const gltf = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
  const rod = gltf.scene.userData.rod || {};
  // Texturen direkt aus dem Speicher dekodieren – ohne Datei-URL, die man im Browser abspeichern könnte.
  // ImageBitmap ignoriert flipY/premultiplyAlpha, deshalb beim Dekodieren spiegeln (wie früher der TextureLoader).
  const tex = async (f, srgb) => {
    const img = await createImageBitmap(new Blob([file(f)], { type: 'image/webp' }),
      { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const t = new THREE.Texture(img);
    t.flipY = false;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; t.needsUpdate = true;
    return t;
  };
  const eyes = await tex('eyes.webp', true);
  const skins = [];
  for (let n = 1; n <= 3; n++) {
    try {
      const [map, normalMap, orm] = await Promise.all([tex(`skin${n}_albedo.webp`, true), tex(`skin${n}_normal.webp`, false), tex(`skin${n}_orm.webp`, false)]);
      skins.push(new THREE.MeshStandardMaterial({ map, normalMap, aoMap: orm, roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1,
        alphaTest: 0.5, emissive: '#ff5a1f', emissiveMap: eyes, emissiveIntensity: 2.4 }));
    } catch (e) { if (n === 1) throw e; }
  }
  let mesh = null;
  gltf.scene.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  if (!mesh || !skins.length) throw new Error('zombie.glb ohne Mesh oder Texturen');
  const H = rod.height || 182.44;
  mesh.userData.sharedGeo = true;                         // Geometrie gehört der Vorlage – beim Entfernen nicht freigeben
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H * 0.5, 0), H * 1.6);   // großzügig: auch Sterbe-Animationen
  gltf.scene.updateMatrixWorld(true);
  // Treffer-Zonen in Vorlagen-Koordinaten: Kopf-Kugel am Kopfknochen, Rumpf-Kapsel Hüfte → Hals
  const bone = (re) => { let b = null; gltf.scene.traverse(o => { if (!b && o.isBone && re.test(o.name)) b = o; }); return b; };
  const head = bone(/Head$/), hips = bone(/Hips$/), neck = bone(/Neck$/) || bone(/Spine2$/);
  const wp = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
  const headC = wp(head); headC.y -= 0.06 * H;           // Kopfknochen sitzt nahe am Scheitel
  const hipsP = wp(hips), neckP = wp(neck);
  const chestP = hipsP.clone().lerp(neckP, 0.72);        // Rumpf endet unterhalb des Halses → verdeckt den Kopf nicht
  const torsoMid = hipsP.clone().lerp(chestP, 0.5), torsoLen = hipsP.distanceTo(chestP);
  const localDir = (b, dirWorld) => { const q = new THREE.Quaternion(); b.getWorldQuaternion(q); return dirWorld.clone().applyQuaternion(q.invert()).normalize(); };
  const clips = new Map(gltf.animations.map(c => [c.name, c]));
  return {
    scene: gltf.scene, clips, skins, H, footY: rod.footY || 0,
    headName: head.name, headLocal: head.worldToLocal(headC.clone()), headR: 0.075 * H,
    hipsName: hips.name, torsoLocal: hips.worldToLocal(torsoMid.clone()), torsoLen, torsoR: 0.11 * H,
    torsoQuat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), localDir(hips, neckP.clone().sub(hipsP))),
    hipsY: hipsP.y - (rod.footY || 0),
  };
}

function buildZombie(cfg, g, ownMats, flashMats){
  const Z = zombieTemplate;
  const zH = 1.42 * cfg.scale, s = zH / Z.H;            // Runner 1,73 m, Normal 1,85 m, Koloss 2,24 m
  const inst = cloneSkinned(Z.scene);
  inst.scale.setScalar(s); inst.position.y = -Z.footY * s;
  g.add(inst);
  // Hautvariante: Koloss modrig-grün, sonst zufällig
  const skinIdx = cfg.key === 'zombie_brute' ? Math.min(2, Z.skins.length - 1) : (Math.random() * Z.skins.length) | 0;
  const mat = Z.skins[skinIdx].clone();
  mat.emissive.set(cfg.visor || '#ff5a1f');
  ownMats.push(mat);
  inst.traverse(o => { if (o.isSkinnedMesh) { o.material = mat; o.castShadow = true; o.raycast = () => {}; } });
  flashMats.push({ mat, color: mat.color.clone(), emissive: mat.emissive.clone(), intensity: mat.emissiveIntensity });
  // Treffer-Zonen folgen der Animation (Kopf am Kopfknochen, Rumpf an der Hüfte) + Beine statisch
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  ownMats.push(hitMat);
  const headHb = new THREE.Mesh(new THREE.SphereGeometry(Z.headR, 8, 6), hitMat);
  headHb.position.copy(Z.headLocal); headHb.userData.isHead = true;
  inst.getObjectByName(Z.headName).add(headHb);
  const torsoHb = new THREE.Mesh(new THREE.CapsuleGeometry(Z.torsoR, Z.torsoLen, 3, 8), hitMat);
  torsoHb.position.copy(Z.torsoLocal); torsoHb.quaternion.copy(Z.torsoQuat);
  inst.getObjectByName(Z.hipsName).add(torsoHb);
  const legH = Z.hipsY * s;
  const legsHb = new THREE.Mesh(new THREE.CapsuleGeometry(0.22 * zH / 1.8, Math.max(0.1, legH - 0.3), 3, 8), hitMat);
  legsHb.position.y = legH / 2 + 0.05;
  g.add(legsHb);
  const hit = [headHb, torsoHb, legsHb];
  for (const h of hit) h.userData.enemyRef = g;
  // Animationen
  const mixer = new THREE.AnimationMixer(inst);
  const act = {};
  for (const [name, clip] of Z.clips) act[name] = mixer.clipAction(clip);
  const runScale = THREE.MathUtils.clamp(cfg.speed / (ZOMBIE_RUN_SPEED * zH / 1.82), 0.8, 3.0);
  const z = { act, base: 'run', baseClip: 'run', runScale, roarT: 0, staggerT: 0, hitT: 0,
    attackClip: Math.random() < 0.5 ? 'atack1' : 'atack3' };
  act.run.setEffectiveTimeScale(runScale);
  act.run.time = Math.random() * Z.clips.get('run').duration;
  act.run.play();
  mixer.update(0.01);
  return { zombie: z, hit, mixer };
}

/** Zombie-Animation: Brüllen → Rennen ↔ Angreifen, Treffer-Zucken, Sterben (Basis-Animation per Überblendung). */
function zombieAnimate(e, dt, dist){
  const z = e.z;
  z.roarT = Math.max(0, z.roarT - dt);
  z.staggerT = Math.max(0, z.staggerT - dt);
  if (z.hitT > 0) {                                       // Treffer-Zucken läuft
    z.hitT -= dt;
    if (z.hitT <= 0) { z.act.gethit.fadeOut(0.25); z.act[z.baseClip].reset().fadeIn(0.25).play(); }
    return;
  }
  const want = z.roarT > 0 ? 'roar' : (dist < 2.1 ? 'attack' : 'run');
  if (want === z.base) return;
  const clip = want === 'attack' ? z.attackClip : want;
  const from = z.act[z.baseClip], to = z.act[clip];
  to.reset().setEffectiveTimeScale(want === 'run' ? z.runScale : want === 'attack' ? 1.35 : 1).setEffectiveWeight(1).fadeIn(0.25).play();
  if (from !== to) from.fadeOut(0.25);
  z.base = want; z.baseClip = clip;
}
function zombieHit(e){
  const z = e.z;
  if (!z || z.hitT > 0) return;
  z.staggerT = 0.45; z.hitT = 0.5;
  z.act[z.baseClip].fadeOut(0.08);
  z.act.gethit.reset().setLoop(THREE.LoopOnce, 1).setEffectiveTimeScale(1.3).setEffectiveWeight(1).fadeIn(0.08).play();
}
function zombieDie(e){
  const z = e.z;
  e.mixer.stopAllAction();
  const d = z.act[Math.random() < 0.5 ? 'death1' : 'death2'];
  d.reset().setLoop(THREE.LoopOnce, 1); d.clampWhenFinished = true; d.setEffectiveTimeScale(1.2).play();
  e.deathT = 4.2;                                         // ~2,5 s Fallen + Liegen, dann im Boden versinken
}

let wave = 0, aliveTarget = 0;
function startWave(){
  wave++;
  ui.wave.textContent = wave;
  const isZ = (gameMode === 'zombies');
  showBanner(isZ ? ('RUNDE ' + wave) : ('WELLE ' + wave));
  const waveLbl = $('wave')?.querySelector('.lbl');
  if (waveLbl) waveLbl.textContent = isZ ? 'Runde' : 'Welle';
  const n = isZ ? (4 + wave * 2) : (3 + wave);
  aliveTarget = n;
  // Große Karten: Gegner rund um den Spieler statt um die Kartenmitte
  const big = getMapBound() > 120;
  for(let i=0;i<n;i++){
    const p = freeSpotNear(big ? camera.position.x : 0, big ? camera.position.z : 0);
    makeEnemy(p.x, p.z);
  }
  warmUpGpu();                    // neue Gegner-Materialien gleich übersetzen (nicht erst beim ersten Sichtkontakt)
}
/** Freier Spawnpunkt im Ring 36–60 m (kleine Hallen: 8–20 m) um (cx, cz), innerhalb der Karte. */
function freeSpotNear(cx, cz){
  const B = getMapBounds(), bx = B.x - 4, bz = B.z - 4;
  const minR = (currentMapId === 'warehouse' || currentMapId === 'atrium' ? 8 : 36);
  const maxR = (currentMapId === 'warehouse' || currentMapId === 'atrium' ? 20 : 60);
  let x,z,tries=0; do{ const a=Math.random()*Math.PI*2, r=minR+Math.random()*(maxR-minR); x=cx+Math.cos(a)*r; z=cz+Math.sin(a)*r; }
  while((Math.abs(x)>bx || Math.abs(z)>bz || pointBlocked(x,z,1.2)) && ++tries<40);
  return { x: THREE.MathUtils.clamp(x,-bx,bx), z: THREE.MathUtils.clamp(z,-bz,bz) };
}

// ----------------------------------------------------------------------------
// Spieler-Status + Waffen-Arsenal + Eingabe
// ----------------------------------------------------------------------------
// player oben deklariert

/** Munitionskiste eingesammelt: alle Reserven voll, eine Granate dazu (höchstens 3). */
function onCratePickup() {
  const got = arsenal.resupply?.();
  const hadGrenades = grenades;
  grenades = Math.min(3, grenades + 1);
  updateGrenadeHud();
  updateAmmo();
  audio.pickup?.();
  showPop(got || grenades > hadGrenades ? '📦 + MUNITION' : '📦 MUNITION VOLL', false);
}

function updateAmmo() {
  const w = arsenal.currentWeapon;
  if (broom.active) {                       // Zauber vom Besen brauchen keine Munition
    ui.ammoNum.textContent = '✦';
    ui.ammoRes.textContent = '∞';
    ui.reloadHint.classList.remove('on');
    return;
  }
  if (w && w.melee) {
    ui.ammoNum.textContent = '⚔️';
    ui.ammoRes.textContent = '∞';
    ui.reloadHint.classList.remove('on');
    return;
  }
  const a = arsenal.ammo;
  ui.ammoNum.textContent = a.mag;
  ui.ammoRes.textContent = a.reserve;
  ui.reloadHint.classList.toggle('on', a.mag <= 0);
}

function updateWeaponHud() {
  const w = arsenal.currentWeapon;
  if (ui.weaponName && w) {
    ui.weaponName.textContent = broom.active ? 'Flugbesen' : w.name;
  }
}

// ----------------------------------------------------------------------------
// Handgranaten & Nahkampf
// ----------------------------------------------------------------------------
let grenades = 3;
const activeGrenades = [];
const grenadeTemplate = buildGrenadeMesh(1.4);   // Modell aus src/weapons/models/grenade.js, wird je Wurf geklont

function updateGrenadeHud() {
  if (ui.grenadeNum) ui.grenadeNum.textContent = `💣 ${grenades}`;
}

function throwGrenade() {
  if (grenades <= 0 || state !== 'playing') return;
  grenades--;
  updateGrenadeHud();
  audio.knife();

  const m = grenadeTemplate.clone();
  m.position.copy(camera.position).addScaledVector(fwd, 0.4);
  scene.add(m);

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y += 0.22;
  dir.normalize();

  const v = dir.clone().multiplyScalar(17);
  const spin = new THREE.Vector3(Math.random()*12, Math.random()*12, Math.random()*12);
  activeGrenades.push({ m, v, spin, fuse: 2.2 });
}

function updateGrenades(dt) {
  for (let i = activeGrenades.length - 1; i >= 0; i--) {
    const g = activeGrenades[i];
    g.fuse -= dt;
    g.v.y -= 18 * dt;
    g.m.position.addScaledVector(g.v, dt);
    g.m.rotation.x += g.spin.x * dt;
    g.m.rotation.y += g.spin.y * dt;

    const gFloor = getFloorHeight(g.m.position.x, g.m.position.z, g.m.position.y) + 0.065;
    if (g.m.position.y < gFloor) {
      g.m.position.y = gFloor;
      g.v.y = -g.v.y * 0.45;
      g.v.x *= 0.65;
      g.v.z *= 0.65;
      g.spin.multiplyScalar(0.7);
      if (Math.abs(g.v.y) > 0.8) audio.play('hit_metal', { volume: 0.35 });
    }
    pushOutObstacles(g.m.position, 0.25);

    if (g.fuse <= 0) {
      explodeGrenade(g.m.position);
      scene.remove(g.m);
      activeGrenades.splice(i, 1);
    }
  }
}

function explodeGrenade(pos) {
  audio.explode();
  damageFeedback();
  impact(pos, '#ff9030', 35);

  const RADIUS = 11;
  for (const e of enemies) {
    if (e.dead) continue;
    const dist = e.g.position.distanceTo(pos);
    if (dist < RADIUS) {
      const dmg = Math.round(260 * (1 - dist / RADIUS));
      damageEnemy(e, dmg, false);
      impact(e.g.position.clone().setY(e.g.position.y + 1.0), '#ff4444', 14);
    }
  }

  const selfDist = camera.position.distanceTo(pos);
  if (selfDist < 6) {
    const selfDmg = Math.round(75 * (1 - selfDist / 6));
    player.hp = Math.max(1, player.hp - selfDmg);
    lastDamageTime = performance.now();
    updateHealth();
  }
}

let meleeCd = 0;
function meleeAttack() {
  if (meleeCd > 0 || state !== 'playing') return;
  meleeCd = 0.75;

  // Nahkampf: Messerschnitt bzw. Stoß mit der Waffe
  arsenal.melee();
  audio.knife(false);

  // Viszerale Dynamik
  pitch += 0.015;

  // Trefferprüfung auf Höhepunkt des Schwungs (~120ms)
  setTimeout(() => {
    if (state !== 'playing') return;
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = ray.intersectObjects(enemyMeshes, false);
    if (hits[0] && hits[0].distance < 3.5) {
      const e = hits[0].object.userData.enemyRef?.userData.rec;
      if (e && !e.dead) {
        audio.knife(true);
        damageEnemy(e, 180, true);
        impact(hits[0].point, '#ff3333', 20);
        showHitmarker(true);
        showBanner('MESSER-KILL!');
      }
    }
  }, 120);
}

let score=0, kills=0, combo=1, comboT=0, highscore = +(localStorage.getItem('rod.highscore')||0);

const keys = {};
addEventListener('keydown', e=>{
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;      // Tippen (z. B. Name für die Bestenliste) steuert nicht das Spiel
  if (nav?.isOpen) { navMapKey(e); return; }            // Karte offen: nur Kartentasten
  if ((e.code === 'KeyN' || e.code === 'Tab') && state === 'playing') { e.preventDefault(); openNavMap(); return; }
  keys[e.code]=true;
  if (e.code === 'KeyB') { toggleBroom(); return; }
  // Auf dem Besen: keine Waffen- und Haltungstasten (C und Strg heißen dort sinken)
  if (broom.active && /^(KeyR|Digit[12]|KeyE|KeyV|KeyC|KeyX|KeyY|KeyZ|ControlLeft|ControlRight)$/.test(e.code)) return;
  if(e.code==='KeyR') arsenal.reload();
  if(e.code==='Digit1') { arsenal.switchSlot('primary'); updateAmmo(); updateWeaponHud(); }
  if(e.code==='Digit2') { arsenal.switchSlot('secondary'); updateAmmo(); updateWeaponHud(); }
  if(e.code==='KeyG') throwGrenade();
  if(e.code==='KeyM') toggleMusic();
  if(e.code==='KeyE' || e.code==='KeyV') meleeAttack();
  if(e.code==='KeyC') setStance(stance==='crouch' ? 'stand' : 'crouch');
  if(e.code==='KeyX' || e.code==='KeyY' || e.code==='KeyZ') setStance(stance==='prone' ? 'stand' : 'prone');
  if(e.code==='ControlLeft' || e.code==='ControlRight') setStance(stance==='crouch' ? 'stand' : 'crouch');
  if(e.code==='Escape' && state==='playing'){ /* pointerlock exit löst Pause aus */ }
});
addEventListener('keyup', e=>{ keys[e.code]=false; });

addEventListener('wheel', e => {
  if (document.pointerLockElement !== canvas) return;
  if (broom.active) { broom.wheel(e.deltaY < 0 ? 1 : -1); return; }   // hoch = Spirale nach vorne, runter = nach hinten
  arsenal.toggleSlot();
  updateAmmo();
  updateWeaponHud();
});

// yaw, pitch, ads, firing oben deklariert
addEventListener('mousemove', e=>{
  if(document.pointerLockElement!==canvas) return;

  // Pointer-Lock Delta-Spike Filter (verhindert das berüchtigte 180°-Umdrehen bei Klicks/schnellem Zielen)
  if(Math.abs(e.movementX) > 120 || Math.abs(e.movementY) > 120) return;
  const mx = THREE.MathUtils.clamp(e.movementX, -75, 75);
  const my = THREE.MathUtils.clamp(e.movementY, -75, 75);

  const isSniper = Boolean(arsenal.currentWeapon?.scope);
  const s = (ads && isSniper) ? 0.00045 : (ads ? 0.0011 : 0.0022);
  yaw -= mx*s; pitch -= my*s;
  pitch = Math.max(-1.5, Math.min(1.5, pitch));
  yaw = ((yaw + Math.PI) % (Math.PI * 2) + (Math.PI * 2)) % (Math.PI * 2) - Math.PI;
});
addEventListener('mousedown', e=>{
  if(document.pointerLockElement!==canvas) return;
  if (broom.active) {                     // Besen: links = Zauber, Mitte (Maus 3) = Schub
    if (e.button === 0) broom.fire(true);
    if (e.button === 1) { e.preventDefault(); broom.setThrust(true); }
    return;
  }
  if(e.button===0) {
    if (arsenal.currentWeapon?.melee) {
      meleeAttack();
    } else {
      firing=true;
      arsenal.setTrigger(true);
    }
  }
  if(e.button===2) ads=true;
});
addEventListener('mouseup', e=>{
  if(e.button===0) { firing=false; arsenal.setTrigger(false); broom.fire(false); }
  if(e.button===1) broom.setThrust(false);
  if(e.button===2) ads=false;
});
addEventListener('contextmenu', e=>e.preventDefault());

// ----------------------------------------------------------------------------
// Treffer-Logik & Rückstoß
// ----------------------------------------------------------------------------
const ray = new THREE.Raycaster();
const recoil = { x:0, y:0 };

function flashEnemy(e) {
  if (!e || !e.flashMats || e.flashMats.length === 0) return;
  for (const f of e.flashMats) {
    if (f.color) { f.mat.color.setScalar(2.6); continue; }
    f.mat.emissive.setHex(0xffffff);
    f.mat.emissiveIntensity = 0.95;
  }
  e.flashUntil = performance.now() + 85;
}

function damageEnemy(e, dmg, head){
  e.hp -= dmg;
  flashEnemy(e);
  if (e.z && e.hp > 0) zombieHit(e);                    // echtes Zombie-Modell zuckt zusammen und taumelt kurz
  if(e.hp<=0){
    e.dead=true; e.deathT=0.7;
    if (e.z) zombieDie(e);
    combo = comboT>0 ? combo+1 : 1; comboT = 2.5;
    kills++;
    updateKills();
    const pts = Math.round((head?150:100)*combo*(e.scoreMul||1)); score += pts; updateScore();
    const label = e.isZombie ? (head ? ' 🧟 HEADSHOT!' : ' 🧟 ELIMINIERT') : (head ? ' 💀 HEADSHOT!' : (combo>1 ? ' x'+combo : ''));
    showPop('+'+pts+label, head);
    if (e.isZombie) audio.zombieDeath();
    else audio.kill();
    for (const hb of (e.hitboxes || [])) {
      const i = enemyMeshes.indexOf(hb);
      if (i >= 0) enemyMeshes.splice(i, 1);
    }
    for(const m of e.g.children) if(m.isMesh){ const i=enemyMeshes.indexOf(m); if(i>=0) enemyMeshes.splice(i,1); }
    impact(e.g.position.clone().setY(e.g.position.y + 1.1), e.isZombie ? '#4caf2a' : '#7ef0c0', 18);
    aliveTarget--;
  }
}

function updateKills(){
  const el = $('fragsNum');
  if (el) el.textContent = kills;
  const labelEl = $('fragsLabel');
  if (labelEl) labelEl.textContent = (gameMode === 'zombies') ? 'ZOMBIES:' : 'KILLS:';
  const iconEl = $('fragsIcon');
  if (iconEl) iconEl.textContent = (gameMode === 'zombies') ? '🧟' : '💀';
}

let lastDamageTime = 0;
const REGEN_DELAY = 4.0; // 4 Sekunden ohne Schaden vor Heilung
const REGEN_RATE = 28;   // 28 HP/s Regenerationsrate

function updateScore(){ ui.score.textContent = score; }
function updateHealth(){
  const hpRound = Math.max(0, Math.round(player.hp));
  ui.healthNum.textContent = hpRound;
  const pct = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));
  ui.healthFill.style.width = pct + '%';
  if (pct <= 30) {
    ui.healthFill.style.background = '#ff3333';
  } else if (pct <= 60) {
    ui.healthFill.style.background = '#ffb300';
  } else {
    ui.healthFill.style.background = 'var(--accent)';
  }
}

function setStance(newStance) {
  if (stance === newStance) return;
  stance = newStance;
  if (stance === 'crouch') {
    player.targetHeight = CROUCH_HEIGHT;
  } else if (stance === 'prone') {
    player.targetHeight = PRONE_HEIGHT;
  } else {
    stance = 'stand';
    player.targetHeight = STAND_HEIGHT;
  }
  updateStanceHud();
}

function updateStanceHud() {
  if (!ui.stanceIcon || !ui.stanceLabel) return;
  if (stance === 'crouch') {
    ui.stanceIcon.textContent = '🧎';
    ui.stanceLabel.textContent = 'GEDUCKT [C]';
    ui.stanceIcon.style.color = '#ffcf00';
  } else if (stance === 'prone') {
    ui.stanceIcon.textContent = '🪖';
    ui.stanceLabel.textContent = 'LIEGEND [X]';
    ui.stanceIcon.style.color = '#ff6a5a';
  } else {
    ui.stanceIcon.textContent = '🧍';
    ui.stanceLabel.textContent = 'STEHEND [C/X]';
    ui.stanceIcon.style.color = '#7ef0c0';
  }
}

// ----------------------------------------------------------------------------
// HUD-Helfer
// ----------------------------------------------------------------------------
function showBanner(t){ ui.banner.textContent=t; ui.banner.classList.remove('show'); void ui.banner.offsetWidth; ui.banner.classList.add('show'); }
function showHitmarker(head){ ui.hitmarker.style.filter = head?'drop-shadow(0 0 6px #ffcf00)':'none';
  ui.hitmarker.classList.remove('show'); void ui.hitmarker.offsetWidth; ui.hitmarker.classList.add('show'); }
function showPop(t, head){ const el=document.createElement('div'); el.className='pop'; el.textContent=t;
  el.style.color = head?'#ffcf00':'#fff';
  el.style.left = 'calc(50% + '+(Math.random()*120-60|0)+'px)'; el.style.top='calc(45% - '+(20+Math.random()*30|0)+'px)';
  ui.popups.appendChild(el); setTimeout(()=>el.remove(),900); }
function damageFeedback(){
  lastDamageTime = performance.now();
  const f = ui.damageFlash;
  f.style.transition = 'none';
  f.style.opacity = '0.85';
  requestAnimationFrame(() => {
    f.style.transition = 'opacity .6s ease-out';
    f.style.opacity = player.hp < 30 ? '0.35' : '0';
  });
  canvas.classList.remove('shake');
  void canvas.offsetWidth;
  canvas.classList.add('shake');
}

// ----------------------------------------------------------------------------
// Pointer-Lock / Zustände
// ----------------------------------------------------------------------------
let state = 'boot'; // boot | ready | playing | paused | over
function setOverlay(){ music.setMode(state==='playing' ? 'game' : (state==='paused' || state==='map') ? 'pause' : 'menu');
  ui.start.style.display = state==='ready'?'flex':'none';
  ui.pause.style.display = state==='paused'?'flex':'none';
  ui.gameover.style.display = state==='over'?'flex':'none';
  syncMusicUi(); }
function lock(){ canvas.requestPointerLock(); }
document.addEventListener('pointerlockchange', ()=>{
  if(document.pointerLockElement===canvas){
    if(state==='ready'||state==='paused'||state==='map'){
      if(state==='ready') arsenal.resetActions?.();
      state='playing';
      setOverlay();
    }
  } else {
    if(state==='playing'){
      state='paused';
      setOverlay();
      showPauseButtons();
    }
  }
});
ui.start.addEventListener('click', ()=>{ audio.ensure(); lock(); });
canvas.addEventListener('click', ()=>{ if(state==='ready'){ audio.ensure(); lock(); } });

// Pause-Menü-Buttons
function showPauseButtons(){ $('pauseButtons').style.display='flex'; $('pauseControls').style.display='none'; }
$('pauseButtons').style.flexDirection='column'; $('pauseButtons').style.gap='12px'; $('pauseButtons').style.display='flex';
ui.pause.addEventListener('click', e=>{
  const act = e.target.getAttribute('data-act'); if(!act) return;
  if(act==='resume') lock();
  else if(act==='controls'){ $('pauseButtons').style.display='none'; $('pauseControls').style.display='block'; }
  else if(act==='back') showPauseButtons();
  else if(act==='music') toggleMusic();
  else if(act==='mute'){ audio.muted=!audio.muted; e.target.textContent = audio.muted?'🔇 Sound-FX: AUS':'🔊 Sound-FX: AN'; }
  else if(act==='quit') quit();
});
ui.gameover.addEventListener('click', e=>{ if(e.target.getAttribute('data-act')==='restart') restart(); });
function quit(){
  if(mpActive || net.connected){ net.disconnect(); clearRemotes(); mpActive=false; frags=0; $('frags').style.display='none'; $('mpStatus').textContent=''; }
  state='ready'; setOverlay(); resetRun();
}
function restart(){ resetRun(); state='ready'; setOverlay(); }
function resetRun(){
  broom.reset();
  for(const e of enemies){
    if (e.mixer) e.mixer.stopAllAction();
    scene.remove(e.g);
    e.g.traverse(o=>{ if(o.isMesh && o.geometry && !o.userData.sharedGeo) o.geometry.dispose(); });
    for(const m of (e.ownMats || [])) m.dispose();
  }
  enemies.length=0; enemyMeshes.length=0;
  crates.clear();
  setStance('stand');
  player.hp=player.maxHp; updateHealth(); score=0; kills=0; updateKills(); combo=1; updateScore();
  grenades = 3; updateGrenadeHud();
  arsenal.refill?.(); arsenal.switchSlot('primary');
  updateAmmo(); updateWeaponHud();
  camera.position.set(mapSpawn.x,groundAt(mapSpawn.x,mapSpawn.z)+player.height,mapSpawn.z); yaw=mapSpawn.yaw; pitch=0; wave=0; aliveTarget=0;
}

// ----------------------------------------------------------------------------
// Kollision (Kreis vs. AABB, XZ)
// ----------------------------------------------------------------------------
const _cp = { x: 0, z: 0, d2: 0 };   // Scratch für Polygon-Kollision
// Raster über die Hindernisse: große Karten haben >1000 Einträge (Häuser, Baumstämme) – geprüft werden
// nur die Zellen um die Abfrage. Kleine Karten (<200 Hindernisse) laufen wie bisher linear.
const OG_CELL = 16;
const og = { cells: new Map(), n: -1, first: null, last: null, stamp: 0, out: [] };
function obstaclesNear(minX, minZ, maxX, maxZ){
  if (obstacles.length < 200) return obstacles;
  if (og.n !== obstacles.length || og.first !== obstacles[0] || og.last !== obstacles[obstacles.length - 1]) {
    og.cells.clear();
    for (const o of obstacles) {
      for (let cx = Math.floor(o.minX / OG_CELL); cx <= Math.floor(o.maxX / OG_CELL); cx++)
        for (let cz = Math.floor(o.minZ / OG_CELL); cz <= Math.floor(o.maxZ / OG_CELL); cz++) {
          const k = cx * 4096 + cz; let c = og.cells.get(k); if (!c) og.cells.set(k, c = []); c.push(o);
        }
    }
    og.n = obstacles.length; og.first = obstacles[0]; og.last = obstacles[obstacles.length - 1];
  }
  const out = og.out; out.length = 0; const st = ++og.stamp;
  for (let cx = Math.floor(minX / OG_CELL); cx <= Math.floor(maxX / OG_CELL); cx++)
    for (let cz = Math.floor(minZ / OG_CELL); cz <= Math.floor(maxZ / OG_CELL); cz++) {
      const c = og.cells.get(cx * 4096 + cz); if (!c) continue;
      for (const o of c) if (o._og !== st) { o._og = st; out.push(o); }
    }
  return out;
}
function pushOutObstacles(pos, radius){   // Kreis vs. AABB — für Spieler UND Gegner (3D Etagen-Unterstützung)
  const footY = (pos.y !== undefined ? pos.y - player.height : 0);
  const headY = (pos.y !== undefined ? pos.y + 0.2 : 2.0);
  const m = radius + 1;
  for(const o of obstaclesNear(pos.x - m, pos.z - m, pos.x + m, pos.z + m)){
    const minY = (o.minY !== undefined) ? o.minY : -999;
    const maxY = (o.maxY !== undefined) ? o.maxY : (o.top !== undefined ? o.top : 999);
    if (headY < minY || footY > maxY) continue;

    if (o.poly) {   // echter Grundriss (OSM-Gebäude, Hecken)
      if (pos.x < o.minX-radius || pos.x > o.maxX+radius || pos.z < o.minZ-radius || pos.z > o.maxZ+radius) continue;
      const inside = pointInPoly(pos.x, pos.z, o.poly);
      const d = Math.sqrt(closestOnPoly(pos.x, pos.z, o.poly, _cp).d2);
      if (inside) {            // auf die nächste Kante + Radius hinausschieben
        if (d > 1e-5) { const nx = (_cp.x-pos.x)/d, nz = (_cp.z-pos.z)/d; pos.x = _cp.x + nx*radius; pos.z = _cp.z + nz*radius; }
      } else if (d < radius && d > 1e-5) {
        pos.x += (pos.x-_cp.x)/d*(radius-d); pos.z += (pos.z-_cp.z)/d*(radius-d);
      }
      continue;
    }
    const cx = THREE.MathUtils.clamp(pos.x, o.minX, o.maxX);
    const cz = THREE.MathUtils.clamp(pos.z, o.minZ, o.maxZ);
    const dx = pos.x-cx, dz = pos.z-cz; const d = Math.hypot(dx,dz);
    if(d < radius){ const push = (radius-d)||radius;
      if(d>0.0001){ pos.x += dx/d*push; pos.z += dz/d*push; } else { pos.x += radius; } }
  }
}
function collide(pos){
  pushOutObstacles(pos, player.radius);
  const B = getMapBounds();
  pos.x = THREE.MathUtils.clamp(pos.x, -(B.x - 1), B.x - 1);
  pos.z = THREE.MathUtils.clamp(pos.z, -(B.z - 1), B.z - 1);
}
// Punkt-in-Hindernis (mit Radius) — für Gegner-Wall-Slide (Fix R3 #2)
function pointBlocked(x,z,r){ for(const o of obstaclesNear(x-r,z-r,x+r,z+r)){ if(x>o.minX-r&&x<o.maxX+r&&z>o.minZ-r&&z<o.maxZ+r){
  if(!o.poly || pointInPoly(x,z,o.poly) || closestOnPoly(x,z,o.poly,_cp).d2 < r*r) return true; } } return false; }

// Sichtlinie: 2D-Segment (Gegner→Spieler) gegen die AABB-Hindernisse (Slab-Test).
function segBlocked(ax,az,bx,bz){
  const dx=bx-ax, dz=bz-az;
  const losH = (stance === 'prone') ? 0.40 : (stance === 'crouch' ? 0.95 : LOS_MIN_H);
  for(const o of obstaclesNear(Math.min(ax,bx), Math.min(az,bz), Math.max(ax,bx), Math.max(az,bz))){
    if(o.top < losH) continue;   // Deckungshöhe passt sich an Haltung an (Stehen: 1.4m, Ducken: 0.95m, Liegen: 0.40m)
    let t0=0, t1=1, hit=true;
    if(Math.abs(dx)<1e-6){ if(ax<o.minX||ax>o.maxX){ hit=false; } }
    else { let ta=(o.minX-ax)/dx, tb=(o.maxX-ax)/dx; if(ta>tb){const s=ta;ta=tb;tb=s;} t0=Math.max(t0,ta); t1=Math.min(t1,tb); }
    if(hit){ if(Math.abs(dz)<1e-6){ if(az<o.minZ||az>o.maxZ){ hit=false; } }
      else { let ta=(o.minZ-az)/dz, tb=(o.maxZ-az)/dz; if(ta>tb){const s=ta;ta=tb;tb=s;} t0=Math.max(t0,ta); t1=Math.min(t1,tb); } }
    if(hit && t0<=t1 && t1>=0 && t0<=1 && (!o.poly || segHitsPoly(ax,az,bx,bz,o.poly))) return true;
  }
  return false;
}

// ----------------------------------------------------------------------------
// Update
// ----------------------------------------------------------------------------
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
let stepTimer = 0;
function update(dt){
  // Blickrichtung
  camera.rotation.set(pitch, yaw, broom.active ? broom.roll : 0, 'YXZ');   // auf dem Besen mit Schräglage und Spirale
  recoil.x *= Math.pow(0.001,dt); recoil.y *= Math.pow(0.001,dt);

  // Bewegung
  const sprint = Boolean(keys['ShiftLeft']||keys['ShiftRight']);
  fwd.set(-Math.sin(yaw),0,-Math.cos(yaw));
  right.set(Math.cos(yaw),0,-Math.sin(yaw));
  tmp.set(0,0,0);
  if(keys['KeyW']) tmp.add(fwd); if(keys['KeyS']) tmp.sub(fwd);
  if(keys['KeyD']) tmp.add(right); if(keys['KeyA']) tmp.sub(right);
  const moving = tmp.lengthSq()>0; if(moving) tmp.normalize();

  let speed = 5.2;
  if (broom.active) {
    // Flugbesen: eigene Flugphysik (broom.js), danach dieselbe Kollision wie zu Fuß
    broom.update(dt, { yaw, pitch, forward: !!keys['KeyW'], brake: !!keys['KeyS'], left: !!keys['KeyA'], right: !!keys['KeyD'],
      up: !!keys['Space'], down: !!(keys['KeyC'] || keys['ControlLeft'] || keys['ControlRight']) });
    player.vy = 0; player.onGround = false;
  } else {
    // Sprinten bricht Ducken / Liegen automatisch ab (taktischer Stand-Sprint)
    if (sprint && moving && stance !== 'stand') {
      setStance('stand');
    }

    // Geschwindigkeitsanpassung je nach Haltung
    speed = 5.2;
    if (stance === 'crouch') {
      speed = 3.1;
    } else if (stance === 'prone') {
      speed = 1.65;
    } else if (sprint) {
      speed = 8.5;
    }
    camera.position.addScaledVector(tmp, speed*dt);

    // Weiche Körpergrößen-Interpolation (Stehen 1.70m <-> Ducken 1.08m <-> Liegen 0.45m)
    const prevH = player.height;
    player.height = THREE.MathUtils.lerp(player.height, player.targetHeight, 14 * dt);
    camera.position.y += (player.height - prevH);

    // Schrittgeräusche (Einzelschritte je Untergrund, Oberflächenerkennung)
    const currentSurface = (currentMapId === 'desert') ? 'sand' : 'concrete';
    if (moving && player.onGround) {
      stepTimer -= dt;
      if (stepTimer <= 0) {
        stepTimer = (stance === 'prone') ? 0.65 : (stance === 'crouch') ? 0.52 : (sprint ? 0.28 : 0.42);
        audio.step(sprint && stance === 'stand', currentSurface);
      }
    } else {
      stepTimer = 0.05;
    }

    // Antigravity-Auftriebszonen & Schwerkraft
    let inLift = false;
    const currentFootY = camera.position.y - player.height;
    for (const lz of liftZones) {
      if (camera.position.x >= lz.minX && camera.position.x <= lz.maxX &&
          camera.position.z >= lz.minZ && camera.position.z <= lz.maxZ &&
          currentFootY >= lz.minY - 0.2 && currentFootY <= lz.maxY) {
        inLift = true;
        // Sanfter Antigravity-Auftrieb nach oben
        player.vy = THREE.MathUtils.lerp(player.vy, lz.liftForce || 9.5, 7 * dt);
        player.onGround = false;
        if (Math.random() < 0.04) audio.antigrav();
        break;
      }
    }

    // Schwerkraft / Sprung
    if(keys['Space'] && player.onGround){
      if (stance !== 'stand') {
        setStance('stand');
        keys['Space'] = false; // Aufstehen statt direktem Hochspringen
      } else {
        player.vy = 6.2;
        player.onGround = false;
        audio.jump();
      }
    }
    if (!inLift) {
      player.vy -= 18*dt;
    }
    camera.position.y += player.vy*dt;

    // Mehrstöckige Landekollision auf Galerie-Etagen
    const targetFloorY = getFloorHeight(camera.position.x, camera.position.z, camera.position.y - player.height);
    if(camera.position.y <= targetFloorY + player.height){
      camera.position.y = targetFloorY + player.height;
      player.vy = 0;
      if(!player.onGround){ audio.land(currentSurface); }
      player.onGround = true;
    } else if (player.onGround && player.vy <= 0 && camera.position.y - player.height - targetFloorY < 0.5) {
      camera.position.y = targetFloorY + player.height;   // Hang/Stufe abwärts: am Boden kleben statt kurz abzuheben
      player.vy = 0;
    } else {
      if (player.vy < -0.5) player.onGround = false;
    }
  }
  collide(camera.position);

  // Lebensenergie-Regeneration nach kurzer Pause ohne Treffer
  if (player.hp > 0 && player.hp < player.maxHp && state === 'playing') {
    const timeSinceDmg = (performance.now() - lastDamageTime) / 1000;
    if (timeSinceDmg >= REGEN_DELAY) {
      player.hp = Math.min(player.maxHp, player.hp + REGEN_RATE * dt);
      updateHealth();
      if (player.hp >= player.maxHp) {
        ui.damageFlash.style.opacity = '0';
      }
    }
  }

  // FOV & Sniper-Scope Zoom
  const currentWpn = arsenal.currentWeapon;
  const isSniper = Boolean(currentWpn?.scope);
  const zoomFov = currentWpn?.scope?.zoomFov || 15;
  const targetFov = broom.active
    ? 75 + 14 * broom.speedFrac + broom.spiralFov       // Besen: weiteres Sichtfeld bei hoher Fahrt und in der Spirale
    : ads
      ? (isSniper ? zoomFov : 50)
      : (sprint && moving ? 82 : 75);

  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.pow(0.001, dt));
  camera.updateProjectionMatrix();

  // Sniper-Scope Overlay anzeigen, wenn mit Scharfschützengewehr gezielt wird
  const isScoped = isSniper && (arsenal.isScoped || (ads && arsenal.aimBlend > 0.82));
  if (ui.sniperScope) {
    if (isScoped) {
      if (ui.sniperScope.style.display !== 'flex') {
        ui.sniperScope.style.display = 'flex';
        audio.scopeZoom(true);
      }
      if (currentWpn?.scope?.overlay) {
        if (!ui.sniperScopeImg.src.endsWith(currentWpn.scope.overlay)) {
          ui.sniperScopeImg.src = currentWpn.scope.overlay;
        }
      }
    } else {
      if (ui.sniperScope.style.display !== 'none') {
        ui.sniperScope.style.display = 'none';
        audio.scopeZoom(false);
      }
    }
  }

  // Feuern & Ausrüstung
  if (meleeCd > 0) meleeCd -= dt;
  updateGrenades(dt);

  // Waffen-Update (Animationen, Nachladen, Kadenz, Mündungsfeuer)
  arsenal.update(dt, {
    speed,
    grounded: player.onGround,
    sprinting: sprint && moving && !ads && stance === 'stand' && !broom.active,
    moving,
    aiming: ads && !broom.active
  });
  updateAmmo();
  updateWeaponHud();

  // Combo-Timer
  if(comboT>0){ comboT-=dt; if(comboT<=0){ combo=1; } }
  ui.combo.textContent='COMBO x'+combo; ui.combo.classList.toggle('on', combo>=2);

  // Pickups (Karotten drehen + einsammeln = heilen)
  for(let i=pickups.length-1;i>=0;i--){ const p=pickups[i]; p.rotation.y+=dt*1.5;
    if(p.position.distanceTo(camera.position)<1.6){ player.hp=Math.min(player.maxHp,player.hp+25); updateHealth();
      audio.pickup(); scene.remove(p); pickups.splice(i,1); showPop('+25 ❤',false); } }

  // Feinde
  let alive=0;
  for(let i=enemies.length-1;i>=0;i--){
    const e = enemies[i];
    if(e.dead){
      e.deathT -= dt;
      if (e.z) {                                          // echte Zombies: Sterbe-Animation, dann im Boden versinken
        e.mixer.update(dt);
        if (e.deathT < 1.3) e.g.position.y -= dt * 0.8;
      } else {
        if (e.mixer) e.mixer.stopAllAction();
        e.g.rotation.x = Math.min(Math.PI * 0.48, e.g.rotation.x + dt * 4.5);
        e.g.position.y = Math.max(groundAt(e.g.position.x, e.g.position.z) - 0.35, e.g.position.y - dt * 1.5);
        e.g.scale.multiplyScalar(Math.max(0.01, 1 - dt * 1.2));
      }
      if(e.deathT<=0){
        scene.remove(e.g);
        for(const hb of (e.hitboxes || [])){
          const idx = enemyMeshes.indexOf(hb);
          if(idx >= 0) enemyMeshes.splice(idx, 1);
        }
        e.g.traverse(o=>{ if(o.isMesh && o.geometry && !o.userData.sharedGeo) o.geometry.dispose(); });
        for(const m of (e.ownMats || [])) m.dispose();
        enemies.splice(i,1);
      }
      continue;
    }

    if (e.flashUntil > 0 && performance.now() > e.flashUntil) {
      e.flashUntil = 0;
      for (const f of e.flashMats) {
        if (f.color) f.mat.color.copy(f.color);
        f.mat.emissive.copy(f.emissive);
        f.mat.emissiveIntensity = f.intensity;
      }
    }

    if (e.mixer) e.mixer.update(dt);

    alive++;
    const to = tmp.set(camera.position.x-e.g.position.x, 0, camera.position.z-e.g.position.z);
    const dist = to.length(); to.normalize();
    e.g.rotation.y = Math.atan2(to.x, to.z);
    const near = dist < 48;                     // teure Checks nur für nahe Gegner (Fix R3 #5)
    const walking = e.isZombie ? (dist > 1.35 && !(e.z && e.z.roarT > 0)) : (dist > 11);
    if (e.z) zombieAnimate(e, dt, dist);

    // Animation umschalten: Laufen vs. Stehen/Zielen
    if (e.runAction && e.idleAction) {
      if (walking && e.curAction !== 'run') {
        e.idleAction.fadeOut(0.2);
        e.runAction.reset().fadeIn(0.2).play();
        e.curAction = 'run';
      } else if (!walking && e.curAction !== 'idle') {
        e.runAction.fadeOut(0.2);
        e.idleAction.reset().fadeIn(0.2).play();
        e.curAction = 'idle';
      }
    }

    if(walking){
      let mv = to;
      // Wall-slide: voraus blockiert → an der FREIEN Tangente ausweichen; konkave Ecke (beide dicht) → kurz zurück (Fix R6)
      if(near && pointBlocked(e.g.position.x+to.x*0.9, e.g.position.z+to.z*0.9, 0.5)){
        const tx=-to.z, tz=to.x;
        const rightFree = !pointBlocked(e.g.position.x+tx*0.9, e.g.position.z+tz*0.9, 0.5);
        const leftFree  = !pointBlocked(e.g.position.x-tx*0.9, e.g.position.z-tz*0.9, 0.5);
        if(rightFree || leftFree){ const side = rightFree?1:-1; mv = tmp2.set(to.x*0.35 + tx*side, 0, to.z*0.35 + tz*side).normalize(); }
        else { mv = tmp2.set(-to.x, 0, -to.z); }   // beide Seiten dicht → kurz lösen statt klemmen
      }
      e.g.position.addScaledVector(mv, e.speed*dt*(e.z && e.z.staggerT > 0 ? 0.3 : 1));
      e.walk += dt*e.speed*2.4;                 // Geh-Zyklus nur beim Laufen (Fix R3 #3)
    }
    if(near){
      // Separation: Gegner stapeln sich nicht ineinander (R2 #5)
      for(const o of enemies){ if(o===e||o.dead) continue;
        const sdx=e.g.position.x-o.g.position.x, sdz=e.g.position.z-o.g.position.z, sd=Math.hypot(sdx,sdz);
        if(sd>0.0001 && sd<1.7){ const p=(1.7-sd)/sd*0.5; e.g.position.x+=sdx*p; e.g.position.z+=sdz*p; } }
      pushOutObstacles(e.g.position, 0.5);      // Hindernis-Kollision (R2 #4)
    }
    const EB = getMapBounds();
    e.g.position.x = THREE.MathUtils.clamp(e.g.position.x, -(EB.x - 2), EB.x - 2);
    e.g.position.z = THREE.MathUtils.clamp(e.g.position.z, -(EB.z - 2), EB.z - 2);

    if (!e.mixer) {
      e.g.position.y = groundAt(e.g.position.x, e.g.position.z) + (walking ? Math.abs(Math.sin(e.walk))*0.06 : 0) + Math.sin(performance.now()*0.003+e.bob)*0.03;
      if(e.legL){ const sw = walking ? Math.sin(e.walk)*0.6 : e.legL.rotation.x*0.8; e.legL.rotation.x=sw; e.legR.rotation.x=-sw; }
    } else {
      e.g.position.y = getFloorHeight(e.g.position.x, e.g.position.z, e.g.position.y);
    }

    // Angriff
    if (e.isZombie) {
      // Zombie-Stöhnen / Gutturaler Schrei in Spielernähe
      e.groanCd = (e.groanCd || 3) - dt;
      if (e.groanCd <= 0 && dist < 24 && Math.random() < 0.35) {
        audio.zombieGroan();
        e.groanCd = 4 + Math.random() * 5;
      }
      e.cd -= dt;
      if (dist < 1.85 && e.cd <= 0) {
        e.cd = 0.85 + Math.random() * 0.35;
        const dmg = 12 + Math.random() * 8;
        player.hp -= dmg;
        updateHealth();
        damageFeedback();
        audio.zombieAttack();
        impact(camera.position.clone().addScaledVector(to, -0.6), '#ff2222', 12);
        if (player.hp <= 0) { gameOver(); }
      }
    } else {
      // Söldner Fernkampf — Sichtlinie nur ~5×/s prüfen
      e.cd -= dt; e.losT -= dt;
      if(e.losT<=0){ e.losT = 0.2+Math.random()*0.1;
        e.blocked = dist<28 ? segBlocked(e.g.position.x, e.g.position.z, camera.position.x, camera.position.z) : true; }
      if(dist<26 && e.cd<=0 && !e.blocked){
        e.cd = 1.3+Math.random()*0.7;                        // nur bei freier Sichtlinie → Deckung wirkt
        player.hp -= 8+Math.random()*6; updateHealth(); damageFeedback();
        const ep = e.g.position.clone().setY(e.g.position.y + 1.4 * (e.scale || 1.3)); tracer(ep, camera.position.clone());
        if(player.hp<=0){ gameOver(); }
      }
    }
  }
  // Welle geschafft? (nur Solo — im Mehrspieler keine KI-Wellen)
  if(state==='playing' && !mpActive && alive===0 && aliveTarget<=0){ startWave(); }
  if(net.connected) mpUpdate(dt);

  // Munitionskisten: auftauchen lassen, drehen, einsammeln
  {
    const w = arsenal.currentWeapon, a = arsenal.ammo;
    const lowAmmo = Boolean(w && !w.melee && a.reserve < a.magSize);
    crates.update(dt, camera.position, camera.position.y - player.height, state === 'playing' && !mpActive, lowAmmo);
  }

  // FX updaten (Pools — nichts wird alloziert/disposed)
  for(const m of tracerPool){ if(!m.visible) continue; m.userData.life-=dt; m.material.opacity=Math.max(0,m.userData.life/0.08);
    if(m.userData.life<=0) m.visible=false; }
  for(const s of sparkPool){ if(!s.pts.visible) continue; s.life-=dt; const pos=s.geo.attributes.position.array;
    for(let k=0;k<s.v.length;k++){ s.v[k].y-=9*dt; pos[k*3]+=s.v[k].x*dt; pos[k*3+1]+=s.v[k].y*dt; pos[k*3+2]+=s.v[k].z*dt; }
    s.geo.attributes.position.needsUpdate=true; s.pts.material.opacity=Math.max(0,s.life/0.5);
    if(s.life<=0) s.pts.visible=false; }

  // Sonne folgt Spieler (Schatten-Frustum bleibt zentriert), außer im Atrium & Halle
  if (currentMapId !== 'warehouse' && currentMapId !== 'atrium') {
    if (currentMapId === 'desert') {
      sun.position.set(camera.position.x + 40, 50, camera.position.z - 40);
    } else if (currentMapId === 'night') {
      sun.position.set(camera.position.x - 30, 40, camera.position.z - 30);
    } else if (currentMapId === 'osm' || currentMapId === 'much') {
      sun.position.set(camera.position.x + 50, camera.position.y + 75, camera.position.z - 50);
    } else {
      sun.position.set(camera.position.x - 60, 22, camera.position.z - 40);
    }
    sun.target.position.copy(camera.position); sun.target.updateMatrixWorld();
  }
}

function gameOver(){
  state='over'; document.exitPointerLock(); setOverlay();
  broom.reset();
  ui.finalScore.textContent=score;
  const isZ = (gameMode === 'zombies');
  const finalKillsEl = $('finalKills');
  if (finalKillsEl) finalKillsEl.textContent = kills;
  const finalKillsIcon = $('finalKillsIcon');
  if (finalKillsIcon) finalKillsIcon.textContent = isZ ? '🧟' : '💀';
  const gameOverTitle = $('gameOverTitle');
  if (gameOverTitle) gameOverTitle.textContent = isZ ? 'ÜBERLEBEN GESCHEITERT' : 'EINSATZ BEENDET';
  const gmBtn = $('gameOverModeBtn');
  if (gmBtn) gmBtn.textContent = isZ ? '🎮 Modus: 🧟 ZOMBIES' : '🎮 Modus: 🛡️ SÖLDNER';
  if(score>highscore){ highscore=score; localStorage.setItem('rod.highscore',score); ui.record.textContent='🏆 NEUER REKORD!'; }
  else ui.record.textContent='Rekord: '+highscore;
  showHighscoreBox();
}

// ----------------------------------------------------------------------------
// Bestenliste (online, je Karte und Modus; Server: server/src/highscores.ts)
// ----------------------------------------------------------------------------
const mapName = (id) => (MAP_CONFIGS.find(m => m.id === id) || {}).name || id;
const modeName = (m) => (m === 'zombies' ? 'Zombies' : 'Söldner');
let hsPending = null;          // Ergebnis der letzten Runde, das noch eingetragen werden kann

function showHighscoreBox(){
  const mode = gameMode === 'zombies' ? 'zombies' : 'classic';
  hsPending = score > 0 ? { map: currentMapId, mode, score, kills, wave } : null;
  $('hsBoard').textContent = mapName(currentMapId) + ' · ' + modeName(mode);
  $('hsName').value = localStorage.getItem('rod.name') || '';
  $('hsForm').style.display = hsPending ? 'flex' : 'none';
  $('hsList').replaceChildren();
  $('hsMsg').textContent = 'Lade Bestenliste …';
  fetchTop(currentMapId, mode)
    .then(d => { renderTop($('hsList'), d.top); $('hsMsg').textContent = d.top.length ? '' : 'Noch keine Einträge – trag dich als Erster ein!'; })
    .catch(() => { $('hsMsg').textContent = 'Bestenliste gerade nicht erreichbar.'; $('hsForm').style.display = 'none'; });
}

async function submitHighscore(){
  if (!hsPending) return;
  const name = $('hsName').value.trim().slice(0, 16) || 'Hase';
  localStorage.setItem('rod.name', name);
  $('hsSubmit').disabled = true;
  $('hsMsg').textContent = 'Wird eingetragen …';
  try {
    const r = await submitScore({ name, ...hsPending });
    hsPending = null;
    $('hsForm').style.display = 'none';
    renderTop($('hsList'), r.top, r.rank);
    $('hsMsg').textContent = !r.rank ? 'Eingetragen.' : (r.rank <= 10 ? `🏆 Platz ${r.rank}!` : `Platz ${r.rank} – knapp an den Top 10 vorbei.`);
  } catch (err) {
    $('hsMsg').textContent = /429/.test(err.message) ? 'Bitte kurz warten und noch einmal versuchen.' : 'Eintragen hat nicht geklappt (Server nicht erreichbar).';
  } finally {
    $('hsSubmit').disabled = false;
  }
}
$('hsSubmit').addEventListener('click', e => { e.stopPropagation(); submitHighscore(); });
$('hsName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitHighscore(); } });

// Bestenliste aus dem Startmenü: beide Modi der aktuellen Karte
function openHighscoreModal(){
  $('hsModalMap').textContent = mapName(currentMapId);
  $('hsModal').style.display = 'flex';
  $('hsModalMsg').textContent = 'Lade …';
  const lists = { classic: $('hsListClassic'), zombies: $('hsListZombies') };
  let failed = 0;
  for (const mode of (SOELDNER_SICHTBAR ? ['classic', 'zombies'] : ['zombies'])) {
    lists[mode].replaceChildren();
    fetchTop(currentMapId, mode)
      .then(d => { renderTop(lists[mode], d.top); if (!d.top.length) lists[mode].innerHTML = '<li class="empty">Noch keine Einträge</li>'; })
      .catch(() => { failed++; })
      .finally(() => { $('hsModalMsg').textContent = failed ? 'Bestenliste gerade nicht erreichbar.' : ''; });
  }
}
$('hsBtn').addEventListener('click', e => { e.stopPropagation(); openHighscoreModal(); });
$('hsCloseBtn').addEventListener('click', e => { e.stopPropagation(); $('hsModal').style.display = 'none'; });
$('hsModal').addEventListener('click', e => { e.stopPropagation(); if (e.target.id === 'hsModal') $('hsModal').style.display = 'none'; });

// ----------------------------------------------------------------------------
// Taktisches Map-Radar (UAV)
// ----------------------------------------------------------------------------
const radarCanvas = $('radarCanvas');
const radarCtx = radarCanvas ? radarCanvas.getContext('2d') : null;
let radarSweep = 0;

function updateRadar(dt) {
  if (!radarCtx) return;
  const w = 150, h = 150;
  const cx = w / 2, cy = h / 2, radius = 68;

  radarCtx.clearRect(0, 0, w, h);
  radarSweep = (radarSweep + dt * 2.8) % (Math.PI * 2);

  radarCtx.save();
  radarCtx.beginPath();
  radarCtx.arc(cx, cy, radius, 0, Math.PI * 2);
  radarCtx.clip();

  // Hintergrund-Raster
  radarCtx.fillStyle = 'rgba(8, 16, 22, 0.9)';
  radarCtx.fillRect(0, 0, w, h);

  // Distanz-Ringe (22m, 44m, 66m)
  radarCtx.strokeStyle = 'rgba(126, 240, 192, 0.2)';
  radarCtx.lineWidth = 1;
  for (const r of [22, 44, 66]) {
    radarCtx.beginPath();
    radarCtx.arc(cx, cy, r, 0, Math.PI * 2);
    radarCtx.stroke();
  }

  // Fadenkreuz
  radarCtx.beginPath();
  radarCtx.moveTo(cx, cy - radius); radarCtx.lineTo(cx, cy + radius);
  radarCtx.moveTo(cx - radius, cy); radarCtx.lineTo(cx + radius, cy);
  radarCtx.stroke();

  // Rotierender Radar-Sweep-Strahl
  radarCtx.save();
  radarCtx.translate(cx, cy);
  radarCtx.rotate(radarSweep);
  const grad = radarCtx.createRadialGradient(0, 0, 4, 0, 0, radius);
  grad.addColorStop(0, 'rgba(126, 240, 192, 0.35)');
  grad.addColorStop(1, 'rgba(126, 240, 192, 0.0)');
  radarCtx.fillStyle = grad;
  radarCtx.beginPath();
  radarCtx.moveTo(0, 0);
  radarCtx.arc(0, 0, radius, 0, 0.55);
  radarCtx.closePath();
  radarCtx.fill();
  radarCtx.restore();

  // Nord-Markierung (rotiert gegen Spieler-Blickrichtung yaw)
  const northAngle = -yaw;
  const nx = cx + Math.sin(northAngle) * (radius - 8);
  const ny = cy - Math.cos(northAngle) * (radius - 8);
  radarCtx.fillStyle = '#7ef0c0';
  radarCtx.font = 'bold 9px monospace';
  radarCtx.textAlign = 'center';
  radarCtx.textBaseline = 'middle';
  radarCtx.fillText('N', nx, ny);

  // Feinde / Zombies auf Radar zeichnen
  const isZ = (gameMode === 'zombies');
  const radarRange = 65; // 65 Meter Radius
  const scale = (radius - 6) / radarRange;
  const sinY = Math.sin(-yaw);
  const cosY = Math.cos(-yaw);

  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.g.position.x - camera.position.x;
    const dz = e.g.position.z - camera.position.z;

    // Relative Drehung zur Spieler-Blickrichtung
    const rx = dx * cosY - dz * sinY;
    const rz = dx * sinY + dz * cosY;

    let px = cx + rx * scale;
    let py = cy + rz * scale;                 // vorne = oben (vorher vertauscht)
    const dFromCenter = Math.hypot(px - cx, py - cy);
    const maxDotR = radius - 5;
    if (dFromCenter > maxDotR) {
      px = cx + ((px - cx) / dFromCenter) * maxDotR;
      py = cy + ((py - cy) / dFromCenter) * maxDotR;
    }

    radarCtx.save();
    radarCtx.fillStyle = isZ ? '#ff2a2a' : '#ff4444';
    radarCtx.shadowColor = isZ ? '#ff0033' : '#ff3333';
    radarCtx.shadowBlur = 6;
    radarCtx.beginPath();
    const dotSize = e.isZombie && e.type === 'zombie_brute' ? 4.5 : (isZ ? 3.4 : 3.0);
    radarCtx.arc(px, py, dotSize, 0, Math.PI * 2);
    radarCtx.fill();
    radarCtx.restore();
  }

  // Munitionskisten: gelbe Quadrate, außerhalb der Reichweite am Rand (zeigt die Richtung)
  for (const c of crates.list) {
    const dx = c.g.position.x - camera.position.x, dz = c.g.position.z - camera.position.z;
    let px = cx + (dx * cosY - dz * sinY) * scale, py = cy + (dx * sinY + dz * cosY) * scale;
    const d = Math.hypot(px - cx, py - cy), maxR = radius - 6;
    if (d > maxR) { px = cx + (px - cx) / d * maxR; py = cy + (py - cy) / d * maxR; }
    radarCtx.fillStyle = '#ffd24a';
    radarCtx.fillRect(px - 3.5, py - 3.5, 7, 7);
  }

  // Navi: Route + Ziel (gleiche Drehung wie die Gegnerpunkte)
  nav?.drawRadar(radarCtx, camera.position, (dx, dz) => ({ x: cx + (dx * cosY - dz * sinY) * scale, y: cy + (dx * sinY + dz * cosY) * scale }), cx, cy, radius - 5);

  // Spieler-Zentrum: Heller grüner Pfeil nach OBEN
  radarCtx.fillStyle = '#7ef0c0';
  radarCtx.shadowColor = '#7ef0c0';
  radarCtx.shadowBlur = 4;
  radarCtx.beginPath();
  radarCtx.moveTo(cx, cy - 6);
  radarCtx.lineTo(cx - 4.5, cy + 5);
  radarCtx.lineTo(cx, cy + 2.5);
  radarCtx.lineTo(cx + 4.5, cy + 5);
  radarCtx.closePath();
  radarCtx.fill();
  radarCtx.shadowBlur = 0;

  radarCtx.restore();
}

// ----------------------------------------------------------------------------
// Musik- & Spielmodus-Verwaltung
// ----------------------------------------------------------------------------
function syncMusicUi() {
  const isMuted = music.muted;
  const text = isMuted ? 'Musik: AUS' : 'Musik: AN';
  const icon = isMuted ? '🔇' : '🎵';

  const hudMusicText = $('hudMusicText');
  if (hudMusicText) hudMusicText.textContent = text;
  const hudBtn = $('hudMusicBtn');
  if (hudBtn) {
    hudBtn.style.borderColor = isMuted ? 'rgba(255,255,255,0.2)' : 'rgba(126,240,192,0.5)';
    hudBtn.style.color = isMuted ? '#888' : '#7ef0c0';
  }

  const startMusicBtn = $('startMusicBtn');
  if (startMusicBtn) {
    startMusicBtn.textContent = `${icon} ${text}`;
    startMusicBtn.style.borderColor = isMuted ? 'rgba(255,255,255,0.2)' : 'rgba(126,240,192,0.5)';
    startMusicBtn.style.color = isMuted ? '#888' : '#7ef0c0';
  }

  const pauseMusicBtn = $('pauseMusicBtn');
  if (pauseMusicBtn) {
    pauseMusicBtn.textContent = `${icon} ${text}`;
    pauseMusicBtn.style.borderColor = isMuted ? 'rgba(255,255,255,0.2)' : 'rgba(126,240,192,0.5)';
    pauseMusicBtn.style.color = isMuted ? '#888' : '#7ef0c0';
  }
}

function toggleMusic() {
  audio.ensure();
  music.unlock(audio.ctx);
  const unmuted = music.toggleMute();
  syncMusicUi();
  showBanner(unmuted ? 'MUSIK AN' : 'MUSIK AUS');
}

function setGameMode(mode) {
  if (!SOELDNER_SICHTBAR) mode = 'zombies';            // Söldner ausgeblendet: immer Zombie-Überleben
  gameMode = (mode === 'zombies') ? 'zombies' : 'classic';
  localStorage.setItem('rod.gameMode', gameMode);

  const isZ = (gameMode === 'zombies');
  const classicBtn = $('modeClassicBtn');
  const zombiesBtn = $('modeZombiesBtn');
  const modeDesc = $('modeDescription');
  const radarBadge = $('radarModeBadge');
  const pauseModeBtn = $('pauseModeBtn');
  const gameOverModeBtn = $('gameOverModeBtn');

  if (classicBtn && zombiesBtn) {
    if (isZ) {
      zombiesBtn.style.border = '2px solid #ff4d6d';
      zombiesBtn.style.background = 'rgba(60,18,26,0.95)';
      zombiesBtn.style.boxShadow = '0 0 16px rgba(255,77,109,0.4)';
      classicBtn.style.border = '1px solid rgba(255,255,255,0.2)';
      classicBtn.style.background = 'rgba(16,22,28,0.7)';
      classicBtn.style.boxShadow = 'none';
      if (modeDesc) modeDesc.innerHTML = '🧟 <b>Zombie-Überleben:</b> Wilde gefräßige Horden jagen dich! Sie sind etwas langsamer als dein Gehen/Sprinten.';
      if (modeDesc) modeDesc.style.color = '#ff6b8b';
    } else {
      classicBtn.style.border = '2px solid #7ef0c0';
      classicBtn.style.background = 'rgba(26,54,46,0.95)';
      classicBtn.style.boxShadow = '0 0 16px rgba(126,240,192,0.3)';
      zombiesBtn.style.border = '1px solid rgba(255,255,255,0.2)';
      zombiesBtn.style.background = 'rgba(24,12,16,0.7)';
      zombiesBtn.style.boxShadow = 'none';
      if (modeDesc) modeDesc.innerHTML = '🛡️ <b>Klassisch: Söldner:</b> Taktische Gefechte gegen bewaffnete Söldner in Deckung.';
      if (modeDesc) modeDesc.style.color = '#7ef0c0';
    }
  }

  if (radarBadge) radarBadge.textContent = isZ ? 'Z-RADAR' : 'RADAR';
  if (pauseModeBtn) pauseModeBtn.textContent = isZ ? '🎮 Modus: 🧟 ZOMBIES' : '🎮 Modus: 🛡️ SÖLDNER';
  if (gameOverModeBtn) gameOverModeBtn.textContent = isZ ? '🎮 Modus: 🧟 ZOMBIES' : '🎮 Modus: 🛡️ SÖLDNER';

  updateKills();
  const waveLabel = $('wave')?.querySelector('.lbl');
  if (waveLabel) waveLabel.textContent = isZ ? 'Runde' : 'Welle';

  if (state === 'ready') {
    resetRun();
    startWave();
  }
}

function setupGameModeAndMusicListeners() {
  $('hudMusicBtn')?.addEventListener('click', (e) => { e.stopPropagation(); toggleMusic(); });
  $('startMusicBtn')?.addEventListener('click', (e) => { e.stopPropagation(); toggleMusic(); });
  $('modeClassicBtn')?.addEventListener('click', (e) => { e.stopPropagation(); setGameMode('classic'); });
  $('modeZombiesBtn')?.addEventListener('click', (e) => { e.stopPropagation(); setGameMode('zombies'); });
  $('pauseModeBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    setGameMode(gameMode === 'zombies' ? 'classic' : 'zombies');
    resetRun();
    startWave();
    lock();
  });
  $('gameOverModeBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    setGameMode(gameMode === 'zombies' ? 'classic' : 'zombies');
    restart();
  });
  if (!SOELDNER_SICHTBAR) {
    // Nur Zombie-Überleben: Modus-Wahl, Umschalter und die Söldner-Spalte der Bestenliste ausblenden
    for (const id of ['modeHeader', 'modeButtons', 'pauseModeBtn', 'gameOverModeBtn']) {
      const el = $(id);
      if (el) el.style.display = 'none';
    }
    const col = $('hsListClassic')?.parentElement;
    if (col) { col.style.display = 'none'; col.parentElement.style.gridTemplateColumns = '1fr'; }
  }
}

// ----------------------------------------------------------------------------
// Karte & Navi (Taste N / Tab): Ziel setzen, Route folgen
// ----------------------------------------------------------------------------
nav = new NavMap({ scene, obstacles, getBounds: getMapBounds, groundAt: (x, z) => groundAt(x, z), getEnemies: () => enemies, banner: showBanner });
nav.onRequestClose = (mode) => closeNavMap(mode);
function openNavMap(){
  state = 'map'; setOverlay();
  nav.open(camera.position);
  document.exitPointerLock();
}
function closeNavMap(mode){
  nav.close();
  if (mode === 'pause') { state = 'paused'; setOverlay(); showPauseButtons(); }
  else lock();                                          // pointerlockchange setzt 'playing'
}
function navMapKey(e){
  if (e.code === 'KeyN' || e.code === 'Tab') { e.preventDefault(); closeNavMap('resume'); }
  else if (e.code === 'Escape') closeNavMap('pause');
  else if (e.code === 'Space') { e.preventDefault(); nav.center(camera.position); }
  else if (e.code === 'Delete' || e.code === 'Backspace') nav.clearMarker();
}
document.addEventListener('pointerlockerror', () => { if (state === 'map') { state = 'paused'; setOverlay(); showPauseButtons(); } });

// ----------------------------------------------------------------------------
// Loop
// ----------------------------------------------------------------------------
let last = performance.now();
function frame(now){
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now-last)/1000); last=now;
  if(state==='playing') update(dt);
  else {
    broom.quiet();                                   // Pause/Menü: Flugwind aus
    for (const e of enemies) {
      if (e.mixer) e.mixer.update(dt);
    }
    arsenal.update(dt, { speed: 0, grounded: true, sprinting: false, moving: false, aiming: false });
  }
  updateRadar(dt);
  const currentWpn = arsenal.currentWeapon;
  const isSniper = Boolean(currentWpn?.scope);
  const isScoped = isSniper && (arsenal.isScoped || (ads && arsenal.aimBlend > 0.82));
  ui.crosshair.classList.toggle('ads', arsenal.isAiming || isScoped);
  skyRig.position.copy(camera.position);
  if (mapTick) mapTick(camera);
  if (state === 'playing') nav.update(dt, camera.position, yaw);
  if (nav.isOpen) nav.draw(camera.position, yaw);
  renderFrame();
}
function renderFrame(){
  const q = gpuTimerBegin();
  try {
    renderer.clear();
    renderer.render(scene, camera);
    if (!broom.active) arsenal.render(renderer);    // auf dem Besen halten die Hände den Besen (Bild), keine Waffe
  } finally { gpuTimerEnd(q); }
  adaptResolution();
}

// ----------------------------------------------------------------------------
// Adaptive Auflösung: GPU-Zeit je Bild per Timer-Query messen und die Pixelratio so
// nachführen, dass ~60 FPS gehalten werden (scharf, wenn Luft ist; weicher, wenn es eng wird).
// Ohne Timer-Query (z. B. Firefox): nur herunterregeln, wenn Bilder verloren gehen.
// ----------------------------------------------------------------------------
const resCtl = { gl: renderer.getContext(), ext: null, pending: [], free: [], samples: [], dts: [], lastT: 0, lastAdjust: 0, avg: 0 };
resCtl.ext = resCtl.gl.getExtension('EXT_disjoint_timer_query_webgl2');
const GPU_TARGET = 10.5, GPU_HIGH = 13;                         // ms pro Bild (60-Hz-Budget 16,7 ms minus Luft für Browser/CPU)
function gpuTimerBegin(){
  const { gl, ext } = resCtl;
  if (!ext || resCtl.pending.length > 6) return null;
  const q = resCtl.free.pop() || gl.createQuery();
  gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
  return q;
}
function gpuTimerEnd(q){
  const { gl, ext } = resCtl;
  if (!ext) return;
  resCtl.frame = (resCtl.frame || 0) + 1;
  if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); q._frame = resCtl.frame; resCtl.pending.push(q); }
  const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
  while (resCtl.pending.length) {
    const head = resCtl.pending[0];
    if (gl.getQueryParameter(head, gl.QUERY_RESULT_AVAILABLE)) {
      resCtl.pending.shift();
      if (!disjoint) resCtl.samples.push(gl.getQueryParameter(head, gl.QUERY_RESULT) / 1e6);
      resCtl.free.push(head);
    } else if (resCtl.frame - head._frame > 30) {   // Ergebnis kommt nie (Treiber/Kontextwechsel) → verwerfen statt blockieren
      resCtl.pending.shift(); gl.deleteQuery(head);
    } else break;
  }
}
function setRenderScale(pr){
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
}
function adaptResolution(){
  const now = performance.now();
  if (resCtl.lastT) resCtl.dts.push(now - resCtl.lastT);
  resCtl.lastT = now;
  if (now - resCtl.lastAdjust < 1500) return;                  // ~1,5 s sammeln
  const samples = resCtl.samples, dts = resCtl.dts;
  resCtl.lastAdjust = now;
  const usable = state === 'playing' && !(FIXED_PR > 0) && now - lastMapLoadT > 2500;
  const pr = renderer.getPixelRatio();
  let next = pr;
  if (usable && resCtl.ext && samples.length >= 20) {
    samples.sort((a, b) => a - b);
    const gpu = samples[Math.floor(samples.length * 0.8)];     // 80-%-Wert: Spitzen zählen, Ausreißer nicht
    resCtl.avg = gpu;
    // GPU-Zeit wächst etwa mit der Pixelzahl (∝ pr²): runter, wenn es eng wird; hoch, wenn die Prognose ins Budget passt
    if (gpu > GPU_HIGH) next = Math.max(MIN_PR, pr * Math.max(0.75, Math.sqrt(GPU_TARGET / gpu)));
    else if (pr < MAX_PR) {
      const up = Math.min(MAX_PR, Math.floor(pr * Math.min(1.15, Math.sqrt(GPU_TARGET / gpu)) * 20) / 20);
      if (up > pr && gpu * (up / pr) ** 2 <= GPU_TARGET) next = up;
    }
  } else if (usable && !resCtl.ext && dts.length >= 30) {
    dts.sort((a, b) => a - b);
    if (dts[Math.floor(dts.length / 2)] > 19) next = Math.max(MIN_PR, pr - 0.1);   // < ~52 FPS
  }
  samples.length = 0; dts.length = 0;
  next = Math.round(next * 20) / 20;                           // 5-%-Schritte
  if (Math.abs(next - pr) >= 0.05) {
    setRenderScale(next);
    console.log(`🖥️ Auflösung ${Math.round(next * 100)} % (GPU ${resCtl.avg.toFixed(1)} ms/Bild)`);
  }
}

// ----------------------------------------------------------------------------
// Shader & Texturen vorab auf die GPU bringen (sonst ruckelt es beim ersten Schuss/Treffer,
// weil Programme für Funken, Leuchtspur, Mündungsfeuer erst dann übersetzt werden)
// ----------------------------------------------------------------------------
let lastMapLoadT = 0;
const warmBits = (() => {           // typische Effekt-Materialien, die erst später entstehen
  const g = new THREE.Group(), geo = new THREE.PlaneGeometry(0.01, 0.01);
  g.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false })));
  g.add(new THREE.Sprite(new THREE.SpriteMaterial({ color: '#ffffff', transparent: true, depthWrite: false })));
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffd27a' })));
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false })));
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, fog: false })));
  return g;
})();
function warmUpGpu(withGeometry = false){
  lastMapLoadT = performance.now();
  try {
    renderer.compile(warmBits, camera, scene);          // mit Licht/Nebel der Spielszene
    renderer.compile(scene, camera);                    // auch unsichtbare Pools (Funken, Leuchtspuren)
    const texs = new Set();
    const grab = (root) => root.traverse(o => {
      for (const m of [].concat(o.material || [])) for (const v of Object.values(m)) if (v && v.isTexture) texs.add(v);
    });
    grab(scene);
    arsenal.compile?.(renderer);
    for (const t of texs) renderer.initTexture(t);
    if (withGeometry) uploadMapGeometry();
  } catch (err) { console.warn('GPU-Vorwärmen:', err); }
}
// Karten-Geometrie vorab hochladen: alles einmal (auch außerhalb des Blickfelds, alle Detailstufen) in ein
// 1×1-Ziel zeichnen. Sonst lädt die Grafikkarte große Häuser-Kacheln erst beim ersten Sichtkontakt → Ruckler.
const warmTarget = new THREE.WebGLRenderTarget(1, 1);
function uploadMapGeometry(){
  const items = [];
  mapGroup.traverse(o => { if (o.isMesh) items.push(o); });
  const saved = items.map(o => [o, o.frustumCulled, o.geometry, o.visible]);
  const prevTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(warmTarget);
  const passes = Math.max(1, ...items.map(o => o.userData.lodGeos?.length || 1));
  for (let p = 0; p < passes; p++) {
    for (const o of items) {
      const g = o.userData.lodGeos;
      o.frustumCulled = false;
      o.visible = p === 0 || (g && p < g.length);
      if (g) o.geometry = g[Math.min(p, g.length - 1)];
    }
    renderer.render(scene, camera);
  }
  renderer.setRenderTarget(prevTarget);
  for (const [o, fc, g, vis] of saved) { o.frustumCulled = fc; o.geometry = g; o.visible = vis; }
}

addEventListener('resize', ()=>{
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  arsenal.setSize?.(innerWidth, innerHeight);
});

// WebGL-Context-Lost absichern (schwache Ziel-GPU / 2 GB VRAM) — Fix #1
canvas.addEventListener('webglcontextlost', e => { e.preventDefault();
  if(state==='playing'){ state='paused'; setOverlay(); showPauseButtons(); } document.exitPointerLock?.(); });
canvas.addEventListener('webglcontextrestored', () => { /* Three.js baut GL-Ressourcen beim nächsten Frame neu auf */ });

// ----------------------------------------------------------------------------
// Waffenkammer UI
// ----------------------------------------------------------------------------
function setupArmoryUI() {
  const modal = $('armoryModal');
  const grid = $('armoryGrid');
  const statusEl = $('armoryStatus');
  const tabPrimary = $('tabPrimary');
  const tabSecondary = $('tabSecondary');
  const tabCamo = $('tabCamo');
  let currentTab = 'primary';

  function updateStatus() {
    const p = arsenal.findWeapon(arsenal.loadout.primary);
    const s = arsenal.findWeapon(arsenal.loadout.secondary);
    if (statusEl) {
      statusEl.textContent = `Ausrüstung: ${p?.name || '–'} (Primär) | ${s?.name || '–'} (Sekundär)`;
    }
  }

  // Anzahl aus dem Katalog zählen, damit sie zu den Karten passt. Eine GLB-Waffe, deren Datei
  // fehlt, ist dort als unavailable markiert und zählt nicht mit.
  function updateCounts() {
    const prim = arsenal.weaponsOfClass('primary');
    const sec = arsenal.weaponsOfClass('secondary');
    const guns = [...prim, ...sec].filter((w) => !w.melee).length;
    const melee = prim.length + sec.length - guns;
    const countEl = $('armoryCount');
    if (countEl) countEl.textContent = `(${guns} WAFFEN${melee ? ' & NAHKAMPF' : ''})`;
    if (tabPrimary) tabPrimary.textContent = `Primärwaffen (${prim.length})`;
    if (tabSecondary) tabSecondary.textContent = `Sekundär & Nahkampf (${sec.length})`;
  }

  function renderGrid() {
    grid.innerHTML = '';
    tabPrimary.style.background = currentTab === 'primary' ? 'var(--accent)' : 'transparent';
    tabPrimary.style.color = currentTab === 'primary' ? '#100b00' : 'var(--ink)';
    tabSecondary.style.background = currentTab === 'secondary' ? 'var(--accent)' : 'transparent';
    tabSecondary.style.color = currentTab === 'secondary' ? '#100b00' : 'var(--ink)';
    tabCamo.style.background = currentTab === 'camo' ? 'var(--accent)' : 'transparent';
    tabCamo.style.color = currentTab === 'camo' ? '#100b00' : 'var(--ink)';

    if (currentTab === 'primary' || currentTab === 'secondary') {
      const list = arsenal.weaponsOfClass(currentTab);
      for (const w of list) {
        const isEquipped = (currentTab === 'primary' ? arsenal.loadout.primary : arsenal.loadout.secondary) === w.id;
        const card = document.createElement('div');
        card.className = 'armory-card' + (isEquipped ? ' selected' : '');
        card.style.cssText = `
          background: ${isEquipped ? '#1a2736' : '#121822'};
          border: 2px solid ${isEquipped ? 'var(--accent)' : 'rgba(255,255,255,0.1)'};
          border-radius: 8px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          flex-direction: column;
          gap: 6px;
        `;
        card.onmouseenter = () => { if (!isEquipped) card.style.borderColor = 'rgba(255,255,255,0.4)'; };
        card.onmouseleave = () => { if (!isEquipped) card.style.borderColor = 'rgba(255,255,255,0.1)'; };

        const img = w.cardArt ? `<img src="${w.cardArt}" alt="" onerror="this.remove()" style="width:100%;height:80px;object-fit:contain;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.6))" />` : '';
        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:900;font-size:1.1rem;color:${isEquipped ? 'var(--accent)' : '#fff'}">${w.name}</span>
            <span style="font-size:0.75rem;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.08);color:var(--muted)">${w.role || w.class}</span>
          </div>
          ${img}
          <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--muted);border-top:1px solid rgba(255,255,255,0.06);padding-top:4px">
            <span>Magazin: <b style="color:#fff">${w.melee ? '–' : w.magazineSize}</b></span>
            <span>Kadenz: <b style="color:#fff">${w.melee ? '–' : w.roundsPerMinute + ' RPM'}</b></span>
            <span>Schaden: <b style="color:#fff">${w.damage}</b></span>
          </div>
          ${isEquipped ? '<div style="font-size:0.75rem;font-weight:800;color:var(--accent);text-align:center;margin-top:2px">✓ AUSGERÜSTET</div>' : ''}
        `;

        card.addEventListener('click', async () => {
          if (currentTab === 'primary') {
            arsenal.loadout.primary = w.id;
            if (arsenal.activeId !== arsenal.loadout.secondary) {
              await arsenal.loadWeapon(w.id);
              arsenal.equip(w.id);
            }
          } else {
            arsenal.loadout.secondary = w.id;
            if (arsenal.activeId === arsenal.loadout.secondary) {
              await arsenal.loadWeapon(w.id);
              arsenal.equip(w.id);
            }
          }
          updateAmmo();
          updateWeaponHud();
          updateStatus();
          renderGrid();
        });

        grid.appendChild(card);
      }
    }
  }

  tabPrimary?.addEventListener('click', () => { currentTab = 'primary'; renderGrid(); });
  tabSecondary?.addEventListener('click', () => { currentTab = 'secondary'; renderGrid(); });
  tabCamo?.addEventListener('click', () => { currentTab = 'camo'; renderGrid(); });

  const openArmory = (ev) => {
    if (ev) ev.stopPropagation();
    modal.style.display = 'flex';
    updateStatus();
    updateCounts();
    renderGrid();
  };

  const closeArmory = () => {
    modal.style.display = 'none';
  };

  $('armoryBtn')?.addEventListener('click', openArmory);
  $('pauseArmoryBtn')?.addEventListener('click', openArmory);
  $('gameOverArmoryBtn')?.addEventListener('click', openArmory);
  $('armoryCloseBtn')?.addEventListener('click', closeArmory);
  $('armoryEquipBtn')?.addEventListener('click', () => {
    closeArmory();
    audio.ensure();
    lock();
  });
  $('soloPlayBtn')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    audio.ensure();
    lock();
  });
}

// ----------------------------------------------------------------------------
// Kartenauswahl UI (4 Einsatzgebiete)
// ----------------------------------------------------------------------------
function setupMapUI() {
  const modal = $('mapModal');
  const grid = $('mapGrid');
  const statusEl = $('mapStatus');
  const closeBtn = $('mapCloseBtn');
  const confirmBtn = $('mapSelectConfirmBtn');
  let selectedMap = currentMapId;

  function updateStatus() {
    const cfg = MAP_CONFIGS.find(m => m.id === selectedMap) || MAP_CONFIGS[0];
    if (statusEl) {
      statusEl.innerHTML = `Ausgewählte Karte: <span style="color:var(--accent)">${cfg.name}</span> <span style="color:var(--muted)">(${cfg.badge})</span>`;
    }
  }

  function renderGrid() {
    if (!grid) return;
    grid.innerHTML = '';
    for (const cfg of MAP_CONFIGS) {
      const isSelected = selectedMap === cfg.id;
      const isCurrentActive = currentMapId === cfg.id;
      const card = document.createElement('div');
      card.className = 'map-card' + (isSelected ? ' selected' : '');
      card.style.cssText = `
        background: ${isSelected ? '#1c2838' : '#121822'};
        border: 2px solid ${isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.12)'};
        border-radius: 10px;
        padding: 14px;
        cursor: pointer;
        transition: all 0.15s ease;
        display: flex;
        flex-direction: column;
        gap: 8px;
        position: relative;
        overflow: hidden;
      `;
      if (isSelected) {
        card.style.boxShadow = '0 0 16px rgba(255,138,61,0.35)';
      }

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-weight:800;font-size:1.05rem;color:${isSelected ? 'var(--accent)' : '#fff'}">${cfg.name}</div>
          <span style="font-size:0.75rem;font-weight:800;background:${isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.1)'};color:${isSelected ? '#100b00' : 'var(--mint)'};padding:2px 8px;border-radius:4px">${cfg.badge}</span>
        </div>
        <div style="font-size:0.75rem;color:var(--muted);font-weight:600;letter-spacing:0.5px">${cfg.type}</div>
        <div style="width:100%;height:110px;border-radius:6px;overflow:hidden;border:1px solid rgba(255,255,255,0.15);position:relative">
          <img src="${cfg.thumb}" alt="${cfg.name}" style="width:100%;height:100%;object-fit:cover" />
          ${isCurrentActive ? '<div style="position:absolute;top:6px;right:6px;background:var(--mint);color:#06140d;font-weight:900;font-size:11px;padding:2px 6px;border-radius:3px">AKTIVE KARTE</div>' : ''}
        </div>
        <div style="font-size:0.8rem;color:rgba(255,255,255,0.72);line-height:1.35;margin-top:2px">${cfg.desc}</div>
      `;

      card.addEventListener('mouseenter', () => {
        if (selectedMap !== cfg.id) card.style.borderColor = 'rgba(255,255,255,0.35)';
      });
      card.addEventListener('mouseleave', () => {
        if (selectedMap !== cfg.id) card.style.borderColor = 'rgba(255,255,255,0.12)';
      });

      card.addEventListener('click', () => {
        selectedMap = cfg.id;
        updateStatus();
        renderGrid();
      });

      card.addEventListener('dblclick', () => {
        selectedMap = cfg.id;
        applyMapAndStart();
      });

      grid.appendChild(card);
    }
  }

  function applyMapAndStart() {
    loadMap(selectedMap);
    closeMapModal();
    audio.ensure();
    for (const e of enemies) scene.remove(e.g);
    enemies.length = 0;
    enemyMeshes.length = 0;
    wave = 0;
    startWave();
    lock();
  }

  const openMapModal = (ev) => {
    if (ev) ev.stopPropagation();
    selectedMap = currentMapId;
    modal.style.display = 'flex';
    updateStatus();
    renderGrid();
  };

  const closeMapModal = () => {
    modal.style.display = 'none';
  };

  $('mapSelectBtn')?.addEventListener('click', openMapModal);
  $('pauseMapBtn')?.addEventListener('click', openMapModal);
  $('gameOverMapBtn')?.addEventListener('click', openMapModal);
  closeBtn?.addEventListener('click', closeMapModal);
  confirmBtn?.addEventListener('click', applyMapAndStart);
}

// ----------------------------------------------------------------------------
// Ladesequenz (Stufen-Balken) → Start
// ----------------------------------------------------------------------------
async function bootUp(){
  try {
    audio.ensure();
    boot.say('Welt aufbauen…'); boot.prog(0.2);
    loadMap(currentMapId);
    await new Promise(r=>setTimeout(r, 80));

    boot.say('Arsenal initialisieren…'); boot.prog(0.4);
    try {
      await arsenal.init();
    } catch (e) {
      console.warn('Arsenal init:', e);
    }

    boot.say('Soldaten-Gegner laden…'); boot.prog(0.7);
    try {
      const gltfLoader = new GLTFLoader();
      const gltf = await gltfLoader.loadAsync('assets/models/soldier/Soldier.glb');
      gltf.scene.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true;
          o.frustumCulled = false;
          o.userData.sharedGeo = true;
        }
      });
      soldierTemplate = {
        scene: gltf.scene,
        animations: gltf.animations || []
      };
      console.log('✅ 3D-Shooter Soldier model geladen:', gltf.animations.map(a => a.name));
    } catch (e) {
      console.warn('Soldier model fallback:', e);
    }

    boot.say('Zombies laden…'); boot.prog(0.8);
    try {
      zombieTemplate = await loadZombieTemplate();
      console.log('✅ Zombie-Modell geladen:', [...zombieTemplate.clips.keys()].join(', '), `(${zombieTemplate.skins.length} Hautvarianten)`);
    } catch (e) {
      console.warn('Zombie-Modell nicht gefunden – Ersatz-Zombies. Anleitung: README, Abschnitt „Zombie-Modell“.', e.message);
    }

    boot.say('Waffenkammer & Karten vorbereiten…'); boot.prog(0.9);
    setupArmoryUI();
    setupMapUI();
    await new Promise(r=>setTimeout(r, 80));

    boot.say('Bereit'); boot.prog(1);
  } catch (err) {
    console.error('Bootup error:', err);
  } finally {
    boot.done();
    updateHealth(); updateAmmo(); updateScore(); updateWeaponHud(); updateGrenadeHud();
    updateStanceHud();
    ui.stanceWrap?.addEventListener('click', () => {
      if (stance === 'stand') setStance('crouch');
      else if (stance === 'crouch') setStance('prone');
      else setStance('stand');
    });
    syncMusicUi();
    setGameMode(gameMode);
    setupGameModeAndMusicListeners();
    startWave();
    state='ready'; setOverlay();
    warmUpGpu();                    // Gegner + Waffen sind jetzt da → ihre Shader/Texturen vorab hochladen
    requestAnimationFrame(frame);
  }
}
bootUp();

// ============================================================================
// Mehrspieler (Colyseus) — behält die Netzwerkfähigkeit aus dem 3d-shooter.
// Derselbe ArenaRoom-Server (server/), 1-gegen-1-Deathmatch, Port 2567.
// ============================================================================
const net = new Net();
let mpActive=false, mpFrozen=false, mpSpawned=false, frags=0, lastMoveSent=0, lastMyHp=100;
const MP_HIT_DMG=50, MP_MOVE_MS=50;
const remoteAvatars = new Map();   // id -> {g, hitbox}
const remoteHitboxes = [];         // Raycast-Ziele fürs Schießen

function makeAvatar(){
  const g = new THREE.Group();
  let mixer = null, idleAction = null, walkAction = null;
  const ownMats = [];

  if (soldierTemplate) {
    const inst = cloneSkinned(soldierTemplate.scene);
    inst.scale.setScalar(1.3);
    inst.rotation.y = Math.PI;
    g.add(inst);

    if (soldierTemplate.animations && soldierTemplate.animations.length > 0) {
      mixer = new THREE.AnimationMixer(inst);
      const idleClip = THREE.AnimationClip.findByName(soldierTemplate.animations, 'Idle');
      const walkClip = THREE.AnimationClip.findByName(soldierTemplate.animations, 'Walk');
      const runClip  = THREE.AnimationClip.findByName(soldierTemplate.animations, 'Run');
      if (idleClip) idleAction = mixer.clipAction(idleClip);
      if (runClip || walkClip) walkAction = mixer.clipAction(runClip || walkClip);
      if (idleAction) idleAction.play();
    }

    inst.traverse(obj => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.raycast = () => {};
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      obj.material = mats.map(m => {
        const cloned = m.clone();
        ownMats.push(cloned);
        if (cloned.isMeshStandardMaterial) {
          cloned.color.lerp(new THREE.Color('#3880ff'), 0.52);
          if (obj.name.toLowerCase().includes('visor')) {
            cloned.color.set('#00e5ff');
            cloned.emissive.set('#00e5ff');
            cloned.emissiveIntensity = 0.95;
          }
        }
        return cloned;
      });
      if (Array.isArray(obj.material) && obj.material.length === 1) obj.material = obj.material[0];
    });
  } else {
    const m = new THREE.MeshStandardMaterial({ color:'#4a6ea8', roughness:.6, metalness:.12, emissive:'#22304a', emissiveIntensity:.4 });
    const torso=new THREE.Mesh(new THREE.CapsuleGeometry(0.35,0.7,4,10), m); torso.position.y=1.05; torso.castShadow=true; g.add(torso);
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.28,14,12), m); head.position.y=1.75; head.castShadow=true; g.add(head);
  }

  const hitbox = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42, 1.6, 4, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  hitbox.position.y = 1.05;
  hitbox.userData.enemyRef = g;
  g.add(hitbox);

  if (typeof blobTex !== 'undefined' && blobTex) {
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    blob.raycast = () => {};
    g.add(blob);
  }

  scene.add(g);
  return { g, hitbox, mixer, idleAction, walkAction, current: 'idle', ownMats };
}
function clearRemotes(){
  for(const [,a] of remoteAvatars) {
    if (a.mixer) a.mixer.stopAllAction();
    scene.remove(a.g);
    for (const m of (a.ownMats || [])) m.dispose();
  }
  remoteAvatars.clear();
  remoteHitboxes.length = 0;
}

function syncRemote(dt){
  const players = net.players; if(!players) return;
  players.forEach((p, id)=>{
    if(id===net.sessionId) return;
    let a = remoteAvatars.get(id);
    if(!a){ a = makeAvatar(); a.hitbox.userData.remoteId=id; a.g.position.set(p.x,0,p.z); remoteAvatars.set(id,a); remoteHitboxes.push(a.hitbox); }
    const prevX = a.g.position.x, prevZ = a.g.position.z;
    const k = Math.min(1, dt*12);                          // sanftes Nachziehen der Netz-Position
    a.g.position.x += (p.x - a.g.position.x)*k;
    a.g.position.z += (p.z - a.g.position.z)*k;
    a.g.position.y = Math.max(0, p.y - 1.6);               // Server-y ist Augenhöhe (1.6); Avatar steht am Boden
    a.g.rotation.y = p.ry;
    a.g.visible = !p.dead;

    if (a.mixer) {
      a.mixer.update(dt);
      const moved = Math.hypot(a.g.position.x - prevX, a.g.position.z - prevZ) > 0.005;
      if (moved && a.current !== 'walk') {
        a.idleAction?.fadeOut(0.2);
        a.walkAction?.reset().fadeIn(0.2).play();
        a.current = 'walk';
      } else if (!moved && a.current !== 'idle') {
        a.walkAction?.fadeOut(0.2);
        a.idleAction?.reset().fadeIn(0.2).play();
        a.current = 'idle';
      }
    }
  });
  for(const [id,a] of remoteAvatars){
    if(!players.get(id)){
      if (a.mixer) a.mixer.stopAllAction();
      scene.remove(a.g);
      for (const m of (a.ownMats || [])) m.dispose();
      const i=remoteHitboxes.indexOf(a.hitbox);
      if(i>=0) remoteHitboxes.splice(i,1);
      remoteAvatars.delete(id);
    }
  }
}
function syncMyHealth(){
  const me = net.getPlayer(net.sessionId); if(!me) return;
  if(!mpSpawned){ camera.position.set(me.x, me.y, me.z); yaw=me.ry; mpSpawned=true; lastMyHp=me.hp; }  // einmaliger Spawn-Teleport
  if(me.hp<lastMyHp) damageFeedback();
  if(me.hp!==lastMyHp){ player.hp=me.hp; updateHealth(); lastMyHp=me.hp; }
  if(me.kills!==frags){ frags=me.kills; $('fragsNum').textContent=frags; }
  if(mpFrozen && !me.dead){ camera.position.set(me.x,me.y,me.z); mpFrozen=false; lastMyHp=me.hp; }        // Respawn
}
function mpUpdate(dt){
  syncMyHealth();
  const now=performance.now();
  if(mpSpawned && !mpFrozen && now-lastMoveSent>=MP_MOVE_MS){ lastMoveSent=now;
    const p=camera.position; const moving = !!(keys['KeyW']||keys['KeyS']||keys['KeyA']||keys['KeyD']);
    net.sendMove(p.x,p.y,p.z,yaw,moving); }
  syncRemote(dt);
}

net.on('shot', s=>{ const m=new THREE.Vector3(s.x,s.y,s.z).addScaledVector(new THREE.Vector3(s.dx,s.dy,s.dz),1.0); impact(m,'#ffd98a',6); audio.play('shot_rifle', { volume:0.7, pitch:0.95 }); })
   .on('killed', k=>{ if(k.victim===net.sessionId){ mpFrozen=true; showBanner('ELIMINIERT'); } else if(k.killer===net.sessionId){ showBanner('KILL!'); } })
   .on('left', ()=>{ mpActive=false; $('mpStatus').textContent='Verbindung getrennt.'; clearRemotes(); })
   .on('join', (id,p)=> showBanner(((p&&p.name)||'GEGNER')+' IST DA'))
   .on('leave', ()=> showBanner('GEGNER WEG'));

$('mpBtn').addEventListener('click', async (ev)=>{
  ev.stopPropagation();                                   // nicht gleichzeitig Solo-Start auslösen
  if(mpActive || net.connected) return;
  const url = net.defaultUrl();
  $('mpStatus').textContent = 'Verbinde mit '+url+' …';
  try { await net.connect(url, 'Hase'); }
  catch(err){ console.error('[net] connect failed', err); $('mpStatus').textContent='Server nicht erreichbar — läuft server/ (npm start)?'; return; }
  mpActive=true; mpFrozen=false; mpSpawned=false; frags=0; lastMyHp=100;
  broom.reset();                       // Besen gibt es nur im Einzelspiel
  for(let i=enemies.length-1;i>=0;i--) scene.remove(enemies[i].g); enemies.length=0; enemyMeshes.length=0; aliveTarget=1;  // KI-Wellen aus
  player.hp=100; updateHealth(); $('fragsNum').textContent='0'; $('frags').style.display='block';
  $('mpStatus').textContent=''; audio.ensure(); lock();
});

// Debug-Hook für Screenshot-Automatik & Tests
window.__ROD__ = {
  camera, scene, renderer, arsenal, audio, music, player, damageFeedback, meleeAttack,
  crates, gameOver, broom,
  get grenades(){return grenades;},
  get score(){return score;},
  set score(v){ score = v; updateScore(); },
  get state(){return state;},
  set state(s){ state = s; setOverlay(); },
  spawnWave:startWave,
  loadMap(id) {
    loadMap(id);
    for (const e of enemies) scene.remove(e.g);
    enemies.length = 0;
    enemyMeshes.length = 0;
    wave = 0;
    startWave();
  },
  get currentMap() { return currentMapId; },
  get mapConfigs() { return MAP_CONFIGS; },
  groundAt: (x, z) => groundAt(x, z),          // Geländehöhe (Tests)
  get renderScale() { return renderer.getPixelRatio(); },   // aktuelle Pixelratio (adaptive Auflösung)
  get gpuMs() { return resCtl.avg; },                        // zuletzt gemessene GPU-Zeit je Bild (80-%-Wert)
  setRenderScale, warmUpGpu, get resCtl() { return resCtl; }, get nav() { return nav; },
  get yaw() { return yaw; }, set yaw(v) { yaw = v; },
  get mapBound() { return getMapBound(); },
  get mapBounds() { return getMapBounds(); },
  get obstacles() { return obstacles; },
  async equipWeapon(id) {
    await arsenal.loadWeapon(id);
    arsenal.loadout.primary = id;
    arsenal.equip(id);
    updateAmmo();
    updateWeaponHud();
  },
  // Posierte Kampf-Szene für Kritiker-Screenshots (Overlay aus, Feinde nah)
  demo(){
    document.getElementById('start').style.display='none';
    document.getElementById('banner').classList.remove('show');
    camera.position.set(4,1.7,20); camera.rotation.set(-0.05, Math.PI, 0, 'YXZ');
    for(let i=pickups.length-1;i>=0;i--){ if(pickups[i].position.distanceTo(camera.position)<15){ scene.remove(pickups[i]); pickups.splice(i,1);} }
    makeEnemy(3,28); makeEnemy(-4,31); makeEnemy(9,33); makeEnemy(0,42);
    camera.updateMatrixWorld();
    arsenal.update(1/60, { speed: 0, grounded: true, sprinting: false, moving: false, aiming: false });
    renderFrame();
  },
  getStance: () => stance,
  setStance: (s) => setStance(s),
};
// Über DOM-Event auslösbar (Automations-evaluate läuft in isolierter Welt,
// sieht window.__ROD__ nicht — das DOM aber schon).
document.addEventListener('rod-demo', () => window.__ROD__.demo());
document.addEventListener('rod-play', () => { state = 'playing'; setOverlay(); });
document.addEventListener('rod-shoot', () => { arsenal.setTrigger(true); setTimeout(() => arsenal.setTrigger(false), 80); });
document.addEventListener('rod-ads', () => { ads = !ads; });
document.addEventListener('rod-reload', () => { arsenal.reload(); });
document.addEventListener('rod-melee', () => { meleeAttack(); });
document.addEventListener('rod-stance', (e) => {
  const target = e.detail?.stance || (stance === 'stand' ? 'crouch' : stance === 'crouch' ? 'prone' : 'stand');
  setStance(target);
});
document.addEventListener('rod-equip', async (e) => {
  const id = e.detail?.id || 'dsr50';
  await arsenal.loadWeapon(id);
  arsenal.loadout.primary = id;
  arsenal.equip(id);
  updateAmmo();
  updateWeaponHud();
});
document.addEventListener('rod-map', (e) => {
  const mapId = e.detail?.id || 'warehouse';
  window.__ROD__.loadMap(mapId);
});
document.addEventListener('rod-aimshoot', () => {
  const alive = enemies.filter(e=>!e.dead); if(!alive.length) return;
  alive.sort((a,b)=>a.g.position.distanceTo(camera.position)-b.g.position.distanceTo(camera.position));
  const t = alive[0].g.position.clone().setY(1.15*1.1); const d = t.sub(camera.position);
  yaw = Math.atan2(-d.x,-d.z); pitch = Math.atan2(d.y, Math.hypot(d.x,d.z));
  camera.rotation.set(pitch,yaw,0,'YXZ'); camera.updateMatrixWorld();
  arsenal.setTrigger(true); setTimeout(() => arsenal.setTrigger(false), 80);
});
// Nach jedem Frame Live-Status ins DOM (für Automations-Checks): Feinde/Score/HP
document.addEventListener('rod-mp', () => $('mpBtn').click());   // Mehrspieler verbinden (Test)
setInterval(() => { document.body.dataset.rod = JSON.stringify({
  state, enemies: enemies.filter(e=>!e.dead).length, total: enemies.length, score, hp: Math.round(player.hp),
  mp: mpActive, sid: net.sessionId||'', np: net.players ? net.players.size : 0, remotes: remoteAvatars.size,
  stance, playerH: +(player.height.toFixed(2)),
  vmTris: renderer.info.render.triangles, vmCalls: renderer.info.render.calls, adsT: arsenal.isAiming ? 1 : 0, weapon: arsenal.currentWeapon?.name || '' }); }, 120);
