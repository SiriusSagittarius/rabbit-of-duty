import { Assembly, box, blob, dome, extrude, roundRect, latheZ, rodZ, ring, screw, picatinny, mlokSlot, mergeAll } from '../geometry.js';
import { buildOptic } from '../parts.js';

/**
 * Bullpup-Sturmgewehr - `bullpup` (fxClass `carbine`)
 *
 * Entwurf: Gemini (nach GEMINI-WAFFEN-PROMPT.md). Korrigiert:
 *  - Handschutz stand senkrecht, Visierbrücke zeigte nach hinten, Magazin war zur Seite gebogen,
 *    Abzug und Abzugsbügel lagen quer, untere M-LOK-Schlitze liefen quer.
 *  - Griff und Wangenauflage schwebten, die Schiene steckte komplett in der Brücke.
 *  - Kimme und Korn mit Lochkimme und Kornschutz, Wangenauflage hinter der Schiene,
 *    seitliche Gummifläche links, Mündungsfeuerdämpfer mit drei Schlitzen.
 *  - Rotpunkt-Optik (dieselbe wie bei der MP) auf der Schiene; Kimme und Korn bleiben als Notvisier.
 *
 * Fiktives Modell. Meter; Mündung -Z, +Y oben, +X rechts; Ursprung vorne am Pistolengriff.
 * Gesamtlänge 0,77 m, Laufachse 7,6 cm über dem Ursprung; Magazin und Verschluss hinter dem Griff.
 */
export function buildBullpup() {
  const bore = 0.076;
  const zRear = 0.22;
  const zFront = -0.50;
  const zChamber = 0.08;
  const zEject = 0.08;
  const zMag = 0.12;

  const hgZ0 = -0.22;
  const hgZ1 = -0.42;
  const hgR = 0.024;
  const hgFlat = hgR * Math.cos(Math.PI / 8);

  const bodyTop = bore + 0.028;     // 0.104
  const bodyBottom = bore - 0.068;  // 0.008
  const bridgeY = bore + 0.01;
  const bridgeTop = bridgeY + 0.036;
  const railY = bridgeTop - 0.0005;
  const railTop = railY + 0.0074;

  const body = new Assembly('bullpup-body');

  // ==========================================================================
  //  1. GEHÄUSE MIT HINTERSCHAFT (ein Stück Polymer)
  // ==========================================================================
  const receiverPoly = box(0.042, 0.096, 0.44, 0.002, 3);
  body.add(receiverPoly, 'polymer_tan', { y: bore - 0.02, z: -0.02 });
  receiverPoly.dispose();

  // Wangenauflage hinter der Schiene, liegt auf dem Gehäuse auf
  const cheekRiser = blob(0.044, 0.024, 0.14, 0.003, 3);
  body.add(cheekRiser, 'polymer', { y: bodyTop + 0.01, z: 0.11 });
  cheekRiser.dispose();

  // Gummifläche links am Schaft (zum Spieler hin)
  const sidePad = box(0.0015, 0.04, 0.12, 0.0006, 2);
  body.add(sidePad, 'rubber', { x: -0.0218, y: bore - 0.002, z: 0.12 });
  sidePad.dispose();

  // Schaftkappe
  const buttPad = blob(0.036, 0.11, 0.018, 0.004, 3);
  body.add(buttPad, 'rubber', { y: bore - 0.026, z: zRear - 0.009 });
  buttPad.dispose();

  // Gehäuseschrauben: Kopf außen, Schaft nach innen
  const chassisBolt = screw(0.004, 0.0022, 0.002, 0.006, 8);
  for (const [y, z] of [[bore - 0.045, 0.08], [bore - 0.035, -0.16]]) {
    body.add(chassisBolt, 'steel', { x: 0.0222, y, z, ry: -Math.PI / 2 });
    body.add(chassisBolt, 'steel', { x: -0.0222, y, z, ry: Math.PI / 2 });
  }
  chassisBolt.dispose();

  // Auswurffenster rechts und Hülsenabweiser dahinter
  const ejectionCut = box(0.005, 0.016, 0.068, 0.0006, 2);
  body.add(ejectionCut, 'cavity', { x: 0.0195, y: bore + 0.002, z: zEject });
  ejectionCut.dispose();
  const brassDeflector = box(0.006, 0.018, 0.012, 0.0006, 2);
  body.add(brassDeflector, 'polymer_tan', { x: 0.022, y: bore + 0.002, z: zEject + 0.042 });
  brassDeflector.dispose();

  // Magazinschacht unter dem Schaft und Magazinhalter dahinter
  const magWellBase = box(0.032, 0.05, 0.09, 0.001, 2);
  body.add(magWellBase, 'polymer', { y: bore - 0.064, z: zMag });
  magWellBase.dispose();
  const magRelease = box(0.01, 0.012, 0.018, 0.0005, 1);
  body.add(magRelease, 'steel', { y: bore - 0.082, z: zMag + 0.054 });
  magRelease.dispose();

  // Langer Abzugsbügel in der Seitenebene, vom Griff nach vorne
  const triggerGuard = extrude(roundRect(0.11, 0.034, 0.008, 4), 0.014, {
    bevel: 0.0012,
    bevelSegments: 2,
    holes: [roundRect(0.096, 0.022, 0.006, 4)],
  });
  body.add(triggerGuard, 'polymer_tan', { y: bodyBottom - 0.017 + 0.0015, z: -0.055, ry: Math.PI / 2 });
  triggerGuard.dispose();

  // ==========================================================================
  //  2. PISTOLENGRIFF (Seitenprofil: x = nach vorne), oben bündig am Gehäuse
  // ==========================================================================
  const grip = extrude(
    [
      [0.0, -0.008],
      [-0.016, -0.016],
      [-0.03, -0.08],
      [-0.012, -0.094],
      [0.012, -0.088],
      [0.022, -0.032],
      [0.014, -0.006],
    ],
    0.028,
    { bevel: 0.0018, bevelSegments: 2 }
  );
  body.add(grip, 'polymer_tan', { y: bodyBottom + 0.008, z: 0.008, ry: Math.PI / 2 });
  grip.dispose();

  // ==========================================================================
  //  3. LAUF & MÜNDUNGSFEUERDÄMPFER
  // ==========================================================================
  const barrel = latheZ([[zFront, 0.0076], [-0.41, 0.0085], [-0.24, 0.0102]], 24);
  body.add(barrel, 'steel', { y: bore });
  barrel.dispose();

  const muzzleDevice = latheZ(
    [
      [-0.54, 0.0],
      [-0.54, 0.010],
      [-0.50, 0.010],
      [-0.495, 0.0078],
      [-0.495, 0.0],
    ],
    24
  );
  body.add(muzzleDevice, 'steel_soot', { y: bore });
  muzzleDevice.dispose();
  const slot = box(0.003, 0.004, 0.024, 0.0005);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    body.add(slot, 'cavity', { x: Math.cos(a) * 0.0088, y: bore + Math.sin(a) * 0.0088, z: -0.522, rz: a - Math.PI / 2 });
  }
  slot.dispose();

  // ==========================================================================
  //  4. HANDSCHUTZ (achteckig, entlang Z)
  // ==========================================================================
  const hgOctagon = extrude(octagonalProfile(hgR), hgZ0 - hgZ1, { bevel: 0.001, holes: [octagonalProfile(hgR - 0.0028)] });
  body.add(hgOctagon, 'polymer_tan', { y: bore, z: (hgZ0 + hgZ1) / 2 });
  hgOctagon.dispose();

  const mlokSide = mlokSlot(0.03, 0.007, 0.0035);
  const slotD = hgFlat - 0.0004;
  for (let z = hgZ0 - 0.04; z > hgZ1 + 0.04; z -= 0.054) {
    body.add(mlokSide, 'cavity', { x: -slotD, y: bore, z, ry: -Math.PI / 2 });
    body.add(mlokSide, 'cavity', { x: slotD, y: bore, z, ry: Math.PI / 2 });
    body.add(mlokSide, 'cavity', { y: bore - slotD, z, rx: Math.PI / 2, rz: Math.PI / 2 });
  }
  mlokSide.dispose();

  // Riemenöse links vorne, liegt flach an der Seite
  const slingLoop = ring(0.006, 0.0014, 12, 6);
  body.add(slingLoop, 'steel', { x: -(hgFlat + 0.0015), y: bore - 0.012, z: -0.38, ry: Math.PI / 2 });
  slingLoop.dispose();

  // ==========================================================================
  //  5. VISIERBRÜCKE, SCHIENE, KIMME & KORN
  // ==========================================================================
  // Brücke (Seitenprofil: x = nach hinten) von z -0.32 bis +0.02
  const optBridge = extrude(
    [
      [-0.32, 0.0],
      [-0.31, 0.036],
      [0.0, 0.036],
      [0.02, 0.0],
      [0.0, -0.004],
      [-0.30, -0.004],
    ],
    0.018,
    { bevel: 0.0008, bevelSegments: 2 }
  );
  body.add(optBridge, 'polymer_tan', { y: bridgeY, ry: -Math.PI / 2 });
  optBridge.dispose();

  const topRail = picatinny(0.30);
  body.add(topRail, 'alu', { y: railY, z: -0.155 });
  topRail.dispose();

  // Korn vorne: Fuß, Schutzohren, Korn
  const zFrontSight = -0.29;
  const zRearSight = -0.012;
  const sightBase = box(0.014, 0.008, 0.02, 0.0005, 1);
  body.add(sightBase, 'steel_black', { y: railTop + 0.004, z: zFrontSight });
  body.add(sightBase, 'steel_black', { y: railTop + 0.004, z: zRearSight });
  sightBase.dispose();
  const ear = box(0.002, 0.012, 0.006, 0.0004, 1);
  body.add(ear, 'steel_black', { x: 0.005, y: railTop + 0.014, z: zFrontSight });
  body.add(ear, 'steel_black', { x: -0.005, y: railTop + 0.014, z: zFrontSight });
  ear.dispose();
  const post = box(0.0018, 0.0055, 0.0018, 0.0002, 1);
  body.add(post, 'steel_black', { y: railTop + 0.0108, z: zFrontSight });
  post.dispose();

  // Lochkimme hinten: zwei Ohren und ein Ring, Lochmitte auf Kornhöhe
  const yAperture = railTop + 0.0135;
  const rearEar = box(0.003, 0.011, 0.006, 0.0004, 1);
  body.add(rearEar, 'steel_black', { x: 0.0055, y: railTop + 0.0135, z: zRearSight });
  body.add(rearEar, 'steel_black', { x: -0.0055, y: railTop + 0.0135, z: zRearSight });
  rearEar.dispose();
  const aperture = ring(0.0032, 0.0011, 16, 6);
  body.add(aperture, 'steel_black', { y: yAperture, z: zRearSight });
  aperture.dispose();

  // Rotpunkt-Optik hinten auf der Schiene
  const opticY = railTop + 0.038;
  const optic = buildOptic(body, {
    rTube: 0.0138, len: 0.044, hood: 0.006, y: opticY, z: -0.07, railTop,
    matBody: 'alu_fine', matSteel: 'steel',
  });

  // ==========================================================================
  //  6. BEWEGLICHE TEILE
  // ==========================================================================
  // A. Abzug: Seitenprofil, Wölbung nach vorne
  const trigger = new Assembly('bullpup-trigger');
  const triggerBlade = extrude(
    [
      [0.002, 0.014],
      [-0.004, 0.004],
      [-0.008, -0.012],
      [-0.003, -0.016],
      [0.0, -0.016],
      [0.003, -0.006],
      [0.005, 0.005],
    ],
    0.0044,
    { bevel: 0.0006 }
  );
  trigger.add(triggerBlade, 'steel', { ry: -Math.PI / 2 });
  triggerBlade.dispose();

  // B. Leicht gebogenes 30-Schuss-Magazin (Seitenprofil: x = nach vorne), Ursprung oben in der Mitte
  const magazine = new Assembly('bullpup-magazine');
  const magBody = extrude(
    [
      [0.030, 0.0],
      [0.034, -0.06],
      [0.044, -0.12],
      [0.058, -0.175],
      [0.004, -0.185],
      [-0.008, -0.13],
      [-0.018, -0.07],
      [-0.026, 0.0],
    ],
    0.026,
    { bevel: 0.0016, bevelSegments: 2 }
  );
  magazine.add(magBody, 'polymer_tan', { ry: Math.PI / 2 });
  magBody.dispose();
  const magFloor = extrude([[0.061, -0.172], [0.002, -0.183], [0.0, -0.189], [0.061, -0.178]], 0.029, { bevel: 0.0006 });
  magazine.add(magFloor, 'polymer', { ry: Math.PI / 2 });
  magFloor.dispose();
  const magFollower = box(0.016, 0.004, 0.044, 0.0004);
  magazine.add(magFollower, 'steel_black', { y: -0.004, z: -0.002 });
  magFollower.dispose();
  const brassCartridge = cartridgeCase(0.044, 0.00495);
  magazine.add(brassCartridge, 'brass', { y: -0.001, z: 0.02, ry: Math.PI });
  brassCartridge.dispose();

  // C. Verschluss hinten (in Waffen-Koordinaten gebaut, Ruhe = Ursprung)
  const bolt = new Assembly('bullpup-bolt');
  const boltCarrier = rodZ(0.0118, 0.0118, 0.14, 16, 0.0006);
  bolt.add(boltCarrier, 'steel_bright', { y: bore, z: zChamber + 0.012 });
  boltCarrier.dispose();
  const breechRound = cartridgeCase(0.044, 0.00495);
  bolt.add(breechRound, 'brass', { y: bore, z: zChamber, ry: Math.PI });
  breechRound.dispose();

  // D. Ladehebel links vorne (läuft nicht mit)
  const charging = new Assembly('bullpup-charging');
  const handlerBase = box(0.006, 0.008, 0.02, 0.0005, 1);
  handlerBase.translate(-0.021, bore + 0.022, -0.22);
  const handlerGrip = dome(0.008, 12, 0.85);
  handlerGrip.rotateY(-Math.PI / 2);
  handlerGrip.translate(-0.024, bore + 0.022, -0.22);
  const chargingHandle = mergeAll([handlerBase, handlerGrip]);
  charging.add(chargingHandle, 'steel_black', {});
  chargingHandle.dispose();

  const irons = [0, yAperture, zRearSight];
  return {
    id: 'bullpup',
    label: 'Kala-BP55',
    fxClass: 'carbine',
    body,
    moving: { magazine, bolt, charging, trigger },
    nodes: {
      muzzle: [0, bore, -0.542],
      chamber: [0, bore, zChamber],
      eject: [0.02, bore + 0.002, zEject],
      ejectDir: [0.86, 0.44, 0.26],
      sight: [0, opticY, optic.lensZ],
      ironSight: irons,
      opticGlass: optic,
      sightAxis: [0, 0, -1],
      handR: [0, -0.012, -0.006],             // vorne am Griff, Mittelfinger
      handL: [0, bore - hgFlat, hgZ0 - 0.08], // unter dem Handschutz
      handguard: { axis: [0, bore, 0], dir: [0, 0, 1], r: hgR, z0: hgZ0, z1: hgZ1 },
      magSeat: { pos: [0, bore - 0.046, zMag], rot: [0, 0, 0] },
      magDrop: [0, -0.38, 0.015],
      boltRest: { pos: [0, 0, 0], rot: [0, 0, 0] },
      boltTravel: [0, 0, 0.062],
      chargeRest: { pos: [0, 0, 0], rot: [0, 0, 0] },
      chargePull: [0, 0, 0.065],
      triggerPivot: { pos: [0, 0.005, -0.014], rot: [0, 0, 0] },
      triggerPull: -0.28,
    },
    shell: { caseLen: 0.044, rimR: 0.00495 },
  };
}

function octagonalProfile(r) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

function cartridgeCase(caseLen, rimR) {
  return latheZ(
    [
      [0.0, 0.0],
      [0.0, rimR],
      [0.0016, rimR],
      [0.0018, rimR - 0.0005],
      [0.0035, rimR - 0.0005],
      [0.004, rimR],
      [caseLen - 0.007, rimR],
      [caseLen - 0.0045, rimR * 0.94],
      [caseLen - 0.0035, rimR * 0.74],
      [caseLen, rimR * 0.74],
    ],
    12
  );
}
