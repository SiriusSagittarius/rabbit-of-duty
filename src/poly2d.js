// 2D-Polygon-Helfer in der XZ-Ebene – Kollision & Sichtlinie gegen echte Gebäude-Grundrisse
// (OSM-Karten). Polygone sind flache Arrays [x0,z0, x1,z1, …], offen (letzter ≠ erster Punkt).

export function pointInPoly(x, z, p) {
  let inside = false;
  for (let i = 0, n = p.length, j = n - 2; i < n; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Nächster Punkt auf dem Polygonrand → out.{x,z,d2} (d2 = quadrierter Abstand). */
export function closestOnPoly(x, z, p, out) {
  let best = Infinity, bx = 0, bz = 0;
  for (let i = 0, n = p.length, j = n - 2; i < n; j = i, i += 2) {
    const ax = p[j], az = p[j + 1], ex = p[i] - ax, ez = p[i + 1] - az;
    const len2 = ex * ex + ez * ez;
    let t = len2 > 1e-12 ? ((x - ax) * ex + (z - az) * ez) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + ex * t, cz = az + ez * t, dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
    if (d2 < best) { best = d2; bx = cx; bz = cz; }
  }
  out.x = bx; out.z = bz; out.d2 = best;
  return out;
}

function orient(ax, az, bx, bz, cx, cz) { return (bx - ax) * (cz - az) - (bz - az) * (cx - ax); }

/** Schneidet die Strecke a→b das Polygon (Rand oder Inneres)? */
export function segHitsPoly(ax, az, bx, bz, p) {
  if (pointInPoly(ax, az, p) || pointInPoly(bx, bz, p)) return true;
  for (let i = 0, n = p.length, j = n - 2; i < n; j = i, i += 2) {
    const cx = p[j], cz = p[j + 1], dx = p[i], dz = p[i + 1];
    const o1 = orient(ax, az, bx, bz, cx, cz), o2 = orient(ax, az, bx, bz, dx, dz);
    if ((o1 > 0) === (o2 > 0)) continue;
    const o3 = orient(cx, cz, dx, dz, ax, az), o4 = orient(cx, cz, dx, dz, bx, bz);
    if ((o3 > 0) !== (o4 > 0)) return true;
  }
  return false;
}
