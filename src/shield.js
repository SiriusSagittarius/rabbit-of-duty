// Schutzschild für die Besenflieger: leuchtende Energiekugel mit flimmernden Blitz-Adern,
// hellem Rand (Fresnel), Treffer-Welle und Farbstufen.
// Das Modell SoldierBesen.glb enthält schon eine passende Kugel namens "Schild" (am Hüftknochen).
// Fehlt sie, wird hier eine eigene Ellipsoid-Kugel erzeugt.
//
// Benutzung:
//   import { createShield, SHIELD_LEVELS } from './shield.js';
//   const shield = createShield(flyerModel);   // flyerModel = geladene SoldierBesen.glb-Szene
//   shield.setLevel(2);          // Farbstufe 0..4 (siehe SHIELD_LEVELS)
//   shield.setEnergy(0.4);       // ODER: Farbe automatisch nach Schildenergie 0..1 (rot -> blau)
//   shield.hit(worldPoint);      // Treffer: Aufblitzen + Welle ab dem Trefferpunkt
//   shield.setVisible(true);
//   shield.update(dt);           // jeden Frame aufrufen
import * as THREE from 'three';

export const SHIELD_LEVELS = [
  { name: 'Blau',  color: 0x3fa9ff },
  { name: 'Türkis', color: 0x2fffd2 },
  { name: 'Lila',  color: 0xb46bff },
  { name: 'Gold',  color: 0xffc43a },
  { name: 'Rot',   color: 0xff4a3a },
];

// Farbverlauf für setEnergy(): leer -> voll
const ENERGY_RAMP = [0xff3a2a, 0xffb02e, 0x2fffd2, 0x3fa9ff].map((c) => new THREE.Color(c));

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const vertexShader = /* glsl */ `
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vViewDir;
void main(){
  vObj = normalize(position);                       // Richtung auf der Kugel (unabhängig von der Größe)
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3  uColor;
uniform float uOpacity;
uniform float uFlash;
uniform vec3  uHitDir;
uniform float uHitAge;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vViewDir;
${NOISE}
float veins(vec3 p, float t){
  float n1 = 1.0 - abs(snoise(p * 2.2 + vec3(0.0, t * 0.35, t * 0.2)));
  float n2 = 1.0 - abs(snoise(p * 4.7 - vec3(t * 0.3, 0.0, t * 0.45)));
  return pow(n1, 14.0) + 0.6 * pow(n2, 18.0);      // dünne, verästelte Blitzlinien
}
void main(){
  float facing  = abs(dot(normalize(vNormalW), normalize(vViewDir)));
  float fresnel = pow(1.0 - facing, 2.2);
  float v = veins(vObj, uTime);
  float flicker = 0.85 + 0.15 * sin(uTime * 23.0 + vObj.y * 9.0);
  // Treffer-Welle: Ring, der sich vom Trefferpunkt über die Kugel ausbreitet
  float ang = acos(clamp(dot(vObj, uHitDir), -1.0, 1.0));
  float ring = uHitAge < 1.2 ? smoothstep(0.25, 0.0, abs(ang - uHitAge * 3.0)) * (1.0 - uHitAge / 1.2) : 0.0;
  float glow = 0.05 + fresnel * 0.9 + v * 0.9 * flicker + ring * 1.2 + uFlash * 0.6;
  vec3 col = mix(uColor, vec3(1.0), clamp(v * 0.55 + ring * 0.6 + uFlash * 0.4, 0.0, 1.0));
  gl_FragColor = vec4(col * glow, clamp(glow, 0.0, 1.0) * uOpacity);
}`;

function makeMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(SHIELD_LEVELS[0].color) },
      uOpacity: { value: 1 },
      uFlash: { value: 0 },
      uHitDir: { value: new THREE.Vector3(0, 0, 1) },
      uHitAge: { value: 99 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

export function createShield(model) {
  let mesh = model.getObjectByName('Schild');
  if (!mesh || !mesh.isMesh) {
    // Ersatz, falls das Modell keine Schild-Kugel hat: Ellipsoid um Reiter + Besen
    mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32));
    mesh.name = 'Schild';
    mesh.scale.set(0.75, 0.85, 1.45);
    mesh.position.set(0, 1.0, 0);
    model.add(mesh);
  }
  const mat = makeMaterial();
  mesh.material = mat;
  mesh.renderOrder = 10;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  const targetColor = mat.uniforms.uColor.value.clone();
  let visible = true;
  let fade = 1;          // 0..1 Ein-/Ausblenden
  const tmp = new THREE.Vector3();

  return {
    mesh,
    setLevel(i) {
      const lv = SHIELD_LEVELS[Math.max(0, Math.min(SHIELD_LEVELS.length - 1, i | 0))];
      targetColor.set(lv.color);
    },
    setEnergy(e) {
      const x = Math.max(0, Math.min(1, e)) * (ENERGY_RAMP.length - 1);
      const k = Math.min(ENERGY_RAMP.length - 2, Math.floor(x));
      targetColor.copy(ENERGY_RAMP[k]).lerp(ENERGY_RAMP[k + 1], x - k);
    },
    hit(worldPoint) {
      mat.uniforms.uFlash.value = 1;
      mat.uniforms.uHitAge.value = 0;
      if (worldPoint) {
        mesh.updateWorldMatrix(true, false);
        tmp.copy(worldPoint);
        mesh.worldToLocal(tmp);
        if (tmp.lengthSq() > 1e-6) mat.uniforms.uHitDir.value.copy(tmp.normalize());
      }
    },
    setVisible(v) { visible = v; if (v) mesh.visible = true; },
    update(dt) {
      const u = mat.uniforms;
      u.uTime.value += dt;
      u.uFlash.value = Math.max(0, u.uFlash.value - dt * 3);
      u.uHitAge.value += dt;
      u.uColor.value.lerp(targetColor, Math.min(1, dt * 6));   // weicher Farbwechsel
      fade += ((visible ? 1 : 0) - fade) * Math.min(1, dt * 8);
      u.uOpacity.value = fade;
      mesh.visible = fade > 0.01;
    },
  };
}
