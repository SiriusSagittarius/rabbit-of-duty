import { Assembly, box, blob, dome, extrude, roundRect, latheZ, rodZ, tubeZ, ring, mergeAll } from '../geometry.js';

/**
 * Sturmgewehr in klassischer Bauweise - `assault2` (fxClass `carbine`)
 *
 * Entwurf: Gemini (nach GEMINI-WAFFEN-PROMPT.md, zweite Fassung mit mehr Details). Korrigiert:
 *  - Schaft zeigte nach vorne, Magazin war zur Seite statt nach vorne gebogen und zu schmal,
 *    Sicherungshebel stand senkrecht, Abzug und Abzugsbügel lagen quer, Nieten standen als Scheiben ab,
 *    Kornschutzring lag waagerecht.
 *  - Griff, Abzug und Magazinhalter schwebten unter dem Gehäuse, Schaftkappe schwebte hinter dem Schaft.
 *  - Handschutz-Hälften waren links/rechts statt oben/unten und ließen seitlich eine Lücke: jetzt zwei
 *    geschlossene Profile, das obere umschließt das Gasrohr.
 *  - Kimme sitzt auf dem vorderen Träger statt im Gehäusedeckel; die Kimme ist im Schieber.
 *  - Sicken, Fingerrillen und Magazinrippen waren gestapelte, verdeckte Platten: ersetzt durch
 *    Querrippen auf dem Deckel, Seitenrillen am Handschutz und erhabene Magazinflächen.
 *
 * Fiktives Modell in klassischer Bauweise (gefrästes Gehäuse, Gasrohr über dem Lauf, gebogenes Magazin).
 * Meter; Mündung -Z, +Y oben, +X rechts; Ursprung vorne am Pistolengriff.
 * Gesamtlänge 0,91 m, Laufachse 7,6 cm über dem Ursprung.
 */
export function buildAssault2() {
  const bore = 0.076;
  const zRear = 0.065;             // Gehäuse-Ende
  const zFront = -0.56;            // Laufende
  const zEject = -0.06;
  const zChamber = -0.15;
  const recvBottom = bore - 0.052; // 0.024
  const coverTop = bore - 0.004 + 0.030;

  const gasY = bore + 0.022;       // Achse des Gasrohrs
  const hgFront = -0.405;
  const hgRear = -0.215;
  const zRearSight = -0.235;

  const body = new Assembly('assault2-body');

  // ==========================================================================
  //  1. GEHÄUSE & DECKEL
  // ==========================================================================
  const receiverBase = box(0.034, 0.048, 0.27, 0.0012, 2);
  body.add(receiverBase, 'steel', { y: bore - 0.028, z: -0.075 });
  receiverBase.dispose();

  // Erhabene Platten an den Gehäuseseiten
  const sidePlateL = box(0.0015, 0.012, 0.12, 0.0004, 2);
  body.add(sidePlateL, 'steel', { x: -0.0178, y: bore - 0.025, z: -0.09 });
  sidePlateL.dispose();
  const sidePlateR = box(0.0015, 0.008, 0.04, 0.0004, 2);
  body.add(sidePlateR, 'steel', { x: 0.0178, y: bore - 0.035, z: -0.15 });
  sidePlateR.dispose();

  // Vorderer Träger: hält Lauf, Gasrohr und Kimme
  const frontTrunnion = box(0.034, 0.052, 0.04, 0.0008, 2);
  body.add(frontTrunnion, 'steel', { y: bore - 0.016, z: -0.23 });
  frontTrunnion.dispose();

  // Gehäusedeckel: gewölbtes Blechprofil, entlang Z extrudiert
  const coverProfile = [
    [-0.017, 0.0],
    [-0.017, 0.018],
    [-0.015, 0.023],
    [-0.009, 0.030],
    [0.009, 0.030],
    [0.015, 0.023],
    [0.017, 0.018],
    [0.017, 0.0],
  ];
  const dustCover = extrude(coverProfile, 0.272, { bevel: 0.0008, bevelSegments: 2 });
  body.add(dustCover, 'steel_soot', { y: bore - 0.004, z: -0.071 });   // matt lackiertes Blech
  dustCover.dispose();

  // Quer verlaufende Versteifungsrippen oben auf dem Deckel
  const coverRib = box(0.016, 0.0014, 0.004, 0.0004);
  for (let z = -0.17; z <= 0.03; z += 0.04) body.add(coverRib, 'steel_soot', { y: coverTop + 0.0004, z });
  coverRib.dispose();

  // Entriegelungsknopf des Deckels, hinten
  const lockButton = box(0.011, 0.014, 0.016, 0.0008, 2);
  body.add(lockButton, 'steel', { y: bore + 0.014, z: zRear + 0.002 });
  lockButton.dispose();

  // Auswurffenster rechts
  const ejectionPortCut = box(0.004, 0.018, 0.078, 0.0005);
  body.add(ejectionPortCut, 'cavity', { x: 0.016, y: bore - 0.002, z: zEject });
  ejectionPortCut.dispose();

  // Abzugsbügel: Schlaufe in der Seitenebene, oben am Gehäuse
  const triggerGuard = extrude(roundRect(0.054, 0.03, 0.007, 4), 0.009, {
    bevel: 0.0008,
    bevelSegments: 2,
    holes: [roundRect(0.042, 0.018, 0.005, 4)],
  });
  body.add(triggerGuard, 'steel', { y: recvBottom - 0.012, z: -0.028, ry: Math.PI / 2 });
  triggerGuard.dispose();

  // Magazinhalter: Gehäuse unter dem Receiver und Hebel davor
  const magCatchBase = box(0.014, 0.02, 0.02, 0.0006, 2);
  body.add(magCatchBase, 'steel', { y: recvBottom - 0.004, z: -0.062 });
  magCatchBase.dispose();
  const magRelease = extrude(
    [
      [0.0, 0.0],
      [0.004, -0.022],
      [-0.004, -0.022],
      [-0.004, 0.0],
    ],
    0.008,
    { bevel: 0.0008, bevelSegments: 2 }
  );
  body.add(magRelease, 'steel', { y: recvBottom - 0.012, z: -0.063 });
  magRelease.dispose();

  // Nieten seitlich, Kopf nach außen
  const rivet = latheZ([[0.0, 0.0], [0.0, 0.0028], [0.0012, 0.0028], [0.0016, 0.0]], 12);
  for (const [y, z] of [[bore - 0.042, -0.19], [bore - 0.018, 0.04], [bore - 0.038, -0.03]]) {
    body.add(rivet, 'steel', { x: 0.0168, y, z, ry: Math.PI / 2 });
    body.add(rivet, 'steel', { x: -0.0168, y, z, ry: -Math.PI / 2 });
  }
  rivet.dispose();

  // ==========================================================================
  //  2. LAUF, GASSYSTEM & VISIERUNG
  // ==========================================================================
  // Lauf (Profil von vorne nach hinten, damit die Flächen nach außen zeigen)
  const barrel = latheZ([[zFront, 0.0072], [-0.53, 0.0076], [-0.32, 0.0088], [-0.24, 0.0108], [-0.23, 0.0108]], 28);
  body.add(barrel, 'steel', { y: bore });
  barrel.dispose();

  // Gasblock mit Brücke zum Gasrohr und zwei Querstiften
  const gasBlockBase = latheZ(
    [
      [-0.485, 0.0],
      [-0.485, 0.0073],
      [-0.48, 0.0135],
      [-0.445, 0.0135],
      [-0.44, 0.0073],
      [-0.44, 0.0],
    ],
    24
  );
  const gasBlockBridge = box(0.013, 0.024, 0.038, 0.0006, 2);
  gasBlockBridge.translate(0, 0.015, -0.46);
  const pinA = rodZ(0.0016, 0.0016, 0.029, 8, 0.0002);
  pinA.rotateY(Math.PI / 2);
  const pinB = pinA.clone();
  pinA.translate(0, 0.004, -0.478);
  pinB.translate(0, 0.004, -0.448);
  const gasBlock = mergeAll([gasBlockBase, gasBlockBridge, pinA, pinB]);
  body.add(gasBlock, 'steel_soot', { y: bore });
  gasBlock.dispose();

  // Gasrohr über dem Lauf, hinten im Kimmenfuß
  const gasTube = tubeZ(0.0082, 0.007, 0.23, 20, 0.0004);
  body.add(gasTube, 'steel_black', { y: gasY, z: -0.325 });
  gasTube.dispose();

  // Verriegelungshebel des Gasrohrs rechts am Kimmenfuß
  const gasLockLever = extrude(
    [
      [0.0, 0.0],
      [0.003, 0.014],
      [0.0, 0.018],
      [-0.003, 0.014],
    ],
    0.005,
    { bevel: 0.0004, bevelSegments: 2 }
  );
  body.add(gasLockLever, 'steel', { x: 0.0085, y: gasY - 0.006, z: zRearSight + 0.01, ry: Math.PI / 2 });
  gasLockLever.dispose();

  // Mündungsmutter direkt am Laufende
  const slantBrake = latheZ(
    [
      [-0.575, 0.0],
      [-0.575, 0.008],
      [-0.572, 0.0082],
      [-0.562, 0.0082],
      [-0.56, 0.0073],
      [-0.56, 0.0],
    ],
    24
  );
  body.add(slantBrake, 'steel_soot', { y: bore });
  slantBrake.dispose();

  // Kornträger mit Schutzring (quer zur Laufachse) und Korn
  const frontSightBase = box(0.012, 0.048, 0.018, 0.0006, 2);
  frontSightBase.translate(0, 0.025, zFront + 0.025);
  const frontSightRing = ring(0.0068, 0.0018, 16, 8);
  frontSightRing.translate(0, 0.049, zFront + 0.025);
  const frontSightPost = rodZ(0.001, 0.001, 0.007, 10, 0.0);
  frontSightPost.rotateX(Math.PI / 2);
  frontSightPost.translate(0, 0.045, zFront + 0.025);
  const frontSight = mergeAll([frontSightBase, frontSightRing, frontSightPost]);
  body.add(frontSight, 'steel_black', { y: bore });
  frontSight.dispose();

  // Kimme: Fuß auf dem vorderen Träger, Visierblatt, Schieber mit der Kimmenkerbe
  const rearSightBlock = box(0.015, 0.029, 0.048, 0.0006, 2);
  rearSightBlock.translate(0, 0.024, zRearSight);
  const rearSightLeaf = box(0.012, 0.004, 0.034, 0.0004, 2);
  rearSightLeaf.translate(0, 0.0445, zRearSight + 0.003);
  const slider = box(0.014, 0.006, 0.008, 0.0003, 1);
  slider.translate(0, 0.047, zRearSight + 0.008);
  const backSightAssembly = mergeAll([rearSightBlock, rearSightLeaf, slider]);
  body.add(backSightAssembly, 'steel_black', { y: bore });
  backSightAssembly.dispose();

  // Putzstock unter dem Lauf bis zum Kornträger
  const cleaningRod = rodZ(0.002, 0.002, 0.33, 12, 0.0002);
  body.add(cleaningRod, 'steel_black', { y: bore - 0.0105, z: -0.38 });
  cleaningRod.dispose();

  // ==========================================================================
  //  3. HANDSCHUTZ: zwei geschlossene Profile, oben ums Gasrohr
  // ==========================================================================
  const hgLen = hgRear - hgFront;
  const hgZ = (hgRear + hgFront) / 2;
  const lowerHg = extrude(
    [
      [-0.019, 0.016],
      [-0.0215, 0.010],
      [-0.0215, -0.010],
      [-0.017, -0.019],
      [-0.008, -0.0225],
      [0.008, -0.0225],
      [0.017, -0.019],
      [0.0215, -0.010],
      [0.0215, 0.010],
      [0.019, 0.016],
    ],
    hgLen,
    { bevel: 0.0015, bevelSegments: 2 }
  );
  body.add(lowerHg, 'polymer', { y: bore, z: hgZ });
  lowerHg.dispose();

  // Griffrillen an beiden Seiten des Unterschafts
  const hgRib = box(0.0016, 0.0026, hgLen - 0.04, 0.0006);
  for (const dy of [-0.0045, 0.0035]) {
    body.add(hgRib, 'polymer', { x: 0.0218, y: bore + dy, z: hgZ });
    body.add(hgRib, 'polymer', { x: -0.0218, y: bore + dy, z: hgZ });
  }
  hgRib.dispose();

  const upperLen = 0.17;
  const upperHg = extrude(
    [
      [-0.0175, 0.016],
      [0.0175, 0.016],
      [0.0175, 0.023],
      [0.012, 0.032],
      [0.005, 0.0355],
      [-0.005, 0.0355],
      [-0.012, 0.032],
      [-0.0175, 0.023],
    ],
    upperLen,
    { bevel: 0.0012, bevelSegments: 2 }
  );
  body.add(upperHg, 'polymer', { y: bore, z: -0.23 - upperLen / 2 });
  upperHg.dispose();

  // Lüftungsschlitze im oberen Handschutz
  const vent = box(0.002, 0.005, 0.014, 0.0005);
  for (const z of [-0.36, -0.32, -0.28]) {
    body.add(vent, 'cavity', { x: 0.0172, y: bore + 0.0215, z });
    body.add(vent, 'cavity', { x: -0.0172, y: bore + 0.0215, z });
  }
  vent.dispose();

  // Halteband vorne und Halteplatte hinten
  const hgRetainerFront = tubeZ(0.024, 0.0076, 0.01, 24, 0.0005);
  body.add(hgRetainerFront, 'steel', { y: bore, z: hgFront - 0.006 });
  hgRetainerFront.dispose();
  const hgRetainerRear = box(0.035, 0.05, 0.01, 0.0008, 2);
  body.add(hgRetainerRear, 'steel', { y: bore - 0.012, z: -0.21 });
  hgRetainerRear.dispose();

  // ==========================================================================
  //  4. SCHAFT & GRIFF
  // ==========================================================================
  // Fester Polymerschaft (Seitenprofil: x = nach hinten), fällt zur Schaftkappe hin ab
  const stockY = bore - 0.006;
  const stockWeb = extrude(
    [
      [0.0, 0.0],
      [0.245, -0.03],
      [0.252, -0.034],
      [0.252, -0.15],
      [0.235, -0.155],
      [0.12, -0.10],
      [0.0, -0.046],
    ],
    0.03,
    { bevel: 0.0018, bevelSegments: 2 }
  );
  body.add(stockWeb, 'polymer', { y: stockY, z: zRear, ry: -Math.PI / 2 });
  stockWeb.dispose();

  // Schaftkappe aus Gummi, bündig am Schaftende
  const buttPlate = blob(0.031, 0.118, 0.01, 0.003, 4);
  body.add(buttPlate, 'rubber', { y: stockY - 0.092, z: zRear + 0.257 });
  buttPlate.dispose();

  // Riemenbügel links am Schaft (Ring liegt flach an der Seite)
  const slingSwivelBase = box(0.005, 0.008, 0.016, 0.0004, 1);
  slingSwivelBase.translate(-0.0155, 0.0, zRear + 0.22);
  const slingSwivelLoop = ring(0.006, 0.0014, 12, 6);
  slingSwivelLoop.rotateY(Math.PI / 2);
  slingSwivelLoop.translate(-0.0185, 0.0, zRear + 0.22);
  const swivel = mergeAll([slingSwivelBase, slingSwivelLoop]);
  body.add(swivel, 'steel', {});
  swivel.dispose();

  // Stahlhülse am Übergang Gehäuse - Schaft
  const stockSleeve = box(0.032, 0.046, 0.014, 0.0008, 2);
  body.add(stockSleeve, 'steel', { y: bore - 0.026, z: zRear + 0.005 });
  stockSleeve.dispose();

  // Pistolengriff (Seitenprofil: x = nach vorne), oben bündig am Gehäuse
  const grip = extrude(
    [
      [0.002, -0.01],
      [-0.012, -0.018],
      [-0.024, -0.078],
      [-0.008, -0.09],
      [0.01, -0.086],
      [0.018, -0.034],
      [0.012, -0.008],
    ],
    0.026,
    { bevel: 0.0018, bevelSegments: 2 }
  );
  body.add(grip, 'polymer', { y: 0.034, z: 0.01, ry: Math.PI / 2 });
  grip.dispose();

  // Sicherungshebel rechts: langer flacher Hebel, Drehpunkt hinten, zeigt nach vorne
  const safetyBlade = extrude(
    [
      [0.0, 0.006],
      [0.012, 0.006],
      [0.07, 0.003],
      [0.074, 0.0],
      [0.07, -0.004],
      [0.012, -0.006],
      [0.0, -0.006],
      [-0.005, 0.0],
    ],
    0.0025,
    { bevel: 0.0005, bevelSegments: 2 }
  );
  body.add(safetyBlade, 'steel', { x: 0.0185, y: bore - 0.016, z: 0.045, ry: Math.PI / 2 });
  safetyBlade.dispose();
  const safetyPivot = rodZ(0.0055, 0.0055, 0.004, 16, 0.0006);
  body.add(safetyPivot, 'steel', { x: 0.0185, y: bore - 0.016, z: 0.045, ry: Math.PI / 2 });
  safetyPivot.dispose();

  // ==========================================================================
  //  5. BEWEGLICHE TEILE
  // ==========================================================================
  // A. Abzug: Seitenprofil, Wölbung nach vorne
  const trigger = new Assembly('assault2-trigger');
  const triggerBlade = extrude(
    [
      [0.002, 0.012],
      [-0.004, 0.002],
      [-0.007, -0.012],
      [-0.003, -0.016],
      [0.0, -0.016],
      [0.003, -0.006],
      [0.004, 0.004],
    ],
    0.0042,
    { bevel: 0.0008, bevelSegments: 2 }
  );
  trigger.add(triggerBlade, 'steel_black', { ry: -Math.PI / 2 });
  triggerBlade.dispose();

  // B. Gebogenes 30-Schuss-Magazin (Seitenprofil: x = nach vorne), Ursprung oben in der Mitte
  const magazine = new Assembly('assault2-magazine');
  const magBody = extrude(
    [
      [0.030, 0.0],
      [0.040, -0.05],
      [0.058, -0.10],
      [0.082, -0.15],
      [0.105, -0.192],
      [0.058, -0.212],
      [0.038, -0.165],
      [0.016, -0.115],
      [-0.004, -0.06],
      [-0.022, 0.0],
    ],
    0.028,
    { bevel: 0.002, bevelSegments: 3 }
  );
  magazine.add(magBody, 'polymer', { ry: Math.PI / 2 });
  magBody.dispose();

  // Erhabene Verstärkungsflächen auf beiden Seiten (etwas breiter als der Körper)
  const magPanel = extrude(
    [
      [0.024, -0.012],
      [0.033, -0.05],
      [0.051, -0.10],
      [0.074, -0.148],
      [0.093, -0.183],
      [0.061, -0.197],
      [0.043, -0.155],
      [0.022, -0.108],
      [0.003, -0.056],
      [-0.013, -0.012],
    ],
    0.0296,
    { bevel: 0.0006 }
  );
  magazine.add(magPanel, 'polymer', { ry: Math.PI / 2 });
  magPanel.dispose();

  // Bodenplatte, etwas breiter
  const magFloor = extrude(
    [
      [0.109, -0.189],
      [0.055, -0.212],
      [0.053, -0.218],
      [0.109, -0.195],
    ],
    0.031,
    { bevel: 0.0006 }
  );
  magazine.add(magFloor, 'polymer', { ry: Math.PI / 2 });
  magFloor.dispose();

  // Zubringer und oberste Patrone
  const magFollower = box(0.018, 0.004, 0.044, 0.0004);
  magazine.add(magFollower, 'steel_black', { y: -0.004, z: -0.004 });
  magFollower.dispose();
  const brassCartridge = cartridgeCase(0.039, 0.0057);
  magazine.add(brassCartridge, 'brass', { y: -0.001, z: 0.018, ry: Math.PI });
  brassCartridge.dispose();

  // C. Verschlussträger mit Ladehebel rechts (in Waffen-Koordinaten gebaut, Ruhe = Ursprung)
  const bolt = new Assembly('assault2-bolt');
  const boltCarrier = rodZ(0.0124, 0.0124, 0.22, 20, 0.0006);
  bolt.add(boltCarrier, 'steel_bright', { y: bore + 0.001, z: -0.08 });
  boltCarrier.dispose();

  const handleExt = box(0.018, 0.008, 0.012, 0.0008, 2);
  handleExt.translate(0.019, bore - 0.002, zEject + 0.024);
  const handleKnob = dome(0.0078, 16, 0.85);
  handleKnob.rotateY(Math.PI / 2);
  handleKnob.translate(0.028, bore - 0.002, zEject + 0.024);
  const chargingHandle = mergeAll([handleExt, handleKnob]);
  bolt.add(chargingHandle, 'steel', {});
  chargingHandle.dispose();

  // Patrone im Lager: wird beim Zurückziehen sichtbar mitgenommen
  const breechRound = cartridgeCase(0.039, 0.0057);
  bolt.add(breechRound, 'brass', { y: bore, z: zChamber, ry: Math.PI });
  breechRound.dispose();

  // Kimmenkerbe oben im Schieber
  const notch = [0, bore + 0.048, zRearSight + 0.008];
  return {
    id: 'assault2',
    label: 'Kavkaz-47',
    fxClass: 'carbine',
    body,
    moving: { magazine, bolt, trigger },
    nodes: {
      muzzle: [0, bore, -0.577],
      chamber: [0, bore, zChamber],
      eject: [0.0175, bore - 0.002, zEject],
      ejectDir: [0.85, 0.45, 0.25],
      sight: notch,
      ironSight: notch,
      sightAxis: [0, 0, -1],
      handR: [0, 0.006, -0.002],              // vorne am Griff, Mittelfinger
      handL: [0, bore - 0.0225, -0.31],       // unter dem Handschutz
      handguard: { axis: [0, bore, 0], dir: [0, 0, 1], r: 0.0225, z0: hgRear, z1: hgFront },
      magSeat: { pos: [0, bore - 0.046, -0.10], rot: [0, 0, 0] },
      magDrop: [0.01, -0.38, 0.018],
      boltRest: { pos: [0, 0, 0], rot: [0, 0, 0] },
      boltTravel: [0, 0, 0.088],
      triggerPivot: { pos: [0, 0.020, -0.014], rot: [0, 0, 0] },
      triggerPull: -0.28,
    },
    shell: { caseLen: 0.039, rimR: 0.0057 },
  };
}

// ==========================================================================
//  Hilfsfunktionen
// ==========================================================================

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
    14
  );
}
