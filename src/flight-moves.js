// Flug-Manöver auf dem Besen: Looping, Fassrolle, Spirale und Trick.
//
// Die Kurven gelten für beide Seiten: Der eigene Flug (broom.js) dreht damit die Kamera und versetzt die Position,
// die Mitflieger-Figur (flyer.js) dreht sich auf dem anderen Rechner genauso. Die Position der Figur kommt dort weiter
// aus der normalen Positionsmeldung, die die Bahn ja schon enthält.
//
// Rahmen: Blickrichtung beim Start des Manövers, x = rechts, y = oben, -z = vorne (wie die Kamera).
//   looping  fwd: klassisch nach oben über Kopf   back: nach unten, kopfüber unten durch
//   roll     left / right: Fassrolle mit kleinem Seitensatz
//   spiral   left / right: Steilspirale, ganze Kurve mit Schräglage und etwas Steigen
//            fwd / back: Korkenzieher nach vorne / hinten (Rolle mit Satz, das Mausrad)
//   trick    nur die Animation „Trick“ mit einem kleinen Hopser
import * as THREE from 'three';

const TAU = Math.PI * 2;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const smooth = (t) => t * t * (3 - 2 * t);
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();

/** Animation der Figur je Manöver (SoldierBesen.glb). */
export const MOVE_ANIM = { looping: 'HoldTight', roll: 'Roll', spiral: 'Roll', trick: 'Trick',
  wave: 'Wave', handstand: 'Handstand', liedown: 'LieDown', dance: 'Dance' };
export const MOVE_DIRS = { looping: ['fwd', 'back'], roll: ['left', 'right'], spiral: ['left', 'right', 'fwd', 'back'], trick: [''],
  wave: [''], handstand: [''], liedown: [''], dance: [''] };
/** Kunststücke ohne Flugbahn: nur die Animation (Winken, Handstand, Hinlegen, Tanzen; 30 fps im Modell). */
export const POSE_MOVES = { wave: 42 / 30, handstand: 80 / 30, liedown: 78 / 30, dance: 80 / 30 };
/** Bei diesen sitzt die Ich-Kamera im Körper: solange von hinten zuschauen. */
export const MOVE_THIRD_PERSON = new Set(['handstand', 'liedown', 'dance']);

export function isMove(move, dir) { return !!MOVE_DIRS[move] && MOVE_DIRS[move].includes(dir); }

/** Dauer in Sekunden. */
export function moveDur(move, dir) {
  if (move === 'looping') return 1.4;
  if (move === 'roll') return 1.0;
  if (move === 'spiral') return dir === 'fwd' || dir === 'back' ? 0.8 : 1.5;
  if (POSE_MOVES[move]) return POSE_MOVES[move];
  return 1.3;                                       // Trick: so lang wie die Animation
}

/**
 * true: Die Bahn ersetzt den normalen Flug (Looping, Steilspirale – man kommt an derselben Stelle mit derselben
 * Fahrt wieder heraus). false: Die Bahn kommt zum normalen Flug dazu (Rolle, Korkenzieher, Trick).
 */
export function moveReplacesFlight(move, dir) {
  return move === 'looping' || (move === 'spiral' && (dir === 'left' || dir === 'right'));
}

/** Radius für Looping und Steilspirale nach der Fahrt beim Start: die Bahn dauert so lang wie das Manöver. */
export function moveRadius(move, dir, speed) {
  return THREE.MathUtils.clamp((speed * moveDur(move, dir)) / TAU, 4, 9);
}

/** Drehung der Figur bzw. Kamera im Startrahmen, t = 0 … 1. */
export function moveQuat(move, dir, t, out) {
  const s = smooth(THREE.MathUtils.clamp(t, 0, 1));
  const left = dir === 'left' ? 1 : -1;
  switch (move) {
    case 'looping': return out.setFromAxisAngle(X, (dir === 'back' ? -1 : 1) * TAU * s);
    case 'roll': return out.setFromAxisAngle(Z, left * TAU * s);
    case 'spiral':
      if (dir === 'fwd' || dir === 'back') return out.setFromAxisAngle(Z, (dir === 'fwd' ? -1 : 1) * TAU * s);   // vorwärts rollt nach rechts
      qa.setFromAxisAngle(Y, left * TAU * s);
      qb.setFromAxisAngle(Z, left * 1.05 * Math.sin(Math.PI * s));                                              // Schräglage in die Kurve
      return out.multiplyQuaternions(qa, qb);
    default: return out.identity();
  }
}

/** Versatz der Bahn im Startrahmen (Meter), t = 0 … 1. R aus moveRadius. */
export function moveOffset(move, dir, t, R, out) {
  const s = smooth(THREE.MathUtils.clamp(t, 0, 1)), a = TAU * s;
  const left = dir === 'left' ? 1 : -1;
  switch (move) {
    case 'looping': return out.set(0, (dir === 'back' ? -1 : 1) * R * (1 - Math.cos(a)), -R * Math.sin(a));
    case 'roll': return out.set(-left * 4 * s, 0.8 * Math.sin(Math.PI * s), 0);
    case 'spiral':
      if (dir === 'fwd' || dir === 'back') {
        const sign = dir === 'fwd' ? 1 : -1;
        return out.set((Math.cos(a) - 1) * 0.9, Math.sin(a) * 0.9 * sign, -sign * 14 * s);
      }
      return out.set(-left * R * (1 - Math.cos(a)), 6 * s, -R * Math.sin(a));
    case 'trick': return out.set(0, 0.6 * Math.sin(Math.PI * s), 0);
    default: return out.set(0, 0, 0);
  }
}

/** Zusätzliches Sichtfeld während eines Manövers (Grad). */
export function moveFov(t) { return Math.sin(Math.PI * THREE.MathUtils.clamp(t, 0, 1)) * 8; }

/** Startrahmen aus Blickrichtung: d vorne, r rechts, u oben (Weltkoordinaten). */
export function moveFrame(yaw, pitch, d, r, u) {
  const cp = Math.cos(pitch);
  d.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  r.set(Math.cos(yaw), 0, -Math.sin(yaw));
  u.crossVectors(r, d).normalize();
}
