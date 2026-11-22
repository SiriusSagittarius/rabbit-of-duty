/**
 * Läden an der Hauptstraße in Much – Platzhalter-Fassaden, bis eigene Fotos da sind.
 *
 * Grundlage: Street-View-Screenshots, nur als Vorlage für Ladenfolge, Haustyp, Farben und Lage der
 * Schilder (nicht als Textur). Schilder sind einfache Schriftzüge in den Ladenfarben, keine nachgezeichneten Logos.
 *
 * Schlüssel: amtliche Adresse aus assets/nrw/much/buildings.json (ALKIS) oder 'id:<LoD2-Gebäude-ID>' für
 * Gebäudeteile ohne Hausnummer.
 *   wall  Fassadentyp der Obergeschosse und Seitenwände (Ebene aus WALL_LAYERS in nrw-level.js)
 *   tint  Farbton dieser Wände
 *   draw  zeichnet die Ladenfront zur Straße (Erdgeschoss + Schildband), Maße in Metern, siehe painter()
 *   face  optional: Himmelsrichtung der Front ('N', 'O', 'S', 'W'), wenn der Laden nicht zur Straße zeigt
 *   near  optional: [x, z] in Spielkoordinaten nahe der Front, wenn das Haus mehrere Wände zur Straße hat
 *   more  optional: weitere Fronten desselben Hauses, je { name, draw, face?, near? }
 *   full  optional: das Bild bedeckt die ganze Wand bis in den Giebel (P.full, P.eave, P.roofAt(x) beim Zeichnen)
 *   photo optional: eigenes, entzerrtes Foto der ganzen Wand (assets/nrw/much/fronts/<photo>.webp, gebaut mit
 *         tools/rectify_fronts.py). Ist es da, ersetzt es draw() und bedeckt die ganze Wand; fehlt es, bleibt draw().
 *   photos optional: weitere Fotos, die draw() mit P.photo(name, x0, x1, h0, h1) einsetzt (z. B. ein Ladenschild)
 *
 * nrw-level.js sucht je Laden die Wand, die zur Straße zeigt, setzt die Front auf das Straßenniveau davor,
 * richtet das Geschossraster des Hauses danach aus und packt alle Fronten in einen Texturatlas
 * (ein Mesh, ein Draw-Call). Eigene Fotos: siehe photo/photos oben – sie kommen in denselben Atlas.
 */

export const SHOP_PX = 64;        // Pixel pro Meter im Atlas
export const SHOP_TOP = 3.4;      // Höhe der Front über Straßenniveau: Erdgeschoss 2,9 m + Schildband
export const SHOP_PHOTO_DIR = './assets/nrw/much/fronts/';

const PHOTOS = new Map();         // Name → geladenes Foto

/** Alle Fotos laden, die Ladeneinträge nennen (photo, photos). Fehlt eine Datei, bleibt die gezeichnete Front. */
export async function loadShopPhotos() {
  const names = new Set();
  for (const s of Object.values(MUCH_SHOPS)) {
    for (const spec of [s, ...(s.more || [])]) {
      if (spec.photo) names.add(spec.photo);
      for (const n of spec.photos || []) names.add(n);
    }
  }
  await Promise.all([...names].filter(n => !PHOTOS.has(n)).map(async (n) => {
    const img = new Image();
    img.src = SHOP_PHOTO_DIR + n + '.webp';
    try { await img.decode(); PHOTOS.set(n, img); }
    catch { console.warn('Fassadenfoto fehlt:', n); }
  }));
}

/** Name des Wandfotos dieses Eintrags, wenn es geladen ist, sonst null. */
export const shopPhotoOf = (spec) => (spec.photo && PHOTOS.has(spec.photo) ? spec.photo : null);

const SANS = '"Segoe UI", Arial, Helvetica, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const SCRIPT = '"Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive';
const ROUND = '"Arial Rounded MT Bold", "Segoe UI", Arial, sans-serif';

export const MUCH_SHOPS = {
  // ---------- Nordseite (ungerade Hausnummern), von Osten nach Westen ----------
  'Hauptstraße 19': {
    name: 'Metzgerei Fedder', wall: 'fachwerk', tint: '#ffffff',
    draw(P) {
      const { W, top } = P, oH = Math.min(2.45, top - 0.85);
      P.stone(0, W, -P.plinth, oH + 0.3);                                     // Natursteinpfeiler und Sockel
      P.door(0.02 * W, 0.105 * W, 0.04, oH, { frame: '#2a211b', glass: true });
      P.window(0.12 * W, 0.3 * W, 0.42, oH, { frame: '#2a211b', t: 0.09, interior: 'shop' });
      P.window(0.36 * W, 0.62 * W, 0.42, oH, { frame: '#2a211b', t: 0.09, interior: 'counter' });
      P.window(0.62 * W, 0.92 * W, 0.42, oH, { frame: '#2a211b', t: 0.09, interior: 'counter' });
      P.slate(0, W, oH + 0.3, top - 0.08);                                    // Schiefer-Vordach über der ganzen Front
      P.rect(0, W, top - 0.08, top, '#2b2e33');
      const x0 = 0.03 * W, bw = Math.min(5.4, 0.45 * W), s0 = top - 0.6, s1 = top - 0.14;
      P.board(x0, x0 + bw * 0.36, s0, s1, { bg: '#1d1c1a' });
      P.text('FEDDER', x0 + bw * 0.18, (s0 + s1) / 2, 0.34, { color: '#e8441d', weight: '900', style: 'italic', stroke: '#f6c400', maxW: bw * 0.32 });
      P.board(x0 + bw * 0.36, x0 + bw, s0 + 0.08, s1 - 0.08, { bg: '#f6c400' });
      P.text('METZGEREI · CATERING-SERVICE', x0 + bw * 0.68, (s0 + s1) / 2, 0.17, { color: '#2d6a31', weight: '700', maxW: bw * 0.6 });
    },
  },
  'Hauptstraße 21': {
    name: 'Praxis Jan Grothaus', wall: 'fachwerk', tint: '#ffffff',
    draw(P) {
      const { W, top } = P, oH = Math.min(2.4, top - 0.8);
      P.plaster('#f5f5f3'); P.plinthBand('#b8bbbe', 0.25);
      P.board(0.03 * W, 0.15 * W, 1.0, 2.1, { bg: '#ffffff', border: '#cdd0d3' });       // Praxisschild
      P.rect(0.03 * W, 0.15 * W, 1.6, 1.64, '#9cc53d');
      P.text('Jan Grothaus', 0.09 * W, 1.84, 0.12, { color: '#3d4247', font: SERIF, maxW: 0.105 * W });
      P.text('Allgemeinmedizin', 0.09 * W, 1.45, 0.07, { color: '#5b6166', maxW: 0.105 * W });
      P.text('Hausärztliche Versorgung', 0.09 * W, 1.3, 0.05, { color: '#5b6166', maxW: 0.105 * W });
      P.door(0.2 * W, 0.36 * W, 0.12, oH + 0.2, { frame: '#f8f8f6', glass: true, transom: 0.45 });
      P.window(0.45 * W, 0.66 * W, 0.42, oH, { frame: '#f8f8f6', t: 0.07, frosted: 0.45, stripe: '#9cc53d', transom: 0.5 });
      P.window(0.74 * W, 0.95 * W, 0.42, oH, { frame: '#f8f8f6', t: 0.07, frosted: 0.45, stripe: '#9cc53d', transom: 0.5 });
    },
  },
  'id:DENW46AL1000Ur6i': {          // rechter Teil desselben Praxisgebäudes (ohne eigene Hausnummer)
    name: 'Praxis Jan Grothaus (rechter Teil)', wall: 'fachwerk', tint: '#ffffff',
    draw(P) {
      const { W, top } = P, oH = Math.min(2.4, top - 0.8);
      P.plaster('#f5f5f3'); P.plinthBand('#b8bbbe', 0.25);
      P.window(0.06 * W, 0.42 * W, 0.42, oH, { frame: '#f8f8f6', t: 0.07, frosted: 0.45, stripe: '#9cc53d', mullions: 1, transom: 0.5 });
      P.number('21', 0.52 * W, oH - 0.15, 0.22);
      P.window(0.6 * W, 0.8 * W, 0.42, oH, { frame: '#f8f8f6', t: 0.07, frosted: 0.45, stripe: '#9cc53d', transom: 0.5 });
      P.door(0.85 * W, 0.97 * W, 0.12, oH, { frame: '#f8f8f6', glass: true });
    },
  },
  'Hauptstraße 23': {
    name: 'Damen- und Herrenfriseur', wall: 'house2', tint: '#d6dadd',
    draw(P) {
      const { W, top } = P, oH = Math.min(2.4, top - 0.85);
      P.plaster('#cdd1d4'); P.plinthBand('#575b60', 0.55);
      P.slate(0, W, top - 0.68, top);                                        // Schieferband mit Buchstaben
      P.window(0.07 * W, 0.33 * W, 0.62, oH, { frame: '#eceeef', t: 0.07, outer: '#3c4045', interior: 'poster' });
      P.steps(0.38 * W, 0.6 * W, 0, 0.55, 3);
      P.door(0.42 * W, 0.56 * W, 0.55, oH + 0.1, { frame: '#eceeef', glass: true });
      P.number('23', 0.595 * W, 1.6, 0.2);
      P.window(0.63 * W, 0.89 * W, 0.62, oH, { frame: '#eceeef', t: 0.07, outer: '#3c4045', interior: 'poster' });
      for (const [s, f] of [['damen', 0.2], ['friseur', 0.5], ['herren', 0.8]]) {
        P.text(s, f * W, top - 0.34, 0.34, { color: '#f26b1d', weight: '700', font: ROUND, maxW: 0.26 * W, shadow: 'rgba(0,0,0,0.35)' });
      }
    },
  },
  'Hauptstraße 25': {
    name: 'Yoga & Pilates', wall: 'fachwerk', tint: '#ffffff', photo: 'hs25',     // Foto: Video des Users, 22.11.
    draw(P) {
      const { W, top } = P, oH = Math.min(2.35, top - 0.9);
      P.plaster('#f6f6f4'); P.plinthBand('#8e9297', 0.45);
      P.window(0.1 * W, 0.25 * W, 1.0, 2.05, { frame: '#e9ebed', t: 0.06, outer: '#9da3a9', interior: 'dark' });
      P.board(0.115 * W, 0.235 * W, 1.72, 1.94, { bg: '#1e9c99' });
      P.text('YOGA & PILATES', 0.175 * W, 1.83, 0.075, { color: '#ffffff', weight: '700', maxW: 0.11 * W });
      P.number('25', 0.3 * W, oH + 0.2, 0.18);
      P.steps(0.32 * W, 0.45 * W, 0, 0.35, 2);
      P.door(0.34 * W, 0.43 * W, 0.35, oH + 0.1, { frame: '#6e4426', wood: '#8a5a33' });
      P.window(0.5 * W, 0.87 * W, 0.75, oH - 0.05, { frame: '#e9ebed', t: 0.06, outer: '#9da3a9', interior: 'dark' });
      P.text('YOGA', 0.62 * W, 1.25, 0.3, { color: '#2bb5b1', weight: '800' });
      P.text('PILATES', 0.76 * W, 1.62, 0.2, { color: '#2bb5b1', weight: '700' });
      P.text('MEDITATION', 0.66 * W, 1.9, 0.12, { color: '#e8f4f4', weight: '700' });
      P.text('FIT · BALANCE · ENERGIE', 0.69 * W, 1.03, 0.08, { color: '#cfe9e8', maxW: 0.3 * W });
    },
    // Hinterer Westteil desselben Gebäudes (7 m zurück, davor Bildstock): dunkelblau verschieferter Giebel (nur mit Foto)
    more: [{ name: 'Hauptstraße 25 (Schiefergiebel)', near: [267.45, -53.6], photo: 'hs25w' }],
  },
  'Hauptstraße 27': {
    name: 'Michael Klement GmbH (duo)', wall: 'fachwerk', tint: '#fbf6ec', photo: 'hs27', // Foto: Video des Users, 22.11.
    draw(P) {
      const { W, top } = P, oH = Math.min(2.3, top - 0.95);
      P.plaster('#f2eee5');
      P.wood(0, W, -P.plinth, top - 0.7, '#1f2622');                         // dunkle Holzfront
      P.window(0.06 * W, 0.62 * W, 0.42, oH, { frame: '#1f2622', t: 0.08, interior: 'shop' });
      P.door(0.67 * W, 0.94 * W, 0.06, oH, { frame: '#1f2622', open: true });
      P.board(0.03 * W, 0.97 * W, top - 0.66, top - 0.08, { bg: '#fbfbf8', border: '#d6d2c9' });
      P.text('MICHAEL KLEMENT GMBH', 0.5 * W, top - 0.31, 0.22, { color: '#a83b2d', weight: '600', spacing: 0.02, maxW: 0.86 * W });
      P.text('SCHREIBEN · LESEN · SCHENKEN · LERNEN · SPIELEN', 0.5 * W, top - 0.53, 0.075, { color: '#a83b2d', maxW: 0.86 * W });
    },
  },
  'Hauptstraße 29': {
    name: 'Goldschmiede Peter Stapf', wall: 'slate', tint: '#ffffff', photos: ['hs29_eg'],
    draw(P) {
      if (P.photo('hs29_eg', 0, P.W, 0, P.top, P.plinth)) return;           // Erdgeschoss: Video des Users, 22.11.
      const { W, top } = P, oH = Math.min(2.45, top - 0.8);
      P.plaster('#e6e6e3'); P.plinthBand('#a6a9ac', 0.42);
      P.steps(0.01 * W, 0.16 * W, 0, 0.42, 3, '#b9b9b6');
      P.window(0.17 * W, 0.95 * W, 0.42, oH, { frame: '#596067', t: 0.06, mullions: 3, interior: 'gallery' });
      P.board(0.2 * W, 0.92 * W, top - 0.6, top - 0.12, { bg: '#f1f1ee', border: '#c8c8c3' });
      P.text('Peter Stapf', 0.42 * W, top - 0.36, 0.22, { color: '#474c52', font: SERIF, maxW: 0.38 * W });
      P.text('GOLDSCHMIEDE', 0.76 * W, top - 0.36, 0.12, { color: '#8c7a45', weight: '600', spacing: 0.04, maxW: 0.26 * W });
    },
  },
  'Hauptstraße 31': {
    // Laden im Westgiebel zum Platz vor der Tourist-Info; links davon stehen im Modell Garagen vor der Wand
    name: 'Strick & Chic', wall: 'house2', tint: '#f7f7f5', face: 'W',
    draw(P) {
      const { W, top } = P, oH = Math.min(2.45, top - 0.9), x0 = Math.max(0.3 * W, W - 4.5), x1 = W - 0.12;
      P.plaster('#f4f4f1');
      P.stone(0, x0 - 0.25, -P.plinth, 0.9, [178, 174, 162]);                // Bruchsteinsockel links
      P.window(x0 - 1.5, x0 - 0.95, 2.5, 3.0, { frame: '#f1f1ef', t: 0.05 });
      P.rect(x0, x1, -P.plinth, oH + 0.08, '#1c1b1a');                        // schwarze Ladenfront
      const dw = Math.min(1.2, (x1 - x0) * 0.28), dc = (x0 + x1) / 2;
      P.window(x0 + 0.07, dc - dw / 2 - 0.05, 0.1, oH, { frame: '#1c1b1a', t: 0.06, interior: 'shop' });
      P.door(dc - dw / 2, dc + dw / 2, 0.02, oH, { frame: '#1c1b1a', glass: true });
      P.window(dc + dw / 2 + 0.05, x1 - 0.07, 0.1, oH, { frame: '#1c1b1a', t: 0.06, interior: 'shop' });
      const s0 = oH + 0.12, s1 = top - 0.04, sc = (s0 + s1) / 2;
      P.board(x0 - 0.06, W - 0.02, s0, s1, { bg: '#f6f5f1', border: '#d6d3cc' });            // weißes Schildband
      P.board(dc - 1.05, dc + 1.05, sc - 0.3, sc + 0.3, { bg: '#f3e9d2', border: '#5c3a26', borderW: 0.04, ellipse: true });
      P.text('Strick & Chic', dc, sc, 0.22, { color: '#6d2b1d', font: SCRIPT, weight: '700', maxW: 1.7 });
    },
    more: [{
      name: 'Strick & Chic (Straßenseite)',
      draw(P) {                     // von links: Ecke zum Laden mit Auslegerschild, Schaufenster, Haustür
        const { top } = P, oH = Math.min(2.4, top - 0.9);
        P.plaster('#f4f4f1'); P.plinthBand('#9a9c9e', 0.3);
        P.board(0.1, 0.9, oH - 0.1, oH + 0.42, { bg: '#f3e9d2', border: '#5c3a26', borderW: 0.03, ellipse: true });
        P.text('Strick & Chic', 0.5, oH + 0.16, 0.11, { color: '#6d2b1d', font: SCRIPT, weight: '700', maxW: 0.66 });
        P.window(1.05, 2.55, 0.7, oH, { frame: '#2a2522', t: 0.07, interior: 'shop' });
        P.door(3.3, 4.2, 0.3, oH, { frame: '#2a2522', panel: '#3b3532' });
      },
    }],
  },
  'Hauptstraße 33': {
    name: 'Gemeinde Much · Tourist-Information', wall: 'house2', tint: '#e6dcc8',
    draw(P) {
      const { W, top } = P, oH = 2.5, b0 = 2.6;
      P.plaster('#e9e0cf');
      P.rect(0, W, 0.62, b0, '#2d2925');                                     // dunkle Schaufensterzone
      P.window(0.035 * W, 0.28 * W, 0.85, oH, { frame: '#3a342f', t: 0.06, mullions: 1, interior: 'poster' });
      P.window(0.3 * W, 0.535 * W, 0.85, oH, { frame: '#3a342f', t: 0.06, mullions: 1, interior: 'poster' });
      P.door(0.55 * W, 0.615 * W, 0.65, oH, { frame: '#3a342f', glass: true });
      P.rect(0.618 * W, 0.64 * W, 0.65, 2.25, '#f4f4f2');                    // weiße Infostele neben der Tür
      P.window(0.645 * W, 0.71 * W, 0.65, oH, { frame: '#3a342f', t: 0.06 });
      P.window(0.727 * W, 0.96 * W, 0.85, oH, { frame: '#3a342f', t: 0.06, interior: 'poster' });
      // Terrassenmauer aus Sandstein mit Treppe zur Tür und Pflanzkübeln
      P.stone(0, 0.535 * W, -P.plinth, 0.65, [196, 182, 150]);
      P.stone(0.735 * W, W, -P.plinth, 0.65, [196, 182, 150]);
      P.steps(0.535 * W, 0.735 * W, -P.plinth, 0.65, 4, '#a39d92');
      for (const xc of [0.47 * W, 0.8 * W]) {
        P.rect(xc - 0.4, xc + 0.4, 0.65, 0.95, '#8c7f6c');
        P.shrub(xc, 0.95, 0.8, 0.45);
      }
      // Schildband: „Gemeinde Much“ | Ortsname | „Tourist-Information“ (nur Schrift, kein Logo)
      P.board(0, 0.535 * W, b0, top - 0.08, { bg: '#f7f7f5', border: '#cfd2d4' });
      P.text('Gemeinde Much', 0.27 * W, (b0 + top - 0.08) / 2, 0.32, { color: '#3b3f44', weight: '500', maxW: 0.46 * W });
      P.board(0.735 * W, W, b0, top - 0.08, { bg: '#f7f7f5', border: '#cfd2d4' });
      P.text('Tourist-Information', 0.867 * W, (b0 + top - 0.08) / 2, 0.24, { color: '#3b3f44', weight: '500', maxW: 0.25 * W });
      P.board(0.535 * W, 0.735 * W, b0 - 0.1, top, { bg: '#ffffff', border: '#cfd2d4' });
      P.text('Much', 0.635 * W, b0 + 0.5, 0.36, { color: '#2f9a8c', weight: '700', font: ROUND, maxW: 0.17 * W });
      P.text('BERGISCH. SCHÖN.', 0.635 * W, b0 + 0.12, 0.065, { color: '#7a7f84', weight: '600', spacing: 0.01, maxW: 0.17 * W });
    },
  },

  // ---------- Südseite (gerade Hausnummern), von Osten nach Westen ----------
  'Hauptstraße 22': {
    name: 'Schuh & Fuß Haas', wall: 'house2', tint: '#f4f2ec',
    draw(P) {
      const { W, top } = P, oH = Math.min(2.35, top - 0.95);
      P.plaster('#ecebe6');                                                  // weißer Rauputz (Schildbereich)
      P.plaster('#e0bd55', -P.plinth, oH + 0.35);                             // ockergelbes Erdgeschoss
      P.plinthBand('#b9b3a3', 0.22);
      P.window(0.04 * W, 0.24 * W, 0.35, oH, { frame: '#dadde0', t: 0.06, interior: 'shoes' });
      P.window(0.25 * W, 0.45 * W, 0.35, oH, { frame: '#dadde0', t: 0.06, interior: 'shoes' });
      P.number('22', 0.475 * W, 1.65, 0.2);
      P.door(0.5 * W, 0.585 * W, 0.15, oH, { frame: '#f1f1ef', panel: '#56676a' });
      P.board(0.62 * W, 0.72 * W, 0.7, 2.25, { bg: '#f3f4f2', border: '#c7cac5' });     // Leistungstafel
      P.text('SCHUH & FUSS', 0.67 * W, 2.08, 0.07, { color: '#4d5853', weight: '700', maxW: 0.09 * W });
      ['Einlagen', 'Maßschuhe', 'Sportversorgung', 'Bandagen', 'Reparaturen'].forEach((s, i) => {
        P.text('• ' + s, 0.67 * W, 1.85 - i * 0.2, 0.055, { color: '#4d5853', maxW: 0.09 * W });
      });
      P.canopy(0, 0.74 * W, oH + 0.3, 0.06, 'rgba(214,226,232,0.9)', true);   // Glasvordach
      P.board(0.07 * W, 0.6 * W, top - 0.62, top - 0.06, { bg: '#e8eae6', border: '#c7cac5' });
      P.text('SCHUH & FUSS', 0.22 * W, top - 0.28, 0.16, { color: '#4b524f', weight: '700', maxW: 0.24 * W });
      P.text('Orthopädie - Schuhtechnik', 0.22 * W, top - 0.48, 0.075, { color: '#4b524f', maxW: 0.24 * W });
      P.text('HAAS', 0.47 * W, top - 0.34, 0.42, { color: '#58a531', weight: '900', maxW: 0.22 * W });
    },
  },
  'Hauptstraße 24': {
    name: 'Fußpflege & Kosmetik', wall: 'brick', tint: '#ffffff',
    draw(P) {
      const { W, top } = P, oH = Math.min(2.35, top - 0.95);
      P.plaster('#eff1f3'); P.plinthBand('#7b8086', 0.3);
      P.window(0.03 * W, 0.44 * W, 0.35, oH, { frame: '#d6262d', t: 0.09, interior: 'display' });
      P.steps(0.44 * W, 0.6 * W, 0, 0.18, 2, '#a9aaa8');
      P.door(0.455 * W, 0.565 * W, 0.18, oH, { frame: '#d6262d', glass: true, label: 'EINGANG' });
      P.window(0.57 * W, 0.645 * W, 0.18, oH, { frame: '#d6262d', t: 0.07 });
      P.canopy(0, 0.8 * W, top - 0.64, 0.12, '#3a3e44');
      P.board(0, 0.8 * W, top - 0.64, top - 0.03, { bg: '#fafafa' });
      P.run([['Fußpflege', '#45484d', '300'], [' & ', '#9aa0a6', '300'], ['Kosmetik', '#e0383e', '700']], 0.4 * W, top - 0.45, 0.36, { maxW: 0.74 * W });
    },
  },
  'Hauptstraße 26': {
    name: 'Hirsch-Apotheke', wall: 'house2', tint: '#f2f3f5',
    draw(P) {
      const { W, top } = P, oH = Math.min(2.3, top - 1.0);
      P.plaster('#edeff2'); P.plinthBand('#c6c9cd', 0.16);
      P.window(0.02 * W, 0.3 * W, 0.28, oH, { frame: '#d32f2f', t: 0.1, interior: 'pharmacy' });
      P.window(0.36 * W, 0.52 * W, 0.28, oH, { frame: '#d32f2f', t: 0.1, interior: 'pharmacy' });
      P.door(0.58 * W, 0.82 * W, 0.04, oH, { frame: '#d32f2f', glass: true, double: true });
      P.window(0.84 * W, 0.9 * W, 0.04, oH, { frame: '#d32f2f', t: 0.06 });
      P.canopy(0, W, oH + 0.32, 0.14, '#4a4f56');
      P.board(0.17 * W, 0.71 * W, top - 0.6, top - 0.05, { bg: '#ffffff', border: '#d7dade' });
      P.run([['Hirsch', '#4a4d52', '300'], ['Apotheke', '#d32f2f', '700']], 0.355 * W, top - 0.4, 0.3, { maxW: 0.32 * W });
      P.text('1831', 0.5 * W, top - 0.13, 0.075, { color: '#d32f2f', weight: '600' });
      P.text('die erste Apotheke in Much', 0.36 * W, top - 0.52, 0.07, { color: '#d32f2f', maxW: 0.3 * W });
      P.text('und Sanitätshaus', 0.6 * W, top - 0.36, 0.15, { color: '#4a4d52', weight: '300', maxW: 0.18 * W });
    },
  },
  'Hauptstraße 28': {
    // Ladenfront im Westgiebel zum Vorplatz der Bäckerei, nicht zur Straße; links = Straßenecke, rechts = SH Mobil
    // full: das Bild bedeckt den ganzen Giebel – oben ein Fenster im Schiefer, darunter zwei im Fachwerk (nach Foto)
    // Seit Ende 2026 zieht hier WIRGES Bad & Heizung ein (Fotos des Users vom 22.11.: Schild, „Hier entsteht eine
    // moderne Badausstellung“, Hausnummer 28) – vorher Fotostudio Olga Malleker.
    name: 'WIRGES Bad & Heizung', wall: 'fachwerk', tint: '#ffffff', face: 'W', full: true, photos: ['wirges_schild'],
    draw(P) {
      const { W, top } = P, gf = P.full ? Math.min(SHOP_TOP, top) : top;   // Oberkante Erdgeschoss
      const f0 = 0.6, oH = Math.min(2.55, gf - 0.8), beam = '#262019';       // Erdgeschoss liegt über einer Treppe
      P.plaster('#f3f2ee'); P.plinthBand('#d2d2cd', f0);
      for (const f of [0, 0.515, 0.655, 0.81, 1]) {                          // dunkle Fachwerkpfosten
        P.rect(Math.max(0, f * W - 0.08), Math.min(W, f * W + 0.08), f0, oH + 0.08, beam);
      }
      P.window(0.02 * W, 0.19 * W, f0 + 0.12, oH, { frame: '#f1f1ee', t: 0.06, interior: 'empty' });
      P.steps(0.13 * W, 0.44 * W, -P.plinth, f0, 4, '#8e9195');
      P.door(0.2 * W, 0.35 * W, f0, oH, { frame: '#f1f1ee', glass: true, double: true });
      P.window(0.36 * W, 0.5 * W, f0 + 0.12, oH, { frame: '#f1f1ee', t: 0.06, interior: 'empty' });
      P.window(0.67 * W, 0.795 * W, f0 + 0.12, oH, { frame: beam, t: 0.06, interior: 'poster' });
      P.rect(0.825 * W, 0.99 * W, -P.plinth, oH, '#2b2927');                  // dunkler Durchgang
      P.slate(0, W, oH + 0.08, gf - 0.1);                                     // Schiefer-Vordach
      P.rect(0, W, gf - 0.1, gf, '#2b2e33');
      // Schild über dem Vordach, unter dem linken Fachwerkfenster: Foto (entzerrt), sonst Schriftzug als Platzhalter
      const sign = (h0, h1) => {
        const w = (h1 - h0) * 4.875, x0 = 0.097 * W, hh = h1 - h0;              // Seitenverhältnis des Schildes
        if (P.photo('wirges_schild', x0, x0 + w, h0, h1)) return;
        P.board(x0, x0 + w, h0, h1, { bg: '#30353a' });
        P.text('WIRGES', x0 + w * 0.6, h0 + hh * 0.64, hh * 0.42, { color: '#ffffff', weight: '700', maxW: w * 0.7 });
        P.text('Bad & Heizung GmbH', x0 + w * 0.6, h0 + hh * 0.24, hh * 0.17, { color: '#ffffff', maxW: w * 0.7 });
      };
      if (!P.full) { sign(oH + 0.12, gf - 0.12); return; }
      // Fachwerkgeschoss mit zwei Fenstern
      const sl = Math.max(gf + 2.6, Math.min(P.eave - 0.6, gf + 3.6));       // Unterkante des Schiefergiebels
      const w1 = sl - 0.45, w0 = w1 - 1.3, bw = 0.17;
      P.plaster('#f3f2ee', gf, sl);
      for (const h of [gf, w0 - 0.12 - bw, w1 + 0.12, sl - bw]) P.rect(0, W, h, h + bw, beam);   // Riegel
      for (const f of [0, 0.15, 0.26, 0.38, 0.5, 0.61, 0.75, 0.87, 1]) {                       // Ständer
        P.rect(Math.max(0, f * W - bw / 2), Math.min(W, f * W + bw / 2), gf, sl, beam);
      }
      for (const [a, b] of [[0.15, 0.26], [0.61, 0.75]]) {
        P.window(a * W + bw / 2, b * W - bw / 2, w0, w1, { frame: '#f4f4f2', t: 0.07, mullions: 1 });
      }
      sign(gf + 0.1, Math.min(gf + 0.8, w0 - 0.05));
      // Schiefergiebel mit einem Fenster, über dem linken Fachwerkfenster – so weit innen, dass es unter die Dachkante passt
      P.slate(0, W, sl, top);
      P.rect(0, W, sl - 0.05, sl + 0.05, '#2a2e33');
      const gw = 1.0, gh = 1.0, g0 = sl + 0.9;
      let gx = 0.205 * W;
      while (gx < 0.5 * W && Math.min(P.roofAt(gx - gw / 2), P.roofAt(gx + gw / 2)) < g0 + gh + 0.3) gx += 0.1;
      P.window(gx - gw / 2, gx + gw / 2, g0, g0 + gh, { frame: '#f4f4f2', t: 0.08, mullions: 1, outer: '#e9e9e6' });
    },
  },
  'id:DENW46AL1000Ur0U': {          // Anbau zwischen Nr. 28 und 30 (ohne eigene Hausnummer)
    name: 'SH Mobil', wall: 'house2', tint: '#f4f4f2',
    draw(P) {
      const { W, top } = P, oH = Math.min(2.3, top - 0.9);
      P.plaster('#f5f5f3'); P.plinthBand('#9aa0a6', 0.35);
      P.steps(0.24 * W, 0.56 * W, 0, 0.35, 3);
      P.door(0.28 * W, 0.52 * W, 0.35, oH, { frame: '#f1f1ef', glass: true, double: true });
      P.window(0.58 * W, 0.9 * W, 0.8, oH, { frame: '#f1f1ef', t: 0.07, interior: 'shop' });
      P.board(0.16 * W, 0.84 * W, top - 0.64, top - 0.08, { bg: '#ffffff', border: '#7cc35a', borderW: 0.04, radius: 0.14 });
      P.text('SH Mobil', 0.5 * W, top - 0.36, 0.34, { color: '#69bd45', weight: '800', maxW: 0.6 * W });
    },
  },
  'Hauptstraße 30': {
    name: 'Café-Bäckerei Heimann', wall: 'house2', tint: '#f3f0ea',
    draw(P) {
      const { W, top } = P, oH = Math.min(2.5, top - 0.75);
      P.plaster('#f1eee8');
      P.rect(0, W, -P.plinth, 0.55, '#46484b');                              // Brüstung des Wintergartens
      P.rect(0, W, 0.5, 0.55, '#5c5f63');
      P.window(0, W, 0.55, oH, { frame: '#3d3f42', t: 0.06, mullions: Math.max(3, Math.round(W / 1.2) - 1), interior: 'cafe' });
      P.door(0.86 * W, 0.97 * W, 0, oH, { frame: '#3d3f42', glass: true });
      P.rect(0, W, oH, top, '#4b4640');                                      // Blende: dunkel mit gelbem Streifen
      P.rect(0, W, top - 0.11, top - 0.04, '#e3a21c');
      P.text('Cafe · Bäckerei · Heimann', 0.5 * W, (oH + top - 0.11) / 2, 0.32, { color: '#e3682b', weight: '700', font: SERIF, maxW: 0.9 * W });
    },
  },
  'Hauptstraße 34': {
    // Westteil des Hauses (Schieferdach); der Ostteil mit Ziegeldach hat eine eigene Wand zur Straße
    name: 'Hazal Grill & Pizzeria', wall: 'slate', tint: '#ffffff', near: [205.8, -35.4],
    draw(P) {
      const { W, top } = P, oH = 2.62, m = W / 11.4;                        // Maße nach Foto, auf die Wandbreite gestreckt
      P.stone(0, W, -P.plinth, top, [194, 188, 170]);                        // heller Verblendstein
      P.rect(0, W, top - 0.1, top, '#8e887b');                               // Abdeckung oben
      const poster = (x0, x1) => {                                           // Angebotsplakat: gelbe Kopfzeile, Speisenfotos
        const w = Math.min(x1 - x0, 1.15), a = (x0 + x1 - w) / 2, n = Math.max(2, Math.round(w / 0.3)), cw = (w - 0.1) / n;
        P.rect(a, a + w, 0.6, 1.46, '#1b1a19');
        P.rect(a + 0.05, a + w - 0.05, 1.33, 1.41, '#f2c21b');
        for (let r = 0; r < 2; r++) for (let c = 0; c < n; c++) {
          P.rect(a + 0.07 + c * cw, a + 0.03 + (c + 1) * cw, 0.97 - r * 0.27, 1.22 - r * 0.27,
            ['#c8742c', '#e3a24f', '#a8432a', '#d9b26a', '#8f5a2b'][(P.rnd() * 5) | 0]);
        }
        P.rect(a, a + w, 0.6, 0.65, '#e2531f');
      };
      for (const [a, b] of [[0.25, 2.0], [2.05, 3.8], [4.7, 5.85], [5.9, 7.05], [7.65, 8.35]]) {
        P.window(a * m, b * m, 0.5, oH, { frame: '#f4f4f2', t: 0.07, transom: 0.42 });
        poster(a * m + 0.1, b * m - 0.1);
      }
      P.steps(8.3 * m, 9.35 * m, 0, 0.14, 1, '#a9a69f');
      P.door(8.35 * m, 9.25 * m, 0.14, oH, { frame: '#f4f4f2', glass: true, transom: 0.42 });
      const s0 = oH + 0.14, s1 = top - 0.16;                                 // Schild: Abendhimmel-Verlauf
      P.board(3.4 * m, 8.0 * m, s0, s1, { grad: ['#e8692a', '#f7b43c', '#c8361d'] });
      P.text('Hazal', 4.75 * m, (s0 + s1) / 2, 0.34, { color: '#161514', font: SCRIPT, weight: '700', stroke: '#fbe7c0', maxW: 2.0 * m });
      P.text('GRILL & PIZZERIA', 6.75 * m, (s0 + s1) / 2 - 0.02, 0.22, { color: '#ffffff', weight: '800', shadow: 'rgba(90,25,0,0.7)', maxW: 2.3 * m });
    },
    more: [{
      name: 'Hazal (Ecke)', near: [198.25, -36.95],                          // vorspringendes Eckstück im Westen
      draw(P) {
        const { W, top } = P;
        P.stone(0, W, -P.plinth, top, [194, 188, 170]);
        P.rect(0, W, top - 0.1, top, '#8e887b');
        P.board(W - 0.85, W - 0.1, 2.15, 2.95, { grad: ['#e8692a', '#f7b43c', '#c8361d'], border: '#f4f4f2', borderW: 0.03 });
        P.text('Hazal', W - 0.475, 2.72, 0.16, { color: '#161514', font: SCRIPT, weight: '700', maxW: 0.66 });
        P.text('PIZZA · GRILL', W - 0.475, 2.38, 0.07, { color: '#ffffff', weight: '800', maxW: 0.66 });
      },
    }],
  },
};

/**
 * Zeichenhilfe für eine Ladenfront. Koordinaten in Metern: x von links nach rechts (von der Straße aus
 * gesehen), h = Höhe über Straßenniveau (0 = Gehweg, negativ = Sockel bis zur Unterkante).
 */
function painter(g, W, top, plinth, seed, extra = {}) {
  const px = SHOP_PX;
  /** Oberkante der Wand bei x (nur bei Fronten über die ganze Wand, sonst top). */
  const roofAt = (x) => {
    let best = -Infinity;
    for (const q of extra.outline || []) {
      for (let i = 0, n = q.length / 2; i < n; i++) {
        const j = (i + 1) % n, ax = q[2 * i], ay = q[2 * i + 1], bx = q[2 * j], by = q[2 * j + 1];
        if (x < Math.min(ax, bx) - 1e-6 || x > Math.max(ax, bx) + 1e-6) continue;
        best = Math.max(best, Math.abs(bx - ax) < 1e-6 ? Math.max(ay, by) : ay + (by - ay) * (x - ax) / (bx - ax));
      }
    }
    return best === -Infinity ? top : best;
  };
  const X = (m) => m * px;
  const Y = (h) => (top - h) * px;
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rect = (x0, x1, h0, h1, col) => {
    if (x1 <= x0 || h1 <= h0) return;
    g.fillStyle = col; g.fillRect(X(x0), Y(h1), X(x1 - x0), (h1 - h0) * px);
  };
  const clip = (x0, x1, h0, h1, fn) => {
    g.save(); g.beginPath(); g.rect(X(x0), Y(h1), X(x1 - x0), (h1 - h0) * px); g.clip(); fn(); g.restore();
  };
  // Innenraum hinter Glas: nur Andeutungen (Regale, Theke, warmes Licht)
  const interior = (kind, x0, x1, h0, h1) => {
    const w = x1 - x0, hh = h1 - h0;
    if (kind === 'counter' || kind === 'cafe') {
      const gr = g.createLinearGradient(0, Y(h1), 0, Y(h0));
      gr.addColorStop(0, 'rgba(255,214,160,0.28)'); gr.addColorStop(1, 'rgba(120,64,30,0.32)');
      g.fillStyle = gr; g.fillRect(X(x0), Y(h1), X(w), hh * px);
      if (kind === 'counter') {
        rect(x0 + 0.1, x1 - 0.1, h0 + 0.3, h0 + 0.8, 'rgba(228,228,222,0.5)');       // Kühltheke
        rect(x0 + 0.1, x1 - 0.1, h0 + 0.8, h0 + 0.85, 'rgba(200,64,52,0.55)');
      } else {
        for (let x = x0 + 0.5; x < x1 - 0.4; x += 1.3 + rnd() * 0.6) {               // Tische und Stühle
          rect(x, x + 0.6, h0 + 0.45, h0 + 0.5, 'rgba(60,40,28,0.55)');
          rect(x + 0.27, x + 0.33, h0, h0 + 0.45, 'rgba(60,40,28,0.45)');
        }
      }
    } else if (kind === 'shop' || kind === 'shoes' || kind === 'pharmacy') {
      rect(x0, x1, h0, h1, 'rgba(255,250,240,0.06)');
      const shelf = kind === 'pharmacy' ? 'rgba(238,238,234,0.5)' : 'rgba(205,205,198,0.35)';
      for (let k = 1; k <= 3; k++) {
        const hs = h0 + hh * (0.12 + 0.24 * k);
        rect(x0 + 0.06, x1 - 0.06, hs - 0.025, hs, shelf);
        for (let x = x0 + 0.1; x < x1 - 0.18; x += 0.1 + rnd() * 0.14) {
          const c = kind === 'pharmacy' ? (rnd() < 0.6 ? 'rgba(242,242,240,0.62)' : 'rgba(205,60,60,0.5)')
            : kind === 'shoes' ? `rgba(${110 + rnd() * 110 | 0},${95 + rnd() * 90 | 0},${80 + rnd() * 80 | 0},0.6)`
              : `hsla(${rnd() * 360 | 0},55%,58%,0.55)`;
          rect(x, x + 0.05 + rnd() * 0.07, hs, hs + 0.07 + rnd() * 0.13, c);
        }
      }
    } else if (kind === 'gallery') {
      rect(x0, x1, h0, h1, 'rgba(255,255,255,0.08)');
      for (let x = x0 + 0.35; x < x1 - 0.3; x += 0.9 + rnd() * 0.4) {               // Vitrinensockel
        rect(x, x + 0.32, h0, h0 + 0.95, 'rgba(240,240,236,0.55)');
        rect(x + 0.1, x + 0.22, h0 + 0.95, h0 + 1.0, 'rgba(212,175,55,0.7)');
      }
    } else if (kind === 'empty') {
      rect(x0, x1, h0 + hh * 0.15, h1, 'rgba(230,226,218,0.16)');
    } else if (kind === 'display') {
      rect(x0, x1, h0, h0 + 0.3, 'rgba(150,170,160,0.45)');                         // Dekotisch
      for (let x = x0 + 0.4; x < x1 - 0.3; x += 0.7 + rnd() * 0.5) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(214,170,90,0.7)' : 'rgba(236,140,40,0.7)';
        g.beginPath(); g.arc(X(x), Y(h0 + 0.8 + rnd() * 0.8), 0.13 * px, 0, Math.PI * 2); g.fill();
      }
    } else if (kind === 'poster') {
      rect(x0 + w * 0.3, x0 + w * 0.6, h0 + hh * 0.08, h1 - hh * 0.1, 'rgba(232,226,220,0.55)');
    }
  };

  return {
    W, top, plinth, rnd, rect, roofAt,
    full: !!extra.full,            // Front bedeckt die ganze Wand (Giebel inklusive)
    eave: extra.eave ?? top,       // Traufhöhe dieser Wand über Straßenniveau
    /**
     * Eigenes Foto (entzerrt, siehe loadShopPhotos) in den Bereich x0..x1, h0..h1 legen. down = Meter, um die
     * die unterste Bildzeile nach unten verlängert wird (Sockel am Hang). false, wenn das Foto fehlt.
     */
    photo(name, x0 = 0, x1 = W, h0 = 0, h1 = top, down = 0) {
      const img = PHOTOS.get(name);
      if (!img) return false;
      g.drawImage(img, X(x0), Y(h1), X(x1 - x0), (h1 - h0) * px);
      if (down > 0) g.drawImage(img, 0, img.height - 2, img.width, 2, X(x0), Y(h0), X(x1 - x0), down * px);
      return true;
    },
    /** Putz mit leichter Körnung. */
    plaster(col, h0 = -plinth, h1 = top, x0 = 0, x1 = W) {
      rect(x0, x1, h0, h1, col);
      const n = Math.round((x1 - x0) * (h1 - h0) * 140);
      for (let i = 0; i < n; i++) {
        const v = rnd() < 0.5 ? 0 : 255;
        g.fillStyle = `rgba(${v},${v},${v},${0.05 * rnd()})`;
        g.fillRect(X(x0 + rnd() * (x1 - x0)), Y(h0 + rnd() * (h1 - h0)), 1 + rnd() * 2, 1 + rnd() * 2);
      }
    },
    /** Natursteinverblendung (Bruchstein, beige-grau). */
    stone(x0, x1, h0, h1, base = [203, 189, 160]) {
      rect(x0, x1, h0, h1, '#8f877a');
      const rowH = 0.22;
      for (let h = h0, row = 0; h < h1; h += rowH, row++) {
        let x = x0 - (row % 2) * 0.2;
        while (x < x1) {
          const w = 0.32 + rnd() * 0.3, j = (rnd() - 0.5) * 34;
          const c = `rgb(${base[0] + j | 0},${base[1] + j | 0},${base[2] + j * 0.8 | 0})`;
          rect(Math.max(x, x0) + 0.015, Math.min(x + w, x1) - 0.015, h + 0.015, Math.min(h + rowH, h1) - 0.015, c);
          x += w;
        }
      }
    },
    /** Schieferbehang (Reihen kleiner Platten). */
    slate(x0, x1, h0, h1) {
      rect(x0, x1, h0, h1, '#3a3f46');
      clip(x0, x1, h0, h1, () => {
        for (let h = h1 - 0.11, row = 0; h > h0 - 0.11; h -= 0.11, row++) {
          for (let x = x0 - (row % 2) * 0.09; x < x1; x += 0.18) {
            const l = 58 + rnd() * 18;
            rect(x, x + 0.165, h + 0.02, h + 0.11, `rgb(${l | 0},${(l + 4) | 0},${(l + 11) | 0})`);
          }
        }
      });
    },
    /** Dunkle Holzverkleidung mit feiner Maserung. */
    wood(x0, x1, h0, h1, col) {
      rect(x0, x1, h0, h1, col);
      for (let i = 0, n = Math.round((x1 - x0) * 30); i < n; i++) {
        g.fillStyle = `rgba(255,255,255,${0.025 * rnd()})`;
        g.fillRect(X(x0 + rnd() * (x1 - x0)), Y(h1), 1, (h1 - h0) * px);
      }
    },
    /** Sockelstreifen über die ganze Breite (bis zur Unterkante). */
    plinthBand(col, h1 = 0.3) {
      rect(0, W, -plinth, h1, col);
      rect(0, W, h1 - 0.03, h1, 'rgba(0,0,0,0.12)');
    },
    /** Glasfläche mit Verlauf, Spiegelung und optionalem Innenraum / Milchglas. */
    glass(x0, x1, h0, h1, o = {}) {
      const gr = g.createLinearGradient(X(x0), Y(h1), X(x1), Y(h0));
      gr.addColorStop(0, o.light ? '#90a5b5' : '#6d8292'); gr.addColorStop(0.5, '#34414d'); gr.addColorStop(1, '#232c35');
      g.fillStyle = gr; g.fillRect(X(x0), Y(h1), X(x1 - x0), (h1 - h0) * px);
      if (o.interior) interior(o.interior, x0, x1, h0, h1);
      clip(x0, x1, h0, h1, () => {
        g.fillStyle = 'rgba(255,255,255,0.07)';
        const w = x1 - x0, hh = h1 - h0;
        for (const f of [0.15, 0.58]) {
          g.beginPath();
          g.moveTo(X(x0 + w * f), Y(h0)); g.lineTo(X(x0 + w * f + hh * 0.5), Y(h1));
          g.lineTo(X(x0 + w * f + hh * 0.5 + 0.35), Y(h1)); g.lineTo(X(x0 + w * f + 0.35), Y(h0));
          g.closePath(); g.fill();
        }
      });
      if (o.frosted) {
        const hf = h0 + (h1 - h0) * o.frosted;
        rect(x0, x1, h0, hf, 'rgba(236,240,242,0.82)');
        if (o.stripe) rect(x0, x1, hf - 0.06, hf - 0.03, o.stripe);
      }
    },
    /** Fenster/Schaufenster: Rahmen, Glas, Sprossen, Fensterbank. */
    window(x0, x1, h0, h1, o = {}) {
      const t = o.t ?? 0.08, fr = o.frame || '#f4f4f2';
      if (o.outer) rect(x0 - 0.06, x1 + 0.06, h0 - 0.06, h1 + 0.06, o.outer);
      rect(x0 - 0.04, x1 + 0.04, h0 - 0.07, h0, 'rgba(0,0,0,0.18)');
      rect(x0, x1, h0, h1, fr);
      this.glass(x0 + t, x1 - t, h0 + t, h1 - t, o);
      for (let k = 1, n = o.mullions || 0; k <= n; k++) {
        const xm = x0 + (x1 - x0) * k / (n + 1);
        rect(xm - t * 0.35, xm + t * 0.35, h0, h1, fr);
      }
      if (o.transom) { const ht = h1 - o.transom; rect(x0, x1, ht - t * 0.35, ht + t * 0.35, fr); }
    },
    /** Tür: Glas, Holz mit Sprossenfenster, Blech oder offen. */
    door(x0, x1, h0, h1, o = {}) {
      const t = o.t ?? 0.07, fr = o.frame || '#f4f4f2';
      rect(x0, x1, h0, h1, fr);
      const a = x0 + t, b = x1 - t, c = h0 + t * 0.5, d = h1 - t;
      if (o.open) {
        rect(a, b, c, d, '#2b2a26');
        interior('shop', a, b, c, d);
      } else if (o.glass) {
        this.glass(a, b, c, d, { light: true });
      } else if (o.wood) {
        this.wood(a, b, c, d, o.wood);
        const gx0 = a + (b - a) * 0.2, gx1 = b - (b - a) * 0.2, gy0 = c + (d - c) * 0.55, gy1 = d - (d - c) * 0.1;
        this.glass(gx0, gx1, gy0, gy1, { light: true });
        for (let k = 1; k < 3; k++) rect(gx0 + (gx1 - gx0) * k / 3 - 0.012, gx0 + (gx1 - gx0) * k / 3 + 0.012, gy0, gy1, o.wood);
        for (let k = 1; k < 4; k++) rect(gx0, gx1, gy0 + (gy1 - gy0) * k / 4 - 0.012, gy0 + (gy1 - gy0) * k / 4 + 0.012, o.wood);
      } else {
        rect(a, b, c, d, o.panel || '#55595e');
      }
      if (o.transom) rect(x0, x1, h1 - o.transom - t * 0.35, h1 - o.transom + t * 0.35, fr);
      if (o.double) rect((x0 + x1) / 2 - t * 0.3, (x0 + x1) / 2 + t * 0.3, h0, h1, fr);
      if (!o.open) { const hx = b - 0.1; rect(hx, hx + 0.03, h0 + 0.85, h0 + 1.25, '#c9cccf'); }
      if (o.label) this.text(o.label, (x0 + x1) / 2, h0 + 1.75, 0.07, { color: '#ffffff', weight: '700', maxW: (b - a) * 0.9 });
    },
    /** Treppenstufen vor einem Eingang (frontal gesehen). */
    steps(x0, x1, h0, h1, n = 2, col = '#9b9892') {
      const dh = (h1 - h0) / n;
      for (let i = 0; i < n; i++) {
        const k = i * 0.06;
        rect(x0 + k, x1 - k, h0 + i * dh, h0 + (i + 1) * dh, col);
        rect(x0 + k, x1 - k, h0 + (i + 1) * dh - 0.02, h0 + (i + 1) * dh, 'rgba(255,255,255,0.28)');
      }
    },
    /** Vordach (Kante + Schatten darunter). */
    canopy(x0, x1, h, thick = 0.1, col = '#43474d', glassy = false) {
      rect(x0, x1, h - thick - 0.22, h - thick, 'rgba(0,0,0,0.12)');
      rect(x0, x1, h - thick, h, col);
      if (glassy) rect(x0, x1, h - 0.02, h, 'rgba(255,255,255,0.55)');
    },
    /** Schildtafel, optional mit Rand, runden Ecken, als Oval (ellipse) oder mit Farbverlauf von oben nach unten (grad). */
    board(x0, x1, h0, h1, o = {}) {
      g.save();
      g.beginPath();
      const r = (o.radius || 0) * px;
      if (o.ellipse) g.ellipse(X((x0 + x1) / 2), Y((h0 + h1) / 2), X(x1 - x0) / 2, (h1 - h0) * px / 2, 0, 0, Math.PI * 2);
      else if (r && g.roundRect) g.roundRect(X(x0), Y(h1), X(x1 - x0), (h1 - h0) * px, r);
      else g.rect(X(x0), Y(h1), X(x1 - x0), (h1 - h0) * px);
      if (o.grad) {
        const gr = g.createLinearGradient(0, Y(h1), 0, Y(h0));
        o.grad.forEach((c, i) => gr.addColorStop(i / (o.grad.length - 1), c));
        g.fillStyle = gr;
      } else g.fillStyle = o.bg || '#ffffff';
      g.fill();
      if (o.border) { g.lineWidth = (o.borderW || 0.025) * px; g.strokeStyle = o.border; g.stroke(); }
      g.restore();
      if (!o.ellipse) rect(x0, x1, h0 - 0.05, h0, 'rgba(0,0,0,0.14)');
    },
    /** Busch im Pflanzkübel: ein paar grüne Kreise um (xc, h0) mit Breite w und Höhe hh. */
    shrub(xc, h0, w, hh) {
      for (let i = 0; i < 7; i++) {
        const x = xc + (rnd() - 0.5) * w * 0.7, h = h0 + hh * (0.3 + rnd() * 0.45), rr = (0.16 + rnd() * 0.1) * Math.min(w, hh * 2);
        g.fillStyle = `rgb(${52 + rnd() * 30 | 0},${96 + rnd() * 40 | 0},${48 + rnd() * 22 | 0})`;
        g.beginPath(); g.arc(X(x), Y(h), rr * px, 0, Math.PI * 2); g.fill();
      }
    },
    /** Schriftzug, mittig um (xc, h); verkleinert sich bei Bedarf auf maxW. */
    text(str, xc, h, size, o = {}) {
      g.save();
      let fs = size * px;
      const setFont = () => { g.font = `${o.style || 'normal'} ${o.weight || '600'} ${fs}px ${o.font || SANS}`; };
      setFont();
      if ('letterSpacing' in g) g.letterSpacing = `${(o.spacing || 0) * px}px`;
      if (o.maxW) { const w = g.measureText(str).width; if (w > o.maxW * px) { fs *= o.maxW * px / w; setFont(); } }
      g.textAlign = o.align || 'center'; g.textBaseline = 'middle';
      if (o.shadow) { g.shadowColor = o.shadow; g.shadowBlur = fs * 0.08; g.shadowOffsetY = fs * 0.05; }
      if (o.stroke) { g.lineWidth = Math.max(1, fs * 0.09); g.lineJoin = 'round'; g.strokeStyle = o.stroke; g.strokeText(str, X(xc), Y(h)); }
      g.fillStyle = o.color || '#222222';
      g.fillText(str, X(xc), Y(h));
      g.restore();
    },
    /** Mehrfarbiger Schriftzug in einer Zeile: parts = [[Text, Farbe, Stärke, Schrift?], …], h = Grundlinie. */
    run(parts, xc, h, size, o = {}) {
      g.save();
      let fs = size * px;
      const fontOf = (p) => `normal ${p[2] || '600'} ${fs}px ${p[3] || o.font || SANS}`;
      const measure = () => parts.map(p => { g.font = fontOf(p); return g.measureText(p[0]).width; });
      let ws = measure(), tot = ws.reduce((a, b) => a + b, 0);
      if (o.maxW && tot > o.maxW * px) { fs *= o.maxW * px / tot; ws = measure(); tot = ws.reduce((a, b) => a + b, 0); }
      let x = X(xc) - tot / 2;
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      parts.forEach((p, i) => { g.font = fontOf(p); g.fillStyle = p[1]; g.fillText(p[0], x, Y(h)); x += ws[i]; });
      g.restore();
    },
    /** Hausnummer. */
    number(str, xc, h, size = 0.2) {
      this.text(str, xc, h, size, { color: '#33373c', weight: '700' });
    },
  };
}

/**
 * Alle Ladenfronten zeichnen und in einen Atlas packen.
 * items: [{ shop, width, top, plinth, photo? }] (Meter) → { canvas, rects: [{ u0, u1, vTop, vBot }] } (UV, wie flipY).
 */
export function drawShopAtlas(items) {
  const PAD = 6, AW = 2048;
  const imgs = items.map((it, i) => {
    const c = document.createElement('canvas');
    c.width = Math.max(8, Math.min(AW - 2 * PAD, Math.round(it.width * SHOP_PX)));
    c.height = Math.max(8, Math.round((it.top + it.plinth) * SHOP_PX));
    const g = c.getContext('2d');
    g.fillStyle = '#eeeeea'; g.fillRect(0, 0, c.width, c.height);
    try {
      const P = painter(g, it.width, it.top, it.plinth, 977 + i * 7919, it);
      if (it.photo) {                // Foto der ganzen Wand; Putz darunter füllt Stellen, die das Foto nicht zeigt
        P.plaster(it.shop.tint || '#f2f1ec');
        P.photo(it.photo, 0, P.W, 0, P.top, P.plinth);
      } else it.shop.draw(P);
    } catch (err) { console.warn('Ladenfront nicht gezeichnet:', it.shop.name, err); }
    return c;
  });
  // Skyline-Packen: höchste Bilder zuerst, jedes an die niedrigste freie Stelle (hohe Giebelbilder lassen
  // daneben Platz für mehrere Reihen normaler Fronten)
  const order = imgs.map((_, i) => i).sort((a, b) => imgs[b].height - imgs[a].height || imgs[b].width - imgs[a].width);
  let sky = [{ x: 0, w: AW, y: 0 }];
  const pos = [];
  for (const i of order) {
    const w = imgs[i].width + 2 * PAD, h = imgs[i].height + 2 * PAD;
    let bx = 0, by = Infinity;
    for (let s = 0; s < sky.length && sky[s].x + w <= AW; s++) {
      let y = 0;
      for (let t = s; t < sky.length && sky[t].x < sky[s].x + w; t++) y = Math.max(y, sky[t].y);
      if (y < by) { by = y; bx = sky[s].x; }
    }
    pos[i] = { x: bx + PAD, y: by + PAD };
    const next = [];
    for (const sg of sky) {
      if (sg.x + sg.w <= bx || sg.x >= bx + w) { next.push(sg); continue; }
      if (sg.x < bx) next.push({ x: sg.x, w: bx - sg.x, y: sg.y });
      if (sg.x + sg.w > bx + w) next.push({ x: bx + w, w: sg.x + sg.w - bx - w, y: sg.y });
    }
    next.push({ x: bx, w, y: by + h });
    next.sort((p, q) => p.x - q.x);
    sky = next.reduce((acc, sg) => {
      const l = acc[acc.length - 1];
      if (l && l.y === sg.y && l.x + l.w === sg.x) l.w += sg.w; else acc.push({ ...sg });
      return acc;
    }, []);
  }
  const AH = Math.max(...sky.map(sg => sg.y));
  const atlas = document.createElement('canvas');
  atlas.width = AW; atlas.height = AH;
  const g = atlas.getContext('2d');
  imgs.forEach((c, i) => {
    const { x: px0, y: py0 } = pos[i], w = c.width, h = c.height;
    g.drawImage(c, px0, py0);
    // Randpixel in den Zwischenraum verlängern: keine Farbsäume aus Nachbarbildern bei Mipmaps
    g.drawImage(c, 0, 0, 1, h, px0 - PAD, py0, PAD, h);
    g.drawImage(c, w - 1, 0, 1, h, px0 + w, py0, PAD, h);
    g.drawImage(c, 0, 0, w, 1, px0, py0 - PAD, w, PAD);
    g.drawImage(c, 0, h - 1, w, 1, px0, py0 + h, w, PAD);
  });
  const rects = imgs.map((c, i) => ({
    u0: pos[i].x / AW, u1: (pos[i].x + c.width) / AW,
    vTop: 1 - pos[i].y / AH, vBot: 1 - (pos[i].y + c.height) / AH,
  }));
  return { canvas: atlas, rects };
}
