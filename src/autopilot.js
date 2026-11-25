// Autopilot für den Flugbesen (Taste P oder Knopf in der Karte).
//
// Fliegt die Luftroute des Navis (navmap.js) zum gewählten Mitflieger: Blick und Flug folgen einem Punkt ein Stück
// voraus auf der Route (über die Dächer), weit weg mit Boost, vor dem Ziel wird gebremst. Ist man angekommen,
// bleibt man im Begleitflug schräg hinter ihm und fliegt mit. Die Flugphysik bleibt in broom.js: der Autopilot
// liefert nur Blickrichtung (yaw, pitch) und die gewünschte Geschwindigkeit (inp.auto). Wer selbst lenkt, beendet
// ihn (main.js).
import * as THREE from 'three';

const NEAR_IN = 16, NEAR_OUT = 30;          // m: ab hier Begleitflug, erst darüber wieder Anflug
const SLOT_RIGHT = 3.5, SLOT_BACK = 5, SLOT_UP = 0.4;   // Platz neben dem Mitflieger (rechts hinten)
const YAW_RATE = 2.2, PITCH_RATE = 1.2;     // rad/s höchstens
const BRAKE_ACC = 7;                        // m/s²: so früh wird vor dem Ziel abgebremst
const BOOST_FROM = 140;                     // m: weiter weg mit Boost

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = THREE.MathUtils.clamp;
/** Winkel weich nachführen, höchstens rate rad/s. */
const turn = (cur, want, rate, dt, k) => cur + clamp(wrap(want - cur) * (1 - Math.exp(-k * dt)), -rate * dt, rate * dt);

export function createAutopilot({ speed = 28, boost = 1.6 } = {}) {
  const vel = new THREE.Vector3(), look = new THREE.Vector3(), d = new THREE.Vector3(), slot = new THREE.Vector3();
  let escort = false;

  return {
    /** Begleitflug (angekommen, fliegt neben dem Mitflieger)? */
    get escort() { return escort; },
    reset() { escort = false; vel.set(0, 0, 0); },

    /**
     * Ein Bild. s: { pos, yaw, pitch, cur (aktuelle Geschwindigkeit m/s), goal (Augenhöhe des Mitfliegers),
     * goalVel, goalYaw, ahead(L, out) → Punkt L m voraus auf der Route }.
     * Gibt { yaw, pitch, vel } zurück (vel = gewünschte Geschwindigkeit für broom.update).
     */
    update(dt, s) {
      const dist = s.pos.distanceTo(s.goal);
      if (escort ? dist > NEAR_OUT : dist < NEAR_IN) escort = !escort;
      let yaw = s.yaw, pitch = s.pitch;
      const gSpeed = s.goalVel.length();

      if (!escort) {
        // Anflug: Punkt voraus auf der Route anpeilen (reine Verfolgung), erst drehen, dann Gas
        s.ahead(clamp(s.cur * 0.9, 10, 36), look);
        d.subVectors(look, s.pos);
        const len = d.length();
        if (len > 1e-3) d.divideScalar(len); else d.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        const wantYaw = Math.atan2(-d.x, -d.z);
        const wantPitch = clamp(Math.asin(clamp(d.y, -1, 1)), -0.6, 0.6) * 0.8;
        yaw = turn(yaw, wantYaw, YAW_RATE, dt, 4);
        pitch = turn(pitch, wantPitch, PITCH_RATE, dt, 3);
        const err = Math.abs(wrap(wantYaw - yaw));
        const align = Math.max(0.12, Math.cos(Math.min(err, Math.PI / 2)) ** 2);
        let v = (dist > BOOST_FROM && err < 0.25 ? speed * boost : speed) * align;
        v = Math.min(v, Math.sqrt(2 * BRAKE_ACC * Math.max(0, dist - NEAR_IN * 0.6)) + gSpeed);
        vel.copy(d).multiplyScalar(v);
      } else {
        // Begleitflug: Platz rechts hinter dem Mitflieger halten und seine Fahrt mitnehmen
        const gy = s.goalYaw, fx = -Math.sin(gy), fz = -Math.cos(gy), rx = Math.cos(gy), rz = -Math.sin(gy);
        slot.set(s.goal.x + rx * SLOT_RIGHT - fx * SLOT_BACK, s.goal.y + SLOT_UP, s.goal.z + rz * SLOT_RIGHT - fz * SLOT_BACK);
        vel.subVectors(slot, s.pos).multiplyScalar(1.3).add(s.goalVel);
        const lim = speed * boost;
        if (vel.length() > lim) vel.setLength(lim);
        // Blick: fliegt er, in seine Flugrichtung (ein Stück vor ihn), sonst auf ihn
        if (gSpeed > 2) look.copy(s.goalVel).multiplyScalar(20 / gSpeed).add(s.goal);
        else look.copy(s.goal);
        d.subVectors(look, s.pos);
        const h = Math.hypot(d.x, d.z);
        if (h > 0.5) yaw = turn(yaw, Math.atan2(-d.x, -d.z), YAW_RATE, dt, 3);
        pitch = turn(pitch, clamp(Math.atan2(d.y, Math.max(h, 1)), -0.6, 0.6) * 0.7, PITCH_RATE, dt, 3);
      }
      return { yaw: wrap(yaw), pitch: clamp(pitch, -1.5, 1.5), vel };
    },
  };
}
