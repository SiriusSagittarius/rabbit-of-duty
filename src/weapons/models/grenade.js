import { Assembly, box, dome, extrude, latheZ, rodZ, tubeZ, ring } from '../geometry.js';

/**
 * Splitterhandgranate - `grenade` (fxClass `grenade`)
 *
 * Entwurf: Gemini (nach GEMINI-WAFFEN-PROMPT.md). Korrigiert:
 *  - Splittersegmente standen als Finnen ab bzw. schwebten oben und unten: jetzt gewölbte Segmente,
 *    die der Körperform folgen (5 Reihen x 8, versetzt).
 *  - Sicherungsbügel steckte im Körper: jetzt ein Blechstreifen über Zünder und Körperflanke.
 *  - Splint und Laschen lagen im Zünder versteckt; Ring hängt jetzt seitlich.
 *  - Bewegliche Teile um ihren Drehpunkt gebaut, Drehpunkte als { pos, rot }.
 *
 * Körper 6 cm Durchmesser, 9,2 cm hoch, mit Zünder 13 cm. Ursprung in der Körpermitte, Zünder oben (+Y).
 */
export function buildGrenade() {
  const body = new Assembly('grenade');

  // ==========================================================================
  //  1. KÖRPER & SPLITTERSEGMENTE
  // ==========================================================================
  // Profil [Höhe, Radius]; latheZ baut entlang Z, rotateX(-90°) stellt ihn auf
  const BODY = [[-0.046, 0.0], [-0.046, 0.012], [-0.035, 0.024], [-0.015, 0.030], [0.015, 0.030], [0.032, 0.023], [0.044, 0.014], [0.046, 0.0]];
  const castBody = latheZ(BODY, 28);
  castBody.rotateX(-Math.PI / 2);
  body.add(castBody, 'steel_soot', {});
  castBody.dispose();

  const rAt = (y) => {
    for (let i = 1; i < BODY.length; i++) {
      const [z0, r0] = BODY[i - 1];
      const [z1, r1] = BODY[i];
      if (z1 > z0 && y >= z0 && y <= z1) return r0 + ((r1 - r0) * (y - z0)) / (z1 - z0);
    }
    return 0;
  };
  const ROWS = 5;
  const COLS = 8;
  const rowH = 0.012;
  const groove = 0.0028;
  const yStart = -(ROWS * rowH + (ROWS - 1) * groove) / 2;
  const sector = (Math.PI * 2) / COLS;
  for (let j = 0; j < ROWS; j++) {
    const y0 = yStart + j * (rowH + groove);
    const y1 = y0 + rowH;
    const profile = [
      [y0, rAt(y0) - 0.002],
      [y0, rAt(y0) + 0.0012],
      [y1, rAt(y1) + 0.0012],
      [y1, rAt(y1) - 0.002],
    ];
    for (let i = 0; i < COLS; i++) {
      const seg = latheZ(profile, 5, i * sector + (j % 2) * (sector / 2), sector - 0.1);
      seg.rotateX(-Math.PI / 2);
      body.add(seg, 'steel_soot', {});
      seg.dispose();
    }
  }

  // Gewindekragen oben
  const collar = tubeZ(0.013, 0.009, 0.008, 20, 0.0004);
  collar.rotateX(-Math.PI / 2);
  body.add(collar, 'steel', { y: 0.046 });
  collar.dispose();

  // ==========================================================================
  //  2. ZÜNDER
  // ==========================================================================
  const fuzeHead = latheZ(
    [
      [0.0, 0.009],
      [0.012, 0.009],
      [0.015, 0.0125],
      [0.026, 0.0125],
      [0.034, 0.009],
      [0.035, 0.0],
    ],
    20
  );
  fuzeHead.rotateX(-Math.PI / 2);
  body.add(fuzeHead, 'alu_fine', { y: 0.049 });
  fuzeHead.dispose();

  // Zwei Laschen seitlich am Zünder, der Splint geht hindurch
  const yPin = 0.0765;
  const zPin = 0.006;
  const lug = box(0.003, 0.01, 0.01, 0.0004, 1);
  body.add(lug, 'alu_fine', { x: 0.0105, y: yPin, z: zPin });
  body.add(lug, 'alu_fine', { x: -0.0105, y: yPin, z: zPin });
  lug.dispose();

  // Schlagbolzenkuppel oben
  const strikerDome = dome(0.005, 12, 0.7);
  strikerDome.rotateX(-Math.PI / 2);
  body.add(strikerDome, 'steel', { y: 0.081 });
  strikerDome.dispose();

  // ==========================================================================
  //  3. BEWEGLICHE TEILE (um ihren Drehpunkt gebaut)
  // ==========================================================================
  // A. Sicherungsbügel: Blechstreifen (Seitenprofil z/y, 1,3 mm stark), über den Zünderkopf
  //    und an der Körperflanke (+Z) entlang. Drehpunkt am hinteren Ende des Kopfes.
  const spoonPivot = [0, 0.086, -0.004];
  const spoonInner = [[-0.004, 0.0866], [0.0118, 0.0866], [0.0138, 0.0846], [0.0138, 0.063], [0.0154, 0.044], [0.0214, 0.036], [0.0269, 0.026], [0.0314, 0.015], [0.0314, -0.015], [0.0281, -0.026]];
  const spoonOuter = [[0.0294, -0.0262], [0.0327, -0.015], [0.0327, 0.015], [0.0282, 0.0265], [0.0227, 0.0367], [0.0167, 0.0446], [0.0151, 0.063], [0.0151, 0.0852], [0.0124, 0.0879], [-0.004, 0.0879]];
  const spoonPts = [...spoonInner, ...spoonOuter].map(([z, y]) => [z - spoonPivot[2], y - spoonPivot[1]]);
  const spoon = new Assembly('grenade-spoon');
  const spoonGeo = extrude(spoonPts, 0.014, { bevel: 0.0003 });
  spoon.add(spoonGeo, 'steel_black', { ry: -Math.PI / 2 });   // Profil-x -> +Z, Breite -> X
  spoonGeo.dispose();

  // B. Splint quer durch die Laschen, Ziehring hängt flach an der rechten Seite
  const pin = new Assembly('grenade-pin');
  const pinShaft = rodZ(0.0016, 0.0016, 0.032, 10, 0.0002);
  pin.add(pinShaft, 'steel_bright', { ry: Math.PI / 2 });
  pinShaft.dispose();
  const pullRing = ring(0.011, 0.0015, 20, 8);
  pin.add(pullRing, 'steel_bright', { x: 0.0178, y: -0.0095, ry: Math.PI / 2 });
  pullRing.dispose();

  return {
    id: 'grenade',
    label: 'F-1 Splitter',
    fxClass: 'grenade',
    body,
    moving: { spoon, pin },
    nodes: {
      handR: [0, 0, 0],                                   // Körpermitte
      spoonPivot: { pos: spoonPivot, rot: [0, 0, 0] },    // Bügel klappt beim Wurf um die X-Achse weg
      pinPivot: { pos: [0, yPin, zPin], rot: [0, 0, 0] }, // Splint wird nach +X gezogen
    },
  };
}
