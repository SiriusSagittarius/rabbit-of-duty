import * as THREE from 'three';

/**
 * Erzeugt eine ultra-hochwertige prozedurale Marmor-Textur (Carrara Weiß mit Gold- & Grau-Adern)
 */
function createMarbleTexture(isDark = false) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Grundierung
  const bgGrad = ctx.createLinearGradient(0, 0, size, size);
  if (isDark) {
    bgGrad.addColorStop(0, '#121418');
    bgGrad.addColorStop(0.5, '#1a1d24');
    bgGrad.addColorStop(1, '#0e1014');
  } else {
    bgGrad.addColorStop(0, '#f8f6f0');
    bgGrad.addColorStop(0.5, '#ede9de');
    bgGrad.addColorStop(1, '#fbf9f4');
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  // Marmor-Adern zeichnen
  const veinCount = isDark ? 14 : 18;
  for (let i = 0; i < veinCount; i++) {
    ctx.beginPath();
    let x = Math.random() * size;
    let y = (i / veinCount) * size;
    ctx.moveTo(x, y);

    const steps = 12;
    for (let s = 0; s < steps; s++) {
      x += (Math.random() - 0.5) * 80 + (isDark ? 20 : 15);
      y += (size / steps) * (0.8 + Math.random() * 0.4);
      ctx.lineTo(x, y);
    }

    if (isDark) {
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(212, 175, 55, 0.45)' : 'rgba(70, 80, 95, 0.35)';
      ctx.lineWidth = 1.0 + Math.random() * 2.5;
    } else {
      ctx.strokeStyle = i % 4 === 0 ? 'rgba(212, 175, 55, 0.55)' : 'rgba(140, 130, 120, 0.35)';
      ctx.lineWidth = 1.2 + Math.random() * 2.8;
    }
    ctx.stroke();
  }

  // Sanfte Kachelfugen für Luxus-Platten
  ctx.strokeStyle = isDark ? 'rgba(212, 175, 55, 0.3)' : 'rgba(200, 185, 160, 0.4)';
  ctx.lineWidth = 2;
  const tileCount = 4;
  const tileSize = size / tileCount;
  for (let t = 0; t <= tileCount; t++) {
    ctx.beginPath();
    ctx.moveTo(t * tileSize, 0); ctx.lineTo(t * tileSize, size);
    ctx.moveTo(0, t * tileSize); ctx.lineTo(size, t * tileSize);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

/**
 * Baut das mehrstöckige Luxus-Wolkenkratzer-Atrium (4 Etagen + Antigravity-Aufzugszonen + Gold-Geländer + Säulendeckung)
 */
export function buildAtriumLevel(ctx) {
  const {
    scene, mapGroup, obstacles, worldColliders, floorPlates, liftZones,
    hemi, amb, sun, sunSprite, sky, ground, camera, player
  } = ctx;

  const W = 54;     // Breite und Tiefe des Atriums
  const H = 28;     // Gesamthöhe bis zum Glasdach
  const voidSize = 22; // Zentraler Lichthof / Atrium-Öffnung (22x22m)
  const floorHeight = 6.0; // 6m pro Etage (Etage 0 = 0m, Etage 1 = 6m, Etage 2 = 12m, Etage 3 = 18m, Etage 4 = 24m)

  // --------------------------------------------------------------------------
  // Materialien: Hochglanz-Marmor, Gold-Geländer, Glas & polierte Säulen
  // --------------------------------------------------------------------------
  const marbleLightTex = createMarbleTexture(false);
  const marbleDarkTex = createMarbleTexture(true);

  // Weißer / Cremer Hochglanz-Marmor
  const matMarbleWhite = new THREE.MeshStandardMaterial({
    map: marbleLightTex,
    color: '#ffffff',
    roughness: 0.18,
    metalness: 0.08,
  });

  // Dunkler Imperial-Marmor mit Goldadern (für Sockel, Säulen & Umrandungen)
  const matMarbleDark = new THREE.MeshStandardMaterial({
    map: marbleDarkTex,
    color: '#2a2622',
    roughness: 0.22,
    metalness: 0.15,
  });

  // Reines poliertes Gold (Gold-Geländer & Zierleisten)
  const matGold = new THREE.MeshStandardMaterial({
    color: '#e6c35c',
    emissive: '#443208',
    emissiveIntensity: 0.25,
    roughness: 0.22,
    metalness: 0.92,
  });

  // Transparentes Sicherheitsglas für Aufzugsschächte & Geländer-Einsätze
  const matGlass = new THREE.MeshPhysicalMaterial({
    color: '#c2e8ff',
    transparent: true,
    opacity: 0.38,
    roughness: 0.08,
    metalness: 0.1,
    transmission: 0.75,
    ior: 1.5,
  });

  // Antigravity-Energiefeld (Leuchtend Türkis / Gold)
  const matLiftPad = new THREE.MeshStandardMaterial({
    color: '#00f0ff',
    emissive: '#00c8e6',
    emissiveIntensity: 1.8,
    roughness: 0.2,
    metalness: 0.5,
  });

  const matLiftRings = new THREE.MeshBasicMaterial({
    color: '#7ef0c0',
    transparent: true,
    opacity: 0.65,
    wireframe: true,
  });

  // --------------------------------------------------------------------------
  // Beleuchtung & Atmosphäre: Luxuriöses warmes Atrium-Licht & Glasdach-Himmel
  // --------------------------------------------------------------------------
  ground.material.map = marbleLightTex;
  ground.material.color.set('#ffffff');
  ground.material.roughness = 0.2;

  scene.fog = new THREE.FogExp2('#1c202a', 0.0055);
  hemi.color.set('#ffe8cc');
  hemi.groundColor.set('#2a2430');
  hemi.intensity = 1.35;
  amb.color.set('#3a3440');
  amb.intensity = 0.95;
  sun.color.set('#fff0db');
  sun.intensity = 2.6;
  sun.position.set(10, 36, -10);
  sunSprite.visible = false;

  sky.material.uniforms.top.value.set('#101828');
  sky.material.uniforms.mid.value.set('#2c2838');
  sky.material.uniforms.bot.value.set('#483c44');

  // --------------------------------------------------------------------------
  // Hilfsfunktionen für Kollisionen & Bau
  // --------------------------------------------------------------------------
  function addCollider(minX, maxX, minZ, maxZ, minY = -999, maxY = 999) {
    const o = { minX: minX - 0.25, maxX: maxX + 0.25, minZ: minZ - 0.25, maxZ: maxZ + 0.25, minY, maxY, top: maxY };
    obstacles.push(o);
    return o;
  }

  function addFloorPlate(minX, maxX, minZ, maxZ, y, label = '') {
    floorPlates.push({ minX, maxX, minZ, maxZ, y, label });
  }

  // --------------------------------------------------------------------------
  // 1. Erdgeschoss (Level 0, y = 0)
  // --------------------------------------------------------------------------
  addFloorPlate(-W/2, W/2, -W/2, W/2, 0, 'Lobby Level 0');

  // Außenwände des Wolkenkratzers
  const wallThick = 2.0;
  const wallMat = matMarbleDark;

  // 4 Außenwände
  function makeWall(x, z, w, h, d) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, h/2, z);
    m.castShadow = m.receiveShadow = true;
    mapGroup.add(m);
    worldColliders.push(m);
    addCollider(x - w/2, x + w/2, z - d/2, z + d/2, 0, h);
    return m;
  }

  makeWall(0, -W/2, W, H, wallThick);
  makeWall(0,  W/2, W, H, wallThick);
  makeWall(-W/2, 0, wallThick, H, W);
  makeWall( W/2, 0, wallThick, H, W);

  // Glasdach oben
  const glassRoof = new THREE.Mesh(new THREE.BoxGeometry(W, 0.8, W), matGlass);
  glassRoof.position.y = H + 0.4;
  mapGroup.add(glassRoof);

  // Goldener Deckenrahmen am Dach
  const domeFrame = new THREE.Mesh(new THREE.RingGeometry(8, 20, 16), matGold);
  domeFrame.rotation.x = Math.PI/2;
  domeFrame.position.y = H - 0.2;
  mapGroup.add(domeFrame);

  // --------------------------------------------------------------------------
  // 2. Die 4 Galerie-Etagen (Level 1 bis Level 4) mit zentralem Lichthof
  // --------------------------------------------------------------------------
  const halfW = W / 2;
  const halfV = voidSize / 2;
  const slabThick = 0.55;

  for (let lvl = 1; lvl <= 4; lvl++) {
    const fY = lvl * floorHeight;

    // Jede Etage hat 4 Platten um den zentralen Lichthof herum
    // Nordplatte
    const nMesh = new THREE.Mesh(new THREE.BoxGeometry(W, slabThick, halfW - halfV), matMarbleWhite);
    nMesh.position.set(0, fY - slabThick/2, -(halfW + halfV) / 2);
    nMesh.receiveShadow = nMesh.castShadow = true;
    mapGroup.add(nMesh); worldColliders.push(nMesh);
    addFloorPlate(-halfW, halfW, -halfW, -halfV, fY, `Etage ${lvl} Nord`);

    // Südplatte
    const sMesh = new THREE.Mesh(new THREE.BoxGeometry(W, slabThick, halfW - halfV), matMarbleWhite);
    sMesh.position.set(0, fY - slabThick/2, (halfW + halfV) / 2);
    sMesh.receiveShadow = sMesh.castShadow = true;
    mapGroup.add(sMesh); worldColliders.push(sMesh);
    addFloorPlate(-halfW, halfW, halfV, halfW, fY, `Etage ${lvl} Süd`);

    // Westplatte
    const wMesh = new THREE.Mesh(new THREE.BoxGeometry(halfW - halfV, slabThick, voidSize), matMarbleWhite);
    wMesh.position.set(-(halfW + halfV) / 2, fY - slabThick/2, 0);
    wMesh.receiveShadow = wMesh.castShadow = true;
    mapGroup.add(wMesh); worldColliders.push(wMesh);
    addFloorPlate(-halfW, -halfV, -halfV, halfV, fY, `Etage ${lvl} West`);

    // Ostplatte
    const eMesh = new THREE.Mesh(new THREE.BoxGeometry(halfW - halfV, slabThick, voidSize), matMarbleWhite);
    eMesh.position.set((halfW + halfV) / 2, fY - slabThick/2, 0);
    eMesh.receiveShadow = eMesh.castShadow = true;
    mapGroup.add(eMesh); worldColliders.push(eMesh);
    addFloorPlate(halfV, halfW, -halfV, halfV, fY, `Etage ${lvl} Ost`);

    // Gilded Trim an der Unterkante der Galerie
    const trimMat = matGold;
    const trimBorder = new THREE.Mesh(new THREE.BoxGeometry(voidSize + 0.4, 0.25, voidSize + 0.4), trimMat);
    trimBorder.position.set(0, fY - slabThick - 0.1, 0);
    mapGroup.add(trimBorder);

    // ------------------------------------------------------------------------
    // Gold-Geländer (Golden Railings) entlang der Galeriekante (Höhe 1.15m)
    // ------------------------------------------------------------------------
    const rH = 1.15;
    function makeRailing(x, z, length, isHorizontal) {
      const gGroup = new THREE.Group();

      // Oberer Gold-Handlauf
      const handrail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, length, 12),
        matGold
      );
      handrail.rotation.z = isHorizontal ? Math.PI/2 : 0;
      handrail.rotation.x = isHorizontal ? 0 : Math.PI/2;
      handrail.position.y = rH;
      handrail.castShadow = true;
      gGroup.add(handrail);

      // Unterer Gold-Sockellauf
      const baseRail = new THREE.Mesh(
        new THREE.BoxGeometry(isHorizontal ? length : 0.08, 0.08, isHorizontal ? 0.08 : length),
        matGold
      );
      baseRail.position.y = 0.08;
      gGroup.add(baseRail);

      // Glas-/Gold-Balustraden-Füllung
      const glassPanel = new THREE.Mesh(
        new THREE.BoxGeometry(isHorizontal ? length - 0.2 : 0.04, rH - 0.2, isHorizontal ? 0.04 : length - 0.2),
        matGlass
      );
      glassPanel.position.y = rH / 2;
      gGroup.add(glassPanel);

      // Goldene vertikale Streben alle 2m
      const posts = Math.floor(length / 2.2);
      for (let p = 0; p <= posts; p++) {
        const offset = -length/2 + (p / posts) * length;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, rH, 10), matGold);
        post.position.set(isHorizontal ? offset : 0, rH/2, isHorizontal ? 0 : offset);
        post.castShadow = true;
        gGroup.add(post);
      }

      gGroup.position.set(x, fY, z);
      mapGroup.add(gGroup);

      // Kollision für Geländer: Spieler kann nicht durchgehen, aber drüber springen
      if (isHorizontal) {
        addCollider(x - length/2, x + length/2, z - 0.15, z + 0.15, fY, fY + rH + 0.1);
      } else {
        addCollider(x - 0.15, x + 0.15, z - length/2, z + length/2, fY, fY + rH + 0.1);
      }
    }

    // Die 4 Geländerkanten um den Lichthof (außer dort wo Skybridges andocken)
    // Auf Level 2: Süd-Skybridge; Auf Level 3: Nord-Skybridge; Auf Level 4: Volle Skybridge
    if (lvl !== 4) {
      makeRailing(0, -halfV, voidSize, true);   // Nord-Kante
      makeRailing(0,  halfV, voidSize, true);   // Süd-Kante
      makeRailing(-halfV, 0, voidSize, false);  // West-Kante
      makeRailing( halfV, 0, voidSize, false);  // Ost-Kante
    } else {
      // Level 4 Penthouse Skybridge (überquert das Atrium von Nord nach Süd)
      const bridgeW = 5.0;
      const bMesh = new THREE.Mesh(new THREE.BoxGeometry(bridgeW, slabThick, voidSize), matMarbleWhite);
      bMesh.position.set(0, fY - slabThick/2, 0);
      bMesh.receiveShadow = bMesh.castShadow = true;
      mapGroup.add(bMesh); worldColliders.push(bMesh);
      addFloorPlate(-bridgeW/2, bridgeW/2, -halfV, halfV, fY, 'Level 4 Skybridge');

      // Geländer links & rechts der Brücke
      makeRailing(-bridgeW/2, 0, voidSize, false);
      makeRailing( bridgeW/2, 0, voidSize, false);

      // Restliche Geländer der 4. Etage
      makeRailing(-(halfV + bridgeW/2)/2, -halfV, halfV - bridgeW/2, true);
      makeRailing( (halfV + bridgeW/2)/2, -halfV, halfV - bridgeW/2, true);
      makeRailing(-(halfV + bridgeW/2)/2,  halfV, halfV - bridgeW/2, true);
      makeRailing( (halfV + bridgeW/2)/2,  halfV, halfV - bridgeW/2, true);
      makeRailing(-halfV, 0, voidSize, false);
      makeRailing( halfV, 0, voidSize, false);
    }
  }

  // --------------------------------------------------------------------------
  // 3. Säulen als taktische Deckung (Marmor mit Gold-Kapitell & Sockel)
  // --------------------------------------------------------------------------
  function makePillar(x, z, baseY, height) {
    const g = new THREE.Group();
    const r = 0.75;

    // Säulenschaft (Weißer Marmor)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, height - 1.2, 16), matMarbleWhite);
    shaft.position.y = height / 2;
    shaft.castShadow = shaft.receiveShadow = true;
    g.add(shaft);

    // Sockel (Dunkler Imperial-Marmor mit Goldring)
    const base = new THREE.Mesh(new THREE.BoxGeometry(r*2.4, 0.6, r*2.4), matMarbleDark);
    base.position.y = 0.3;
    base.castShadow = true;
    g.add(base);

    const baseGold = new THREE.Mesh(new THREE.CylinderGeometry(r*1.15, r*1.2, 0.2, 16), matGold);
    baseGold.position.y = 0.7;
    g.add(baseGold);

    // Kapitell (Gold / Dunkler Marmor oben)
    const capGold = new THREE.Mesh(new THREE.CylinderGeometry(r*1.2, r*1.05, 0.3, 16), matGold);
    capGold.position.y = height - 0.7;
    g.add(capGold);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(r*2.4, 0.5, r*2.4), matMarbleDark);
    cap.position.y = height - 0.25;
    cap.castShadow = true;
    g.add(cap);

    g.position.set(x, baseY, z);
    mapGroup.add(g);
    worldColliders.push(shaft); worldColliders.push(base);

    // Saubere 3D-Kollision für Spieler
    addCollider(x - r*1.1, x + r*1.1, z - r*1.1, z + r*1.1, baseY, baseY + height);
  }

  // 8 Grandiose Säulen im Erdgeschoss (Lobby)
  const pillarDist = 14;
  for (const px of [-pillarDist, pillarDist]) {
    for (const pz of [-pillarDist, -5, 5, pillarDist]) {
      makePillar(px, pz, 0, 6.0);
    }
  }

  // Galerie-Säulen auf Etage 1, 2, 3 für taktische Feuergefechte
  for (let lvl = 1; lvl <= 3; lvl++) {
    const fY = lvl * floorHeight;
    for (const px of [-18, 18]) {
      for (const pz of [-16, 0, 16]) {
        makePillar(px, pz, fY, floorHeight);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 4. Zentrale Aufzugsschächte als Antigravity-Auftriebszonen
  // --------------------------------------------------------------------------
  // 2 Luxus-Panoramaglas-Aufzugsröhren bei x = -7.0 und x = +7.0
  const shaftRadius = 2.4;
  const liftShafts = [
    { x: -7.0, z: 0, label: 'Aufzugsschacht West (Antigrav)' },
    { x:  7.0, z: 0, label: 'Aufzugsschacht Ost (Antigrav)' },
  ];

  for (const shaft of liftShafts) {
    const sGroup = new THREE.Group();

    // 1. Antigrav-Bodenplatte (Pulsierendes Energiefeld)
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(shaftRadius * 0.9, shaftRadius * 0.95, 0.35, 24),
      matLiftPad
    );
    pad.position.y = 0.18;
    sGroup.add(pad);

    // Goldener Rahmen um den Schacht
    const ringBase = new THREE.Mesh(
      new THREE.TorusGeometry(shaftRadius, 0.12, 12, 24),
      matGold
    );
    ringBase.rotation.x = Math.PI/2;
    ringBase.position.y = 0.36;
    sGroup.add(ringBase);

    // 2. Aufsteigende Antigrav-Energieringe im Schacht (alle 3 Meter bis zum Dach)
    for (let ry = 2.5; ry < H - 2; ry += 3.2) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(shaftRadius * 0.85, 0.05, 8, 20), matLiftRings);
      ring.rotation.x = Math.PI/2;
      ring.position.y = ry;
      ring.userData = { spinSpeed: 0.8 + Math.random()*0.5, bobBaseY: ry };
      sGroup.add(ring);
    }

    // 3. Vertikale Gold- & Glaspfeiler um den Schacht mit Ausstiegsöffnungen
    const glassSegments = 6;
    for (let seg = 0; seg < glassSegments; seg++) {
      const angle = (seg / glassSegments) * Math.PI * 2;
      const colX = Math.cos(angle) * shaftRadius;
      const colZ = Math.sin(angle) * shaftRadius;

      // Vertikale Goldsäule
      const vPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, H - 1, 10),
        matGold
      );
      vPole.position.set(colX, H/2, colZ);
      vPole.castShadow = true;
      sGroup.add(vPole);
    }

    sGroup.position.set(shaft.x, 0, shaft.z);
    mapGroup.add(sGroup);

    // 4. Antigravity-Auftriebszone registrieren!
    liftZones.push({
      minX: shaft.x - shaftRadius * 0.9,
      maxX: shaft.x + shaftRadius * 0.9,
      minZ: shaft.z - shaftRadius * 0.9,
      maxZ: shaft.z + shaftRadius * 0.9,
      minY: 0,
      maxY: H - 1.5,
      liftForce: 12.0,
      label: shaft.label,
    });
  }

  // --------------------------------------------------------------------------
  // 5. Luxus-Interieur als taktische Deckung: Marmor-Brunnen, Empfang & Sitzbereiche
  // --------------------------------------------------------------------------
  // Zentraler Marmor-Brunnen / Blumenbeet im Erdgeschoss
  const fountainBase = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.8, 0.85, 24), matMarbleDark);
  fountainBase.position.set(0, 0.42, 0);
  fountainBase.castShadow = fountainBase.receiveShadow = true;
  mapGroup.add(fountainBase); worldColliders.push(fountainBase);
  addCollider(-3.6, 3.6, -3.6, 3.6, 0, 0.9);

  const fountainWater = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.2, 0.15, 24),
    new THREE.MeshStandardMaterial({ color: '#20b2aa', roughness: 0.1, metalness: 0.3 })
  );
  fountainWater.position.set(0, 0.85, 0);
  mapGroup.add(fountainWater);

  // Empfangstresen (Reception Desk) im Norden
  const desk = new THREE.Mesh(new THREE.BoxGeometry(8, 1.25, 2.0), matMarbleDark);
  desk.position.set(0, 0.62, -18);
  desk.castShadow = desk.receiveShadow = true;
  mapGroup.add(desk); worldColliders.push(desk);
  addCollider(-4, 4, -19, -17, 0, 1.3);

  // Luxus-Sitzgruppen / Couches als hüfthohe Deckung auf Floor 0 & Floor 1
  const matCouch = new THREE.MeshStandardMaterial({ color: '#5c242e', roughness: 0.85 }); // Dunkelroter Samt
  function makeCouch(x, z, rot, y = 0) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.85, 1.2), matCouch);
    c.position.set(x, y + 0.42, z);
    c.rotation.y = rot;
    c.castShadow = c.receiveShadow = true;
    mapGroup.add(c); worldColliders.push(c);
    const halfL = 1.6, halfW = 0.6;
    addCollider(x - 1.6, x + 1.6, z - 1.2, z + 1.2, y, y + 0.9);
  }

  makeCouch(-12, -8, 0.3, 0);
  makeCouch( 12, -8, -0.3, 0);
  makeCouch(-12,  8, 0.2, 0);
  makeCouch( 12,  8, -0.2, 0);

  // Couches & Luxusvitrinen auf den Galerien (Floor 1 & 2)
  makeCouch(-20, -6, Math.PI/2, 6.0);
  makeCouch( 20, -6, Math.PI/2, 6.0);
  makeCouch(-20,  6, Math.PI/2, 12.0);
  makeCouch( 20,  6, Math.PI/2, 12.0);

  // --------------------------------------------------------------------------
  // 6. Beleuchtungs-Akzente & Kronleuchter im Atrium
  // --------------------------------------------------------------------------
  const chandelierLight = new THREE.PointLight('#ffeacc', 3.8, 60, 1.1);
  chandelierLight.position.set(0, H - 4, 0);
  mapGroup.add(chandelierLight);

  // Etagen-Fülllichter für dramatische warme Beleuchtung
  for (let lvl = 0; lvl <= 4; lvl++) {
    const ly = lvl * floorHeight + 3.0;
    const fl1 = new THREE.PointLight('#ffe2b8', 1.8, 25, 1.3);
    fl1.position.set(-18, ly, -18); mapGroup.add(fl1);
    const fl2 = new THREE.PointLight('#ffe2b8', 1.8, 25, 1.3);
    fl2.position.set( 18, ly,  18); mapGroup.add(fl2);
  }

  // --------------------------------------------------------------------------
  // Startposition des Spielers in der Grand Lobby
  // --------------------------------------------------------------------------
  camera.position.set(0, player.height, 14);
  player.vy = 0;
  player.onGround = true;

  console.log('🏛️ Luxus-Wolkenkratzer-Atrium erfolgreich aufgebaut: 4 Galerien, 2 Antigrav-Schächte, Marmor & Gold.');
}
