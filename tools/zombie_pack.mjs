#!/usr/bin/env node
// Zombie-Modell verschlüsselt packen: images/net/build/ (zombie.glb + WebP-Texturen) → assets/models/zombie/zombie.pak + zombie.key
//
//     node tools/zombie_pack.mjs
//     node tools/zombie_pack.mjs --src <ordner> --out <ordner>
//
// Warum: Die CGTrader-Lizenz erlaubt das Modell im Spiel, verlangt aber angemessene Maßnahmen, damit Spieler es
// nicht als Datei herausholen können. Das Spiel lädt es deshalb nur aus diesem Paket (Format: src/zombie-pak.js).
// Auf den Webserver gehören nur zombie.pak und zombie.key, nie die Einzeldateien. Braucht Node.js 22 oder neuer.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePak, openPak } from '../src/zombie-pak.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const src = arg('--src', join(ROOT, 'images', 'net', 'build'));
const out = arg('--out', join(ROOT, 'assets', 'models', 'zombie'));

// Pflicht: Modell, Augen, Haut 1. Haut 2 und 3 sind freiwillig (das Spiel nimmt, was da ist).
const names = ['zombie.glb', 'eyes.webp'];
for (let n = 1; n <= 3; n++) for (const k of ['albedo', 'normal', 'orm']) names.push(`skin${n}_${k}.webp`);
const files = new Map();
for (const f of names) {
  const p = join(src, f);
  if (existsSync(p)) files.set(f, new Uint8Array(readFileSync(p)));
  else if (!/^skin[23]_/.test(f)) { console.error(`Fehlt: ${p}\nAnleitung: README, Abschnitt „Zombie-Modell einrichten“.`); process.exit(1); }
}

const key = new Uint8Array(randomBytes(32)), nonce = new Uint8Array(randomBytes(12));
const pak = makePak(files, key, nonce);

// Gegenprobe: wieder öffnen und Byte für Byte vergleichen
const back = openPak(pak, key);
for (const [f, bytes] of files) {
  if (Buffer.compare(Buffer.from(back.get(f)), Buffer.from(bytes)) !== 0) { console.error('Gegenprobe fehlgeschlagen: ' + f); process.exit(1); }
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'zombie.pak'), pak);
writeFileSync(join(out, 'zombie.key'), key);
console.log(`OK: ${files.size} Dateien verschlüsselt → ${join(out, 'zombie.pak')} (${Math.round(pak.length / 1024)} KB) + zombie.key`);
console.log('Auf den Webserver nur zombie.pak und zombie.key hochladen – nie die Einzeldateien aus ' + src);
