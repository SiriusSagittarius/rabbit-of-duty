/**
 * Geografie-Hilfen.
 *
 * Die NRW-Daten (Gebäude, Gelände, Luftbild) liegen im amtlichen UTM-Raster (ETRS89 / UTM 32N). Dessen „Norden“
 * ist hier um etwa 1,2° gegenüber dem wahren Norden gedreht (Meridiankonvergenz) – bei 400 m Abstand von der Mitte
 * ergibt das schon ~9 m Versatz. OpenStreetMap-Wege kommen als Breite/Länge; damit sie auf den Straßen des
 * Luftbilds liegen, werden sie über dieselbe UTM-Rechnung in das Spielfeld umgerechnet wie die NRW-Daten.
 */

/** WGS84/ETRS89 → UTM Zone 32N (Krüger-Reihen, cm-genau). Dieselbe Rechnung wie in tools/nrw_fetch.py. */
export function utm32(lat, lon) {
  const a = 6378137.0, f = 1 / 298.257222101, e2 = f * (2 - f), k0 = 0.9996;
  const lon0 = 9 * Math.PI / 180, phi = lat * Math.PI / 180, lam = lon * Math.PI / 180;
  const ep2 = e2 / (1 - e2);
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2, A = Math.cos(phi) * (lam - lon0);
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
  const E = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  const Nn = k0 * (M + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24
    + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
  return [E, Nn];
}

/**
 * Umrechnung Breite/Länge → Spielfeld-Meter (x = Osten, z = Süden) um einen Mittelpunkt.
 * utm = true: im UTM-Raster wie die NRW-Daten (x = E − E0, z = −(N − N0)); sonst einfache Näherung.
 */
export function makeLocalFrame(centerLat, centerLon, utm) {
  if (utm) {
    const [E0, N0] = utm32(centerLat, centerLon);
    return (lat, lon) => { const [E, N] = utm32(lat, lon); return [E - E0, -(N - N0)]; };
  }
  const mLat = 110574, mLon = 111320 * Math.cos(centerLat * Math.PI / 180);
  return (lat, lon) => [(lon - centerLon) * mLon, -(lat - centerLat) * mLat];
}
