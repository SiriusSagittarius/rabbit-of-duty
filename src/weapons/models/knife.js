import { Assembly, box, dome, extrude, roundRect, rodZ, tubeZ, screw } from '../geometry.js';

/**
 * Kampfmesser - `knife` (fxClass `knife`)
 *
 * Entwurf: Gemini (nach GEMINI-WAFFEN-PROMPT.md). Korrigiert:
 *  - Klinge und Griff zeigten nach unten (-Y) statt nach vorne (-Z); Parierstück lag waagerecht,
 *    Sägezähne und Knauf saßen getrennt davon.
 *  - Jetzt alles entlang -Z, Schneide unten, Rücken oben. Profile als Seitenansicht
 *    (x = Abstand entlang der Klinge, y = Höhe).
 *  - Blanke Schneidenfase sichtbar statt in der Klinge versteckt, Hohlkehle dunkel, Griff mit Ringen.
 *
 * Gesamtlänge 0,31 m, Klinge 0,17 m. Ursprung in der Griffmitte. Klinge zeigt nach -Z.
 */
export function buildKnife() {
  const body = new Assembly('knife');
  const zGuard = -0.064;

  // ==========================================================================
  //  1. PARIERSTÜCK (quer zur Klinge)
  // ==========================================================================
  const guardPlate = extrude(roundRect(0.016, 0.046, 0.005, 4), 0.008, { bevel: 0.0008, bevelSegments: 2 });
  body.add(guardPlate, 'steel', { y: -0.002, z: zGuard });
  guardPlate.dispose();

  // Öse im oberen Teil des Parierstücks, quer durch
  const guardHole = rodZ(0.002, 0.002, 0.0175, 8, 0.0002);
  body.add(guardHole, 'cavity', { y: 0.015, z: zGuard, ry: Math.PI / 2 });
  guardHole.dispose();

  // ==========================================================================
  //  2. KLINGE (Seitenprofil: x = Abstand nach vorne, y = Höhe; ry +90° legt x auf -Z)
  // ==========================================================================
  const toBlade = { ry: Math.PI / 2 };
  const blade = extrude(
    [
      [0.064, 0.0],
      [0.064, 0.014],
      [0.19, 0.014],     // gerader Rücken
      [0.238, -0.004],   // Clip-Point-Spitze
      [0.21, -0.012],    // Bauch der Schneide
      [0.15, -0.014],    // Hauptschneide
      [0.064, -0.010],
    ],
    0.0045,
    { bevel: 0.0015, bevelSegments: 2 }
  );
  body.add(blade, 'steel_black', toBlade);
  blade.dispose();

  // Blanke Schneidenfase: schmales Band, das an der Schneide durch die Klingenfase tritt
  const cuttingEdge = extrude(
    [
      [0.075, -0.0107],
      [0.15, -0.0147],
      [0.21, -0.0127],
      [0.237, -0.0047],
      [0.232, -0.0025],
      [0.21, -0.0085],
      [0.15, -0.0105],
      [0.075, -0.0072],
    ],
    0.0026,
    { bevel: 0.0003 }
  );
  body.add(cuttingEdge, 'steel_bright', toBlade);
  cuttingEdge.dispose();

  // Sägezahnung auf dem Rücken: Zahnspitzen 3 mm über dem Rücken
  const saw = [[0.09, 0.0125]];
  for (let x = 0.09; x < 0.168; x += 0.006) saw.push([x + 0.0015, 0.0172], [x + 0.006, 0.0135]);
  saw.push([0.17, 0.0125]);
  const spineTeeth = extrude(saw, 0.0036, { bevel: 0.0003 });
  body.add(spineTeeth, 'steel_black', toBlade);
  spineTeeth.dispose();

  // Daumenrillen auf dem Rücken hinter dem Parierstück
  const thumbRidge = box(0.0036, 0.0012, 0.0016, 0.0003, 1);
  for (const z of [-0.070, -0.0745, -0.079, -0.0835]) body.add(thumbRidge, 'steel_black', { y: 0.0146, z });
  thumbRidge.dispose();

  // Hohlkehle auf beiden Flanken (dunkler Streifen)
  const fuller = box(0.0006, 0.0035, 0.085, 0.0002, 1);
  body.add(fuller, 'steel_soot', { x: 0.0024, y: 0.005, z: -0.135 });
  body.add(fuller, 'steel_soot', { x: -0.0024, y: 0.005, z: -0.135 });
  fuller.dispose();

  // ==========================================================================
  //  3. GRIFF (Seitenprofil: x = Abstand nach hinten; ry -90° legt x auf +Z)
  // ==========================================================================
  const zGripFront = -0.060;
  const gripLower = [[0, 0], [0.012, -0.01], [0.024, -0.014], [0.038, -0.01], [0.052, -0.013], [0.068, -0.009], [0.082, -0.012], [0.094, -0.007], [0.11, -0.01], [0.116, 0]];
  const gripUpper = [[0, 0.008], [0.03, 0.014], [0.09, 0.014], [0.114, 0.008], [0.116, 0]];
  const grip = extrude([...gripLower, ...gripUpper.slice(0, -1).reverse()], 0.024, { bevel: 0.002, bevelSegments: 3 });
  body.add(grip, 'rubber', { z: zGripFront, ry: -Math.PI / 2 });
  grip.dispose();

  // Griffringe, folgen der Kontur
  for (const s of [0.02, 0.035, 0.05, 0.065, 0.08, 0.095]) {
    const lo = interp(gripLower, s);
    const hi = interp(gripUpper, s);
    const ringGeo = box(0.0252, hi - lo + 0.001, 0.0022, 0.0008, 2);
    body.add(ringGeo, 'polymer', { y: (hi + lo) / 2, z: zGripFront + s });
    ringGeo.dispose();
  }

  // ==========================================================================
  //  4. KNAUF
  // ==========================================================================
  const pommelBase = box(0.022, 0.028, 0.014, 0.0012, 2);
  body.add(pommelBase, 'steel', { y: -0.004, z: 0.062 });
  pommelBase.dispose();

  // Glasbrecher unten an der Rückseite
  const glassBreaker = dome(0.004, 8, 0.7);
  body.add(glassBreaker, 'steel', { y: -0.013, z: 0.0695 });
  glassBreaker.dispose();

  // Schraube oben an der Rückseite, Kopf nach hinten
  const tangScrew = screw(0.003, 0.0016, 0.0015, 0.004, 8);
  body.add(tangScrew, 'steel_black', { y: 0.004, z: 0.0702, ry: Math.PI });
  tangScrew.dispose();

  // Fangriemenöse quer durch den Knauf
  const lanyardHole = tubeZ(0.0035, 0.0022, 0.024, 12, 0.0004);
  body.add(lanyardHole, 'steel', { y: -0.012, z: 0.062, ry: Math.PI / 2 });
  lanyardHole.dispose();

  return {
    id: 'knife',
    label: 'Stalker-17',
    fxClass: 'knife',
    body,
    nodes: {
      handR: [0, 0, 0],             // Griffmitte
      tip: [0, -0.004, -0.238],     // Klingenspitze
    },
  };
}

/** Lineare Interpolation von y über x in einer nach x sortierten Punktliste. */
function interp(pts, x) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x >= x0 && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
  }
  return pts[pts.length - 1][1];
}
