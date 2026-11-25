/**
 * Wohnhäuser an der Schulstraße in Much – gezeichnete Fassaden (ganze Wand bis in den Giebel).
 *
 * Grundlage: Street-View-Screenshots des Users (24.11.), nur als Vorlage für Fensterachsen, Farben, Läden und
 * Haustüren, nicht als Textur. Einträge wie in much-shops.js (dort die Beschreibung der Felder); die Lage der
 * Fenster steht als Anteil der Wandbreite W (von der Straße aus links → rechts) und in Metern über dem Gehweg,
 * meist umgerechnet mit k = Traufhöhe im Spiel / Traufhöhe im Foto.
 *
 * Zuordnung, wo die Bilder anders heißen als die amtliche Adresse:
 *   Bild „11“  → Schulstraße 13 (zwischen 9 und 13 steht kein weiteres Haus)
 *   Bild „19“  → Anbau ohne Hausnummer westlich von Nr. 19 (id:DENW46AL1000Uq9E)
 *   Bild „19a“ → Doppelhaus Nr. 19 (links) und Nr. 17 (rechts)
 *   Bild „29“  → Schulstraße 29a, Bild „29-25“ → Reihenhäuser 29, 27, 25 (Front auf dem vorgezogenen Obergeschoss)
 *   Garagen von Nr. 14 und Balkon westlich an Nr. 9: eigene LoD2-Bauteile vor dem Haus (Schlüssel id:…)
 *   Bild „18“  → Haus hinter der Einfahrt zwischen Nr. 14 und 16 (id:DENW46AL1000Uqo4, im LoD2 ein Nebengebäude);
 *                laut User inzwischen neu gebaut und ein Geschoss höher (raise), von der Einfahrt aus unten links
 *                zwei Türen und ein Fenster, oben zwei Fenster.
 */

const SERIF = 'Georgia, "Times New Roman", serif';

/** Gemeinsame Vorgaben: ganze Wand, Front zur Schulstraße, halbe Atlasauflösung reicht für Wohnhäuser. */
const H = (o) => ({ wall: 'house2', tint: '#f4f4f2', full: true, px: 40, street: 'Schulstraße', ...o });

// ---------- Zeichenhilfen ----------

/** Rollladen: Panzer bis zum Anteil frac heruntergelassen. */
function roller(P, x0, x1, h0, h1, frac, col = '#dcd8cf') {
  const hb = h1 - (h1 - h0) * Math.min(1, frac);
  P.rect(x0, x1, hb, h1, col);
  for (let h = hb + 0.045; h < h1; h += 0.055) P.rect(x0, x1, h, h + 0.01, 'rgba(0,0,0,0.13)');
}

/** Klappläden mit Lamellen links und rechts eines Fensters; edge = andersfarbiger Rahmen. */
function shutters(P, x0, x1, h0, h1, col, w, edge) {
  const sw = w ?? Math.min(0.55, (x1 - x0) / 2);
  for (const [a, b] of [[x0 - sw - 0.03, x0 - 0.03], [x1 + 0.03, x1 + sw + 0.03]]) {
    if (edge) P.rect(a - 0.02, b + 0.02, h0 - 0.04, h1 + 0.04, edge);
    P.rect(a, b, h0 - 0.02, h1 + 0.02, col);
    for (let h = h0 + 0.05; h < h1 - 0.03; h += 0.07) P.rect(a + 0.035, b - 0.035, h, h + 0.028, 'rgba(0,0,0,0.28)');
  }
}

/**
 * Fenster eines Wohnhauses. o: frame (Rahmenfarbe), mull (Flügel), transom, bars [Spalten, Zeilen] (Sprossen),
 * curtain (true oder Farbe), roller (0..1, Rollladen), rcol, box (Rollladenkasten), shut (Ladenfarbe), shutW, shutEdge,
 * surround (Faschen), sill (Fensterbank), grille (Eisengitter).
 */
function win(P, x0, x1, h0, h1, o = {}) {
  const fr = o.frame || '#f4f4f2';
  if (o.surround) P.rect(x0 - 0.1, x1 + 0.1, h0 - 0.1, h1 + 0.1, o.surround);
  P.window(x0, x1, h0, h1, { frame: fr, t: o.t ?? 0.06, mullions: o.mull ?? (x1 - x0 > 1.05 ? 1 : 0), transom: o.transom });
  if (o.curtain) P.rect(x0 + 0.07, x1 - 0.07, h0 + 0.07, h1 - 0.07, o.curtain === true ? 'rgba(242,240,234,0.55)' : o.curtain);
  if (o.bars) {
    const [nc, nr] = o.bars, t = 0.018;
    for (let i = 1; i < nc; i++) { const x = x0 + (x1 - x0) * i / nc; P.rect(x - t, x + t, h0, h1, fr); }
    for (let i = 1; i < nr; i++) { const h = h0 + (h1 - h0) * i / nr; P.rect(x0, x1, h - t, h + t, fr); }
  }
  if (o.roller) roller(P, x0 + 0.05, x1 - 0.05, h0 + 0.05, h1 - 0.03, o.roller, o.rcol);
  if (o.box) P.rect(x0 - 0.02, x1 + 0.02, h1, h1 + 0.17, o.box === true ? '#e9e8e4' : o.box);
  if (o.grille) for (let x = x0 + 0.12; x < x1 - 0.05; x += 0.12) P.rect(x - 0.012, x + 0.012, h0, h1, o.grille);
  P.rect(x0 - 0.06, x1 + 0.06, h0 - 0.05, h0, o.sill || '#c9c7c1');
  if (o.shut) shutters(P, x0, x1, h0, h1, o.shut, o.shutW, o.shutEdge);
}

/** Ortgang: dunkle Kante unter der Dachlinie (Fronten bis in den Giebel); beams = Abstand der Pfettenköpfe. */
function verge(P, col = '#3b3c3f', w = 0.2, beams = 0) {
  for (let x = 0; x < P.W; x += 0.04) { const r = P.roofAt(x + 0.02); P.rect(x, x + 0.04, r - w, r + 0.05, col); }
  if (beams) for (let x = beams / 2; x < P.W; x += beams) {
    const r = P.roofAt(x);
    if (r > P.eave + 0.4) P.rect(x - 0.08, x + 0.08, r - w - 0.22, r - w + 0.02, col);
  }
}

/** Schatten unter dem Dachüberstand an der Traufe. */
function soffit(P, h = P.eave, d = 0.35) {
  P.rect(0, P.W, h - d, h + 0.05, 'rgba(0,0,0,0.12)');
  P.rect(0, P.W, h - 0.08, h + 0.05, 'rgba(0,0,0,0.2)');
}

/** Fallrohr bis zur Traufe. */
function pipe(P, x, col = '#b9bcbf', top = P.eave) { P.rect(x - 0.045, x + 0.045, -P.plinth, top, col); }

/** Klinker oder Ziegel im Läuferverband; base = [r, g, b]. */
function brick(P, x0, x1, h0, h1, base = [160, 90, 66], mortar = 'rgba(225,215,200,0.4)') {
  P.rect(x0, x1, h0, h1, `rgb(${base})`);
  for (let h = h0, r = 0; h < h1; h += 0.075, r++) {
    P.rect(x0, x1, h, Math.min(h1, h + 0.012), mortar);
    for (let x = x0 - (r % 2) * 0.125; x < x1; x += 0.25) {
      const j = (P.rnd() - 0.5) * 26;
      P.rect(Math.max(x0, x + 0.012), Math.min(x1, x + 0.25), h + 0.012, Math.min(h1, h + 0.075),
        `rgb(${base[0] + j | 0},${base[1] + j * 0.7 | 0},${base[2] + j * 0.6 | 0})`);
    }
  }
}

/** Waagerechte Holzverschalung. */
function boards(P, x0, x1, h0, h1, col = '#2c2623') {
  P.wood(x0, x1, h0, h1, col);
  for (let h = h0 + 0.16; h < h1; h += 0.16) P.rect(x0, x1, h, h + 0.018, 'rgba(0,0,0,0.35)');
}

/** Kleines Vordach von vorn: Traufkante unten, Dachfläche nach oben schmaler (Walm). */
function hood(P, x0, x1, h0, h1, col = '#5b4c44', edge = '#3e4246') {
  P.rect(x0 + 0.1, x1 - 0.1, h0 - 0.22, h0, 'rgba(0,0,0,0.15)');
  const n = Math.max(2, Math.round((h1 - h0) / 0.07)), inset = (x1 - x0) * 0.22;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    P.rect(x0 + inset * t, x1 - inset * t, h0 + (h1 - h0) * t, h0 + (h1 - h0) * (i + 1) / n, i % 2 ? col : 'rgba(0,0,0,0)');
    P.rect(x0 + inset * t, x1 - inset * t, h0 + (h1 - h0) * t, h0 + (h1 - h0) * t + 0.012, 'rgba(0,0,0,0.25)');
  }
  P.rect(x0, x1, h0, h0 + 0.1, edge);
}

/** Bewuchs (Kletterpflanze, Busch an der Wand) im Rechteck. */
function green(P, x0, x1, h0, h1) {
  for (let x = x0 + 0.3; x < x1; x += 0.55) for (let h = h0; h < h1 - 0.2; h += 0.6) P.shrub(x, h, 0.8, 0.7);
}

/** Wandleuchte. */
function lamp(P, x, h) {
  P.rect(x - 0.06, x + 0.06, h - 0.12, h + 0.12, '#2d2f32');
  P.rect(x - 0.04, x + 0.04, h - 0.08, h + 0.07, '#e8e2c8');
}

/** Garagentor mit senkrechten Sicken zwischen Betonpfeilern. */
function garageDoor(P, x0, x1, h1, col = '#6f7a84') {
  P.rect(x0, x1, 0, h1, col);
  for (let x = x0 + 0.1; x < x1; x += 0.1) P.rect(x, x + 0.015, 0, h1, 'rgba(0,0,0,0.18)');
  P.rect(x0, x1, h1 - 0.05, h1, 'rgba(0,0,0,0.25)');
}

/**
 * Dreiergiebel-Reihenhaus (Nr. 25–29): weiße Wand, darüber Schiefergiebel, unten überdachter Eingangsbereich. Die Front
 * liegt auf dem vorgezogenen Obergeschoss, das im LoD2 ein eigenes Bauteil ohne Adresse ist (vor der Hauswand).
 */
function rowHouse(P, nr, o) {
  const { W, top } = P, fr = '#2d2e31', white = Math.min(4.9, top - 0.9);
  P.plaster('#f4f4f2', -P.plinth, white);
  P.slate(0, W, white, top);
  P.rect(0, W, white - 0.06, white + 0.04, '#2c3035');
  win(P, o.up[0] * W, o.up[1] * W, 3.42, 4.5, { frame: fr, mull: 1, curtain: true, sill: '#d6d4cf' });
  const r1 = o.recess;                                                         // überdachter Eingang unter dem Obergeschoss
  P.rect(0.02 * W, 0.93 * W, -P.plinth, r1, '#c9c8c3');
  P.rect(0.02 * W, 0.93 * W, r1 - 0.25, r1, 'rgba(0,0,0,0.25)');
  for (const [a, b, h0, h1] of o.wins) win(P, a * W, b * W, h0, h1, { frame: fr, curtain: true });
  if (o.door) P.door(o.door[0] * W, o.door[1] * W, 0, Math.min(2.15, r1 - 0.08), { frame: fr, glass: true });
  if (o.box) P.rect(o.box[0] * W, o.box[1] * W, 0, 1.4, '#7c7b78');
  if (o.brick) brick(P, o.brick[0] * W, o.brick[1] * W, 0, 0.25, [96, 52, 44]);
  P.number(nr, o.nr * W, r1 - 0.45, 0.16);
}

// ---------- Häuser ----------

export const MUCH_HOUSES = {
  'Schulstraße 4': H({
    name: 'Schulstraße 4', tint: '#f2f2ef',
    draw(P) {
      const { W } = P, k = P.eave / 5.9, fr = '#55585c';
      P.plaster('#f2f2ef'); P.plinthBand('#a7a9ab', 0.35);
      win(P, 0.36 * W, 0.46 * W, 3.93 * k, 5.28 * k, { frame: fr, curtain: true });
      win(P, 0.57 * W, 0.62 * W, 4.58 * k, 5.35 * k, { frame: fr });
      win(P, 0.67 * W, 0.72 * W, 4.58 * k, 5.35 * k, { frame: fr });
      win(P, 0.36 * W, 0.45 * W, 1.37 * k, 2.56 * k, { frame: fr, curtain: true });
      win(P, 0.56 * W, 0.61 * W, 1.77 * k, 2.59 * k, { frame: fr });
      pipe(P, 0.02 * W); soffit(P);
    },
  }),

  'Schulstraße 6': H({
    name: 'Schulstraße 6', tint: '#f4f4f1',
    draw(P) {
      const { W } = P, k = P.eave / 5.56, fr = '#6b4a33';
      P.plaster('#f4f4f1'); P.plinthBand('#8d8f91', 0.3);
      win(P, 0.344 * W, 0.444 * W, 3.83 * k, 4.87 * k, { frame: fr, curtain: 'rgba(228,228,236,0.7)' });
      win(P, 0.627 * W, 0.78 * W, 3.8 * k, 4.89 * k, { frame: fr, mull: 0, curtain: 'rgba(236,236,240,0.6)' });
      win(P, 0.12 * W, 0.23 * W, 1.0 * k, 2.2 * k, { frame: fr, curtain: true });
      win(P, 0.66 * W, 0.8 * W, 1.0 * k, 2.2 * k, { frame: fr, curtain: true });
      hood(P, 0.294 * W, 0.549 * W, 2.75 * k, 3.55 * k, '#5a4b43', '#4a4f55');      // Walmdach über der Haustür
      P.steps(0.3 * W, 0.5 * W, -P.plinth, 0.35, 2, '#6b6a68');
      P.door(0.336 * W, 0.442 * W, 0.35, 2.4 * k, { frame: '#5b3a24', wood: '#8a5a32' });
      P.number('6', 0.475 * W, 2.45 * k, 0.12);
      pipe(P, 0.06 * W, '#8c8f92'); soffit(P);
    },
  }),

  'Schulstraße 7': {
    // Neuapostolische Kirche: Klinker, dunkles Schieferband an der Traufe, Portal mit Ornamentgitter, Kreuz mit
    // Sonnenstrahlen; rechts der Turm mit dem hohen Fensterband (more).
    name: 'Neuapostolische Kirche', wall: 'brick', tint: '#ffffff', full: true, px: 48, street: 'Schulstraße',
    draw(P) {
      const { W } = P, E = P.eave, b0 = E - 0.85, d0 = 0.324 * W, d1 = 0.499 * W, dh = Math.min(2.3, b0 - 0.2);
      brick(P, 0, W, -P.plinth, b0, [164, 90, 70]);
      P.slate(0, W, b0, P.top);
      P.rect(0, W, b0 - 0.06, b0, 'rgba(0,0,0,0.3)');
      P.rect(d0 - 0.2, d1 + 0.2, 0, dh + 0.2, '#8a4c3b');                          // Portalnische
      P.door(d0, d1, 0, dh, { frame: '#cfd2d4', glass: true, double: true, t: 0.08 });
      for (let x = d0 + 0.22; x < d1 - 0.1; x += 0.3) for (let h = 0.35; h < dh - 0.2; h += 0.32) {
        P.board(x - 0.12, x + 0.12, h - 0.12, h + 0.12, { ellipse: true, bg: 'rgba(0,0,0,0)', border: '#25272a', borderW: 0.03 });
      }
      lamp(P, 0.245 * W, 1.9); lamp(P, 0.535 * W, 1.9);
      P.board(0.046 * W, 0.134 * W, 1.1, 1.3, { bg: '#cdc6b6', border: '#8a857a', borderW: 0.015 });
      P.text('NEUAPOSTOLISCHE KIRCHE', 0.09 * W, 1.2, 0.05, { color: '#4a443b', weight: '700', maxW: 0.08 * W });
      const cx = 0.85 * W, ch = 0.9;                                              // Kreuz mit Strahlen über Wellen
      for (let a = -70; a <= 70; a += 14) {
        const s = Math.sin(a * Math.PI / 180), c = Math.cos(a * Math.PI / 180);
        for (let r = 0.15; r < 0.75; r += 0.03) P.rect(cx + s * r - 0.015, cx + s * r + 0.015, ch + c * r - 0.015, ch + c * r + 0.015, '#b9b6b0');
      }
      P.rect(cx - 0.04, cx + 0.04, ch, 2.3, '#bdbab4');
      P.rect(cx - 0.32, cx + 0.32, 1.92, 2.0, '#bdbab4');
      for (let i = 0; i < 2; i++) P.rect(cx - 0.42, cx + 0.42, ch - 0.18 - i * 0.12, ch - 0.12 - i * 0.12, '#b9b6b0');
      pipe(P, W - 0.08, '#8e9194', b0);
    },
    more: [{
      name: 'Neuapostolische Kirche (Turm)', full: true, near: [-16.6, 125.6],
      draw(P) {
        const { W, top } = P, b1 = top - 0.6;
        brick(P, 0, W, -P.plinth, b1, [164, 90, 70]);
        P.slate(0, W, b1, top);
        const x0 = 0.1 * W, x1 = 0.8 * W, rows = [[0.65, 1.95], [2.2, 3.5], [3.75, 4.9], [5.15, 6.3]].filter(r => r[1] < b1 - 0.4);
        P.rect(x0, x1, 0.5, rows[rows.length - 1][1] + 0.15, '#eeeeeb');
        for (const [h0, h1] of rows) for (let i = 0; i < 3; i++) {
          const a = x0 + 0.1 + i * (x1 - x0 - 0.2) / 3, b = a + (x1 - x0 - 0.2) / 3 - 0.12;
          P.rect(a, b, h0, h1, '#c9d3d8');
          for (let h = h0 + 0.2; h < h1; h += 0.25) P.rect(a, b, h, h + 0.02, 'rgba(120,100,140,0.35)');
          P.rect((a + b) / 2 - 0.02, (a + b) / 2 + 0.02, h0, h1, 'rgba(160,120,90,0.4)');
        }
        pipe(P, W - 0.1, '#8e9194', b1);
      },
    }],
  },

  'Schulstraße 8': H({
    name: 'Schulstraße 8', tint: '#f3f3f0',
    draw(P) {
      const { W } = P, k = P.eave / 5.33, fr = '#5d4030';
      P.plaster('#f3f3f0'); P.plinthBand('#9a9c9e', 0.3);
      win(P, 0.333 * W, 0.43 * W, 3.47 * k, 4.66 * k, { frame: fr, bars: [2, 3] });
      win(P, 0.552 * W, 0.6 * W, 4.0 * k, 4.73 * k, { frame: fr });
      win(P, 0.63 * W, 0.677 * W, 4.0 * k, 4.73 * k, { frame: fr });
      win(P, 0.77 * W, 0.908 * W, 3.5 * k, 4.66 * k, { frame: fr, curtain: true });
      hood(P, 0.243 * W, 0.468 * W, 2.43 * k, 3.05 * k, '#3e4246', '#33373b');      // Schieferhaube über der Tür
      P.door(0.312 * W, 0.418 * W, 0.3, 2.1 * k, { frame: '#3a2a20', panel: '#2e2622' });
      for (let x = 0.325 * W; x < 0.405 * W; x += 0.14) for (let h = 0.7; h < 2.0 * k; h += 0.2) P.rect(x, x + 0.1, h, h + 0.14, 'rgba(110,130,140,0.55)');
      P.number('8', 0.442 * W, 2.2 * k, 0.13);
      P.rect(0.43 * W, 0.462 * W, 0.6, 0.9, '#8d9196');                            // Briefkasten
      lamp(P, 0.255 * W, 1.95 * k);
      win(P, 0.546 * W, 0.595 * W, 1.22 * k, 2.1 * k, { frame: fr, grille: '#2b2b2b' });
      win(P, 0.627 * W, 0.677 * W, 1.22 * k, 2.1 * k, { frame: fr, grille: '#2b2b2b' });
      win(P, 0.77 * W, 0.913 * W, 0.8 * k, 2.08 * k, { frame: fr, curtain: true });
      pipe(P, 0.5 * W, '#7a6a5a'); soffit(P);
    },
  }),

  'Schulstraße 9': H({
    name: 'Schulstraße 9', tint: '#f1f1ee',
    draw(P) {
      const { W } = P, k = P.eave / 5.7;
      P.plaster('#f1f1ee'); P.plinthBand('#b0b2b3', 0.3);
      win(P, 0.183 * W, 0.444 * W, 3.75 * k, 4.97 * k, { curtain: true });
      win(P, 0.643 * W, 0.84 * W, 3.75 * k, 4.95 * k, { roller: 1, rcol: '#7b5232' });
      win(P, 0.244 * W, 0.438 * W, 1.0 * k, 2.2 * k, { curtain: true });
      win(P, 0.652 * W, 0.86 * W, 1.0 * k, 2.2 * k, { curtain: true });
      pipe(P, 0.96 * W, '#6e5444'); soffit(P);
    },
  }),

  'id:DENW46AL1000UvAT': H({
    // westlich vor Nr. 9 der Balkonvorbau (eigenes LoD2-Bauteil): Balkon mit Markise und Eisengeländer (Schlaufen)
    name: 'Schulstraße 9 (Balkon)',
    draw(P) {
      const { W } = P, k = P.eave / 5.7, s0 = 3.05 * k, iron = '#2a2b2e';
      P.plaster('#efefec'); P.plinthBand('#b0b2b3', 0.3);
      win(P, 0.35 * W, 0.97 * W, s0 + 0.1, 5.1 * k, { frame: '#6b4a33', curtain: true });
      P.rect(0.3 * W, W, 5.25 * k, 5.55 * k, '#e9e3cf');                           // Markise
      for (let x = 0.3 * W; x < W; x += 0.25) P.board(x, x + 0.25, 5.15 * k, 5.32 * k, { ellipse: true, bg: '#e9e3cf' });
      P.rect(0, W, s0 - 0.25, s0, 'rgba(0,0,0,0.15)');
      P.rect(0, W, s0, s0 + 0.18, '#5f6266');
      P.rect(0, W, s0 + 1.0, s0 + 1.05, iron);
      for (let x = 0.05; x < W - 0.1; x += 0.22) P.board(x, x + 0.18, s0 + 0.25, s0 + 0.95, { ellipse: true, bg: 'rgba(0,0,0,0)', border: iron, borderW: 0.02 });
      P.rect(0, W, s0 + 0.2, s0 + 1.0, 'rgba(210,205,190,0.35)');
      win(P, 0.55 * W, 0.95 * W, 0.6, 2.2, { frame: '#6b4a33' });
      green(P, 0, 0.6 * W, 0, 2.6);
    },
  }),

  'Schulstraße 10': H({
    // Alte Villa mit Bruchsteinsockel, Gesimsband, Sprossenfenstern und dunklen Klappläden oben
    name: 'Schulstraße 10', wall: 'house', tint: '#ddd7cc',
    draw(P) {
      const { W } = P, k = P.eave / 8.7, sh = '#4a3a2e';
      P.plaster('#ddd7cc'); P.stone(0, W, -P.plinth, 1.2 * k, [150, 128, 100]);
      for (const [a, b] of [[0.096, 0.313], [0.436, 0.617], [0.74, 0.92]]) win(P, a * W, b * W, 2.15 * k, 4.4 * k, { mull: 1, transom: 0.7, bars: [4, 1] });
      P.rect(0, W, 4.85 * k - 0.12, 4.85 * k, 'rgba(0,0,0,0.12)');
      P.rect(0, W, 4.85 * k, 5.1 * k, '#cdc6b8');
      for (const [a, b] of [[0.185, 0.313], [0.483, 0.606], [0.762, 0.868]]) win(P, a * W, b * W, 5.86 * k, 7.77 * k, { mull: 1, bars: [2, 3], shut: sh, shutW: 0.55 });
      pipe(P, W - 0.08, '#c9c4ba'); soffit(P);
    },
    more: [{
      name: 'Schulstraße 10 (Vorbau)', full: true, near: [-68.05, 148.75],
      draw(P) {
        const { W, top } = P, k = Math.min(P.eave, 9.6) / 8.7, sh = '#4a3a2e';
        P.plaster('#ddd7cc'); P.stone(0, W, -P.plinth, 1.2 * k, [150, 128, 100]);
        win(P, 0.36 * W, 0.64 * W, 2.15 * k, 4.4 * k, { mull: 1, transom: 0.7, bars: [4, 1] });
        P.rect(0, W, 4.85 * k, 5.1 * k, '#cdc6b8');
        win(P, 0.4 * W, 0.6 * W, 5.86 * k, 7.77 * k, { mull: 1, bars: [2, 3], shut: sh, shutW: 0.55 });
        if (top > P.eave + 0.5) {
          P.slate(0, W, P.eave, top);
          win(P, 0.45 * W, 0.55 * W, P.eave + 0.4, Math.min(P.eave + 1.3, P.roofAt(0.5 * W) - 0.5), { mull: 0 });
          verge(P, '#33373b', 0.18);
        } else soffit(P);
      },
    }],
  }),

  'Schulstraße 13': H({
    // Bild „11“: Giebelhaus mit braunem Holzbalkon und grünen Fenstern
    name: 'Schulstraße 13', tint: '#f3f3f0',
    draw(P) {
      const { W } = P, fr = '#2f5d45', s0 = Math.min(2.85, P.eave - 2.0), wood = '#5a3a2a';
      P.plaster('#f3f3f0'); P.plinthBand('#b5b3ad', 0.25);
      win(P, 0.322 * W, 0.444 * W, 0.9, 1.95, { frame: fr, bars: [2, 2] });
      win(P, 0.731 * W, 0.846 * W, 0.9, 1.95, { frame: fr, bars: [2, 2] });
      for (const [a, b] of [[0.302, 0.44], [0.577, 0.708]]) win(P, a * W, b * W, s0 + 0.12, s0 + 1.95, { frame: fr, transom: 0.45, bars: [2, 1] });
      P.rect(0.158 * W, 0.764 * W, s0 - 0.25, s0, 'rgba(0,0,0,0.15)');
      P.rect(0.158 * W, 0.764 * W, s0, s0 + 0.12, '#f1f1ee');
      for (let x = 0.158 * W; x < 0.764 * W - 0.05; x += 0.13) P.rect(x, x + 0.09, s0 + 0.12, s0 + 1.05, wood);
      P.rect(0.158 * W, 0.764 * W, s0 + 1.0, s0 + 1.1, wood);
      verge(P, '#3a2f2a', 0.24, 1.2);
    },
  }),

  'Schulstraße 14': H({
    // Flachdachvorbau aus Beton: Eingang, dahinter das Haus mit Schieferwand; die zwei Garagen davor siehe UqZC
    name: 'Schulstraße 14', tint: '#e2e0d9', wall: 'slate',
    draw(P) {
      const { W, top } = P, f0 = 2.45, f1 = 3.05;
      P.plaster('#e2e0d9', -P.plinth, f0);
      P.slate(0, W, f1, top); P.rect(0, W, f1, f1 + 0.08, '#c7c9cb');
      P.rect(0, W, f0, f1, '#d4d1c8'); P.rect(0, W, f0 - 0.05, f0, 'rgba(0,0,0,0.28)');
      P.door(0.05 * W, 0.25 * W, 0, 2.3, { frame: '#f4f4f2', glass: true });
      P.door(0.3 * W, 0.62 * W, 0, 2.3, { frame: '#f4f4f2', panel: '#f1f1ef' });
      P.glass(0.33 * W, 0.59 * W, 1.35, 2.15);
      for (const h of [0.55, 0.8]) P.rect(0.33 * W, 0.59 * W, h, h + 0.08, '#3a3d42');
      P.number('14', 0.78 * W, 2.0, 0.15);
    },
  }),

  'id:DENW46AL1000UqZC': H({
    // die beiden Garagen von Nr. 14 (eigenes Gebäude vor dem Haus): Betonblende, blaugraue Tore, dahinter Schiefer
    name: 'Schulstraße 14 (Garagen)', wall: 'slate',
    draw(P) {
      const { W, top } = P, f1 = Math.min(3.05, top), f0 = Math.min(2.45, f1 - 0.4), m = W / 7;
      P.plaster('#e2e0d9', -P.plinth, f0);
      P.slate(0, W, f1, top); P.rect(0, W, f1, f1 + 0.08, '#c7c9cb');
      P.rect(0, W, f0, f1, '#d4d1c8'); P.rect(0, W, f0 - 0.05, f0, 'rgba(0,0,0,0.28)');
      for (const a of [0.3, 3.85]) { garageDoor(P, a * m, (a + 2.85) * m, Math.min(2.15, f0 - 0.1)); P.rect((a + 1.3) * m, (a + 1.55) * m, 1.2, 1.32, '#e8c43a'); }
    },
  }),

  'Schulstraße 15': H({
    name: 'Schulstraße 15', tint: '#f4f4f1',
    draw(P) {
      const { W } = P, k = P.eave / 2.33, iron = '#26272a';
      P.plaster('#f4f4f1'); P.rect(0, W, -P.plinth, 0.32, '#5d6066');
      win(P, 0.627 * W, 0.804 * W, 0.87 * k, 2.17 * k, { frame: '#3a2a22', curtain: true });
      for (const [x, h] of [[0.6, 0.9], [0.83, 0.9], [0.6, 1.9], [0.83, 1.9]]) P.board(x * W - 0.15, x * W + 0.15, h * k, h * k + 0.4, { ellipse: true, bg: 'rgba(0,0,0,0)', border: iron, borderW: 0.025 });
      for (let x = 0.64 * W; x < 0.8 * W; x += 0.14) P.rect(x, x + 0.02, 0.87 * k, 2.17 * k, iron);
      pipe(P, 0.012 * W, '#e6e6e4'); soffit(P);
    },
    more: [{
      // höherer Ostteil mit Eingang unter dem Dach (dunkler Pfosten) und zwei Fenstern mit Rollläden
      name: 'Schulstraße 15 (Eingang)', full: true, near: [-88.7, 113.75],
      draw(P) {
        const { W, top } = P;
        P.plaster('#f4f4f1'); P.rect(0, W, -P.plinth, 0.45, '#5d6066');
        P.rect(0, 0.2 * W, -P.plinth, 2.45, 'rgba(0,0,0,0.1)');
        P.steps(0, 0.21 * W, -P.plinth, 0.45, 3, '#9a9894');
        P.door(0.02 * W, 0.19 * W, 0.45, 2.35, { frame: '#f4f4f2', glass: true });
        P.rect(0.2 * W, 0.22 * W, -P.plinth, top, '#3b2c25');
        P.number('15', 0.17 * W, 2.5, 0.13);
        for (const [a, b] of [[0.237, 0.45], [0.632, 0.844]]) win(P, a * W, b * W, 1.25, 2.45, { frame: '#2f2f2f', roller: 0.72, rcol: '#e3e1dd' });
        P.rect(0.68 * W, 0.85 * W, 0.05, 0.3, '#3a3a3a');
        pipe(P, 0.94 * W, '#e6e6e4'); soffit(P);
      },
    }],
  }),

  'id:DENW46AL1000Uqo4': H({
    name: 'Schulstraße, Haus hinter der Einfahrt', raise: 2.6,
    draw(P) {
      const { W } = P, E = P.eave, fr = '#4b4e52';
      P.plaster('#f4f4f2'); P.plinthBand('#9c9ea0', 0.3);
      P.door(0.1 * W, 0.19 * W, 0, 2.15, { frame: fr, panel: '#8e9296' });
      P.door(0.24 * W, 0.33 * W, 0, 2.15, { frame: fr, panel: '#8e9296' });
      lamp(P, 0.215 * W, 2.35);
      win(P, 0.6 * W, 0.78 * W, 0.95, 2.15, { frame: fr });
      win(P, 0.2 * W, 0.33 * W, E - 1.85, E - 0.55, { frame: fr });
      win(P, 0.6 * W, 0.73 * W, E - 1.85, E - 0.55, { frame: fr });
      soffit(P);
    },
  }),

  'Schulstraße 17': H({
    // rechte Hälfte des Doppelhauses (Bild „19a“): helle Klappläden mit dunklem Rand, Gesimsband
    name: 'Schulstraße 17', tint: '#f5f4f0',
    draw(P) {
      const { W } = P, k = P.eave / 6.1, o = { shut: '#cfc6ad', shutEdge: '#3e4a44', shutW: 0.5, bars: [2, 3], surround: '#e3dccb' };
      P.plaster('#f5f4f0'); P.plinthBand('#a9a7a1', 0.3);
      P.rect(0, W, 4.0 * k, 4.15 * k, '#d8d2c3');
      win(P, 0.18 * W, 0.3 * W, 4.2 * k, 5.4 * k, o);
      win(P, 0.56 * W, 0.68 * W, 4.2 * k, 5.4 * k, o);
      win(P, 0.2 * W, 0.32 * W, 1.3 * k, 2.53 * k, o);
      win(P, 0.58 * W, 0.7 * W, 1.3 * k, 2.53 * k, o);
      soffit(P);
    },
  }),

  'Schulstraße 19': H({
    // linke Hälfte des Doppelhauses (Bild „19a“): dunkelgrüne Klappläden, oben das Zwerchhaus mit Schiefer
    name: 'Schulstraße 19', tint: '#f4f3ef',
    draw(P) {
      const { W, top } = P, k = 1.04, e1 = Math.min(6.53, top - 1.4), sh = '#2f4a3f';
      P.plaster('#f4f3ef'); P.plinthBand('#a9a7a1', 0.3);
      P.rect(0, W, 4.2 * k, 4.37 * k, '#cfc9bc');
      for (const [a, b] of [[0.265, 0.423], [0.693, 0.837]]) win(P, a * W, b * W, 4.42, 5.86, { bars: [2, 3], shut: sh, shutW: 0.55 });
      for (const [a, b] of [[0.248, 0.414], [0.7, 0.856]]) win(P, a * W, b * W, 1.52, 2.65, { bars: [2, 2], shut: sh, shutW: 0.55, curtain: 'rgba(240,226,214,0.45)' });
      P.number('19', 0.034 * W + 0.15, 2.15, 0.14);
      green(P, 0.72 * W, W, 1.6, 3.9);
      P.rect(0, W, e1 - 0.14, e1, '#2c3035');
      P.slate(0, W, e1, top);
      win(P, 0.23 * W, 0.35 * W, e1 + 0.35, Math.min(top - 0.3, e1 + 1.3), { box: '#dcdcd8' });
      win(P, 0.66 * W, 0.78 * W, e1 + 0.35, Math.min(top - 0.3, e1 + 1.3), {});
      pipe(P, 0.015 * W, '#6b4b3a', e1);
    },
  }),

  'id:DENW46AL1000Uq9E': H({
    // Bild „19“: niedriger Anbau mit Sprossenfenster, grünen Klappläden, Sonne aus Metall und offenem Eingang
    name: 'Schulstraße 19 (Anbau)', tint: '#f3efe2',
    draw(P) {
      const { W } = P, k = P.eave / 2.6;
      P.plaster('#f3efe2'); P.plinthBand('#bdb8aa', 0.25);
      win(P, 0.146 * W, 0.432 * W, 0.62 * k, 2.0 * k, { mull: 1, bars: [4, 3], shut: '#2f4a3f', shutW: 0.55, curtain: 'rgba(245,245,245,0.35)' });
      const sx = 0.72 * W, sh = 1.25 * k;
      for (let a = 0; a < 360; a += 20) {
        const s = Math.sin(a * Math.PI / 180), c = Math.cos(a * Math.PI / 180);
        P.rect(sx + s * 0.2 - 0.012, sx + s * 0.2 + 0.012 + s * 0.12, sh + c * 0.2 - 0.012, sh + c * 0.2 + 0.012 + c * 0.12, '#b88a4a');
      }
      P.board(sx - 0.17, sx + 0.17, sh - 0.17, sh + 0.17, { ellipse: true, bg: '#c9964f' });
      P.rect(0.806 * W, 0.93 * W, 0, 2.35, '#3d3935');
      P.door(0.84 * W, 0.92 * W, 0, 2.1, { frame: '#f2f2f0', panel: '#e9e9e6' });
      pipe(P, 0.006 * W, '#c4c4c2'); soffit(P);
    },
  }),

  'Schulstraße 21': H({
    // Friseur im Erdgeschoss mit bordeauxroten Markisen, Schieferband unter dem Giebel, Konsolen am Ortgang
    name: 'Coiffeur Schulstraße 21', tint: '#f4f4f2',
    draw(P) {
      const { W } = P, E = P.eave, k = E / 6.4, red = '#a3243c';
      P.plaster('#f4f4f2'); P.plinthBand('#b8b6b0', 0.3);
      for (const [a, b] of [[0.292, 0.466], [0.665, 0.846]]) {
        P.window(a * W, b * W, 0.48 * k, 2.15 * k, { frame: '#2b2b2b', t: 0.06, interior: 'poster' });
        P.rect((a + 0.03) * W, (b - 0.03) * W, 0.75 * k, 1.9 * k, 'rgba(225,215,205,0.55)');
        P.rect((a - 0.04) * W, (b + 0.04) * W, 2.62 * k, 2.95 * k, '#b8445a');      // Markise: Tuch, darunter der Volant
        P.rect((a - 0.04) * W, (b + 0.04) * W, 2.22 * k, 2.62 * k, red);
        P.text('COIFFEUR', (a + b) / 2 * W, 2.42 * k, 0.12, { color: '#f3e6e8', font: SERIF, spacing: 0.02, maxW: (b - a) * W });
      }
      P.rect(0.49 * W, 0.63 * W, 0, 0.6, '#d4d5d3');                               // Klimagerät
      P.number('21', 0.965 * W, 2.05 * k, 0.12);
      P.rect(0, W, 3.1 * k, 3.13 * k, '#cfcfcc');
      win(P, 0.265 * W, 0.408 * W, 4.1 * k, 5.65 * k, { frame: '#2e2e2e', roller: 1, rcol: '#e2e2df' });
      win(P, 0.612 * W, 0.777 * W, 4.1 * k, 5.65 * k, { frame: '#2e2e2e', roller: 0.35, rcol: '#e2e2df' });
      P.slate(0, W, E - 0.75, E); P.rect(0, W, E - 0.8, E - 0.72, '#2c3035');
      for (const [a, b] of [[0.3, 0.4], [0.62, 0.72]]) {
        const h1 = Math.min(E + 1.05, P.roofAt((a + b) / 2 * W) - 0.6);
        if (h1 > E + 0.6) win(P, a * W, b * W, E + 0.12, h1, { frame: '#2e2e2e', sill: '#3a3a3a' });
      }
      verge(P, '#3a3f46', 0.3, 0.55);
      pipe(P, 0.01 * W, '#e2e2e0', E - 0.75);
    },
  }),

  'Schulstraße 22': H({
    // Natursteinsockel, weißes Erdgeschoss, Obergeschoss und Giebel mit Schiefer
    name: 'Schulstraße 22', wall: 'slate', tint: '#ffffff',
    draw(P) {
      const { W, top } = P, s = 3.9;
      P.stone(0, W, -P.plinth, 1.0, [140, 128, 112]);
      P.plaster('#f5f5f3', 1.0, s);
      P.slate(0, W, s, top); P.rect(0, W, s - 0.05, s + 0.05, '#2c3035');
      for (const [a, b] of [[0.193, 0.368], [0.632, 0.798]]) {
        win(P, a * W, b * W, 1.8, 3.2, { frame: '#3a3a3a', roller: 0.78, rcol: '#a77d55' });
        P.rect((a + 0.02) * W, (b - 0.06) * W, 0.15, 0.45, '#2a2a2a');
      }
      win(P, 0.64 * W, 0.8 * W, 5.0, 6.35, { curtain: true, surround: '#2c3035' });
      const g1 = Math.min(P.eave + 2.0, P.roofAt(0.5 * W) - 0.6);
      if (g1 > P.eave + 1.2) win(P, 0.44 * W, 0.56 * W, P.eave + 0.6, g1, { curtain: true });
      verge(P, '#2a2d31', 0.2);
      pipe(P, 0.99 * W, '#6e5444');
    },
  }),

  'Schulstraße 23': H({
    // Klinkerstreifen mit Glasbausteinen am Treppenhaus, dunkle Fensterrahmen, anthrazitfarbener Sockel
    name: 'Schulstraße 23', tint: '#f4f4f2',
    draw(P) {
      const { W } = P, E = P.eave, k = E / 5.9, fr = '#3c3f44';
      P.plaster('#f4f4f2'); P.rect(0, W, -P.plinth, 0.5 * k, '#4d5157');
      brick(P, 0, 0.14 * W, 0.5 * k, E, [196, 140, 96]);
      P.rect(0.05 * W, 0.135 * W, 3.3 * k, 5.2 * k, '#cfd6d8');
      for (let x = 0.05 * W; x < 0.135 * W; x += 0.2) P.rect(x, x + 0.02, 3.3 * k, 5.2 * k, '#9fa6a8');
      for (let h = 3.3 * k; h < 5.2 * k; h += 0.2) P.rect(0.05 * W, 0.135 * W, h, h + 0.02, '#9fa6a8');
      win(P, 0.04 * W, 0.137 * W, 0.55 * k, 2.75 * k, { frame: fr, roller: 1, rcol: '#d8d8d6' });
      win(P, 0.266 * W, 0.527 * W, 4.45 * k, 5.85 * k, { frame: fr, mull: 2, box: true });
      win(P, 0.756 * W, 0.928 * W, 4.45 * k, 5.85 * k, { frame: fr, roller: 1, rcol: '#cfcfcd' });
      win(P, 0.267 * W, 0.537 * W, 1.45 * k, 3.05 * k, { frame: fr, mull: 2, sill: '#9a4a34' });
      win(P, 0.784 * W, 0.965 * W, 1.45 * k, 3.05 * k, { frame: '#4a3328', curtain: true, sill: '#9a4a34' });
      pipe(P, 0.995 * W, '#e6e6e4'); soffit(P);
    },
  }),

  'Schulstraße 24': H({
    name: 'Schulstraße 24', tint: '#f5f4f0',
    draw(P) {
      const { W } = P, k = P.eave / 5.9, gw = '#d9cdb6';
      P.plaster('#f5f4f0'); P.plinthBand('#b8b6b0', 0.25);
      win(P, 0.207 * W, 0.41 * W, 4.3 * k, 5.4 * k, { curtain: true });
      win(P, 0.628 * W, 0.84 * W, 4.3 * k, 5.4 * k, { curtain: true });
      win(P, 0.876 * W, 0.96 * W, 4.3 * k, 5.4 * k, { curtain: true });
      win(P, 0.2 * W, 0.41 * W, 1.39 * k, 2.67 * k, { roller: 1, rcol: gw });
      P.steps(0.72 * W, 0.92 * W, -P.plinth, 0.6 * k, 3, '#b0623e');
      P.door(0.623 * W, 0.805 * W, 0.6 * k, 2.64 * k, { frame: '#f4f4f2', panel: '#f2f2ef' });
      for (let i = 0; i < 2; i++) P.glass(0.64 * W + i * 0.17, 0.64 * W + i * 0.17 + 0.09, 0.8 * k, 2.45 * k);
      P.number('24', 0.765 * W, 2.25 * k, 0.12);
      win(P, 0.88 * W, 0.965 * W, 1.6 * k, 2.67 * k, { roller: 1, rcol: gw });
      lamp(P, 0.593 * W, 2.4 * k);
      pipe(P, 0.008 * W, '#e6e6e4'); soffit(P);
    },
    more: [{
      name: 'Schulstraße 24 (Westteil)', full: true, near: [-219.35, 108.35],
      draw(P) {
        const { W } = P, k = P.eave / 6.0;
        P.plaster('#f5f4f0'); P.plinthBand('#b8b6b0', 0.25);
        win(P, 0.323 * W, 0.694 * W, 4.44 * k, 5.8 * k, { curtain: true });
        win(P, 0.334 * W, 0.723 * W, 1.39 * k, 2.6 * k, { roller: 1, rcol: '#d9cdb6' });
        lamp(P, 0.214 * W, 2.2 * k);
        P.rect(0.05 * W, 0.12 * W, 1.6 * k, 2.0 * k, '#cfcfcc');
        pipe(P, 0.957 * W, '#e6e6e4'); soffit(P);
      },
    }],
  }),

  'id:DENW46AL1000UvCb': H({
    name: 'Schulstraße 25',
    draw(P) {
      rowHouse(P, '25', { up: [0.287, 0.763], recess: 1.96, wins: [[0.21, 0.33, 0.8, 1.6], [0.386, 0.736, 0.55, 1.6]], door: [0.03, 0.11], nr: 0.17 });
      roller(P, 0.21 * P.W, 0.33 * P.W, 0.8, 1.6, 1, '#d5d4d0');
    },
  }),
  'id:DENW46AL1000UvDI': H({
    name: 'Schulstraße 27',
    draw(P) { rowHouse(P, '27', { up: [0.284, 0.741], recess: 2.2, wins: [[0.319, 0.434, 1.3, 1.95], [0.512, 0.862, 0.85, 1.9]], nr: 0.28, brick: [0.27, 0.63] }); },
  }),
  'id:DENW46AL1000Uv5V': H({
    name: 'Schulstraße 29',
    draw(P) {
      rowHouse(P, '29', { up: [0.29, 0.727], recess: 2.3, wins: [[0.206, 0.555, 1.45, 2.0], [0.627, 0.743, 1.45, 2.0]], door: [0.81, 0.933], box: [0.03, 0.3], nr: 0.77 });
    },
  }),

  'Schulstraße 26': H({
    // weiß gestrichener Klinkergiebel auf Bruchsteinsockel, Fenster mit Bögen, Schild KNiPP (Rohbau, Umbau, Klinkerbau)
    name: 'Schulstraße 26', tint: '#f2f2ef',
    draw(P) {
      const { W } = P, k = P.eave / 4.3;
      brick(P, 0, W, 1.07 * k, P.top, [240, 240, 236], 'rgba(170,170,165,0.55)');
      P.stone(0, W, -P.plinth, 1.07 * k, [120, 104, 88]);
      const arch = (a, b, h1) => { for (let i = 0; i < 7; i++) P.rect(a * W - 0.08 + i * 0.012, b * W + 0.08 - i * 0.012, h1 + 0.02 + i * 0.03, h1 + 0.05 + i * 0.03, '#dcdcd6'); };
      for (const [a, b] of [[0.303, 0.41], [0.551, 0.66]]) {
        win(P, a * W, b * W, 2.0 * k, 3.15 * k, { frame: '#5a3e2c', curtain: true }); arch(a, b, 3.15 * k);
        win(P, a * W, b * W, 4.4 * k, 5.55 * k, { frame: '#5a3e2c', curtain: true }); arch(a, b, 5.55 * k);
        P.rect((a + 0.01) * W, (b - 0.01) * W, 0.12 * k, 0.72 * k, '#2c2c2c');
      }
      const gh = P.roofAt(0.48 * W);
      if (gh > 7.6 * k) win(P, 0.455 * W, 0.506 * W, 6.8 * k, 7.4 * k, { frame: '#5a3e2c' });
      P.board(0.047 * W, 0.142 * W, 1.6 * k, 2.05 * k, { bg: '#f4f4f2', border: '#b9b9b5', borderW: 0.01 });
      P.text('KNiPP', 0.0945 * W, 1.93 * k, 0.11, { color: '#1d1d1d', weight: '900', maxW: 0.085 * W });
      P.rect(0.055 * W, 0.134 * W, 1.78 * k, 1.84 * k, '#1d1d1d');
      P.text('ROHBAU • UMBAU', 0.0945 * W, 1.71 * k, 0.03, { color: '#1d1d1d', weight: '700', maxW: 0.085 * W });
      P.text('KLINKERBAU', 0.0945 * W, 1.65 * k, 0.03, { color: '#1d1d1d', weight: '700', maxW: 0.085 * W });
      lamp(P, -0.02 * W + 0.1, 2.2 * k);
      verge(P, '#3d4045', 0.22, 0.9);
    },
  }),

  'Schulstraße 28': H({
    name: 'Schulstraße 28', tint: '#f5f5f3',
    draw(P) {
      const { W } = P, k = P.eave / 6.0, br = '#a0704a';
      P.plaster('#f5f5f3'); P.rect(0, W, -P.plinth, 0.85 * k, '#c49a7c'); P.rect(0, W, 0.85 * k - 0.04, 0.85 * k, 'rgba(0,0,0,0.15)');
      win(P, 0.132 * W, 0.232 * W, 4.15 * k, 5.45 * k, { frame: br, roller: 1, rcol: '#c0703a' });
      win(P, 0.33 * W, 0.425 * W, 4.2 * k, 5.45 * k, { frame: br, curtain: true });
      win(P, 0.602 * W, 0.698 * W, 4.2 * k, 5.5 * k, { frame: br, curtain: true });
      win(P, 0.182 * W, 0.375 * W, 1.6 * k, 2.85 * k, { frame: br, roller: 1, rcol: '#b8683a' });
      brick(P, 0.573 * W, 0.75 * W, 0.85 * k, 3.2 * k, [130, 96, 78]);
      P.canopy(0.505 * W, 0.83 * W, 3.5 * k, 0.12, '#8e9296');
      P.door(0.607 * W, 0.709 * W, 0.85 * k, 2.95 * k, { frame: '#f4f4f2', panel: '#f2f2f0' });
      P.board(0.637 * W, 0.68 * W, 1.6 * k, 2.6 * k, { ellipse: true, bg: '#c4cdd2' });
      win(P, 0.784 * W, 0.84 * W, 2.15 * k, 2.9 * k, { frame: br });
      P.steps(0.555 * W, 0.8 * W, -P.plinth, 0.85 * k, 4, '#8f8a84');
      P.rect(0.255 * W, 0.335 * W, 0.15, 0.55, '#2c2c2c');
      soffit(P);
    },
  }),

  'Schulstraße 29a': H({
    // Bild „29“: Holztür mit Rautenmuster, Holzfenster, brauner Sockel
    name: 'Schulstraße 29a', tint: '#f3f1ec',
    draw(P) {
      const { W } = P, k = P.eave / 3.97, wood = '#b06a2c';
      P.plaster('#f3f1ec'); P.rect(0, W, -P.plinth, 0.3 * k, '#a8704a');
      win(P, 0.191 * W, 0.375 * W, 1.75 * k, 3.0 * k, { frame: wood, mull: 1, curtain: true });
      P.steps(0.513 * W, 0.71 * W, -P.plinth, 0.9 * k, 4, '#a8a6a2');
      P.door(0.556 * W, 0.667 * W, 0.9 * k, 3.0 * k, { frame: wood, panel: '#c27a38' });
      const dx = 0.62 * W, dh = 2.0 * k;
      for (let i = 0; i < 8; i++) P.rect(dx - 0.25 + i * 0.03, dx + 0.25 - i * 0.03, dh - 0.02 + i * 0.05, dh + 0.03 + i * 0.05, '#9c5a22');
      for (let i = 0; i < 8; i++) P.rect(dx - 0.25 + i * 0.03, dx + 0.25 - i * 0.03, dh - 0.03 - i * 0.05, dh + 0.02 - i * 0.05, '#9c5a22');
      P.glass(0.562 * W, 0.585 * W, 1.1 * k, 2.8 * k, { frosted: 1 });
      P.number('29a', 0.535 * W, 2.75 * k, 0.11);
      lamp(P, 0.69 * W, 2.75 * k);
      P.rect(0.68 * W, 0.7 * W, 2.0 * k, 2.4 * k, '#2c2e31');
      win(P, 0.727 * W, 0.785 * W, 1.75 * k, 2.95 * k, { frame: wood, frosted: 1, mull: 0 });
      pipe(P, 0.985 * W, '#7a5a42'); soffit(P);
    },
  }),

  'Schulstraße 30': H({
    // Mehrfamilienhaus: rechts drei Fensterachsen, Treppenhaus aus Klinker mit Haustür, links der zweite Flügel
    name: 'Schulstraße 30', wall: 'house', tint: '#efe9dc',
    draw(P) {
      const { W } = P, k = P.eave / 5.76, fr = '#4a2e22', iron = '#2a2b2e';
      P.plaster('#efe9dc'); P.rect(0, W, -P.plinth, 0.63 * k, '#6b4535');
      const up = [4.05 * k, 5.4 * k], lo = [1.5 * k, 2.8 * k];
      for (const [a, b] of [[2.4, 3.4], [5.55, 6.5], [9.99, 11.06], [12.39, 14.09], [15.64, 17.44]]) {
        win(P, a / 19.25 * W, b / 19.25 * W, up[0], up[1], { frame: fr, curtain: true });
        win(P, a / 19.25 * W, b / 19.25 * W, lo[0], lo[1], { frame: fr, curtain: true, roller: a < 7 ? 0.95 : 0, rcol: '#e6e2d8' });
      }
      const c0 = 15.64 / 19.25 * W, c1 = 17.44 / 19.25 * W;
      for (const h of [up[0], lo[0] - 0.55]) {
        P.rect(c0, c1, h + 0.5, h + 0.54, iron);
        for (let x = c0 + 0.08; x < c1; x += 0.11) P.rect(x, x + 0.015, h, h + 0.52, iron);
      }
      const t0 = 7.19 / 19.25 * W, t1 = 9.19 / 19.25 * W;
      brick(P, t0, t1, 0.63 * k, P.eave, [150, 70, 52]);
      P.door(t0 + 0.3, t1 - 0.3, 0.43 * k, 2.39 * k, { frame: '#f4f4f2', glass: true });
      win(P, t0 + 0.4, t1 - 0.4, 3.8 * k, 4.8 * k, { frame: '#f4f4f2', mull: 1 });
      P.rect(t0 - 0.12, t0 + 0.12, 1.2 * k, 1.6 * k, '#e2e2de');
      pipe(P, W - 0.1, '#9a9a96'); soffit(P);
    },
  }),

  'Schulstraße 31': H({
    // Schieferbehang, weiße Haustür mit Rundbogenglas unter einem Vordach aus Cortenstahl
    name: 'Schulstraße 31', wall: 'slate', tint: '#ffffff',
    draw(P) {
      const { W } = P, E = P.eave;
      P.slate(0, W, -P.plinth, E);
      P.rect(0, W, -P.plinth, 0.15, '#4a4c50');
      P.rect(0.025 * W, 0.16 * W, 0, 2.3, '#f2f2f0');
      P.door(0.048 * W, 0.14 * W, 0, 2.2, { frame: '#f4f4f2', panel: '#f3f3f1' });
      P.board(0.07 * W, 0.12 * W, 1.3, 1.95, { radius: 0.12, bg: '#3a4048' });
      P.canopy(-0.02 * W, 0.26 * W, 2.55, 0.1, '#8a4a2a');
      P.rect(0.065 * W, 0.115 * W, 2.27, 2.37, '#f4f4f2'); P.text('31', 0.09 * W, 2.32, 0.08, { color: '#2a2a2a', weight: '700' });
      win(P, 0.135 * W, 0.26 * W, 3.38, 4.75, { bars: [2, 2] });
      win(P, 0.474 * W, 0.58 * W, 3.38, 4.75, { bars: [2, 2] });
      win(P, 0.76 * W, 0.87 * W, 3.38, 4.75, { bars: [2, 2] });
      win(P, 0.537 * W, 0.8 * W, 0.85, 2.1, { bars: [4, 2], curtain: true });
      P.canopy(0.5 * W, 0.84 * W, 2.45, 0.08, '#3e4246');
      soffit(P);
    },
  }),

  'Schulstraße 33': H({
    // links dunkle Holzverschalung mit weißem Eingangsvorbau, rechts Schieferbehang mit Rautenband
    name: 'Schulstraße 33', wall: 'slate', tint: '#ffffff',
    draw(P) {
      const { W } = P, E = P.eave, wz = 0.379 * W;
      boards(P, 0, wz, -P.plinth, E);
      P.slate(wz, W, -P.plinth, E);
      for (let x = wz; x < W; x += 0.36) for (let h = 2.65; h < 3.3; h += 0.3) P.board(x, x + 0.34, h, h + 0.28, { ellipse: true, bg: 'rgba(120,124,130,0.35)' });
      P.rect(0, W, -P.plinth, 0.15, '#4a4c50');
      win(P, 0.169 * W, 0.265 * W, 3.4, 4.6, { bars: [2, 3] });
      win(P, 0.012 * W, 0.077 * W, 1.15, 1.85, {});
      P.rect(0.069 * W, 0.08 * W, 0, 2.5, '#f2f2f0'); P.rect(0.069 * W, 0.149 * W, 0, 2.5, 'rgba(255,255,255,0.0)');
      P.rect(0.138 * W, 0.149 * W, 0, 2.5, '#f2f2f0');
      P.canopy(0.069 * W, 0.294 * W, 2.6, 0.1, '#5a5e63');
      P.door(0.184 * W, 0.273 * W, 0, 2.2, { frame: '#f4f4f2', panel: '#f3f3f1' });
      P.board(0.205 * W, 0.252 * W, 1.3, 1.95, { radius: 0.12, bg: '#3a4048' });
      P.rect(0.095 * W, 0.142 * W, 1.45, 1.75, '#6a6e72');
      P.number('33', 0.29 * W, 2.25, 0.1);
      win(P, 0.504 * W, 0.615 * W, 3.38, 4.75, { bars: [2, 2] });
      win(P, 0.694 * W, 0.802 * W, 3.38, 4.75, { bars: [2, 2] });
      win(P, 0.516 * W, 0.732 * W, 0.85, 2.1, { bars: [4, 2], curtain: true });
      P.canopy(0.48 * W, 0.77 * W, 2.4, 0.08, '#3e4246');
      soffit(P);
    },
  }),

  'Schulstraße 33a': H({
    // Mehrfamilienhaus mit drei Giebeln: rechter Flügel (Hauptfront), Treppenhaus und linker Flügel (more)
    name: 'Schulstraße 33a (rechts)', tint: '#e6e6e4',
    draw(P) { wing(P); },
    more: [
      { name: 'Schulstraße 33a (Eingang)', full: true, near: [-257.45, 72.15], draw(P) { stair(P); } },
      { name: 'Schulstraße 33a (links)', full: true, near: [-260.45, 69.65], draw(P) { wing(P); } },
    ],
  }),

  'Schulstraße 35': H({
    // Klinkerhaus: vorn der eingeschossige Teil mit großem Fenster und Dachterrasse
    name: 'Schulstraße 35', wall: 'brick', tint: '#ffffff',
    draw(P) {
      const { W, top } = P, s = Math.min(2.6, P.eave - 0.3);
      brick(P, 0, W, -P.plinth, top, [178, 140, 110]);
      win(P, 0.12 * W, 0.66 * W, 0.45, 2.0, { mull: 2, frosted: 0.25, curtain: 'rgba(230,236,238,0.25)' });
      P.rect(0, W, s, s + 0.35, '#6f7377'); P.rect(0, W, s, s + 0.05, '#9a9ea2');
      P.rect(0, W, s - 0.2, s, 'rgba(0,0,0,0.15)');
    },
    more: [{
      name: 'Schulstraße 35 (Eingang)', full: true, near: [-278.15, 60.25],
      draw(P) {
        const { W, top } = P, s = 2.5, iron = '#2a2b2e';
        brick(P, 0, W, -P.plinth, top, [178, 140, 110]);
        win(P, 0.19 * W, 0.59 * W, 0.6, 2.0, { mull: 1, frosted: 0.25 });
        P.steps(0.72 * W, W, -P.plinth, 0.12, 1, '#7a7d80');
        P.door(0.77 * W, 0.99 * W, 0.12, 2.3, { frame: '#f4f4f2', glass: true, double: true });
        P.number('35', 0.72 * W, 2.0, 0.12);
        P.rect(0, W, s, s + 0.3, '#6f7377');
        if (top > s + 2.4) {
          win(P, 0.31 * W, 0.69 * W, s + 0.45, Math.min(top - 0.4, s + 2.35), { mull: 1, box: true });
          P.rect(0, W, s + 1.25, s + 1.3, iron);
          for (let x = 0.05; x < W; x += 0.13) P.rect(x, x + 0.02, s + 0.3, s + 1.28, iron);
        }
      },
    }],
  }),

  'Schulstraße 39': H({
    // Mehrfamilienhaus mit Plattenverkleidung (helle und graue Bänder), weiß gefliester Eingang unter einem Glasdach
    name: 'Schulstraße 39', tint: '#d8d2c2',
    draw(P) {
      const { W } = P, E = P.eave, k = E / 6.8;
      for (let h = -P.plinth, r = 0; h < E; h += 0.75, r++) {
        for (let x = 0, c = 0; x < W; x += 0.85, c++) {
          const j = (P.rnd() - 0.5) * 8, base = r % 3 === 1 ? [170, 162, 158] : [216, 210, 194];
          P.rect(x, Math.min(W, x + 0.85), h, Math.min(E, h + 0.75), `rgb(${base[0] + j | 0},${base[1] + j | 0},${base[2] + j | 0})`);
          P.rect(x, x + 0.015, h, Math.min(E, h + 0.75), 'rgba(0,0,0,0.18)');
        }
        P.rect(0, W, h, h + 0.015, 'rgba(0,0,0,0.18)');
      }
      for (const [a, b, big] of [[0.369, 0.408], [0.494, 0.53], [0.573, 0.657, 1], [0.73, 0.787], [0.857, 0.935, 1]]) {
        win(P, a * W, b * W, big ? 1.27 * k : 1.97 * k, 2.85 * k, { curtain: true });
        win(P, a * W, b * W, big ? 4.64 * k : 5.6 * k, 6.35 * k, { curtain: true });
      }
      win(P, 0.179 * W, 0.226 * W, 5.6 * k, 6.35 * k, {});
      const e0 = 0.038 * W, e1 = 0.244 * W, eh = 2.9 * k;                           // gefliester Eingang, Glasdach
      P.rect(e0, e1, -P.plinth, eh, '#f1f1ef');
      for (let x = e0; x < e1; x += 0.2) P.rect(x, x + 0.012, 0, eh, 'rgba(150,150,150,0.4)');
      for (let h = 0; h < eh; h += 0.2) P.rect(e0, e1, h, h + 0.012, 'rgba(150,150,150,0.4)');
      P.door(0.146 * W, 0.224 * W, 0, 2.45 * k, { frame: '#f4f4f2', glass: true });
      const g0 = -0.01 * W, g1 = 0.29 * W, gm = (g0 + g1) / 2, gp = 5.0 * k;
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, x = g0 + (gm - g0) * t, h = eh + (gp - eh) * t, x2 = g1 - (g1 - gm) * t;
        P.rect(x - 0.04, x + 0.04, h - 0.04, h + 0.04, '#e9ebec'); P.rect(x2 - 0.04, x2 + 0.04, h - 0.04, h + 0.04, '#e9ebec');
        P.rect(x + 0.04, x2 - 0.04, h - 0.03, h, 'rgba(210,225,232,0.25)');
      }
      P.number('39', 0.27 * W, 2.3 * k, 0.16);
      pipe(P, W - 0.08, '#4a4c50'); soffit(P, E, 0.5);
    },
  }),
};

/** Seitenflügel von Nr. 33a: Fenster mit Holzrahmen in grauen Faschen, Balkone mit Glasbrüstung, Schiefer im Giebel. */
function wing(P) {
  const { W, top } = P, wood = '#c07a2a', sur = '#6b6e72', iron = '#3a3c40';
  P.plaster('#e6e6e4'); P.plinthBand('#9a9c9e', 0.25);
  const rows = [[0.9, 2.35], [3.3, 4.85], [6.1, 7.5]];
  rows.forEach(([h0, h1], i) => {
    const r = P.roofAt(0.5 * W);
    if (h1 > r - 0.4) return;
    win(P, 0.12 * W, 0.88 * W, h0, h1, { frame: wood, mull: 2, surround: sur, curtain: 'rgba(240,236,228,0.35)' });
    if (i < 2) {                                                                  // Balkon darunter (Platte + Glasbrüstung)
      const s = i === 0 ? 0.0 : 2.75;
      if (i === 1) { P.rect(0, W, s - 0.22, s, 'rgba(0,0,0,0.18)'); P.rect(0, W, s, s + 0.25, '#d6d6d3'); }
      P.rect(0.02 * W, 0.98 * W, s + 0.25, s + 1.2, 'rgba(150,160,165,0.55)');
      P.rect(0.02 * W, 0.98 * W, s + 1.15, s + 1.22, iron);
      for (let x = 0.02 * W; x < 0.98 * W; x += 0.6) P.rect(x, x + 0.04, s + 0.25, s + 1.2, iron);
    }
  });
  if (top > 7.8) { P.slate(0, W, 7.9, top); verge(P, '#3e3226', 0.25); }
}

/** Treppenhaus von Nr. 33a: Holztür mit Glasfeldern unter einem Glasvordach, darüber zwei Fenster, kleines Walmdach. */
function stair(P) {
  const { W, top } = P, wood = '#c07a2a', sur = '#6b6e72';
  P.plaster('#e6e6e4'); P.plinthBand('#9a9c9e', 0.25);
  P.door(0.18 * W, 0.82 * W, 0, 2.5, { frame: wood, glass: true, double: true, t: 0.1 });
  for (const h of [0.9, 1.7]) P.rect(0.18 * W, 0.82 * W, h, h + 0.06, wood);
  P.rect(0.05 * W, 0.95 * W, 2.7, 2.8, '#c5ccd0'); P.rect(0.05 * W, 0.95 * W, 2.48, 2.7, 'rgba(0,0,0,0.12)');
  for (const x of [0.07, 0.93]) P.rect(x * W - 0.05, x * W + 0.05, 0, 2.75, '#5a3a24');
  for (const [h0, h1] of [[3.6, 4.85], [6.0, 7.25]]) if (h1 < top - 0.4) win(P, 0.25 * W, 0.75 * W, h0, h1, { frame: wood, mull: 1, surround: sur });
  if (top < 8.5) soffit(P);
}
