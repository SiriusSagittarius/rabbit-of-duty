import { Assembly, box, blob, dome, extrude, roundRect, latheZ, rodZ, tubeZ, screw, knurlBand, picatinny, mlokSlot, mergeAll } from '../geometry.js';

/**
 * Scharfschützengewehr (Repetierer) - `sniper` (fxClass `sniper`)
 *
 * Entwurf: Gemini (nach GEMINI-WAFFEN-PROMPT.md). Korrigiert:
 *  - Achsen: Handschutz lag senkrecht, Zweibein zeigte nach oben, Türme, Ringe, Abzug,
 *    Abzugsbügel und Schrauben waren falsch gedreht, zwei Türme hatten kein Material.
 *  - Anschlüsse: Griff, Schiene, Ringe und Mündungsbremse schwebten.
 *  - Verschluss liegt geschlossen am Laufende an, Kammerstängel über dem Griff.
 *  - Linsen flach und versenkt statt Glaskugeln vor dem Rohr.
 *
 * Fiktives Modell im Stil moderner Chassis-Repetierer.
 * Meter; Mündung -Z, +Y oben, +X rechts; Ursprung vorne am Pistolengriff.
 * Gesamtlänge 1,21 m mit Mündungsbremse, Lauf 0,67 m, Laufachse 8 cm über dem Ursprung.
 */
export function buildSniper() {
  const bore = 0.08;
  const zFront = -0.85;            // Laufende ohne Bremse
  const zBarrelRear = -0.18;       // Patronenlager
  const zRecvFront = -0.20;
  const zRecvRear = 0.0;
  const rRecv = 0.019;
  const zEject = -0.115;

  const hgZ0 = -0.19;
  const hgZ1 = -0.62;
  const hgR = 0.024;
  const hgFlat = hgR * Math.cos(Math.PI / 8);   // Abstand der Achteck-Flächen zur Achse

  const opticY = bore + 0.078;
  const opticZ = -0.10;
  const railY = bore + rRecv - 0.0005;          // Unterkante der Schiene
  const railTop = railY + 0.0074;               // Basis 4,2 mm + Zähne 3,2 mm

  const chassisBottom = bore - 0.049;           // 0.031

  const body = new Assembly('sniper-body');

  // ==========================================================================
  //  1. GEHÄUSE & CHASSIS
  // ==========================================================================
  const receiverGeo = tubeZ(rRecv, 0.015, zRecvRear - zRecvFront, 24, 0.001);
  body.add(receiverGeo, 'alu', { y: bore, z: (zRecvFront + zRecvRear) / 2 });
  receiverGeo.dispose();

  // Hinterer Abschlussring, durch den der Verschluss gleitet
  const recvCap = tubeZ(rRecv, 0.0106, 0.008, 24, 0.0008);
  body.add(recvCap, 'alu', { y: bore, z: zRecvRear - 0.004 });
  recvCap.dispose();

  // Auswurffenster rechts (+X)
  const ejectPort = box(0.01, 0.016, 0.072, 0.001);
  body.add(ejectPort, 'cavity', { x: 0.0148, y: bore + 0.002, z: zEject });
  ejectPort.dispose();

  // Schiene oben auf einem Sockel, damit sie auf dem runden Gehäuse aufliegt
  const railRiser = box(0.016, 0.006, 0.2, 0.0008);
  body.add(railRiser, 'alu', { y: railY - 0.002, z: -0.10 });
  railRiser.dispose();
  const topRail = picatinny(0.2);
  body.add(topRail, 'alu', { y: railY, z: -0.10 });
  topRail.dispose();

  // Chassis unter dem Gehäuse
  const chassisBase = box(0.032, 0.038, 0.42, 0.002);
  body.add(chassisBase, 'alu', { y: bore - 0.03, z: -0.07 });
  chassisBase.dispose();

  // Magazinschacht
  const magWell = box(0.028, 0.046, 0.11, 0.0015);
  body.add(magWell, 'alu', { y: bore - 0.048, z: -0.13 });
  magWell.dispose();

  // Abzugsbügel: Schlaufe in der Seitenebene, oben im Chassis verankert
  const triggerGuard = extrude(roundRect(0.066, 0.034, 0.008, 3), 0.01, {
    bevel: 0.001,
    holes: [roundRect(0.054, 0.022, 0.005, 3)],
  });
  body.add(triggerGuard, 'alu', { y: chassisBottom - 0.014, z: -0.034, ry: Math.PI / 2 });
  triggerGuard.dispose();

  // Inbusschrauben am Chassis: Kopf außen, Schaft nach innen (jede Seite einzeln gedreht)
  const screwH = screw(0.004, 0.0022, 0.002, 0.006, 8);
  for (const z of [-0.22, -0.02, 0.08]) {
    body.add(screwH, 'steel', { x: 0.0172, y: bore - 0.03, z, ry: -Math.PI / 2 });
    body.add(screwH, 'steel', { x: -0.0172, y: bore - 0.03, z, ry: Math.PI / 2 });
  }
  screwH.dispose();

  // ==========================================================================
  //  2. LAUF & MÜNDUNGSBREMSE
  // ==========================================================================
  // Schwerer Lauf, hinten dicker (Profil von vorne nach hinten, damit die Normalen nach außen zeigen)
  const barrelGeo = latheZ([[zFront, 0.0095], [-0.78, 0.0095], [-0.30, 0.012], [zBarrelRear, 0.014]], 24);
  body.add(barrelGeo, 'steel', { y: bore });
  barrelGeo.dispose();

  // Mündungsbremse direkt am Laufende, je drei Gasöffnungen links und rechts
  const zBrakeRear = zFront + 0.004;
  const zBrakeFront = zFront - 0.058;
  const brake = latheZ(
    [
      [zBrakeFront + 0.004, 0.0045],
      [zBrakeFront, 0.0045],
      [zBrakeFront, 0.0115],
      [zBrakeFront + 0.003, 0.013],
      [zBrakeRear - 0.003, 0.013],
      [zBrakeRear, 0.0118],
      [zBrakeRear, 0.0],
    ],
    24
  );
  body.add(brake, 'steel_soot', { y: bore });
  brake.dispose();
  const brakePort = box(0.003, 0.008, 0.008, 0.0006);
  for (let i = 0; i < 3; i++) {
    const z = zBrakeFront + 0.012 + i * 0.014;
    body.add(brakePort, 'cavity', { x: 0.0122, y: bore, z });
    body.add(brakePort, 'cavity', { x: -0.0122, y: bore, z });
  }
  brakePort.dispose();

  // ==========================================================================
  //  3. HANDSCHUTZ (achteckig, Lauf frei schwingend)
  // ==========================================================================
  const hgOuter = octagonalTube(hgR, hgR - 0.003, hgZ0 - hgZ1, 0.0015);
  body.add(hgOuter, 'alu', { y: bore, z: (hgZ0 + hgZ1) / 2 });
  hgOuter.dispose();

  // M-LOK-Schlitze links, rechts und unten, bündig in den Flächen
  const zBipod = hgZ1 + 0.05;
  const mlok = mlokSlot(0.032, 0.0075, 0.003);
  const slotX = hgFlat - 0.0004;
  for (let z = hgZ0 - 0.05; z > hgZ1 + 0.04; z -= 0.06) {
    body.add(mlok, 'cavity', { x: slotX, y: bore, z, ry: Math.PI / 2 });
    body.add(mlok, 'cavity', { x: -slotX, y: bore, z, ry: -Math.PI / 2 });
    if (z > zBipod + 0.06) body.add(mlok, 'cavity', { y: bore - slotX, z, rx: Math.PI / 2, rz: Math.PI / 2 });
  }
  mlok.dispose();

  // Picatinny-Stück unten vorne für das Zweibein (hängt kopfüber unter dem Handschutz)
  const bottomRail = picatinny(0.08, { baseH: 0.003, topH: 0.002 });
  body.add(bottomRail, 'alu', { y: bore - hgFlat + 0.0005, z: zBipod, rx: Math.PI });
  bottomRail.dispose();

  // ==========================================================================
  //  4. ZWEIBEIN, nach hinten eingeklappt unter dem Handschutz
  // ==========================================================================
  const yMount = bore - hgFlat - 0.0047 - 0.0055;
  const bipodMount = box(0.02, 0.012, 0.032, 0.001);
  body.add(bipodMount, 'steel_black', { y: yMount, z: zBipod });
  bipodMount.dispose();

  const yLeg = yMount - 0.004;
  const pivot = rodZ(0.0055, 0.0055, 0.012, 12, 0.0005);
  const leg = rodZ(0.0042, 0.0036, 0.17, 12, 0.0006);
  const foot = blob(0.012, 0.012, 0.018, 0.004, 2);
  for (const side of [-1, 1]) {
    body.add(pivot, 'steel_black', { x: side * 0.012, y: yLeg, z: zBipod, ry: Math.PI / 2 });
    body.add(leg, 'steel_black', { x: side * 0.012, y: yLeg - 0.002, z: zBipod + 0.085, ry: -side * 0.03 });
    body.add(foot, 'rubber', { x: side * 0.0145, y: yLeg - 0.003, z: zBipod + 0.175 });
  }
  pivot.dispose();
  leg.dispose();
  foot.dispose();

  // ==========================================================================
  //  5. HINTERSCHAFT, WANGENAUFLAGE & GRIFF
  // ==========================================================================
  // Klappscharnier direkt hinter dem Chassis
  const stockHinges = box(0.024, 0.038, 0.02, 0.0015);
  body.add(stockHinges, 'steel_black', { y: bore - 0.018, z: 0.15 });
  stockHinges.dispose();

  // Schaftrahmen: zwei Rohre
  const stockUpper = rodZ(0.011, 0.011, 0.16, 16, 0.001);
  body.add(stockUpper, 'alu', { y: bore - 0.004, z: 0.19 });
  stockUpper.dispose();

  const stockLower = rodZ(0.009, 0.009, 0.16, 16, 0.001);
  body.add(stockLower, 'alu', { y: bore - 0.056, z: 0.195 });
  stockLower.dispose();

  // Steg zwischen den Rohren (Seitenprofil: x = nach hinten, y = Höhe)
  const stockWeb = extrude(
    [
      [-0.01, -0.05],
      [-0.01, 0.0],
      [0.12, 0.0],
      [0.10, -0.04],
      [0.06, -0.06],
      [0.0, -0.06],
    ],
    0.02,
    { bevel: 0.0015 }
  );
  body.add(stockWeb, 'polymer_tan', { y: bore - 0.01, z: 0.11, ry: -Math.PI / 2 });
  stockWeb.dispose();

  // Verstellbare Wangenauflage
  const cheekRest = blob(0.026, 0.024, 0.11, 0.003, 3);
  body.add(cheekRest, 'polymer', { y: bore + 0.012, z: 0.18 });
  cheekRest.dispose();

  // Stellräder links am Schaft (zeigen zum Spieler)
  const knob = latheZ([[0, 0.009], [0.006, 0.009], [0.008, 0]], 16);
  body.add(knob, 'steel_black', { x: -0.0095, y: bore - 0.014, z: 0.16, ry: -Math.PI / 2 });
  body.add(knob, 'steel_black', { x: -0.0095, y: bore - 0.014, z: 0.215, ry: -Math.PI / 2 });
  knob.dispose();

  // Schaftkappe mit Zwischenstück
  const buttPadSpacer = box(0.024, 0.082, 0.012, 0.0015);
  body.add(buttPadSpacer, 'alu', { y: bore - 0.04, z: 0.28 });
  buttPadSpacer.dispose();

  const buttPad = blob(0.025, 0.09, 0.016, 0.004, 3);
  body.add(buttPad, 'rubber', { y: bore - 0.04, z: 0.29 });
  buttPad.dispose();

  // Pistolengriff (Seitenprofil: x = nach vorne), oben bündig am Chassis
  const gripG = extrude(
    [
      [0.006, -0.015],
      [-0.014, -0.024],
      [-0.026, -0.084],
      [-0.012, -0.096],
      [0.008, -0.092],
      [0.018, -0.038],
      [0.014, -0.012],
    ],
    0.028,
    { bevel: 0.0018 }
  );
  body.add(gripG, 'polymer_tan', { y: 0.045, z: 0.016, ry: Math.PI / 2 });
  gripG.dispose();

  // Monopod-Aufnahme unten am Schaft
  const monopodMount = box(0.014, 0.014, 0.022, 0.001);
  body.add(monopodMount, 'steel_black', { y: bore - 0.071, z: 0.24 });
  monopodMount.dispose();

  // ==========================================================================
  //  6. ZIELFERNROHR & MONTAGE
  // ==========================================================================
  // Montagebasis auf der Schiene
  const mountBase = box(0.025, 0.012, 0.15, 0.001);
  body.add(mountBase, 'alu_fine', { y: railTop + 0.0055, z: opticZ });
  mountBase.dispose();

  // Zwei Ringe mit Fuß, Ohren und senkrechten Deckelschrauben
  const ringGeo = extrude(circlePts(0.0205, 28), 0.014, { bevel: 0.0008, holes: [circlePts(0.0152, 28)] });
  const yLegTop = opticY - 0.0205;
  const yLegBottom = railTop + 0.0115;
  const ringLeg = box(0.016, yLegTop - yLegBottom + 0.004, 0.014, 0.001);
  const ear = box(0.053, 0.007, 0.014, 0.001);
  const ringScrew = screw(0.0022, 0.0013, 0.0014, 0.004, 8);
  for (const zr of [opticZ - 0.045, opticZ + 0.045]) {
    body.add(ringGeo, 'alu_fine', { y: opticY, z: zr });
    body.add(ringLeg, 'alu_fine', { y: (yLegTop + yLegBottom) / 2, z: zr });
    body.add(ear, 'alu_fine', { y: opticY, z: zr });
    for (const side of [-1, 1]) {
      body.add(ringScrew, 'steel', { x: side * 0.0232, y: opticY + 0.0047, z: zr, rx: Math.PI / 2 });
    }
  }
  ringGeo.dispose();
  ringLeg.dispose();
  ear.dispose();
  ringScrew.dispose();

  // Zielfernrohr: Objektivglocke 56 mm, Mittelrohr 30 mm, Okular; Lippen vorne und hinten
  const scopeZStart = opticZ - 0.17;
  const scopeZEnd = opticZ + 0.16;
  const scopeBody = latheZ(
    [
      [scopeZStart + 0.012, 0.0245],
      [scopeZStart, 0.0245],
      [scopeZStart, 0.028],
      [scopeZStart + 0.035, 0.028],
      [scopeZStart + 0.07, 0.015],
      [scopeZEnd - 0.07, 0.015],
      [scopeZEnd - 0.045, 0.018],
      [scopeZEnd - 0.01, 0.020],
      [scopeZEnd, 0.020],
      [scopeZEnd, 0.0165],
      [scopeZEnd - 0.012, 0.0165],
    ],
    32
  );
  body.add(scopeBody, 'alu_fine', { y: opticY });
  scopeBody.dispose();

  // Turmgehäuse (Sattel) mit Höhen- (oben), Seiten- (rechts) und Parallaxeturm (links)
  const saddle = blob(0.036, 0.036, 0.05, 0.008, 3);
  body.add(saddle, 'alu_fine', { y: opticY, z: opticZ });
  saddle.dispose();

  const turretHi = turretGeo(0.0105, 0.016);
  const turretKnurl = knurlBand(0.0107, 0.008, 28, 0.0004, 2);
  body.add(turretHi, 'alu_fine', { y: opticY + 0.017, z: opticZ, rx: -Math.PI / 2 });
  body.add(turretKnurl, 'alu_fine', { y: opticY + 0.026, z: opticZ, rx: -Math.PI / 2 });
  body.add(turretHi, 'alu_fine', { x: 0.017, y: opticY, z: opticZ, ry: Math.PI / 2 });
  body.add(turretKnurl, 'alu_fine', { x: 0.026, y: opticY, z: opticZ, ry: Math.PI / 2 });
  turretHi.dispose();
  turretKnurl.dispose();

  const turretPx = turretGeo(0.0125, 0.010);
  body.add(turretPx, 'alu_fine', { x: -0.017, y: opticY, z: opticZ, ry: -Math.PI / 2 });
  turretPx.dispose();

  // Vergrößerungsring und Fokusring am Okular
  const powerRing = tubeZ(0.0188, 0.015, 0.012, 32, 0.0006);
  body.add(powerRing, 'alu_fine', { y: opticY, z: scopeZEnd - 0.058 });
  powerRing.dispose();
  const powerKnurl = knurlBand(0.0188, 0.009, 36, 0.0004, 2);
  body.add(powerKnurl, 'alu_fine', { y: opticY, z: scopeZEnd - 0.058 });
  powerKnurl.dispose();
  const focusRing = knurlBand(0.0195, 0.01, 24, 0.0004, 2);
  body.add(focusRing, 'alu_fine', { y: opticY, z: scopeZEnd - 0.012 });
  focusRing.dispose();

  // Dunkler Innenraum hinter den Linsen
  const lensInnerO = rodZ(0.0245, 0.0245, 0.004, 24, 0.0002);
  body.add(lensInnerO, 'cavity', { y: opticY, z: scopeZStart + 0.014 });
  lensInnerO.dispose();
  const lensInnerE = rodZ(0.0165, 0.0165, 0.004, 24, 0.0002);
  body.add(lensInnerE, 'cavity', { y: opticY, z: scopeZEnd - 0.014 });
  lensInnerE.dispose();

  // Linsen: flache Kugelkappen, knapp hinter den Lippen
  const glass = new Assembly('sniper-glass');
  const rFront = 0.08;
  const lensFront = dome(rFront, 24, Math.asin(0.0245 / rFront) / Math.PI);
  glass.add(lensFront, 'glass', { y: opticY, z: scopeZStart + 0.004 + rFront, rx: Math.PI });
  lensFront.dispose();
  const rEye = 0.06;
  const lensEye = dome(rEye, 24, Math.asin(0.0165 / rEye) / Math.PI);
  glass.add(lensEye, 'glass', { y: opticY, z: scopeZEnd - 0.004 - rEye });
  lensEye.dispose();

  // ==========================================================================
  //  7. BEWEGLICHE TEILE
  // ==========================================================================
  // A. Abzug: Seitenprofil, Wölbung nach vorne, 5 mm breit
  const trigger = new Assembly('sniper-trigger');
  const triggerBlade = extrude(
    [
      [0.002, 0.016],
      [-0.004, 0.004],
      [-0.008, -0.012],
      [-0.004, -0.018],
      [0.0, -0.018],
      [0.003, -0.008],
      [0.005, 0.006],
    ],
    0.005,
    { bevel: 0.0008 }
  );
  trigger.add(triggerBlade, 'steel', { ry: -Math.PI / 2 });
  triggerBlade.dispose();

  // B. Kastenmagazin, 10 Schuss
  const magazine = new Assembly('sniper-magazine');
  const magBody = box(0.022, 0.068, 0.088, 0.002);
  const magLips = box(0.018, 0.01, 0.08, 0.001);
  magLips.translate(0, 0.034, 0);
  const magComplete = mergeAll([magBody, magLips]);
  magazine.add(magComplete, 'polymer', {});
  magComplete.dispose();
  const magBase = box(0.026, 0.006, 0.094, 0.0015);
  magazine.add(magBase, 'polymer', { y: -0.036 });
  magBase.dispose();

  // Zubringer und oberste Patrone
  const magFollower = box(0.016, 0.004, 0.076, 0.0005);
  magazine.add(magFollower, 'steel_black', { y: 0.033 });
  magFollower.dispose();
  const brassCartridge = cartridgeCase(0.051, 0.006);
  magazine.add(brassCartridge, 'brass', { y: 0.032, z: 0.004, ry: Math.PI });
  brassCartridge.dispose();

  // C. Verschluss mit Kammerstängel (lokal um boltRest gebaut)
  const bolt = new Assembly('sniper-bolt');
  const boltCylinder = rodZ(0.0102, 0.0102, 0.155, 20, 0.0008);
  bolt.add(boltCylinder, 'steel_bright', { z: -0.03 });
  boltCylinder.dispose();

  // Verriegelungswarzen vorne
  const boltLug = box(0.004, 0.006, 0.016, 0.0005);
  bolt.add(boltLug, 'steel_bright', { x: -0.008, y: 0.004, z: -0.1 });
  bolt.add(boltLug, 'steel_bright', { x: 0.008, y: -0.004, z: -0.1 });
  boltLug.dispose();

  // Flache Rippen auf dem Zylinder
  const boltRibs = spiralFluting(0.0094, 0.08);
  bolt.add(boltRibs, 'steel', { z: -0.035 });
  boltRibs.dispose();

  // Verbindung und nach unten abgewinkelter Arm
  const boltHandleConnector = box(0.009, 0.007, 0.012, 0.0005);
  bolt.add(boltHandleConnector, 'steel_black', { x: 0.008, z: 0.042 });
  boltHandleConnector.dispose();

  const boltHandleArm = extrude(
    [
      [0.0, 0.0],
      [0.026, -0.014],
      [0.042, -0.038],
      [0.045, -0.045],
      [0.036, -0.045],
      [0.02, -0.02],
      [0.0, -0.005],
    ],
    0.0075,
    { bevel: 0.0008 }
  );
  bolt.add(boltHandleArm, 'steel_black', { x: 0.008, z: 0.044, rx: 0.1 });
  boltHandleArm.dispose();

  // Kugelknopf
  const boltKnob = dome(0.011, 16, 0.8);
  bolt.add(boltKnob, 'polymer', { x: 0.049, y: -0.046, z: 0.038, rx: 0.5, rz: -0.2 });
  boltKnob.dispose();

  // Schlagbolzenkappe hinten
  const shroud = latheZ([[0, 0], [0, 0.009], [0.018, 0.008], [0.022, 0]], 16);
  bolt.add(shroud, 'steel_black', { z: 0.054 });
  shroud.dispose();

  const scopeEye = scopeZEnd - 0.004;
  return {
    id: 'sniper',
    label: 'M98 Recon',
    fxClass: 'sniper',
    body,
    moving: { magazine, bolt, trigger },
    glass,
    nodes: {
      muzzle: [0, bore, zBrakeFront - 0.002],
      chamber: [0, bore, -0.155],
      eject: [0.0195, bore + 0.002, zEject],
      ejectDir: [0.85, 0.45, 0.25],
      sight: [0, opticY, scopeEye],
      sightAxis: [0, 0, -1],
      handR: [0, 0.006, 0.002],                 // vorne am Griff, Mittelfinger
      handL: [0, bore - hgFlat, hgZ0 - 0.14],   // unter dem Handschutz
      handguard: { axis: [0, bore, 0], dir: [0, 0, 1], r: hgR, z0: hgZ1, z1: hgZ0 },
      magSeat: { pos: [0, bore - 0.05, -0.13], rot: [0, 0, 0] },
      magDrop: [0, -0.4, 0.015],
      boltRest: { pos: [0, bore, -0.065], rot: [0, 0, 0] },
      boltTravel: [0, 0, 0.105],
      boltLift: 1.047,
      triggerPivot: { pos: [0, 0.028, -0.018], rot: [0, 0, 0] },
      triggerPull: -0.25,
    },
    shell: { caseLen: 0.051, rimR: 0.006 },
  };
}

// ==========================================================================
//  Hilfsfunktionen
// ==========================================================================

/** Achteckrohr entlang Z (extrude läuft schon entlang Z). */
function octagonalTube(rOuter, rInner, len, bevel = 0.001) {
  return extrude(octagonalProfile(rOuter), len, { bevel, holes: [octagonalProfile(rInner)] });
}

function octagonalProfile(r) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

function circlePts(r, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/** Verstellturm entlang +Z: Wand, Fase, Deckel. */
function turretGeo(r, h) {
  return latheZ([[0, 0], [0, r], [h - 0.0015, r], [h, r - 0.0015], [h, 0]], 24);
}

function spiralFluting(r, len) {
  const parts = [];
  const rib = box(0.003, 0.002, len, 0.0005);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const g = rib.clone();
    g.rotateZ(a);
    g.translate(Math.cos(a) * r, Math.sin(a) * r, 0);
    parts.push(g);
  }
  rib.dispose();
  return mergeAll(parts);
}

function cartridgeCase(caseLen, rimR) {
  return latheZ(
    [
      [0, 0],
      [0.0, rimR],
      [0.0016, rimR],
      [0.0018, rimR - 0.0005],
      [0.004, rimR - 0.0005],
      [0.0045, rimR],
      [caseLen - 0.008, rimR],
      [caseLen - 0.005, rimR * 0.95],
      [caseLen - 0.004, rimR * 0.72],
      [caseLen, rimR * 0.72],
    ],
    12
  );
}
