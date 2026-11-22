#!/usr/bin/env python3
"""
NRW-Geobasisdaten -> 3D-Kulisse für einen Ort in Nordrhein-Westfalen.

    python tools/nrw_fetch.py much 50.905265 7.407934

Erzeugt assets/nrw/<name>/:
  meta.json       Mittelpunkt, Geländeraster-Info, Luftbild-Ausschnitte, Bäume
  terrain.bin     Gelände (DGM1, 1-m-Raster) als Uint16 (cm über Minimum)
  buildings.json  echte Gebäude (3D-Gebäudemodell LoD2): Dach-, Wand-, Grundflächen
  dop_near.jpg    Luftbild (DOP) ±256 m um die Mitte (Spielfläche), 12,5 cm/Pixel
  dop_far.jpg     Luftbild ±500 m, ~0,5 m/Pixel

Bäume werden aus dem Oberflächenmodell abgeleitet: DOM1 - DGM1 = Höhe über Grund;
lokale Maxima außerhalb von Gebäuden = Baumkronen (Position, Höhe, Kronenradius).

Quellen (OpenGeodata.NRW / Geobasis NRW, Lizenz dl-de/zero-2-0, frei nutzbar):
  LoD2:  https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/lod2_gml/
  DGM1:  https://www.opengeodata.nrw.de/produkte/geobasis/hm/dgm1_tiff/dgm1_tiff/
  DOM1:  https://www.opengeodata.nrw.de/produkte/geobasis/hm/dom1_tiff/dom1_tiff/
  DOP:   https://www.wms.nrw.de/geobasis/wms_nw_dop  (Layer nw_dop_rgb)
Braucht numpy + Pillow. Downloads werden im Temp-Ordner zwischengespeichert.
"""
import argparse
import datetime as dt
import io
import json
import math
import os
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image, ImageDraw

UA = "rabbit-of-duty-nrw-extract/1.0"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(tempfile.gettempdir(), "rod_nrw_cache")
OGD = "https://www.opengeodata.nrw.de/produkte/geobasis/"
SRC = {
    "lod2": OGD + "3dg/lod2_gml/lod2_gml/",
    "dgm1": OGD + "hm/dgm1_tiff/dgm1_tiff/",
    "dom1": OGD + "hm/dom1_tiff/dom1_tiff/",
}
WMS_DOP = "https://www.wms.nrw.de/geobasis/wms_nw_dop"
NS = {"bldg": "http://www.opengis.net/citygml/building/1.0", "gml": "http://www.opengis.net/gml"}

Image.MAX_IMAGE_PIXELS = None


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def http_get(url, timeout=300):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def cached(url, name=None):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name or url.rsplit("/", 1)[-1])
    if not os.path.exists(path):
        log("  lade", url)
        data = http_get(url)
        with open(path + ".part", "wb") as f:
            f.write(data)
        os.replace(path + ".part", path)
    return path


def utm32(lat, lon):
    """WGS84/ETRS89 -> UTM Zone 32N (Krüger-Reihen, cm-genau)."""
    a = 6378137.0
    f = 1 / 298.257222101
    e2 = f * (2 - f)
    k0 = 0.9996
    lon0 = math.radians(9.0)
    phi, lam = math.radians(lat), math.radians(lon)
    ep2 = e2 / (1 - e2)
    N = a / math.sqrt(1 - e2 * math.sin(phi) ** 2)
    T = math.tan(phi) ** 2
    C = ep2 * math.cos(phi) ** 2
    A = math.cos(phi) * (lam - lon0)
    M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi
             - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * math.sin(2 * phi)
             + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * math.sin(4 * phi)
             - (35 * e2 ** 3 / 3072) * math.sin(6 * phi))
    E = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000
    Nn = k0 * (M + N * math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24
                                        + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720))
    return E, Nn


def tiles_for(E0, N0, r):
    return sorted({(ex, ny)
                   for ex in range(int((E0 - r) // 1000), int((E0 + r) // 1000) + 1)
                   for ny in range(int((N0 - r) // 1000), int((N0 + r) // 1000) + 1)})


def index_files(kind):
    data = json.loads(http_get(SRC[kind] + "index.json", timeout=120).decode("utf-8"))
    return [f["name"] for ds in data.get("datasets", []) for f in ds.get("files", [])]


def pick_tile(files, ex, ny):
    key = f"_32_{ex}_{ny}_1_"
    cand = sorted(n for n in files if key in n)
    return cand[-1] if cand else None   # neuester Jahrgang zuletzt


class Mosaic:
    """1-m-Raster aus mehreren 1-km-GeoTIFF-Kacheln (Pixelmitte = Kachelecke + 0,5 m)."""

    def __init__(self, kind, tiles):
        files = index_files(kind)
        exs = [t[0] for t in tiles]
        nys = [t[1] for t in tiles]
        self.e_min = min(exs) * 1000
        self.n_max = (max(nys) + 1) * 1000
        w = (max(exs) - min(exs) + 1) * 1000
        h = (max(nys) - min(nys) + 1) * 1000
        self.a = np.full((h, w), np.nan, dtype=np.float32)
        for ex, ny in tiles:
            name = pick_tile(files, ex, ny)
            if not name:
                log(f"  ({kind}: keine Kachel {ex}/{ny})")
                continue
            im = Image.open(cached(SRC[kind] + name))
            x0, y0 = im.tag_v2[33922][3], im.tag_v2[33922][4]
            arr = np.array(im, dtype=np.float32)
            arr[arr < -1000] = np.nan
            c, r = int(round(x0 - self.e_min)), int(round(self.n_max - y0))
            self.a[r:r + arr.shape[0], c:c + arr.shape[1]] = arr
        if np.isnan(self.a).any():
            self.a[np.isnan(self.a)] = np.nanmean(self.a)

    def sample(self, E, N):
        """Bilinear an (E, N) – Arrays gleicher Form."""
        c = E - self.e_min - 0.5
        r = self.n_max - N - 0.5
        c0 = np.clip(np.floor(c).astype(int), 0, self.a.shape[1] - 2)
        r0 = np.clip(np.floor(r).astype(int), 0, self.a.shape[0] - 2)
        fc = np.clip(c - c0, 0, 1)
        fr = np.clip(r - r0, 0, 1)
        a = self.a
        return ((a[r0, c0] * (1 - fc) + a[r0, c0 + 1] * fc) * (1 - fr)
                + (a[r0 + 1, c0] * (1 - fc) + a[r0 + 1, c0 + 1] * fc) * fr)


def parse_lod2(paths, E0, N0, base, radius):
    out = []
    tag_b = "{%s}Building" % NS["bldg"]
    for path in paths:
        log("  lese", os.path.basename(path))
        for _, el in ET.iterparse(path, events=("end",)):
            if el.tag != tag_b:
                continue
            fn = el.findtext("bldg:function", default="", namespaces=NS)
            rt = el.findtext("bldg:roofType", default="", namespaces=NS)
            b = {"id": el.get("{%s}id" % NS["gml"], ""), "fn": fn, "rt": int(rt) if rt.isdigit() else 0,
                 "g": [], "r": [], "w": []}
            ys = []
            for kind, key in (("RoofSurface", "r"), ("WallSurface", "w"), ("GroundSurface", "g")):
                for surf in el.iter("{%s}%s" % (NS["bldg"], kind)):
                    for pl in surf.iter("{%s}posList" % NS["gml"]):
                        v = np.array(pl.text.split(), dtype=np.float64).reshape(-1, 3)
                        if len(v) > 1 and np.allclose(v[0], v[-1]):
                            v = v[:-1]
                        if len(v) < 3:
                            continue
                        x = v[:, 0] - E0
                        y = v[:, 2] - base
                        z = -(v[:, 1] - N0)
                        ys.extend(y.tolist())
                        if key == "g":
                            b["g"].append([round(float(t), 2) for p in zip(x, z) for t in p])
                        else:
                            b[key].append([round(float(t), 2) for p in zip(x, y, z) for t in p])
            el.clear()
            if not b["g"] or not ys:
                continue
            gx = [b["g"][0][i] for i in range(0, len(b["g"][0]), 2)]
            gz = [b["g"][0][i] for i in range(1, len(b["g"][0]), 2)]
            cx, cz = sum(gx) / len(gx), sum(gz) / len(gz)
            if cx * cx + cz * cz > radius * radius:
                continue
            b["y0"] = round(min(ys), 2)
            b["y1"] = round(max(ys), 2)
            out.append(b)
    return out


def find_trees(dgm, dom, E0, N0, radius, buildings):
    """Baumkronen aus nDOM = DOM - DGM (1-m-Raster um die Mitte)."""
    n = int(radius) * 2 + 1
    off = np.arange(n) - int(radius)
    EE, NN = np.meshgrid(E0 + off, N0 - off)          # Zeile 0 = Norden
    ndom = dom.sample(EE, NN) - dgm.sample(EE, NN)
    # Gebäude ausmaskieren (Grundrisse + 2 m Puffer)
    mask = Image.new("L", (n, n), 0)
    d = ImageDraw.Draw(mask)
    for b in buildings:
        for g in b["g"]:
            pts = [(g[i] + radius, g[i + 1] + radius) for i in range(0, len(g), 2)]
            if len(pts) >= 3:
                d.polygon(pts, fill=255, outline=255)
    from PIL import ImageFilter
    mask = np.array(mask.filter(ImageFilter.MaxFilter(5))) > 0
    veg = np.where(mask, 0.0, ndom)
    veg[veg < 2.0] = 0.0
    # lokale Maxima (7x7) mit Mindest-Kronenfläche
    pad = 3
    P = np.pad(veg, pad)
    mx = np.zeros_like(veg)
    cnt = np.zeros_like(veg)
    for dy in range(-pad, pad + 1):
        for dx in range(-pad, pad + 1):
            s = P[pad + dy:pad + dy + n, pad + dx:pad + dx + n]
            mx = np.maximum(mx, s)
            if abs(dx) <= 2 and abs(dy) <= 2:
                cnt += s > 2.0
    cand = np.argwhere((veg >= mx) & (veg > 3.0) & (cnt >= 9))
    order = np.argsort(-veg[cand[:, 0], cand[:, 1]])
    trees, grid = [], {}
    for i in order:
        r, c = cand[i]
        h = float(veg[r, c])
        key = (r // 4, c // 4)
        ok = True
        for kr in (key[0] - 1, key[0], key[0] + 1):
            for kc in (key[1] - 1, key[1], key[1] + 1):
                for (rr, cc, hh) in grid.get((kr, kc), ()):
                    if (rr - r) ** 2 + (cc - c) ** 2 < max(9, (0.18 * max(h, hh)) ** 2):
                        ok = False
        if not ok:
            continue
        # Kronenradius: in 8 Richtungen bis die Höhe unter 55 % fällt
        dists = []
        for ddr, ddc in ((0, 1), (1, 0), (0, -1), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            step = math.hypot(ddr, ddc)
            k = 1
            while k < 9:
                rr, cc = r + ddr * k, c + ddc * k
                if not (0 <= rr < n and 0 <= cc < n) or veg[rr, cc] < 0.55 * h:
                    break
                k += 1
            dists.append(k * step)
        rad = float(np.clip(np.mean(dists), 1.2, 7.0))
        x, z = float(c - radius), float(r - radius)
        if x * x + z * z > radius * radius:
            continue
        grid.setdefault(key, []).append((r, c, h))
        trees.append([round(x, 1), round(z, 1), round(min(h, 40.0), 1), round(rad, 1)])
        if len(trees) >= 6000:
            break
    return trees


def wms_dop(E0, N0, half, px, path, tile_px=2048):
    """Luftbild ±half m als px×px-JPEG; große Bilder in Kacheln abrufen (WMS-Größenlimit) und zusammensetzen."""
    n = max(1, math.ceil(px / tile_px))
    tp, th = px // n, half / n
    log("  Luftbild", f"±{half} m", f"{px}px", f"({n}×{n} Abrufe)" if n > 1 else "")
    im = Image.new("RGB", (tp * n, tp * n))
    for ty in range(n):              # Zeilen von Norden (oben) nach Süden
        for tx in range(n):
            cE = E0 - half + (2 * tx + 1) * th
            cN = N0 + half - (2 * ty + 1) * th
            url = (f"{WMS_DOP}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=nw_dop_rgb&STYLES="
                   f"&CRS=EPSG:25832&BBOX={cE - th:.2f},{cN - th:.2f},{cE + th:.2f},{cN + th:.2f}"
                   f"&WIDTH={tp}&HEIGHT={tp}&FORMAT=image/jpeg")
            im.paste(Image.open(io.BytesIO(http_get(url))).convert("RGB"), (tx * tp, ty * tp))
    im.save(path, "JPEG", quality=84, optimize=True, progressive=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("name")
    ap.add_argument("lat", type=float)
    ap.add_argument("lon", type=float)
    ap.add_argument("--radius", type=float, default=400, help="Gebäude/Bäume bis zu diesem Radius (m)")
    ap.add_argument("--terrain", type=int, default=500, help="Gelände-Halbbreite (m)")
    ap.add_argument("--near", type=int, default=256,
                    help="scharfes Luftbild (12,5 cm/Pixel) für ±near m – sollte die Spielfläche abdecken")
    ap.add_argument("--near-px", type=int, default=4096,
                    help="höchstens so viele Pixel Kantenlänge für das scharfe Luftbild (Grafikspeicher!)")
    ap.add_argument("--dop-only", action="store_true",
                    help="nur die Luftbilder neu holen (vorhandene meta.json wird aktualisiert)")
    a = ap.parse_args()

    E0, N0 = utm32(a.lat, a.lon)
    out_dir = os.path.join(ROOT, "assets", "nrw", a.name)
    os.makedirs(out_dir, exist_ok=True)
    log(f"Mitte UTM32: {E0:.1f} / {N0:.1f}")
    near_px = min(a.near_px, int(round(2 * a.near / 0.125)))   # 12,5 cm/Pixel, gedeckelt (4096² ≈ 64 MB Grafikspeicher)

    if a.dop_only:
        meta_path = os.path.join(out_dir, "meta.json")
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
        log("Luftbilder (DOP) …")
        wms_dop(E0, N0, a.near, near_px, os.path.join(out_dir, "dop_near.jpg"))
        meta["dop"]["near"] = {"file": "dop_near.jpg", "half": a.near}
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
        log(f"OK: dop_near.jpg ±{a.near} m ({near_px}px)")
        return

    T = a.terrain
    t_tiles = tiles_for(E0, N0, T + 2)
    log("Gelände (DGM1) …")
    dgm = Mosaic("dgm1", t_tiles)
    base = float(dgm.sample(np.array([E0]), np.array([N0]))[0])
    off = np.arange(-T, T + 1, dtype=np.float64)
    EE, NN = np.meshgrid(E0 + off, N0 - off)
    H = dgm.sample(EE, NN) - base
    hmin = float(np.floor(H.min() * 100) / 100)
    q = np.clip(np.round((H - hmin) * 100), 0, 65535).astype("<u2")
    q.tofile(os.path.join(out_dir, "terrain.bin"))
    log(f"  Höhen: {H.min():.1f} … {H.max():.1f} m relativ zur Mitte ({base:.1f} m ü. NHN)")

    log("Gebäude (LoD2) …")
    b_tiles = tiles_for(E0, N0, a.radius + 50)
    files = index_files("lod2")
    paths = [cached(SRC["lod2"] + n) for n in (pick_tile(files, ex, ny) for ex, ny in b_tiles) if n]
    buildings = parse_lod2(paths, E0, N0, base, a.radius)
    with open(os.path.join(out_dir, "buildings.json"), "w", encoding="utf-8") as f:
        json.dump({"b": buildings}, f, separators=(",", ":"))
    log(f"  {len(buildings)} Gebäude")

    log("Bäume (DOM1 - DGM1) …")
    dom = Mosaic("dom1", t_tiles)
    trees = find_trees(dgm, dom, E0, N0, int(a.radius), buildings)
    log(f"  {len(trees)} Bäume")

    log("Luftbilder (DOP) …")
    wms_dop(E0, N0, a.near, near_px, os.path.join(out_dir, "dop_near.jpg"))
    wms_dop(E0, N0, T, 2048, os.path.join(out_dir, "dop_far.jpg"))

    meta = {
        "name": a.name, "center": [a.lat, a.lon], "utm32": [round(E0, 2), round(N0, 2)],
        "base": round(base, 2),
        "terrain": {"file": "terrain.bin", "n": 2 * T + 1, "half": T, "step": 1, "hmin": hmin, "scale": 0.01},
        "dop": {"near": {"file": "dop_near.jpg", "half": a.near}, "far": {"file": "dop_far.jpg", "half": T}},
        "buildings": "buildings.json",
        "trees": trees,
        "attribution": "Geobasis NRW",
        "license": "Datenlizenz Deutschland – Zero – Version 2.0 (dl-de/zero-2-0)",
        "fetched": dt.date.today().isoformat(),
    }
    with open(os.path.join(out_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    total = sum(os.path.getsize(os.path.join(out_dir, n)) for n in os.listdir(out_dir))
    log(f"OK: {out_dir}  ({total // 1024} KB)")
    log(f"In src/osm-level.js beim Ort eintragen:  nrw: './assets/nrw/{a.name}/'")


if __name__ == "__main__":
    main()
