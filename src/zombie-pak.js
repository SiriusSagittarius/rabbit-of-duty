// ----------------------------------------------------------------------------
// Verschlüsseltes Zombie-Paket (assets/models/zombie/zombie.pak + zombie.key)
//
// Die CGTrader-Lizenz des Zombie-Modells erlaubt es im Spiel, verlangt aber angemessene Maßnahmen, damit Spieler
// das Modell nicht als Datei herausholen können. Deshalb liegen Modell und Texturen auf dem Webserver nur
// verschlüsselt in EINER Datei; erst das Spiel entschlüsselt sie im Arbeitsspeicher. Paket und Schlüssel
// erzeugt tools/zombie_pack.mjs (Schlüssel bei jedem Packen neu gewürfelt); beide sind nicht im Repo.
//
// zombie.pak = 12 Byte Nonce | ChaCha20(Schlüssel, Nonce, Blockzähler ab 1) über:
//              "RODZ" | u32 Länge des Inhaltsverzeichnisses | Inhaltsverzeichnis (JSON [[name, offset, länge], …]) | Daten
// zombie.key = 32 Byte Schlüssel
//
// Läuft im Browser und in Node (das Packwerkzeug nutzt dieselben Funktionen). Reines JavaScript statt WebCrypto,
// damit es auch ohne HTTPS funktioniert (Heimnetz über http://192.168.…).
// ----------------------------------------------------------------------------

const MAGIC = 0x5a444f52;   // "RODZ" (little-endian)
const LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/** ChaCha20 nach RFC 8439. XOR mit dem Schlüsselstrom, also zum Ver- und Entschlüsseln; ändert `data` direkt. */
export function chacha20(key, nonce, data, counter = 1) {
  const kv = new DataView(key.buffer, key.byteOffset, 32), nv = new DataView(nonce.buffer, nonce.byteOffset, 12);
  const k0 = kv.getInt32(0, true), k1 = kv.getInt32(4, true), k2 = kv.getInt32(8, true), k3 = kv.getInt32(12, true);
  const k4 = kv.getInt32(16, true), k5 = kv.getInt32(20, true), k6 = kv.getInt32(24, true), k7 = kv.getInt32(28, true);
  const n0 = nv.getInt32(0, true), n1 = nv.getInt32(4, true), n2 = nv.getInt32(8, true);
  const ks = new Int32Array(16), ks8 = new Uint8Array(ks.buffer);
  // Ganze Blöcke wortweise verknüpfen (XOR ist bitweise, die Bytereihenfolge der Ansicht spielt dabei keine Rolle)
  const d32 = (data.byteOffset & 3) === 0 ? new Int32Array(data.buffer, data.byteOffset, data.length >> 2) : null;
  for (let off = 0; off < data.length; off += 64, counter++) {
    let x0 = 0x61707865, x1 = 0x3320646e, x2 = 0x79622d32, x3 = 0x6b206574;
    let x4 = k0, x5 = k1, x6 = k2, x7 = k3, x8 = k4, x9 = k5, x10 = k6, x11 = k7;
    let x12 = counter | 0, x13 = n0, x14 = n1, x15 = n2, t;
    for (let r = 0; r < 10; r++) {
      // Spalten
      x0 = (x0 + x4) | 0; t = x12 ^ x0; x12 = (t << 16) | (t >>> 16);
      x8 = (x8 + x12) | 0; t = x4 ^ x8; x4 = (t << 12) | (t >>> 20);
      x0 = (x0 + x4) | 0; t = x12 ^ x0; x12 = (t << 8) | (t >>> 24);
      x8 = (x8 + x12) | 0; t = x4 ^ x8; x4 = (t << 7) | (t >>> 25);
      x1 = (x1 + x5) | 0; t = x13 ^ x1; x13 = (t << 16) | (t >>> 16);
      x9 = (x9 + x13) | 0; t = x5 ^ x9; x5 = (t << 12) | (t >>> 20);
      x1 = (x1 + x5) | 0; t = x13 ^ x1; x13 = (t << 8) | (t >>> 24);
      x9 = (x9 + x13) | 0; t = x5 ^ x9; x5 = (t << 7) | (t >>> 25);
      x2 = (x2 + x6) | 0; t = x14 ^ x2; x14 = (t << 16) | (t >>> 16);
      x10 = (x10 + x14) | 0; t = x6 ^ x10; x6 = (t << 12) | (t >>> 20);
      x2 = (x2 + x6) | 0; t = x14 ^ x2; x14 = (t << 8) | (t >>> 24);
      x10 = (x10 + x14) | 0; t = x6 ^ x10; x6 = (t << 7) | (t >>> 25);
      x3 = (x3 + x7) | 0; t = x15 ^ x3; x15 = (t << 16) | (t >>> 16);
      x11 = (x11 + x15) | 0; t = x7 ^ x11; x7 = (t << 12) | (t >>> 20);
      x3 = (x3 + x7) | 0; t = x15 ^ x3; x15 = (t << 8) | (t >>> 24);
      x11 = (x11 + x15) | 0; t = x7 ^ x11; x7 = (t << 7) | (t >>> 25);
      // Diagonalen
      x0 = (x0 + x5) | 0; t = x15 ^ x0; x15 = (t << 16) | (t >>> 16);
      x10 = (x10 + x15) | 0; t = x5 ^ x10; x5 = (t << 12) | (t >>> 20);
      x0 = (x0 + x5) | 0; t = x15 ^ x0; x15 = (t << 8) | (t >>> 24);
      x10 = (x10 + x15) | 0; t = x5 ^ x10; x5 = (t << 7) | (t >>> 25);
      x1 = (x1 + x6) | 0; t = x12 ^ x1; x12 = (t << 16) | (t >>> 16);
      x11 = (x11 + x12) | 0; t = x6 ^ x11; x6 = (t << 12) | (t >>> 20);
      x1 = (x1 + x6) | 0; t = x12 ^ x1; x12 = (t << 8) | (t >>> 24);
      x11 = (x11 + x12) | 0; t = x6 ^ x11; x6 = (t << 7) | (t >>> 25);
      x2 = (x2 + x7) | 0; t = x13 ^ x2; x13 = (t << 16) | (t >>> 16);
      x8 = (x8 + x13) | 0; t = x7 ^ x8; x7 = (t << 12) | (t >>> 20);
      x2 = (x2 + x7) | 0; t = x13 ^ x2; x13 = (t << 8) | (t >>> 24);
      x8 = (x8 + x13) | 0; t = x7 ^ x8; x7 = (t << 7) | (t >>> 25);
      x3 = (x3 + x4) | 0; t = x14 ^ x3; x14 = (t << 16) | (t >>> 16);
      x9 = (x9 + x14) | 0; t = x4 ^ x9; x4 = (t << 12) | (t >>> 20);
      x3 = (x3 + x4) | 0; t = x14 ^ x3; x14 = (t << 8) | (t >>> 24);
      x9 = (x9 + x14) | 0; t = x4 ^ x9; x4 = (t << 7) | (t >>> 25);
    }
    ks[0] = (x0 + 0x61707865) | 0; ks[1] = (x1 + 0x3320646e) | 0; ks[2] = (x2 + 0x79622d32) | 0; ks[3] = (x3 + 0x6b206574) | 0;
    ks[4] = (x4 + k0) | 0; ks[5] = (x5 + k1) | 0; ks[6] = (x6 + k2) | 0; ks[7] = (x7 + k3) | 0;
    ks[8] = (x8 + k4) | 0; ks[9] = (x9 + k5) | 0; ks[10] = (x10 + k6) | 0; ks[11] = (x11 + k7) | 0;
    ks[12] = (x12 + counter) | 0; ks[13] = (x13 + n0) | 0; ks[14] = (x14 + n1) | 0; ks[15] = (x15 + n2) | 0;
    if (!LE) for (let i = 0; i < 16; i++) { const v = ks[i]; ks[i] = (v >>> 24) | ((v >>> 8) & 0xff00) | ((v & 0xff00) << 8) | (v << 24); }
    if (d32 && off + 64 <= data.length) {
      const w = off >> 2;
      for (let i = 0; i < 16; i++) d32[w + i] ^= ks[i];
    } else {
      const end = Math.min(64, data.length - off);
      for (let i = 0; i < end; i++) data[off + i] ^= ks8[i];
    }
  }
  return data;
}

/** Dateien (Map name → Uint8Array) zu einem verschlüsselten Paket schnüren. */
export function makePak(files, key, nonce) {
  const index = [];
  let size = 0;
  for (const [name, bytes] of files) { index.push([name, size, bytes.length]); size += bytes.length; }
  const idx = new TextEncoder().encode(JSON.stringify(index));
  const body = new Uint8Array(8 + idx.length + size), dv = new DataView(body.buffer);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, idx.length, true);
  body.set(idx, 8);
  let p = 8 + idx.length;
  for (const bytes of files.values()) { body.set(bytes, p); p += bytes.length; }
  chacha20(key, nonce, body);
  const pak = new Uint8Array(12 + body.length);
  pak.set(nonce, 0);
  pak.set(body, 12);
  return pak;
}

/** Paket entschlüsseln → Map name → Uint8Array. Wirft bei falschem Schlüssel oder kaputter Datei. */
export function openPak(pak, key) {
  if (key.length !== 32 || pak.length < 20) throw new Error('Zombie-Paket oder -Schlüssel unvollständig');
  const body = chacha20(key, pak.subarray(0, 12), pak.slice(12));
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('Zombie-Paket passt nicht zum Schlüssel (beide neu hochladen)');
  const n = dv.getUint32(4, true);
  const data = body.subarray(8 + n);
  const files = new Map();
  for (const [name, off, len] of JSON.parse(new TextDecoder().decode(body.subarray(8, 8 + n)))) files.set(name, data.subarray(off, off + len));
  return files;
}

/** Paket + Schlüssel laden und öffnen. `no-cache`: der Browser fragt nach, ob es eine neuere Fassung gibt – sonst
 *  könnten nach dem Neupacken altes Paket und neuer Schlüssel zusammenkommen. */
export async function loadPak(pakUrl, keyUrl) {
  const get = async (url) => {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  };
  const [pak, key] = await Promise.all([get(pakUrl), get(keyUrl)]);
  return openPak(pak, key);
}
