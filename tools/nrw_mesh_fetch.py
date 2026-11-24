"""
Texturiertes 3D-Mesh von Geobasis NRW (Luftbild-Mesh, dl-de/zero-2-0) für einen Kartenausschnitt holen.

Das Land stellt das Mesh als riesige SLPK-Pakete bereit (I3S 1.7, je Gebiet 3–300 GB). Ein SLPK ist ein ZIP ohne
Kompression, der Server kann Byte-Bereiche liefern – also laden wir nur das Inhaltsverzeichnis (~110 MB, einmalig,
im Cache) und danach genau die Kacheln, die den Ausschnitt berühren.

Aufruf (im Projektordner, nach tools/nrw_fetch.py für denselben Ort):
    python tools/nrw_mesh_fetch.py much Mesh_GM1451T345_nw_2025 --level 18 --half 480 290

Ergebnis in assets/nrw/<ort>/mesh/:
    mesh.json        Kachelliste: Datei, Eckenzahl, Lage und Umfang (Spielkoordinaten), Textur
    t<i>.bin         Eckpunkte als Dreiecksliste: Uint16-Position (auf den Kachelumfang quantisiert), Uint16-UV
    t<i>.jpg         Textur der Kachel (Luftbild-Ausschnitt)
Spielkoordinaten wie in nrw-level.js: x = Ost − E0, y = Höhe − base, z = −(Nord − N0).
Welches Paket einen Ort abdeckt, steht in mesh_meta.zip (MeshAktuell.geojson) auf dem Server.
"""
import argparse
import gzip
import json
import math
import os
import struct
import sys
import urllib.request

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_URL = 'https://www.opengeodata.nrw.de/produkte/geobasis/lusat/akt/3dmesh/3dmesh/'
UA = {'User-Agent': 'rabbit-of-duty-mapfetch/1.0'}


class Slpk:
    def __init__(self, name, cache):
        self.url = BASE_URL + name + '.slpk'
        self.cache = cache
        os.makedirs(cache, exist_ok=True)
        self.idx = self._index()

    def _range(self, a, b):
        r = urllib.request.Request(self.url, headers={**UA, 'Range': f'bytes={a}-{b}'})
        for attempt in range(4):
            try:
                return urllib.request.urlopen(r, timeout=180).read()
            except Exception as err:          # Netz wackelt: kurz neu versuchen
                if attempt == 3:
                    raise
                print('  erneut:', err)

    def _index(self):
        path = os.path.join(self.cache, 'index.json')
        if os.path.exists(path):
            return json.load(open(path))
        size = int(urllib.request.urlopen(urllib.request.Request(self.url, method='HEAD', headers=UA)).headers['Content-Length'])
        tail = self._range(size - 65536, size - 1)
        k = tail.rfind(b'PK\x06\x06')
        cd_size, cd_off = struct.unpack('<QQ', tail[k + 40:k + 56])
        print(f'Inhaltsverzeichnis laden: {cd_size / 1e6:.0f} MB …')
        d = self._range(cd_off, cd_off + cd_size - 1)
        idx, p = {}, 0
        while d[p:p + 4] == b'PK\x01\x02':
            cs, us = struct.unpack('<II', d[p + 20:p + 28])
            nl, el, cl = struct.unpack('<HHH', d[p + 28:p + 34])
            off = struct.unpack('<I', d[p + 42:p + 46])[0]
            name = d[p + 46:p + 46 + nl].decode('utf-8', 'replace')
            extra, e = d[p + 46 + nl:p + 46 + nl + el], 0
            while e + 4 <= len(extra):
                hid, hs = struct.unpack('<HH', extra[e:e + 4])
                if hid == 1:                    # Zip64: große Werte stehen hier
                    q = e + 4
                    if us == 0xFFFFFFFF: q += 8
                    if cs == 0xFFFFFFFF: cs = struct.unpack('<Q', extra[q:q + 8])[0]; q += 8
                    if off == 0xFFFFFFFF: off = struct.unpack('<Q', extra[q:q + 8])[0]
                e += 4 + hs
            idx[name] = (off, cs, nl)
            p += 46 + nl + el + cl
        json.dump(idx, open(path, 'w'))
        return idx

    def get(self, name):
        cp = os.path.join(self.cache, name.replace('/', '__'))
        if os.path.exists(cp):
            data = open(cp, 'rb').read()
        else:
            off, cs, nl = self.idx[name]
            h = self._range(off, off + 30 + nl + 1024 + cs)
            n, e = struct.unpack('<HH', h[26:30])
            data = h[30 + n + e:30 + n + e + cs]
            open(cp, 'wb').write(data)
        return gzip.decompress(data) if name.endswith('.gz') else data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('place')
    ap.add_argument('package', help='z. B. Mesh_GM1451T345_nw_2025')
    ap.add_argument('--level', type=int, default=18, help='Detailstufe im Kachelbaum (18 ≈ 0,7 Mio Ecken für 1 km²)')
    ap.add_argument('--half', type=float, nargs=2, default=[480, 290], help='halbe Ausdehnung Ost-West / Nord-Süd (m)')
    ap.add_argument('--fine', type=float, nargs=4, metavar=('CX', 'CZ', 'HX', 'HZ'), help='feiner Bereich (Spielkoordinaten): Mitte und halbe Größe')
    ap.add_argument('--fine-level', type=int, default=20, help='Detailstufe im feinen Bereich')
    a = ap.parse_args()
    meta = json.load(open(os.path.join(ROOT, 'assets', 'nrw', a.place, 'meta.json'), encoding='utf-8'))
    E0, N0 = meta['utm32']; base = meta['base']
    out = os.path.join(ROOT, 'assets', 'nrw', a.place, 'mesh')
    os.makedirs(out, exist_ok=True)
    S = Slpk(a.package, os.path.join(os.environ.get('TEMP', '/tmp'), 'nrw_mesh_cache', a.package))
    pages = {}

    def node(i):
        p = i // 64
        if p not in pages:
            pages[p] = json.loads(S.get(f'nodepages/{p}.json.gz'))['nodes']
        return pages[p][i % 64]

    def touches(n, cx, cz, hx, hz):
        c = n['obb']['center']; r = math.sqrt(sum(h * h for h in n['obb']['halfSize']))
        dx = max(0, abs(c[0] - E0 - cx) - hx); dy = max(0, abs(-(c[1] - N0) - cz) - hz)
        return dx * dx + dy * dy <= r * r

    def collect(level, cx, cz, hx, hz):
        sel = []

        def walk(i, d):
            n = node(i)
            if not touches(n, cx, cz, hx, hz):
                return
            if 'mesh' in n and (d == level or not n.get('children')):
                sel.append(n); return
            for c in n.get('children') or []:
                walk(c, d + 1)
        walk(0, 0)
        return sel

    for f in os.listdir(out):                         # alte Kacheln entfernen
        if f.endswith(('.bin', '.jpg')): os.remove(os.path.join(out, f))
    tiles, total = [], 0
    fine = a.fine and (a.fine[0], a.fine[1], a.fine[2], a.fine[3])   # cx cz hx hz (Spielkoordinaten)

    def in_fine(tri):                                 # Dreiecksmitte im feinen Bereich?
        mx, mz = tri[:, :, 0].mean(1), tri[:, :, 2].mean(1)
        return (np.abs(mx - fine[0]) < fine[2]) & (np.abs(mz - fine[1]) < fine[3])

    def emit(nodes, keepfn, tag):
        nonlocal total
        for k, n in enumerate(nodes):
            r = n['mesh']['geometry']['resource']
            b = S.get(f'nodes/{r}/geometries/0.bin.gz')
            vc = struct.unpack('<I', b[:4])[0]
            pos = np.frombuffer(b, np.float32, vc * 3, 8).reshape(-1, 3).astype(np.float64)
            uv = np.frombuffer(b, np.float32, vc * 2, 8 + vc * 12).reshape(-1, 2)
            c = n['obb']['center']
            g = np.empty_like(pos)                          # → Spielkoordinaten
            g[:, 0] = pos[:, 0] + c[0] - E0
            g[:, 1] = pos[:, 2] + c[2] - base
            g[:, 2] = -(pos[:, 1] + c[1] - N0)
            tri = g.reshape(-1, 3, 3)
            keep = ~((tri[:, :, 0].min(1) > a.half[0] + 20) | (tri[:, :, 0].max(1) < -a.half[0] - 20)
                     | (tri[:, :, 2].min(1) > a.half[1] + 20) | (tri[:, :, 2].max(1) < -a.half[1] - 20))
            keep &= keepfn(tri)
            if not keep.any():
                continue
            g = tri[keep].reshape(-1, 3); uvk = uv.reshape(-1, 3, 2)[keep].reshape(-1, 2)
            lo, hi = g.min(0), g.max(0); ext = np.maximum(hi - lo, 1e-3)
            q = np.round((g - lo) / ext * 65535).astype('<u2')
            quv = np.round(np.clip(uvk, 0, 1) * 65535).astype('<u2')
            name = f't{len(tiles)}'
            with open(os.path.join(out, name + '.bin'), 'wb') as f:
                f.write(np.hstack([q, quv]).tobytes())        # je Ecke: x y z u v (Uint16)
            open(os.path.join(out, name + '.jpg'), 'wb').write(S.get(f'nodes/{r}/textures/0.jpg'))
            tiles.append({'file': name, 'count': int(len(g)), 'lo': [round(v, 3) for v in lo], 'ext': [round(v, 3) for v in ext], 'fine': tag})
            total += len(g)
            print(f'  {"fein" if tag else "grob"} {k + 1}/{len(nodes)}  {total / 1e6:.2f} Mio Ecken', end='\r', flush=True)
        print()

    coarse = collect(a.level, 0, 0, a.half[0], a.half[1])
    print(f'{len(coarse)} Kacheln auf Stufe {a.level}')
    emit(coarse, (lambda t: ~in_fine(t)) if fine else (lambda t: np.ones(len(t), bool)), False)
    if fine:
        fn = collect(a.fine_level, *fine)
        print(f'{len(fn)} feine Kacheln auf Stufe {a.fine_level}')
        emit(fn, in_fine, True)
    json.dump({'source': a.package, 'level': a.level, 'license': 'Geobasis NRW, dl-de/zero-2-0', 'tiles': tiles},
              open(os.path.join(out, 'mesh.json'), 'w'), indent=1)
    size = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
    print(f'{len(tiles)} Kacheln, {total / 1e6:.2f} Mio Ecken, {size / 1e6:.1f} MB -> assets/nrw/{a.place}/mesh/')


if __name__ == '__main__':
    sys.exit(main())
