/**
 * Läden an der Hauptstraße in Much (und die VR-Bank am Kirchplatz) – gezeichnete Fassaden oder eigene Fotos.
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
 *   jog   optional: größter Vor- oder Rücksprung (m), bis zu dem Wandstücke zur selben Front gehören (Standard 0,6)
 *   gap   optional: größte Lücke (m) zwischen Wandstücken derselben Front, z. B. schräge Erkerwände (Standard 0,5)
 *   above optional: so weit (m) darf die Front über die Traufe hinausragen, z. B. ein Schildkasten auf einem Vordach
 *   more  optional: weitere Fronten desselben Hauses, je { name, draw, face?, near?, jog? }
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

  // ---------- Nordseite westlich der Tourist-Info: Nr. 35–53 (Vorlage: Street-View-Bilder des Users, 24.11.) ----------
  // Die Fronten zeigen nach Süden: links im Bild = Westen = x 0. Von Osten: Villa 35 oben am Hang (nur Wandfarbe) mit
  // Garage in der Bruchsteinmauer, 37 Gothaer/Glücklich, 39 Friseur mit Balkon, 41 levanta, Durchgang zu Elektronik Haas
  // (Hausnummer 41 am Pfeiler), 43 MEDO, Café, Post & Kiosk, Ausstellung; Schotterparkplatz; 49 Fachwerk mit Fahrschule,
  // 51 Bioresonanzzentrum, 53 Systems Software Services, TintenPro, BIANGA.
  'Hauptstraße 35': { name: 'Hauptstraße 35', wall: 'house2', tint: '#f6f6f4' },
  'id:DENW46AL1000UqcI': {
    name: 'Garage an der Hangmauer', wall: 'plain', tint: '#a48b6c',
    draw(P) {
      const { W, top } = P, d0 = 0.22 * W, d1 = 0.8 * W, dH = Math.min(2.15, top - 0.35);
      P.stone(0, W, -P.plinth, top, [150, 126, 98]);
      P.rect(d0 - 0.1, d1 + 0.1, -P.plinth, dH + 0.1, '#7d6c56');
      P.rect(d0, d1, -P.plinth, dH, '#f2f2f0');                                // weißes Sektionaltor
      for (let h = dH - 0.5; h > 0; h -= 0.5) P.rect(d0, d1, h - 0.015, h + 0.015, '#cfd0ce');
      P.rect(d0 - 0.55, d0 - 0.2, 1.5, 1.75, '#f1f1ef');                        // Schild „Ausfahrt freihalten“
      P.rect(d1 + 0.2, d1 + 0.42, 1.3, 1.6, '#e9e9e6');
    },
  },
  'Hauptstraße 37': {
    // Gothaer Versicherungsbüro und Glücklich (Hausnummer an der Ladentür) unter einem dunklen, schiefergrünen Blendband
    name: 'Gothaer · Glücklich', wall: 'house2', tint: '#f7f7f5',
    draw(P) {
      const { W, top } = P, m = W / 14.3, oH = Math.min(2.45, top - 0.9), b0 = oH + 0.08, fr = '#2f3133', blue = '#1d5aa6';
      P.plaster('#f4f4f2');
      P.rect(0, W, -P.plinth, b0, fr);                                          // dunkle Ladenrahmung
      P.rect(0, W, -P.plinth, 0.04, '#8d8b86');
      // Gothaer: Schaufenster, offene Tür, Schaufenster – blaue Tafeln und Plakate
      for (const [a, b] of [[0.7, 3.0], [4.3, 5.4]]) {
        P.glass(a * m, b * m, 0.08, oH - 0.05, { light: true, interior: 'empty' });
        P.rect(a * m + 0.2, a * m + 0.7, 0.1, 1.85, blue);
        P.rect(a * m + 0.2, a * m + 0.7, 2.0, 2.25, blue);
        P.text('Gothaer', a * m + 0.45, 2.125, 0.08, { color: '#ffffff', font: SERIF, weight: '700', maxW: 0.42 });
      }
      P.rect(1.55 * m, 2.25 * m, 0.95, 1.95, '#a8569a');                        // Plakate (nur Farbflächen)
      P.rect(4.75 * m, 5.25 * m, 1.0, 1.9, '#d9572f');
      P.door(3.1 * m, 4.2 * m, 0.02, oH - 0.05, { frame: fr, open: true });
      // Glücklich: Kleider an Puppen, Taschen und Geschenke, Hausnummer über der Tür
      P.glass(5.8 * m, 8.95 * m, 0.08, oH - 0.05, { light: true, interior: 'empty' });
      for (const [x, c] of [[6.35, '#c9b48f'], [6.95, '#e2708a'], [8.05, '#d9382e'], [8.55, '#e0463a']]) dress(P, x * m, 0.25, c);
      P.shrub(7.45 * m, 0.1, 0.6, 0.6);
      for (const [a, b] of [[9.35, 10.1], [11.0, 12.7], [12.85, 14.15]]) P.glass(a * m, b * m, 0.08, oH - 0.05, { light: true, interior: 'shop' });
      P.door(10.2 * m, 10.95 * m, 0.02, oH - 0.05, { frame: fr, glass: true });
      P.text('37', 10.57 * m, oH - 0.22, 0.13, { color: '#f2f2f2', weight: '700' });
      P.rect(12.1 * m, 13.6 * m, 0.55, 0.6, '#b08a5a');                          // Holzregal mit Waren vor dem Laden
      for (let x = 12.15 * m; x < 13.55 * m; x += 0.28) P.rect(x, x + 0.2, 0.6, 0.75 + P.rnd() * 0.12, `hsl(${P.rnd() * 360 | 0},40%,65%)`);
      for (const x of [0.25, 5.6, 9.2, 12.78]) P.board(x * m - 0.12, x * m + 0.12, oH - 0.6, oH - 0.36, { ellipse: true, bg: '#f4f4f0' });
      // Blendband mit zwei Schildern
      P.rect(0, W, b0, top, '#465049');
      P.rect(5.35 * m, 10.2 * m, b0 - 0.07, b0, '#465049');                      // Mittelteil etwas tiefer
      P.rect(0, W, top - 0.05, top, '#363d39');
      const s0 = b0 + 0.08, s1 = top - 0.07, sm = (s0 + s1) / 2;
      P.board(0.93 * m, 5.05 * m, s0, s1, { bg: '#ffffff', border: '#d6d6d6', borderW: 0.012 });
      P.text('Gothaer', 2.15 * m, sm, 0.34, { color: blue, font: SERIF, weight: '700', maxW: 2.2 * m });
      P.rect(3.38 * m, 3.4 * m, s0 + 0.08, s1 - 0.08, '#9a9a9a');
      P.text('Versicherungsbüro', 4.2 * m, sm + 0.08, 0.1, { color: '#333333', maxW: 1.5 * m });
      P.text('Much', 4.2 * m, sm - 0.09, 0.1, { color: '#333333', maxW: 1.5 * m });
      P.board(10.9 * m, 13.8 * m, s0, s1, { bg: '#f3f1ea', border: '#d8d4c8', borderW: 0.012 });
      P.text('GLÜCKLICH', 12.35 * m, sm + 0.02, 0.19, { color: '#6d6a64', weight: '400', spacing: 0.06, maxW: 2.5 * m });
    },
  },
  'Hauptstraße 39': {
    // Friseur ohne Namensschild: Schaufenster mit Frisurenplakaten, darüber ein Balkon über die ganze Breite mit
    // verschnörkeltem Eisengeländer und Geranien. full: auch das Obergeschoss mit den braunen Rollläden nach Foto.
    name: 'Friseur Hauptstraße 39', wall: 'house2', tint: '#f3f2ee', full: true,
    draw(P) {
      const { W, top } = P, m = W / 12.6, gf = P.full ? Math.min(SHOP_TOP, top) : top;
      const oH = Math.min(2.5, gf - 0.85), s0 = oH + 0.2, s1 = s0 + 0.32, fr = '#f6f6f4';   // s0..s1 = Balkonplatte
      P.plaster('#f3f2ee');
      P.plinthBand('#d6d5d0', 0.3);
      P.window(0.9 * m, 3.45 * m, 0.55, oH, { frame: fr, t: 0.07, interior: 'empty' });
      P.rect(1.55 * m, 2.85 * m, 0.7, oH - 0.12, '#5b6f86');                    // Frisurenplakate (nur Farbflächen)
      P.steps(3.5 * m, 5.3 * m, -P.plinth, 0.3, 2, '#bdbbb5');
      P.door(3.6 * m, 4.7 * m, 0.3, oH, { frame: fr, glass: true });
      P.glass(4.78 * m, 5.22 * m, 0.35, oH - 0.07, { light: true });
      P.rect(3.85 * m, 4.35 * m, 1.25, 1.65, '#f0c64a');                         // Aushang Öffnungszeiten
      P.window(5.3 * m, 10.65 * m, 0.55, oH, { frame: fr, t: 0.07, interior: 'empty' });
      P.rect(8.4 * m, 9.9 * m, 0.7, oH - 0.1, '#c9a36a');
      P.shrub(6.0 * m, 0.55, 0.7, 0.9);
      P.rect(5.38 * m, 5.42 * m, 0.3, 1.25, '#9aa0a6');                          // Handlauf an der Treppe
      P.rect(5.38 * m, 6.4 * m, 1.21, 1.25, '#9aa0a6');
      P.rect(0, W, s0 - 0.22, s0, 'rgba(0,0,0,0.1)');                            // Balkonplatte mit Schatten
      P.rect(0, W, s0, s1, '#efefed');
      P.rect(0, W, s0, s0 + 0.03, '#c6c6c2');
      if (!P.full) return;
      const eave = Math.min(P.eave, top), r0 = s1, r1 = s1 + 0.95;
      const w1 = Math.min(eave - 0.3, r0 + 2.1), w0 = Math.max(r0 + 0.35, w1 - 1.5);
      P.plaster('#f1f0ec', s1, top);
      for (const [a, b] of [[1.73, 5.8], [7.6, 9.75]]) {                         // braune Holzrollläden, geschlossen
        P.rect(a * m - 0.07, b * m + 0.07, w0 - 0.07, w1 + 0.07, '#e4e3df');
        P.rect(a * m, b * m, w0, w1, '#7a4a2a');
        for (let h = w0 + 0.05; h < w1; h += 0.06) P.rect(a * m, b * m, h, h + 0.012, 'rgba(0,0,0,0.2)');
      }
      // Eisengeländer mit Schlaufen, davor Blumenkästen mit roten Geranien
      const iron = '#26272a';
      P.rect(0, W, r1 - 0.05, r1, iron);
      P.rect(0, W, r0 + 0.08, r0 + 0.11, iron);
      for (let x = 0.06; x < W; x += 0.14) P.rect(x, x + 0.018, r0, r1, iron);
      for (let x = 0.06; x < W - 0.2; x += 0.28) P.board(x + 0.02, x + 0.26, r0 + 0.35, r1 - 0.12, { ellipse: true, bg: 'rgba(0,0,0,0)', border: iron, borderW: 0.018 });
      for (const [a, b] of [[0.83, 1.94], [2.9, 3.94], [5.2, 6.3], [7.68, 8.86], [10.03, 11.9]]) {
        P.rect(a * m, b * m, r0, r0 + 0.18, '#5d4b3c');
        for (let x = a * m + 0.06; x < b * m - 0.04; x += 0.11) {
          P.board(x - 0.07, x + 0.07, r0 + 0.14, r0 + 0.3, { ellipse: true, bg: '#3f7a3a' });
          if (P.rnd() < 0.6) P.board(x - 0.05, x + 0.05, r0 + 0.25, r0 + 0.37, { ellipse: true, bg: '#d8242c' });
        }
      }
    },
  },
  'Hauptstraße 41': {
    // levanta „duftendes & schönes“: zwei Schaufenster, Eingang mit Stufen dazwischen, breites helles Schild in Lila.
    // Die Hausnummer 41 hängt nebenan am Pfeiler des Durchgangs zu Elektronik Haas.
    name: 'levanta', wall: 'house2', tint: '#f4f4f1',
    draw(P) {
      const { W, top } = P, m = W / 11.1, oH = Math.min(2.5, top - 0.85), s0 = oH + 0.15, lila = '#6c5aa6', fr = '#f7f7f5';
      P.plaster('#f3f3f0');
      P.rect(0, W, -P.plinth, 0.48, '#c3b3a1');                                 // taupefarbener Sockel
      P.window(0.74 * m, 4.5 * m, 0.48, oH, { frame: fr, t: 0.08, interior: 'shop' });
      P.steps(4.45 * m, 6.4 * m, -P.plinth, 0.3, 2, '#55585c');
      P.rect(4.5 * m, 6.35 * m, 0.3, oH, fr);
      P.glass(4.58 * m, 5.3 * m, 0.35, oH - 0.08, { light: true, interior: 'shop' });
      P.door(5.36 * m, 6.3 * m, 0.3, oH - 0.03, { frame: fr, glass: true });
      P.window(6.4 * m, 10.55 * m, 0.48, oH, { frame: fr, t: 0.08, interior: 'shop' });
      P.text('levanta', 8.1 * m, oH - 0.3, 0.17, { color: '#ffffff', font: SERIF, style: 'italic', maxW: 1.2 * m });
      P.board(0.1 * m, 0.62 * m, 0.7, 1.9, { bg: '#f4f4f2', border: '#c9c9c6', borderW: 0.01 });   // Infotafel am Rand
      P.board(0, W, s0, top - 0.02, { bg: '#f4f2f8', border: '#e1deea', borderW: 0.012 });
      P.text('duftendes & schönes', 5.1 * m, top - 0.19, 0.1, { color: lila, maxW: 3.0 * m });
      P.text('levanta', 5.1 * m, s0 + (top - s0) * 0.36, 0.34, { color: lila, weight: '400', maxW: 3.0 * m });
    },
  },
  // Durchgang zu Elektronik Haas zwischen 41 und 43: ein 5 m tiefes Vordach über dem Durchgang, hinten die Türen. Im LoD2
  // ist das Vordach ein geschlossener Block (Uv5m, 2,7 m hoch); die Front kommt auf seine Straßenseite und zeigt den
  // Durchgang. Der Schildkasten steht oben auf der Vorderkante und ragt über den Block hinaus (above).
  'id:DENW46AL1000Uv5m': {
    name: 'Elektronik Haas', wall: 'plain', tint: '#9c7a5c', above: 1.0,
    draw(P) {
      const { W, top } = P, cH = Math.max(2.0, Math.min(2.6, P.eave - 0.08)), brick = '#9c7a5c';
      const pillar = (a, b) => {
        P.rect(a, b, -P.plinth, cH, brick);
        for (let h = 0.08; h < cH; h += 0.08) P.rect(a, b, h, h + 0.012, 'rgba(255,255,255,0.18)');
      };
      P.rect(0, W, -P.plinth, cH, '#25262a');                                   // dunkler Durchgang, hinten Glastüren
      P.rect(1.4, W - 0.7, -P.plinth, cH - 0.4, '#3a3b3e');
      P.rect(1.4, W - 0.7, -P.plinth, 0.02, '#55565a');
      P.door(2.2, 3.4, 0, cH - 0.7, { frame: '#4a4b4e', glass: true, double: true });
      P.rect(3.6, 4.3, 0, cH - 0.7, '#4a4b4e');
      pillar(0, 1.0); pillar(W - 0.4, W);
      P.rect(0.1, 0.28, 1.9, 2.12, '#e8b53c');                                   // Hausnummer am Pfeiler
      P.text('41', 0.19, 2.01, 0.12, { color: '#2b2b2b', weight: '700' });
      P.board(0.4, 0.92, 0.95, 1.85, { bg: '#f4f4f2' });                         // Infotafel
      P.text('ELEKTRONIK', 0.66, 1.7, 0.05, { color: '#1f56b8', weight: '800', maxW: 0.44 });
      P.text('Haas', 0.66, 1.57, 0.08, { color: '#1b2f6e', weight: '800', style: 'italic', maxW: 0.44 });
      for (let k = 0; k < 6; k++) P.rect(0.47, 0.85, 1.05 + k * 0.07, 1.08 + k * 0.07, 'rgba(60,60,60,0.35)');
      // Schildkasten über die ganze Breite
      const s0 = cH + 0.02, s1 = top - 0.03, sm = (s0 + s1) / 2, sx = Math.min(1, W / 5.5);
      P.board(0, W, s0, s1, { bg: '#f2f3f5', border: '#c8cbd0', borderW: 0.015 });
      P.board(0.1 * sx, 1.55 * sx, sm - 0.04, s1 - 0.07, { bg: '#1f56b8', border: '#f2c21b', borderW: 0.02 });
      P.text('ELEKTRONIK', 0.82 * sx, (sm + s1) / 2 - 0.02, 0.15, { color: '#ffffff', weight: '800', style: 'italic', maxW: 1.3 * sx });
      P.text('Verkauf • Service', 0.82 * sx, s0 + 0.15, 0.1, { color: '#1d1d1d', weight: '700', maxW: 1.4 * sx });
      P.text('Meisterbetrieb', 2.45 * sx, s1 - 0.1, 0.07, { color: '#1d1d1d', weight: '700', maxW: 1.1 * sx });
      P.text('Haas', 2.45 * sx, sm - 0.07, 0.32, { color: '#1b2f6e', weight: '900', style: 'italic', maxW: 1.4 * sx });
      const list = ['Unterhaltungselektronik', 'Telekommunikation / Vernetzung', 'Haushaltsgroß- und Kleingeräte', 'Empfangstechnik', 'Multimedia'];
      list.forEach((t, i) => P.text(t, 3.35 * sx, s1 - 0.09 - i * (s1 - s0 - 0.12) / 5, 0.05, { color: '#1d1d1d', weight: '700', align: 'left', maxW: W - 3.45 * sx }));
    },
  },
  'id:DENW46AL1000UrP2': { name: 'Durchgang Haas (hinten)', wall: 'plain', tint: '#efefed' },
  'Hauptstraße 43': {
    // Langes Geschäftshaus mit Erkern, Erdgeschoss zwischen Granitpfeilern. Von Westen: Durchgang mit Mülltonnen,
    // Ausstellung für Fenster und Türen, Post & Kiosk („Kangoo-Shop“, gelber Briefkasten, Postkartenständer), Café/Imbiss,
    // MEDO im flachen Vorbau unter der Dachterrasse. Im LoD2 springt die Front an jedem Erker vor und zurück (jog, gap).
    name: 'MEDO · Post & Kiosk', wall: 'house2', tint: '#d6d4cf', jog: 1.2, gap: 0.8,
    draw(P) {
      const { W, top } = P, m = W / 28.6, oH = Math.min(2.4, top - 0.95), b0 = oH + 0.42, teal = '#3cc7b4', fr = '#f4f4f2';
      P.plaster('#d3d1cc');                                                      // grauer Rauputz
      P.rect(0, W, -P.plinth, 0.1, '#8e8a84');
      P.rect(0, 1.5 * m, -P.plinth, b0, '#34363a');                              // Durchgang mit Mülltonnen
      P.rect(0.15 * m, 0.7 * m, 0, 1.1, '#3f6b3f');
      P.rect(0.78 * m, 1.32 * m, 0, 1.1, '#e0b52c');
      // Ausstellung: sechs Felder mit Oberlicht, darin Tür- und Fenstermuster
      for (let i = 0; i < 6; i++) P.window((1.75 + i * 0.95) * m, (2.7 + i * 0.95) * m, 0.12, oH, { frame: fr, t: 0.06, transom: 0.42, interior: 'empty' });
      P.rect(1.95 * m, 2.55 * m, 0.14, 1.95, '#f1f1ef');
      P.glass(2.07 * m, 2.43 * m, 1.05, 1.82, { light: true });
      P.rect(4.0 * m, 4.9 * m, 0.55, 1.65, '#e6e6e3');
      P.glass(4.08 * m, 4.82 * m, 0.63, 1.57, { light: true });
      P.rect(6.0 * m, 6.35 * m, 1.2, 1.5, '#ffffff');                            // Zettel an der Scheibe
      // Post & Kiosk: zwei Abschnitte, Schriftzug in den Oberlichtern
      for (let i = 0; i < 5; i++) {
        const a = (8.15 + i * 0.9) * m, b = a + 0.9 * m;
        P.window(a, b, 0.12, oH, { frame: fr, t: 0.05, transom: 0.42, interior: i % 2 ? 'display' : 'shop' });
        P.text('Kangoo-Shop', (a + b) / 2, oH - 0.21, 0.07, { color: teal, weight: '700', maxW: 0.8 * m });
      }
      P.window(13.25 * m, 14.4 * m, 0.12, oH, { frame: fr, t: 0.05, transom: 0.42, interior: 'shop' });
      P.door(14.4 * m, 15.6 * m, 0.02, oH, { frame: fr, glass: true, transom: 0.42 });
      P.window(15.6 * m, 16.85 * m, 0.12, oH, { frame: fr, t: 0.05, transom: 0.42, interior: 'shop' });
      P.window(16.85 * m, 18.15 * m, 0.12, oH, { frame: fr, t: 0.05, transom: 0.42, interior: 'shop' });
      P.text('Kangoo - Shop', 15.6 * m, oH - 0.21, 0.22, { color: teal, weight: '800', maxW: 3.6 * m });
      for (const [a, b] of [[13.45, 14.15], [16.25, 16.9], [17.1, 17.75]]) cards(P, a * m, b * m, 0.05, 1.85);
      P.rect(11.95 * m, 12.55 * m, 0, 1.15, '#f2c200');                           // gelber Briefkasten
      P.rect(11.95 * m, 12.55 * m, 1.15, 1.27, '#d4a900');
      P.rect(12.1 * m, 12.4 * m, 0.75, 0.95, '#f7f3e6');
      // Café/Imbiss: Speisekarte, Tür, Fenster, Tische davor
      P.rect(19.05 * m, 19.5 * m, 0.12, 2.2, '#7a2f28');
      for (let k = 0; k < 7; k++) P.rect(19.12 * m, 19.43 * m, 0.45 + k * 0.23, 0.5 + k * 0.23, 'rgba(255,238,215,0.75)');
      P.door(19.6 * m, 20.45 * m, 0.08, oH, { frame: '#9fa3a6', glass: true, transom: 0.42 });
      P.window(20.5 * m, 21.5 * m, 0.12, oH, { frame: '#9fa3a6', t: 0.05, transom: 0.42, interior: 'cafe' });
      P.window(21.5 * m, 23.35 * m, 0.12, oH, { frame: '#9fa3a6', t: 0.05, transom: 0.42, mullions: 1, interior: 'cafe' });
      for (const x of [19.2, 20.8, 22.2]) {
        P.rect(x * m, x * m + 0.7, 0.72, 0.77, '#7b5634');
        P.rect(x * m + 0.33, x * m + 0.37, 0, 0.72, '#3a3a3a');
      }
      // Granitpfeiler und Granitband über dem Erdgeschoss
      granite(P, 1.5 * m, 23.9 * m, oH, b0);
      for (const [a, b] of [[1.5, 1.75], [7.45, 8.15], [12.65, 13.25], [18.15, 18.95], [23.4, 23.9]]) granite(P, a * m, b * m, -P.plinth, b0);
      for (const x of [7.75, 12.95, 18.5]) P.rect(x * m - 0.05, x * m + 0.05, -P.plinth, top, '#5e4a3a');   // Fallrohre
      P.board(12.72 * m, 13.18 * m, b0 + 0.04, Math.min(top - 0.03, b0 + 0.5), { bg: '#f2c200' });      // Post-Schild
      // MEDO im flachen Vorbau: Sichtbetonbrüstung, Fenster, große Blende, senkrechtes Schild am Pfeiler
      const M0 = 23.9 * m, M1 = W - 0.05, mf = Math.min(top - 0.08, oH + 0.95);
      P.rect(M0, M1, -P.plinth, 0.55, '#b9b6b0');
      for (let x = M0 + 0.15; x < M1; x += 0.15) P.rect(x, x + 0.01, -P.plinth, 0.55, 'rgba(0,0,0,0.12)');
      P.door(M0 + 0.12, M0 + 1.0, 0.02, oH - 0.05, { frame: '#e8e8e6', glass: true });
      P.window(M0 + 1.08, M1 - 0.1, 0.55, oH - 0.05, { frame: '#e8e8e6', t: 0.05, mullions: 2, interior: 'cafe' });
      P.rect(M0, M1, oH - 0.05, mf, '#f7f7f5');
      P.rect(M0, M1, oH - 0.05, oH - 0.01, '#bdbdbd');
      P.text('MEDO', M0 + (M1 - M0) * 0.45, (oH + mf) / 2, 0.75, { color: '#151515', weight: '900', font: SERIF, spacing: 0.04, maxW: (M1 - M0) * 0.75 });
      P.rect(M1 - 0.75, M1 - 0.25, oH + 0.2, mf - 0.18, '#c4c6c8');
      for (let h = oH + 0.24; h < mf - 0.2; h += 0.07) P.rect(M1 - 0.75, M1 - 0.25, h, h + 0.02, '#9c9fa2');
      P.board(23.47 * m, 23.83 * m, 0.95, oH - 0.05, { bg: '#f7f7f5' });
      ['M', 'E', 'D', 'O'].forEach((c, i) => P.text(c, 23.65 * m, oH - 0.3 - i * 0.36, 0.28, { color: '#151515', weight: '900', font: SERIF }));
    },
  },
  'Hauptstraße 49': {
    // Fachwerkhaus (Hausnummer am Briefkasten) mit vorkragendem Obergeschoss und Balkenköpfen, im Ostteil die Fahrschule
    // Neukirchen; östlich daneben der Schotterparkplatz. full: auch das Obergeschoss nach Foto.
    name: 'Fahrschule Neukirchen', wall: 'fachwerk', tint: '#ffffff', full: true,
    draw(P) {
      const { W, top } = P, m = W / 13.3, beam = '#1f2226', bw = 0.15, eave = Math.min(P.eave, top), blue = '#2a6fd6';
      const V = (x, h0, h1, w = bw) => P.rect(Math.max(0, x * m - w / 2), Math.min(W, x * m + w / 2), h0, h1, beam);
      const H = (a, b, h) => P.rect(a * m, b * m, h, h + bw, beam);
      P.plaster('#f6f6f4');
      P.stone(0, W, -P.plinth, 0.3, [138, 128, 116]);                           // Bruchsteinsockel
      // Erdgeschoss: Schwelle, Ständer, Riegel, Strebe links, Rähm; darüber Balkenköpfe und die Schwelle des Obergeschosses
      H(0, 13.3, 0.3);
      for (const x of [0.08, 1.08, 2.32, 3.12, 4.28, 4.68, 5.88, 6.93]) V(x, 0.3, 2.86);
      V(13.08, 0.3, 2.86, 0.42);
      for (const [a, b] of [[0, 1.08], [2.32, 3.12], [4.28, 4.68], [5.88, 6.93]]) H(a, b, 0.95);
      H(0, 6.93, 2.35);
      brace(P, 0.15 * m, 1.1, 1.0 * m, 2.35, bw, beam);
      H(0, 13.3, 2.71);
      P.rect(0, W, 2.86, 3.02, 'rgba(0,0,0,0.35)');
      for (let x = 0.1; x < W - 0.1; x += 0.62) P.rect(x, x + 0.14, 2.86, 3.02, beam);
      P.rect(0, W, 3.02, 3.18, beam);
      // Haustür mit Glasstreifen, Briefkasten „49“, Fenster mit hellblauen Rollos
      P.steps(1.1 * m, 2.3 * m, -P.plinth, 0.3, 1, '#a59e92');
      P.rect(1.17 * m, 2.23 * m, 0.3, 2.37, '#f4f4f2');
      P.door(1.24 * m, 2.16 * m, 0.3, 2.3, { frame: '#f4f4f2', panel: '#efefed' });
      P.glass(1.55 * m, 1.68 * m, 0.55, 2.1, { light: true });
      P.rect(0.72 * m, 0.98 * m, 1.2, 1.5, '#4a4d52');
      P.text('49', 0.85 * m, 1.3, 0.07, { color: '#e6e6e6', weight: '700' });
      for (const [a, b] of [[3.2, 4.2], [4.76, 5.8]]) {
        P.window(a * m, b * m, 1.1, 2.3, { frame: '#f6f6f4', outer: '#ecebe7', t: 0.07 });
        P.rect(a * m + 0.07, b * m - 0.07, 1.17, 2.1, 'rgba(150,200,215,0.8)');
      }
      // Fahrschule: zwei große Schaufenster mit Milchglasfolie und Schriftzug, Tür dazwischen
      for (const [a, b] of [[7.1, 9.1], [10.15, 12.85]]) {
        P.rect(a * m - 0.12, b * m + 0.12, 0.3, 2.52, '#f3f3f1');
        P.rect(a * m - 0.12, b * m + 0.12, 0.3, 0.42, '#b8ad9c');
        P.glass(a * m, b * m, 0.42, 2.4, { interior: 'empty' });
        P.rect(a * m, b * m, 0.42, 1.3, 'rgba(226,231,233,0.82)');
      }
      P.door(9.15 * m, 10.1 * m, 0.12, 2.42, { frame: '#f3f3f1', glass: true, t: 0.1 });
      for (let k = 1; k < 3; k++) P.rect(9.15 * m + 0.1, 10.1 * m - 0.1, 1.95 + k * 0.13, 1.96 + k * 0.13, '#f3f3f1');
      P.text('POWER DAYS', 8.1 * m, 2.2, 0.15, { color: '#d8262c', weight: '800', maxW: 1.8 * m });
      P.text('7 Tage 1:1 Theorie', 8.1 * m, 2.0, 0.09, { color: '#d8262c', weight: '700', maxW: 1.8 * m });
      P.text('OPEN', 11.5 * m, 2.15, 0.11, { color: '#ff4a4a', weight: '700', stroke: '#2a5cc0' });
      for (const xc of [8.1, 11.5]) {
        P.text('Fahrschule', xc * m, 1.62, 0.2, { color: blue, style: 'italic', weight: '800', stroke: '#ffffff', maxW: 1.7 * m });
        P.text('NEUKIRCHEN', xc * m, 1.4, 0.12, { color: blue, weight: '800', stroke: '#ffffff', maxW: 1.6 * m });
        P.text('www.fahrschule-neukirchen.de', xc * m, 0.56, 0.055, { color: '#2b2b2b', weight: '700', maxW: 1.8 * m });
      }
      P.text('FAHRSCHULE', 11.5 * m, 1.05, 0.09, { color: '#2b2b2b', weight: '800' });
      P.rect(W - 0.08, W, -P.plinth, top, '#a7abae');                             // Fallrohr an der Ostecke
      if (!P.full) return;
      // Obergeschoss: Ständer, Brüstungs- und Sturzriegel, Rähm, Streben an beiden Enden, sechs Fenster
      const w1 = Math.min(eave - 0.35, 5.4), w0 = Math.min(4.1, w1 - 0.9);
      P.plaster('#f6f6f4', 3.18, top);
      for (const x of [0.08, 1.27, 2.22, 3.12, 4.12, 4.68, 5.78, 6.62, 7.32, 8.17, 9.12, 9.97, 10.67, 11.67]) V(x, 3.18, eave);
      V(13.21, 3.18, eave);
      H(0, 13.3, w0 - bw);
      H(0, 13.3, w1);
      H(0, 13.3, eave - bw);
      brace(P, 0.15 * m, 3.18, 1.2 * m, eave - bw, bw, beam);
      brace(P, 11.75 * m, eave - bw, 13.13 * m, 3.18, bw, beam);
      for (const [a, b] of [[1.35, 2.15], [3.2, 4.05], [4.76, 5.7], [7.4, 8.1], [9.2, 9.9], [10.75, 11.6]]) {
        P.window(a * m, b * m, w0, w1, { frame: '#f6f6f4', outer: '#ecebe7', t: 0.07, mullions: 1 });
      }
      if (top > eave + 0.1) P.slate(0, W, eave, top);
    },
  },
  'Hauptstraße 51': {
    // Weißer Bau mit zwei Eingängen über Stufen: Büro mit grünen Lamellen, Bioresonanzzentrum für Tiere
    name: 'Bioresonanzzentrum für Tiere', wall: 'house2', tint: '#f7f7f5',
    draw(P) {
      const { W, top } = P, m = W / 18.6, oH = Math.min(2.35, top - 1.0), fr = '#f8f8f6', green = '#3aa35a';
      P.plaster('#f5f5f3');
      P.plinthBand('#8f9499', 0.32);
      P.door(0.4 * m, 1.3 * m, 0.25, oH, { frame: fr, panel: '#f2f2f0' });      // weiße Nebentür
      P.window(1.9 * m, 3.95 * m, 0.55, oH, { frame: fr, t: 0.07 });
      P.rect(1.9 * m + 0.07, 3.95 * m - 0.07, 0.62, oH - 0.07, '#cdd6bd');      // grüne Lamellen
      for (let x = 1.9 * m + 0.1; x < 3.95 * m - 0.07; x += 0.09) P.rect(x, x + 0.012, 0.62, oH - 0.07, 'rgba(0,0,0,0.08)');
      for (const [a, b] of [[5.15, 7.65], [8.75, 11.5]]) P.steps(a * m, b * m, -P.plinth, 0.35, 2, '#b4b3ae');
      P.window(5.3 * m, 6.4 * m, 0.35, oH, { frame: fr, t: 0.07, interior: 'empty' });
      P.door(6.4 * m, 7.5 * m, 0.35, oH, { frame: fr, glass: true });
      P.door(8.9 * m, 10.1 * m, 0.35, oH, { frame: fr, glass: true });
      P.window(10.1 * m, 11.35 * m, 0.35, oH, { frame: fr, t: 0.07, frosted: 0.75 });
      P.text('Bioresonanz-', 10.72 * m, 1.75, 0.06, { color: '#2f3a44', weight: '700', maxW: 1.0 * m });
      P.text('zentrum für Tiere', 10.72 * m, 1.62, 0.06, { color: '#2f3a44', weight: '700', maxW: 1.0 * m });
      P.rect(8.3 * m, 8.55 * m, 1.6, 1.9, '#f3f3f1');                            // Briefkasten
      P.rect(11.8 * m - 0.05, 11.8 * m + 0.05, -P.plinth, top, '#a7abae');      // Fallrohr
      P.window(13.5 * m, 17.05 * m, 0.55, oH, { frame: fr, t: 0.07, interior: 'empty' });
      P.text('Bioresonanzzentrum für Tiere', 15.27 * m, oH - 0.2, 0.13, { color: green, weight: '700', maxW: 3.3 * m });
      for (const [x, h] of [[14.1, 1.55], [16.35, 1.45]]) easel(P, x * m, 0.62, h, '#6fa6d6');
      P.rect(15.0 * m, 15.6 * m, 0.62, 0.95, '#b48a55');                        // Korb
      P.rect(13.1 * m, 13.3 * m, oH + 0.35, oH + 0.6, '#ecece9');                // Wandleuchte
      P.rect(11.2 * m, 11.4 * m, top - 0.4, top - 0.1, '#d23a32');               // Alarmgeber
    },
  },
  'Hauptstraße 53': {
    // Weißer Bau mit grauem Sockel. Von Westen: BIANGA (goldene Buchstaben), Eingangsnische mit TintenPro und
    // Computer-Doktor über einem Podest mit Stufen, Systems Software Services
    name: 'TintenPro · BIANGA', wall: 'house2', tint: '#f7f7f5',
    draw(P) {
      const { W, top } = P, m = W / 21, oH = Math.min(2.3, top - 1.1), fr = '#f8f8f6', recH = Math.min(2.88, top - 0.5);
      P.plaster('#f5f5f3');
      P.plinthBand('#8f9499', 0.3);
      // BIANGA
      P.window(1.4 * m, 4.13 * m, 0.3, oH, { frame: fr, t: 0.1, interior: 'gallery' });
      P.text('BIANGA', 2.77 * m, oH + 0.42, 0.36, { color: '#c49a4a', font: SERIF, weight: '600', spacing: 0.06, maxW: 2.8 * m });
      for (const x of [1.1, 4.5]) P.rect(x * m - 0.05, x * m + 0.05, oH + 0.38, oH + 0.48, '#3a3a3a');
      for (const x of [5.0, 16.9]) P.rect(x * m - 0.05, x * m + 0.05, -P.plinth, top, '#a7abae');   // Fallrohre
      // Eingangsnische mit Podest, Glasfront mit Oberlichtern
      P.steps(6.85 * m, 15.5 * m, -P.plinth, 0.22, 2, '#c4c2bc');
      P.rect(7.0 * m, 15.0 * m, 0.22, recH, '#e4e4e1');
      P.rect(7.0 * m, 15.0 * m, recH - 0.12, recH, 'rgba(0,0,0,0.2)');
      const t0 = recH - 0.62;                                                      // Unterkante der Oberlichter
      for (const [a, b] of [[7.13, 8.07], [8.07, 9.33], [12.2, 13.6], [13.6, 14.8]]) {
        P.window(a * m, b * m, 0.22, recH - 0.12, { frame: fr, t: 0.07, transom: recH - 0.12 - t0, interior: 'empty' });
      }
      P.rect(7.3 * m, 7.9 * m, 0.5, 1.9, '#1d1d1f');                             // Plakat
      P.door(9.33 * m, 10.4 * m, 0.22, t0, { frame: fr, glass: true });
      P.glass(9.33 * m, 10.4 * m, t0 + 0.05, recH - 0.17, { light: true });
      P.rect(10.4 * m, 10.93 * m, 0.22, recH - 0.12, '#cfcfcc');
      P.door(10.93 * m, 12.2 * m, 0.22, t0, { frame: fr, glass: true });
      P.glass(10.93 * m, 12.2 * m, t0 + 0.05, recH - 0.17, { light: true });
      P.shrub(9.0 * m, 0.22, 0.45, 0.8);
      P.board(12.45 * m, 13.35 * m, 1.62, 2.08, { bg: '#ffffff' });                // Aushänge
      P.text('Tinte', 12.9 * m, 1.95, 0.08, { color: '#1f5fae', weight: '700' });
      P.text('Papier', 12.9 * m, 1.74, 0.08, { color: '#1f5fae', weight: '700' });
      P.board(13.75 * m, 14.65 * m, 1.6, 2.1, { bg: '#ffffff' });
      P.text('Drucker-', 14.2 * m, 1.95, 0.075, { color: '#1f5fae', weight: '700' });
      P.text('Patrone ?', 14.2 * m, 1.74, 0.075, { color: '#1f5fae', weight: '700' });
      P.rect(7.0 * m, 7.13 * m, 0.22, recH, '#d6d6d3');                          // Laibungen
      P.rect(14.8 * m, 15.0 * m, 0.22, recH, '#d6d6d3');
      P.board(11.67 * m, 13.4 * m, recH + 0.07, top - 0.03, { bg: '#ffffff', border: '#cfd3d8', borderW: 0.012 });
      P.text('TintenPro', 12.53 * m, (recH + top) / 2 + 0.02, 0.24, { color: '#1f5fae', style: 'italic', weight: '800', maxW: 1.55 * m });
      P.board(15.4 * m, 16.15 * m, oH + 0.3, oH + 0.78, { bg: '#e6e8ea', border: '#b9bdc1', borderW: 0.01 });
      P.text('Computer', 15.77 * m, oH + 0.63, 0.06, { color: '#2c3e5c', font: SERIF, maxW: 0.65 * m });
      P.text('Doktor', 15.77 * m, oH + 0.47, 0.06, { color: '#2c3e5c', font: SERIF, maxW: 0.65 * m });
      // Systems Software Services
      P.window(17.5 * m, 19.85 * m, 0.5, oH, { frame: fr, t: 0.08, interior: 'poster' });
      for (const [x, h] of [[17.9, 1.5], [18.4, 1.7], [18.85, 1.45], [19.3, 1.65]]) P.rect(x * m, x * m + 0.28, h, h + 0.36, '#f4f1dc');
      const s0 = oH + 0.32, s1 = Math.min(top - 0.1, oH + 0.82);
      P.board(17.3 * m, 20.1 * m, s0, s1, { bg: '#f7f7f9', border: '#9aa3b5', borderW: 0.012 });
      P.board(17.38 * m, 17.75 * m, s0 + 0.06, s1 - 0.06, { bg: '#6d9fb8' });
      P.text('Systems Software Services', 18.95 * m, s1 - 0.17, 0.12, { color: '#1f2f6b', font: SERIF, weight: '700', maxW: 2.2 * m });
      P.text('DESKTOP TO MAINFRAME SOLUTIONS seit 1985', 18.95 * m, s0 + 0.11, 0.05, { color: '#1f2f6b', font: SERIF, maxW: 2.2 * m });
      P.rect(20.3 * m, 20.45 * m, top - 0.4, top - 0.1, '#d23a32');               // Alarmgeber
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

  // ---------- Südseite westlich vom Hazal: Parkplatz, dann Nr. 36–48 (Vorlage: Street-View-Bilder des Users, 24.11.) ----------
  // Die Fronten zeigen nach Norden: links im Bild = Osten. Nr. 38 und 44 springen oft kurz vor und zurück (jog).
  'Hauptstraße 36': {
    name: 'Billard-Vereinsheim', wall: 'house2', tint: '#f3e4a6',             // gelber Putz, schwarzes Blendband überm Laden
    draw(P) {
      const { W, top } = P, m = W / 16.5, b0 = Math.min(2.9, top - 0.45);   // b0 = Unterkante des Blendbands
      P.plaster('#f4f3ef');                                                   // weiße Ladenrahmung
      P.rect(0, W, -P.plinth, 0.08, '#c9c9c4');
      const win = (x0, x1, h0, word) => {
        P.window(x0, x1, h0, b0 - 0.08, { frame: '#1c1c1c', t: 0.05, interior: 'empty' });
        blinds(P, x0 + 0.05, x1 - 0.05, h0 + 0.05, b0 - 0.13);
        if (word) P.text(word, (x0 + x1) / 2, h0 + (b0 - h0) * 0.48, 0.24, { color: '#1a1a1a', weight: '800', spacing: 0.02, maxW: (x1 - x0) * 0.6 });
      };
      win(0.15 * m, 3.35 * m, 0.6, 'BILLARD');
      win(3.5 * m, 6.9 * m, 0.6, 'DART');
      P.rect(7.15 * m, 11.05 * m, 0, b0, '#1e1f21');                          // Eingang: Glastür mit Seitenteilen
      P.glass(7.25 * m, 8.55 * m, 0.1, b0 - 0.45, { light: true });
      P.door(8.6 * m, 9.95 * m, 0.02, b0 - 0.45, { frame: '#1e1f21', glass: true });
      P.glass(10.0 * m, 10.95 * m, 0.1, b0 - 0.45, { light: true });
      P.glass(7.25 * m, 10.95 * m, b0 - 0.4, b0 - 0.08, { light: true });
      P.text('BILLARD', 9.27 * m, 1.55, 0.12, { color: '#1a1a1a', weight: '800', maxW: 1.1 * m });
      P.board(7.6 * m, 8.4 * m, 0.45, 1.25, { ellipse: true, bg: '#1f4fa0', border: '#e8e8e8', borderW: 0.03 });
      P.text('PBC Much e.V.', 8.0 * m, 0.85, 0.07, { color: '#ffffff', weight: '700', maxW: 0.6 * m });
      win(11.6 * m, 16.1 * m, 0.25);
      P.rect(0, W, b0, top, '#1b1b1c');                                       // Blendband
      P.rect(12.8 * m, W, b0 - 0.12, b0 + 0.38, '#77705a');                   // kleines Vordach über dem rechten Fenster
      P.rect(12.8 * m, W, b0 - 0.12, b0 - 0.06, '#57513f');
      P.board(7.2 * m, 9.85 * m, b0 - 0.02, top - 0.02, { bg: '#f6f6f4', border: '#bdbdbd', borderW: 0.015 });
      P.text('BILLARD', 8.7 * m, b0 + (top - b0) * 0.62, 0.2, { color: '#161616', weight: '800', spacing: 0.02, maxW: 1.6 * m });
      P.text('Vereinsheim', 8.7 * m, b0 + (top - b0) * 0.22, 0.08, { color: '#161616', maxW: 1.6 * m });
    },
  },
  'Hauptstraße 38': {
    // Von Osten: Durchfahrt zum Hof, Zahnärzte, Treppenhaus mit Hausnummer, Ernsting's family – Erdgeschoss auf einer
    // Terrasse mit Sandsteinsockel und Geländer
    name: "Zahnärzte Much · Ernsting's family", wall: 'house2', tint: '#f2e9c2', jog: 2.2,
    draw(P) {
      const { W, top } = P, m = W / 21.6, t0 = 0.6, oH = Math.min(2.75, top - 0.3);   // t0 = Höhe der Terrasse
      P.plaster('#efe6bd');
      const a0 = 0.3 * m, a1 = 3.1 * m, aH = Math.min(2.75, top - 0.25);       // Durchfahrt: dunkel, hinten der helle Hof
      P.rect(a0, a1, -P.plinth, aH, '#2a2a28');
      P.rect(a0 + 0.5, a1 - 0.5, -P.plinth, aH - 0.7, '#4a4c4a');
      P.rect(a0 + 0.9, a1 - 0.9, -P.plinth, 1.0, '#8d918c');
      P.stone(3.3 * m, W, -P.plinth, t0, [176, 160, 138]);                    // Sandsteinsockel, Treppe an der Durchfahrt
      P.steps(3.3 * m, 4.6 * m, -P.plinth, t0, 4, '#a39a8c');
      // Zahnärzte: Sandsteinrahmen, zwei Fenster und Tür
      P.rect(3.3 * m, 9.3 * m, t0, top, '#bba98d');
      P.window(3.6 * m, 5.4 * m, t0 + 0.1, oH - 0.45, { frame: '#5a5e63', t: 0.06, interior: 'shop' });
      P.door(5.6 * m, 7.2 * m, t0, oH - 0.45, { frame: '#5a5e63', glass: true, double: true });
      P.window(7.4 * m, 9.1 * m, t0 + 0.1, oH - 0.45, { frame: '#5a5e63', t: 0.06, interior: 'empty' });
      P.board(3.6 * m, 5.4 * m, oH - 0.38, oH + 0.05, { bg: '#e7e7e4' });
      P.text('ZAHNTECHNIK', 4.5 * m, oH - 0.16, 0.12, { color: '#3b3f44', weight: '600', spacing: 0.01, maxW: 1.6 * m });
      P.board(5.5 * m, 7.9 * m, oH - 0.4, oH + 0.1, { bg: '#4a4d52' });
      P.run([['ZAHNÄRZTE ', '#e8452c', '800'], ['MUCH', '#ffffff', '700']], 6.7 * m, oH - 0.23, 0.17, { maxW: 2.2 * m });
      // Treppenhaus mit Hausnummer
      P.rect(9.3 * m, 11.8 * m, t0, top, '#d9d6cc');
      P.door(9.6 * m, 10.6 * m, t0, oH, { frame: '#7b8086', glass: true });
      P.glass(10.7 * m, 11.6 * m, t0 + 0.1, top - 0.05, { light: true });
      for (let k = 1; k < 4; k++) P.rect(10.7 * m, 11.6 * m, t0 + k * 0.9 - 0.025, t0 + k * 0.9 + 0.025, '#7b8086');
      P.number('38', 9.45 * m, 2.1, 0.16);
      // Ernsting's family: Schaufenster mit Kinderkleidung, Markise mit bunter Volantkante
      const e0 = 11.9 * m, e1 = 21.4 * m;
      P.window(e0, 15.6 * m, t0 + 0.05, oH, { frame: '#9ea3a8', t: 0.05, mullions: 1, interior: 'shop' });
      P.door(15.75 * m, 16.95 * m, t0, oH, { frame: '#9ea3a8', glass: true });
      P.window(17.1 * m, e1, t0 + 0.05, oH, { frame: '#9ea3a8', t: 0.05, mullions: 1, interior: 'shop' });
      P.rect(e0 + 0.1, e0 + 1.2, t0 + 0.2, oH - 0.1, '#4f8fd0');              // Plakat (nur Farbfläche)
      for (const [x, h] of [[13.6, 1.9], [14.6, 1.5], [18.0, 2.0], [19.8, 1.7]]) {   // „50 %“-Aufkleber
        P.rect(x * m, x * m + 0.42, h, h + 0.32, '#d8262c');
        P.text('50%', x * m + 0.21, h + 0.16, 0.12, { color: '#ffffff', weight: '800' });
      }
      clothes(P, 12.6 * m, 15.4 * m, t0 + 0.05, t0 + 1.15);
      clothes(P, 17.6 * m, 20.9 * m, t0 + 0.05, t0 + 1.2);
      awning(P, e0 - 0.2, e1 + 0.15, oH - 0.2, top);
      P.board(9.4 * m, 11.7 * m, top - 0.42, top - 0.04, { bg: '#ffffff', border: '#e0e0e0', borderW: 0.015 });
      P.text("Ernsting's family", 10.55 * m, top - 0.23, 0.12, { color: '#d43c2f', font: SCRIPT, weight: '700', maxW: 2.1 * m });
      railing(P, 4.6 * m, W, t0, t0 + 0.95);
    },
  },
  'Hauptstraße 40': {
    name: 'Provinzial · Mucher Pflegedienst', wall: 'house2', tint: '#f7f7f5',
    draw(P) {
      const { W, top } = P, m = W / 9.2, oH = Math.min(2.7, top - 0.6), gr = '#1f8a3c';
      P.plaster('#f6f6f4'); P.plinthBand('#9a9d9f', 0.12);
      P.steps(3.0 * m, 5.6 * m, -P.plinth, 0.3, 2, '#b4b4b0');
      P.window(0.02 * m, 1.72 * m, 0.25, oH, { frame: '#f4f4f2', t: 0.06, interior: 'shop' });
      P.rect(1.72 * m, 1.95 * m, 0.25, oH, gr);
      P.window(1.97 * m, 3.0 * m, 0.25, oH, { frame: '#f4f4f2', t: 0.06, interior: 'empty' });
      P.door(3.1 * m, 4.05 * m, 0.3, oH, { frame: '#f4f4f2', glass: true });
      P.number('40', 4.27 * m, oH - 0.4, 0.13);
      P.door(4.45 * m, 5.45 * m, 0.3, oH, { frame: '#f4f4f2', glass: true });
      P.rect(5.8 * m, 6.05 * m, 0.25, oH, gr);
      P.window(6.08 * m, 8.45 * m, 0.25, oH, { frame: '#f4f4f2', t: 0.06, interior: 'cafe' });
      P.text('Mucher Pflegedienst', 7.27 * m, oH - 0.6, 0.12, { color: '#ffffff', weight: '700', maxW: 1.9 * m });
      const s0 = oH + 0.12, s1 = top - 0.04;                                  // Schilder: Provinzial (grün), Pflegedienst
      P.board(0, 2.65 * m, s0, s1, { bg: '#d9dbdc' });
      P.board(0, 1.55 * m, s0 + 0.04, s1 - 0.04, { bg: gr });
      P.text('PROVINZIAL', 0.78 * m, (s0 + s1) / 2, 0.22, { color: '#ffffff', weight: '800', maxW: 1.4 * m });
      P.board(1.6 * m, 2.6 * m, s0 + 0.06, s1 - 0.06, { bg: gr, border: '#ffffff', borderW: 0.015 });
      P.text('Geschäftsstelle', 2.1 * m, (s0 + s1) / 2 + 0.06, 0.065, { color: '#ffffff', weight: '700', maxW: 0.9 * m });
      P.text('Boris Wisser', 2.1 * m, (s0 + s1) / 2 - 0.06, 0.065, { color: '#ffffff', weight: '700', maxW: 0.9 * m });
      P.board(2.65 * m, 3.75 * m, s0, s1, { bg: '#c9cbcd' });
      P.board(3.75 * m, 9.15 * m, s0, s1, { bg: '#f1f2f4', border: '#d4d6d9', borderW: 0.015 });
      P.text('Mucher Pflegedienst', 6.45 * m, (s0 + s1) / 2, 0.24, { color: '#2e3034', weight: '700', maxW: 4.4 * m });
    },
  },
  'Hauptstraße 42': {
    name: 'Lebenshilfe Rhein Sieg', wall: 'house2', tint: '#eef0f2',           // modern, Büro im Erdgeschoss, 4 m hinter Nr. 40
    draw(P) {
      const { W, top } = P, m = W / 9.5, oH = Math.min(2.55, top - 0.7), fr = '#3c4045';
      P.plaster('#f3f4f5'); P.plinthBand('#8e9398', 0.12);
      P.rect(0.3 * m, 6.0 * m, oH, top, '#5c6166');                           // dunkles Band über dem Büro
      P.rect(0.4 * m, 5.9 * m, 0.1, oH, fr);
      for (const [a, b] of [[0.45, 1.75], [1.8, 3.4], [3.45, 4.95]]) P.glass(a * m, b * m, 0.16, oH - 0.06, { light: true, interior: 'empty' });
      P.door(5.0 * m, 5.85 * m, 0.1, oH, { frame: fr, glass: true });
      P.text('Lebenshilfe Rhein Sieg e.V.', 3.0 * m, oH - 0.32, 0.13, { color: '#ffffff', weight: '700', maxW: 3.2 * m });
      P.canopy(6.6 * m, 8.6 * m, oH + 0.15, 0.08, '#55595e');
      P.door(7.0 * m, 8.1 * m, 0.12, oH - 0.05, { frame: '#4a4e53', panel: '#4a4e53' });
      P.number('42', 8.35 * m, 1.9, 0.14);
      P.rect(6.3 * m, 6.75 * m, 0.9, 1.5, '#9ea3a8');                          // Briefkästen
    },
  },
  // Haus 44: langer Bau mit Fachwerkgiebeln. Vor dem Erdgeschoss liegt ein Laubengang unter einem Vordach mit dunklem
  // Blendband; im LoD2 ist das Vordach ein eigener Block bis zum Boden („Überdachung“, ohne Hausnummer), der die
  // Ladenwände verdeckt. Die Läden kommen deshalb auf seine Straßenseite: Ostteil (leerer Laden, ARTHEM, darüber
  // Studienkreis), Mitte (Eingang „Haus 44“), Westteil (Bergische Apotheke, Ergotherapie).
  'Hauptstraße 44': { name: 'Haus 44', wall: 'fachwerk', tint: '#ffffff' },
  'id:DENW46AL2Yc0004A': {
    name: 'Haus 44 (Ostteil)', wall: 'house2', tint: '#f4f4f2', near: [111.3, -38.8],
    draw(P) {
      const { W, top } = P, m = W / 19.7, f0 = 0.8, oH = Math.min(2.65, top - 0.6), fr = '#3a3d41';
      P.plaster('#f3f3f1');
      P.rect(1.0 * m, 15.9 * m, f0 - 0.05, oH, fr);
      P.glass(1.1 * m, 4.95 * m, f0 + 0.05, oH - 0.08, {});                     // leerer Laden mit Lamellen
      blinds(P, 1.1 * m, 4.95 * m, f0 + 0.05, oH - 0.08);
      P.door(5.1 * m, 7.5 * m, f0, oH - 0.05, { frame: fr, glass: true, double: true });
      P.rect(5.55 * m, 5.95 * m, f0 + 0.9, f0 + 1.35, '#ffffff');              // Aushang
      for (const [a, b] of [[7.8, 10.5], [10.6, 13.2], [13.3, 15.8]]) P.glass(a * m, b * m, f0 + 0.05, oH - 0.08, { light: true });
      for (const x of [8.4, 9.7, 11.3, 12.5, 15.2]) {                           // ARTHEM: Bilder auf Staffeleien
        P.rect(x * m - 0.02, x * m + 0.02, f0 + 0.05, f0 + 1.45, '#a8865a');
        P.rect(x * m - 0.3, x * m + 0.3, f0 + 0.75, f0 + 1.35, `hsl(${P.rnd() * 360 | 0},45%,${45 + P.rnd() * 20 | 0}%)`);
      }
      P.rect(13.75 * m, 13.75 * m + 0.9, f0 + 0.5, f0 + 1.4, '#1e1f23');
      P.board(13.75 * m + 0.15, 13.75 * m + 0.75, f0 + 0.65, f0 + 1.25, { ellipse: true, bg: '#d4a62a' });
      P.board(8.0 * m, 12.4 * m, oH - 0.55, oH - 0.14, { bg: '#f7f5ef' });
      P.text('20 Jahre ARTHEM', 10.2 * m, oH - 0.345, 0.2, { color: '#3a3a3a', font: SERIF, maxW: 4.0 * m });
      P.stone(0.9 * m, 5.0 * m, -P.plinth, f0 + 0.05, [150, 142, 128]);       // Steinmauern, Treppe in der Mitte
      P.stone(7.6 * m, 15.9 * m, -P.plinth, f0, [150, 142, 128]);
      P.steps(5.0 * m, 7.6 * m, -P.plinth, f0, 5, '#9c978e');
      arcade(P, 15.9 * m, W, oH, [17.6 * m]);                                  // Laubengang zum Eingang „Haus 44“
      P.rect(0.8 * m, W, oH, top, '#4d5156');                                  // Blendband mit Studienkreis-Schild
      P.board(12.3 * m, 15.6 * m, oH + 0.08, top - 0.05, { bg: '#d8222a' });
      P.text('Studienkreis', 13.95 * m, oH + (top - oH) * 0.6, 0.24, { color: '#ffffff', weight: '800', maxW: 3.0 * m });
      P.text('Profi-Nachhilfe', 13.95 * m, oH + (top - oH) * 0.25, 0.08, { color: '#ffffff', weight: '600', maxW: 3.0 * m });
    },
    more: [{
      name: 'Haus 44 (Eingang)', near: [99.1, -39.9],
      draw(P) {
        const { W, top } = P, oH = Math.min(2.65, top - 0.6);
        arcade(P, 0, W, oH, []);
        P.door(0.25, W - 0.25, 0, oH - 0.55, { frame: '#3a3d41', glass: true, double: true });
        P.rect(0, W, oH, top, '#4d5156');
        P.board(0.1, W - 0.1, oH + 0.08, top - 0.08, { bg: '#2f5fa8', border: '#ffffff', borderW: 0.02 });
        P.text('Haus 44', W / 2, (oH + top) / 2, 0.24, { color: '#ffffff', weight: '700', maxW: W - 0.4 });
      },
    }, {
      name: 'Haus 44 (Westteil)', near: [86.7, -40.05],
      draw(P) {
        const { W, top } = P, m = W / 19.8, oH = Math.min(2.65, top - 0.6), fr = '#3a3d41', blue = '#2f6fb5';
        P.plaster('#f3f3f1');
        arcade(P, 0, 4.0 * m, oH, [1.5 * m, 3.1 * m]);                         // Laubengang mit Schaukästen
        P.rect(4.0 * m, W, -P.plinth, oH, fr);
        for (const [a, b] of [[4.3, 6.2], [6.3, 8.2], [8.3, 10.1]]) P.glass(a * m, b * m, 0.35, oH - 0.08, { light: true, interior: 'pharmacy' });
        P.door(10.3 * m, 11.6 * m, 0, oH - 0.05, { frame: fr, glass: true });
        P.door(11.8 * m, 13.3 * m, 0, oH - 0.05, { frame: fr, glass: true });    // Ergotherapie: Tür und Milchglasfenster
        P.rect(11.95 * m, 13.15 * m, 0.3, oH - 0.6, 'rgba(236,240,242,0.85)');
        P.text('Praxis für', 12.55 * m, 1.75, 0.07, { color: blue, maxW: 1.1 * m });
        P.text('Ergotherapie', 12.55 * m, 1.6, 0.07, { color: blue, maxW: 1.1 * m });
        for (const [a, b] of [[13.45, 16.5], [16.6, 19.7]]) P.glass(a * m, b * m, 0.1, oH - 0.08, { frosted: 0.85 });
        P.text('Praxis für Ergotherapie', 15.0 * m, 1.95, 0.15, { color: blue, font: SERIF, maxW: 2.8 * m });
        P.text('Frank Erdmann', 15.0 * m, 1.0, 0.13, { color: blue, font: SERIF, maxW: 2.8 * m });
        P.stone(5.5 * m, 10.2 * m, -P.plinth, 0.4, [168, 152, 130]);            // Steinmauern vor dem Laden
        P.stone(13.4 * m, W, -P.plinth, 0.55, [168, 152, 130]);
        P.rect(0, W, oH, top, '#55595e');                                      // Blendband, Apothekenschild darunter
        P.board(4.35 * m, 9.9 * m, oH - 0.42, oH + 0.06, { bg: '#ffffff', border: '#d8dcd8', borderW: 0.015 });
        P.text('Bergische Apotheke', 7.12 * m, oH - 0.18, 0.28, { color: '#43a047', style: 'italic', weight: '700', font: SERIF, maxW: 5.0 * m });
      },
    }],
  },
  'Hauptstraße 48': {
    // Links daneben das Westende von Haus 44 (Apothekenschild), rechts die Einfahrt zum Parkplatz, dahinter der Rathaus-Grill
    name: 'Renani fashion trends', wall: 'house2', tint: '#f1f1ef',
    draw(P) {
      const { W, top } = P, m = W / 10.95, oH = Math.min(2.6, top - 0.75), post = '#3b302b';
      P.plaster('#f0f0ee'); P.plinthBand('#6f6a64', 0.15);
      for (const [a, b] of [[1.5, 3.23], [3.53, 5.26], [6.62, 8.35], [8.65, 10.45]]) P.window(a * m, b * m, 0.15, oH, { frame: post, t: 0.05, interior: 'shop' });
      P.rect(5.56 * m, 6.62 * m, 0, oH, '#2a2522');                             // Eingangsnische, Tür offen
      P.door(5.66 * m, 6.52 * m, 0.02, oH - 0.3, { frame: post, open: true });
      for (const [a, b] of [[1.0, 1.5], [3.23, 3.53], [5.26, 5.56], [6.54, 6.62], [8.35, 8.65], [10.45, 10.95]]) P.rect(a * m, b * m, -P.plinth, oH, post);
      for (const x of [1.13, 3.29, 8.53, 10.8]) P.board(x * m - 0.13, x * m + 0.13, 2.0, 2.26, { ellipse: true, bg: '#f4f4f0' });   // Kugelleuchten
      clothes(P, 1.2 * m, 3.1 * m, 0.25, 1.3);                                  // Kleiderständer vor den Fenstern
      clothes(P, 3.7 * m, 5.1 * m, 0.25, 1.3);
      clothes(P, 6.9 * m, 8.2 * m, 0.25, 1.3);
      clothes(P, 9.0 * m, 10.6 * m, 0.25, 1.3);
      P.rect(0.45 * m, W, oH, top - 0.12, '#3a3b3d');                           // Blende: dunkler Kasten, Mitte höher
      P.rect(4.4 * m, 7.1 * m, oH, top, '#3a3b3d');
      P.rect(0.45 * m, W, oH, oH + 0.05, '#2a2b2d');
      P.board(4.59 * m, 6.92 * m, oH + 0.1, top - 0.05, { bg: '#fbfbfa' });
      P.text('RENANI', 5.75 * m, oH + (top - oH) * 0.62, 0.26, { color: '#2b2b2b', font: SERIF, weight: '600', spacing: 0.03, maxW: 1.9 * m });
      P.text('fashion trends', 5.75 * m, oH + (top - oH) * 0.27, 0.12, { color: '#2b2b2b', font: SERIF, weight: '400', maxW: 1.9 * m });
    },
  },
  'Hauptstraße 50': {
    // Rathaus-Grill: Eckhaus westlich der Einfahrt neben Renani; Erdgeschoss mit weißen Klinkerriemchen, oben gelber Putz.
    // Linker Teil nach Foto (Ecke, Fenster, Speisekarte, Tür); den rechten Teil zeigt kein Bild – dort nur weitergeführt.
    name: 'Rathaus-Grill', wall: 'house2', tint: '#f1e3a8',
    draw(P) {
      const { W, top } = P, oH = Math.min(2.3, top - 0.9), wood = '#b39b6c', s0 = oH + 0.42, s1 = Math.min(oH + 0.82, top - 0.12);
      tiles(P, 0, W, -P.plinth, s1 + 0.1);
      P.plaster('#efe0a6', s1 + 0.1, top);                                    // gelber Putz darüber
      P.rect(0, W, -P.plinth, 0.05, '#b9b9b4');
      P.rect(0.08, 0.2, -P.plinth, top, '#a7abae');                            // Fallrohr an der Ecke
      const win = (x0, x1) => {
        P.window(x0, x1, 0.2, oH, { frame: '#d7d7d3', t: 0.06, interior: 'cafe' });
        P.rect(x0 - 0.06, x1 + 0.06, 0.12, 0.2, '#c9c9c5');
      };
      win(3.5, 5.3);
      P.rect(5.85, 6.75, 1.0, 2.1, wood);                                      // Speisekartenkasten
      P.rect(5.93, 6.67, 1.08, 2.02, '#f4f2ea');
      P.steps(6.9, 9.0, -P.plinth, 0.1, 1, '#b5634a');                         // rotbraune Stufe
      P.door(7.0, 8.9, 0.1, oH, { frame: wood, glass: true, double: true });
      P.rect(9.1, 9.4, 1.3, 1.6, '#f0f0ee');                                   // Klingelkasten
      for (const x0 of [10.6, 13.4]) if (x0 + 1.8 < W - 0.3) win(x0, x0 + 1.8);
      const a = 2.0, b = Math.min(W - 0.2, 9.6);                               // Schild weiß mit grünem Rand, Lampen darüber
      P.board(a, b, s0, s1, { bg: '#fbfbf8', border: '#2f6b3a', borderW: 0.03, radius: 0.12 });
      P.text('SCHNELL-RESTAURANT', (a + b) / 2, s1 - 0.1, 0.085, { color: '#1d1d1d', weight: '700', spacing: 0.02, maxW: (b - a) * 0.5 });
      P.text('Rathaus-Grill', (a + b) / 2, s0 + 0.14, 0.18, { color: '#1d1d1d', font: '"Old English Text MT", "UnifrakturMaguntia", Georgia, serif', weight: '700', maxW: (b - a) * 0.5 });
      for (let x = 2.4; x < b; x += 1.0) {
        P.rect(x - 0.015, x + 0.015, s1, top - 0.08, '#d9d9d6');
        P.board(x - 0.14, x + 0.14, top - 0.16, top - 0.04, { ellipse: true, bg: '#f2f2f0', border: '#c9c9c6', borderW: 0.01 });
      }
    },
  },

  // ---------- Westlich vom Kirchplatz und gegenüber (Vorlage: Street-View-Bilder des Users vom 24.11.) ----------
  'Hauptstraße 12': {
    name: 'Hauptstraße 12', wall: 'house2', tint: '#f6f6f4',             // weißes Giebelhaus am Kirchplatz
    draw(P) {
      const { W, top } = P, oH = Math.min(2.45, top - 0.8);
      P.plaster('#f3f3f1'); P.plinthBand('#8d9196', 0.42);
      P.window(0.06 * W, 0.36 * W, 0.62, oH, { frame: '#f7f7f5', outer: '#d9dadb', t: 0.08, mullions: 1, transom: 0.5, interior: 'poster' });
      P.steps(0.42 * W, 0.58 * W, -P.plinth, 0.42, 2, '#a7a49e');
      P.door(0.44 * W, 0.56 * W, 0.42, oH, { frame: '#f7f7f5', glass: true, transom: 0.45 });
      P.window(0.64 * W, 0.92 * W, 0.62, oH, { frame: '#f7f7f5', outer: '#d9dadb', t: 0.08, mullions: 1, interior: 'poster' });
      P.rect(0.7 * W, 0.78 * W, 1.0, 1.7, 'rgba(232,120,40,0.75)');           // orangefarbenes Plakat im Fenster
      P.rect(0, W, top - 0.5, top - 0.44, 'rgba(0,0,0,0.08)');                // Gesimslinie über dem Erdgeschoss
    },
  },
  'Hauptstraße 14': {
    name: 'Haetham Hair Style', wall: 'slate', tint: '#ffffff',             // Schieferhaus, Friseur über Stufen
    draw(P) {
      const { W, top } = P, gf = 0.7, oH = top - 0.45;
      P.slate(0, W, 0, top);
      P.rect(0, W, -P.plinth, gf, '#5f6269');                                 // grauer Sockel
      P.rect(0.62 * W, 0.66 * W, 0.15, 0.3, '#3a3d42');                        // Kellerlüftung
      P.rect(0, W, gf, oH + 0.12, '#f3f3f1');                                  // weißer Ladenrahmen
      const grid = (x0, x1, cols, poster) => {
        P.window(x0, x1, gf + 0.12, oH - 0.08, { frame: '#f6f6f4', t: 0.06, mullions: cols - 1 });
        for (let k = 1; k < 3; k++) P.rect(x0, x1, gf + 0.12 + (oH - gf - 0.2) * k / 3 - 0.025, gf + 0.12 + (oH - gf - 0.2) * k / 3 + 0.025, '#f6f6f4');
        if (poster) {                                                            // schwarze Werbefolie unten im Fenster
          P.rect(x0 + 0.06, x1 - 0.06, gf + 0.18, gf + 0.85, '#141414');
          P.text('HAETHAM', (x0 + x1) / 2, gf + 0.6, 0.12, { color: '#c9a24c', font: SERIF, weight: '700', maxW: (x1 - x0) * 0.4 });
          P.text('HAIR STYLE', (x0 + x1) / 2, gf + 0.42, 0.07, { color: '#c9a24c', font: SERIF, weight: '700', maxW: (x1 - x0) * 0.4 });
        }
      };
      grid(0.03 * W, 0.4 * W, 4, true);
      P.steps(0.42 * W, 0.62 * W, -P.plinth, gf, 5, '#a9a59d');
      P.door(0.45 * W, 0.59 * W, gf, oH - 0.05, { frame: '#f6f6f4', open: true });
      grid(0.64 * W, 0.98 * W, 4, true);
      P.rect(0.405 * W, 0.44 * W, gf + 0.3, oH - 0.3, '#151515');              // Preistafel neben der Tür
      P.rect(0, W, oH + 0.12, oH + 0.18, '#d8d8d6');                           // Kante des Vordachs
      P.board(0.33 * W, 0.72 * W, oH - 0.62, oH + 0.02, { bg: '#121212', border: '#b8954a', borderW: 0.02 });
      P.text('HAETHAM', 0.525 * W, oH - 0.2, 0.26, { color: '#d2ac57', font: SERIF, weight: '700', spacing: 0.02, maxW: 0.3 * W });
      P.text('HAIR STYLE', 0.525 * W, oH - 0.47, 0.13, { color: '#d2ac57', font: SERIF, weight: '700', spacing: 0.02, maxW: 0.2 * W });
      for (const xl of [0.3 * W, 0.75 * W]) {                                  // zwei schwarze Laternen
        P.rect(xl - 0.02, xl + 0.02, oH - 0.75, oH - 0.2, '#1b1b1b');
        P.rect(xl - 0.13, xl + 0.13, oH - 0.62, oH - 0.22, '#222222');
        P.rect(xl - 0.09, xl + 0.09, oH - 0.56, oH - 0.28, 'rgba(240,236,220,0.55)');
      }
    },
  },
  'Hauptstraße 16': {
    name: 'Wok Mei', wall: 'slate', tint: '#ffffff',                       // Erdgeschoss mit grauem Wellblech verkleidet
    draw(P) {
      const { W, top } = P, gf = 0.5;
      P.rect(0, W, -P.plinth, top, '#9ba6b2');
      for (let x = 0; x < W; x += 0.1) {                                       // senkrechte Wellen
        P.rect(x, x + 0.035, gf, top, 'rgba(255,255,255,0.2)');
        P.rect(x + 0.055, x + 0.08, gf, top, 'rgba(30,40,55,0.14)');
      }
      P.rect(0, W, -P.plinth, gf, '#5b5f66');                                 // dunkler Sockel mit Kellerfenstern
      for (const xc of [0.2 * W, 0.47 * W, 0.86 * W]) P.rect(xc - 0.25, xc + 0.25, 0.08, 0.3, '#33363b');
      const win = (x0, x1) => {
        P.rect(x0 - 0.08, x1 + 0.08, 0.92, 2.78, '#4a4f56');                   // dunkle Laibung
        P.rect(x0, x1, 2.55, 2.72, '#7a5536');                                 // Rollladenkasten
        P.window(x0, x1, 1.0, 2.55, { frame: '#f2f2f0', t: 0.07, mullions: 1, frosted: 0.92 });
        P.rect(x0 - 0.12, x1 + 0.12, 0.86, 0.94, '#62676e');                   // Fensterbank
      };
      win(0.085 * W, 0.255 * W); win(0.28 * W, 0.415 * W); win(0.435 * W, 0.555 * W);
      P.rect(0.795 * W, 0.92 * W, 0.92, 2.6, '#4a4f56');
      P.window(0.805 * W, 0.91 * W, 1.0, 2.5, { frame: '#f2f2f0', t: 0.06, interior: 'display' });
      // Eingang: Nische mit Stufen, helle Holzzarge
      P.rect(0.645 * W, 0.725 * W, -P.plinth, 2.62, '#e8e6e0');
      P.steps(0.645 * W, 0.725 * W, -P.plinth, gf + 0.1, 4, '#aaa7a0');
      P.door(0.655 * W, 0.695 * W, gf + 0.1, 2.5, { frame: '#c8a46e', glass: true });
      for (const xc of [0.6 * W, 0.77 * W]) {                                  // grüne Speisekarten-Kästen
        P.rect(xc - 0.23, xc + 0.23, 1.25, 1.95, '#2f7a3c');
        P.rect(xc - 0.17, xc + 0.17, 1.32, 1.82, '#efe9da');
      }
      P.board(0.6 * W, 0.77 * W, 2.7, top - 0.05, { bg: '#fbfaf7', border: '#d8322b', borderW: 0.025, radius: 0.08 });
      P.text('Schnell-Restaurant', 0.685 * W, top - 0.17, 0.09, { color: '#d8322b', weight: '700', font: SERIF, maxW: 0.12 * W });
      P.text('Wok Mei', 0.685 * W, top - 0.38, 0.22, { color: '#e0302a', weight: '800', maxW: 0.13 * W });
      P.text('Chinesische Spezialitäten', 0.685 * W, 2.79, 0.065, { color: '#d8322b', weight: '700', font: SERIF, maxW: 0.14 * W });
    },
  },
  'Hauptstraße 17': {
    name: 'Schublade', wall: 'fachwerk', tint: '#ffffff',                  // Fachwerk, Erdgeschoss voller Glyzinien
    draw(P) {
      const { W, top } = P, gf = 0.42, beam = '#1e1c1a';
      P.plaster('#f4f3ef'); P.plinthBand('#3d3d3c', 0.25);
      for (const f of [0, 0.34, 1]) P.rect(Math.max(0, f * W - 0.09), Math.min(W, f * W + 0.09), 0.25, top, beam);
      P.rect(0, W, top - 0.22, top, beam);
      P.steps(0.04 * W, 0.32 * W, -P.plinth, gf, 4, '#a19c93');
      P.door(0.08 * W, 0.28 * W, gf, 2.7, { frame: '#c3c7ca', glass: true, double: true });
      P.window(0.42 * W, 0.88 * W, 0.7, 2.75, { frame: '#f6f6f4', t: 0.06, mullions: 5, interior: 'cafe' });
      for (let k = 1; k < 4; k++) P.rect(0.42 * W, 0.88 * W, 0.7 + 2.05 * k / 4 - 0.025, 0.7 + 2.05 * k / 4 + 0.025, '#f6f6f4');
      P.board(0.5 * W, 0.62 * W, 1.0, 1.45, { bg: '#ffffff', border: '#cfcfcf' });
      P.text('Schublade', 0.56 * W, 1.24, 0.11, { color: '#1b1b1b', font: '"Old English Text MT", "UnifrakturMaguntia", Georgia, serif', weight: '700', maxW: 0.1 * W });
      // Glyzinie: Blätterbüschel rings um das Fenster, über dem Pfosten und an der Tür
      const leaf = (x0, x1, h0, h1, n) => {
        for (let i = 0; i < n; i++) P.shrub(x0 + P.rnd() * (x1 - x0), h0 + P.rnd() * (h1 - h0) - 0.2, 0.5 + P.rnd() * 0.4, 0.45);
      };
      leaf(0.3 * W, 0.44 * W, 0.2, 3.0, 26);
      leaf(0.86 * W, 0.98 * W, 0.2, 3.0, 22);
      leaf(0.3 * W, 0.98 * W, 2.65, 3.15, 40);
      leaf(0.4 * W, 0.95 * W, 0.15, 0.75, 22);
      leaf(0.27 * W, 0.33 * W, 1.5, 3.0, 8);
      P.text('Schublade', 0.66 * W, top - 0.42, 0.28, { color: '#151515', font: '"Old English Text MT", "UnifrakturMaguntia", Georgia, serif', weight: '700', maxW: 0.25 * W });
    },
  },
  'Hauptstraße 15': {
    name: 'GeschmackSache', wall: 'fachwerk', tint: '#ffffff',             // Fachwerk mit grünen Läden, direkt neben der Sparkasse
    draw(P) {
      const { W, top } = P, gf = 0.45, oH = Math.min(2.6, top - 0.5), beam = '#1e1c1a';
      P.plaster('#f5f4f0'); P.plinthBand('#2f3236', gf);
      for (const f of [0, 0.235, 0.62, 1]) P.rect(Math.max(0, f * W - 0.08), Math.min(W, f * W + 0.08), gf, top, beam);
      P.rect(0, W, top - 0.2, top, beam);
      P.steps(0.03 * W, 0.22 * W, -P.plinth, gf, 3, '#8d9095');
      P.door(0.06 * W, 0.2 * W, gf, oH, { frame: '#f6f6f4', glass: true });
      P.window(0.27 * W, 0.6 * W, gf + 0.2, oH, { frame: '#f6f6f4', t: 0.08, mullions: 1, interior: 'empty' });
      P.window(0.65 * W, 0.96 * W, gf + 0.2, oH, { frame: '#f6f6f4', t: 0.08, mullions: 1, interior: 'empty' });
      P.rect(0.4 * W, 0.405 * W, gf + 0.25, gf + 1.3, '#8a6b48');               // Staffelei im Schaufenster
      P.rect(0.37 * W, 0.44 * W, gf + 0.95, gf + 1.45, 'rgba(240,238,232,0.8)');
      const s0 = oH + 0.1, s1 = top - 0.26;                                     // schlichtes Namensschild über den Schaufenstern
      P.board(0.3 * W, 0.93 * W, s0, s1, { bg: '#2f4a3a', border: '#d9cfa8', borderW: 0.02 });
      P.text('GeschmackSache', 0.615 * W, (s0 + s1) / 2, 0.26, { color: '#f1e9d0', font: SERIF, weight: '700', spacing: 0.01, maxW: 0.55 * W });
    },
  },

  // ---------- VR-Bank Rhein-Sieg am Platz gegenüber der Kirche (Vorlage: Street-View-Bild des Users, 24.11.) ----------
  // Front zum Platz mit Kugelbrunnen (Brunnen und Kirchturm: src/much-landmarks.js). Die Front besteht im LoD2 aus zwei
  // gegeneinander versetzten Stücken; Wände und Obergeschoss zeigen die Bank-Ebenen (bank_eg/bank_og in nrw-level.js).
  'Dr.Wirtz-Straße 3': {
    name: 'VR-Bank Rhein-Sieg', wall: 'bank_eg', tint: '#ffffff', face: 'S', near: [373.4, -73.3],
    draw(P) { bankFront(P, true); },
    more: [{ name: 'VR-Bank Rhein-Sieg (links)', face: 'S', near: [368.1, -72.6], draw(P) { bankFront(P, false); } }],
  },
};

/** Erdgeschoss der VR-Bank: Glasfelder in dunklen Rahmen, dunkle Blende; sign = mit Schriftzug über dem Eingang. */
function bankFront(P, sign) {
  const { W, top } = P, b0 = 2.85;
  P.rect(0, W, -P.plinth, top, '#9fd0c6');
  P.rect(0, W, -P.plinth, 0.35, '#5f6468');
  P.rect(0.08, W - 0.08, 0.35, b0, '#3d4246');
  const n = Math.max(1, Math.round((W - 0.16) / 1.4)), bw = (W - 0.16) / n;
  for (let i = 0; i < n; i++) {
    const x0 = 0.08 + i * bw, x1 = x0 + bw;
    if (sign && i === n - 1) P.door(x0 + 0.06, x1 - 0.06, 0.35, b0 - 0.08, { frame: '#3d4246', glass: true, double: bw > 1.6 });
    else P.glass(x0 + 0.06, x1 - 0.06, 0.41, b0 - 0.08, { light: true, interior: 'empty' });
  }
  P.rect(0.08, W - 0.08, 2.3, 2.35, '#3d4246');                                // Kämpfer
  P.rect(0, W, b0, top, '#4a4e53');                                            // Blende
  if (sign) {
    P.board(0.2, W - 0.2, b0 + 0.08, top - 0.05, { bg: '#ffffff', border: '#d0d4d8', borderW: 0.015 });
    P.text('VR-Bank Rhein-Sieg', W / 2, (b0 + top) / 2 + 0.015, 0.25, { color: '#0a5aa5', weight: '700', maxW: W - 0.6 });
  }
}

/** Senkrechte Lamellen hinter Glas (Büro, Vereinsheim). */
function blinds(P, x0, x1, h0, h1) {
  P.rect(x0, x1, h0, h1, 'rgba(226,229,231,0.82)');
  for (let x = x0 + 0.045; x < x1; x += 0.09) P.rect(x, Math.min(x1, x + 0.012), h0, h1, 'rgba(0,0,0,0.07)');
}

/** Laubengang hinter dem Blendband: dunkel, hinten hellere Wand; xs = Schaukästen (weiß mit schwarzem Dach). */
function arcade(P, x0, x1, oH, xs) {
  P.rect(x0, x1, -P.plinth, oH, '#2c2d30');
  P.rect(x0 + 0.3, x1 - 0.3, -P.plinth, oH - 0.45, '#6d7075');
  P.rect(x0, x1, -P.plinth, 0.02, '#8a8780');
  for (const x of xs) {
    P.rect(x - 0.32, x + 0.32, 0.45, 1.85, '#e9ebec');
    P.glass(x - 0.26, x + 0.26, 0.55, 1.75, { light: true, interior: 'poster' });
    P.rect(x - 0.4, x + 0.4, 1.85, 2.15, '#1d1e20');
    P.rect(x - 0.05, x + 0.05, -P.plinth, 0.45, '#5b5e62');
  }
}

/** Weiße, glasierte Klinkerriemchen im Verband. */
function tiles(P, x0, x1, h0, h1) {
  P.rect(x0, x1, h0, h1, '#f1f1ee');
  for (let h = h0, row = 0; h < h1; h += 0.075, row++) {
    P.rect(x0, x1, h, Math.min(h1, h + 0.009), 'rgba(140,140,135,0.35)');
    for (let x = x0 + (row % 2) * 0.12; x < x1; x += 0.24) P.rect(x, Math.min(x1, x + 0.009), h, Math.min(h1, h + 0.075), 'rgba(140,140,135,0.3)');
  }
}

/** Kleiderständer vor einem Laden: Stange, darunter bunte Kleidungsstücke. */
function clothes(P, x0, x1, h0, h1) {
  P.rect(x0 - 0.05, x0 - 0.02, h0 - 0.15, h1 + 0.05, '#9aa0a6');
  P.rect(x1 + 0.02, x1 + 0.05, h0 - 0.15, h1 + 0.05, '#9aa0a6');
  for (let x = x0; x < x1 - 0.02;) {
    const w = 0.03 + P.rnd() * 0.035;
    P.rect(x, Math.min(x1, x + w), h0 + P.rnd() * 0.35, h1 - 0.02, `hsl(${P.rnd() * 360 | 0},${45 + P.rnd() * 35 | 0}%,${50 + P.rnd() * 25 | 0}%)`);
    x += w + 0.005;
  }
  P.rect(x0 - 0.05, x1 + 0.05, h1 - 0.02, h1 + 0.02, '#b8bcc0');
}

/** Markise von vorn: helles Tuch, unten ein Volant aus bunten Bögen. */
function awning(P, x0, x1, h0, h1) {
  P.rect(x0, x1, h0 + 0.18, h1, '#ece7dc');
  for (let x = x0 + 0.6; x < x1; x += 1.2) P.rect(x, x + 0.02, h0 + 0.18, h1, 'rgba(0,0,0,0.05)');
  const cols = ['#e5505e', '#f3c445', '#5a8ed8', '#c79ade', '#79c26f', '#ef8bb5', '#ee7f3b'];
  for (let i = 0, x = x0; x < x1 - 0.01; i++, x += 0.3) {
    const c = cols[i % cols.length], xe = Math.min(x1, x + 0.3);
    P.rect(x, xe, h0 + 0.08, h0 + 0.22, c);
    P.board(x, xe, h0, h0 + 0.16, { ellipse: true, bg: c });
  }
  P.rect(x0, x1, h0 + 0.2, h0 + 0.22, 'rgba(0,0,0,0.12)');
}

/** Edelstahlgeländer vor einer Terrasse. */
function railing(P, x0, x1, h0, h1) {
  const c = '#aeb3b8', n = Math.max(1, Math.round((x1 - x0) / 1.6));
  P.rect(x0, x1, h1 - 0.04, h1, c);
  P.rect(x0, x1, (h0 + h1) / 2 - 0.015, (h0 + h1) / 2 + 0.015, c);
  for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; P.rect(x - 0.025, x + 0.025, h0, h1, c); }
}

/** Grauer Granit (Pfeiler, Bänder): Grundton mit feinen hellen und dunklen Körnern. */
function granite(P, x0, x1, h0, h1) {
  P.rect(x0, x1, h0, h1, '#a9a59f');
  const n = Math.round((x1 - x0) * (h1 - h0) * 260);
  for (let i = 0; i < n; i++) {
    const x = x0 + P.rnd() * (x1 - x0), h = h0 + P.rnd() * (h1 - h0);
    P.rect(x, Math.min(x1, x + 0.025), h, Math.min(h1, h + 0.025), P.rnd() < 0.5 ? 'rgba(60,58,55,0.35)' : 'rgba(245,243,238,0.4)');
  }
}

/** Postkartenständer: graues Gestell, Reihen bunter Karten. */
function cards(P, x0, x1, h0, h1) {
  P.rect(x0, x1, h0, h1, '#b4b8bc');
  for (let h = h0 + 0.1; h < h1 - 0.12; h += 0.2) {
    for (let x = x0 + 0.03; x < x1 - 0.1; x += 0.13) P.rect(x, x + 0.11, h, h + 0.16, `hsl(${P.rnd() * 360 | 0},${40 + P.rnd() * 40 | 0}%,${50 + P.rnd() * 30 | 0}%)`);
  }
}

/** Kleiderpuppe im Schaufenster: Rock, Oberteil, Kopf, Ständer. */
function dress(P, x, h0, col) {
  P.rect(x - 0.015, x + 0.015, h0, h0 + 0.2, '#8a8d90');
  P.rect(x - 0.22, x + 0.22, h0 + 0.2, h0 + 0.85, col);
  P.rect(x - 0.14, x + 0.14, h0 + 0.85, h0 + 1.32, col);
  P.board(x - 0.07, x + 0.07, h0 + 1.33, h0 + 1.52, { ellipse: true, bg: '#e9e4da' });
}

/** Staffelei mit Bild: Holzbeine, darauf eine Farbfläche (oben bei h). */
function easel(P, x, h0, h, col) {
  P.rect(x - 0.02, x + 0.02, h0, h + 0.1, '#a8865a');
  P.rect(x - 0.22, x - 0.18, h0, h - 0.4, '#a8865a');
  P.rect(x + 0.18, x + 0.22, h0, h - 0.4, '#a8865a');
  P.rect(x - 0.3, x + 0.3, h - 0.45, h, col);
}

/** Fachwerkstrebe von (xa, ha) nach (xb, hb), Breite bw: aus schmalen waagerechten Streifen. */
function brace(P, xa, ha, xb, hb, bw, col) {
  const n = Math.max(1, Math.ceil(Math.abs(hb - ha) * SHOP_PX)), lo = Math.min(ha, hb);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, h = ha + (hb - ha) * t, x = xa + (xb - xa) * t;
    P.rect(x - bw * 0.6, x + bw * 0.6, Math.max(lo, h - Math.abs(hb - ha) / n * 0.6), h + Math.abs(hb - ha) / n * 0.6, col);
  }
}

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
