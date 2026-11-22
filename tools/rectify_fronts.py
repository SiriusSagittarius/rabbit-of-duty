"""
Eigene Fassadenfotos entzerren → assets/nrw/much/fronts/<name>.webp (für src/much-shops.js, Feld photo/photos).

Aufruf (im Projektordner):   python tools/rectify_fronts.py            alle Einträge aus tools/fronts.json
                             python tools/rectify_fronts.py hs27 hs25  nur diese

tools/fronts.json, je Eintrag:
  src    Quellbild (Foto oder Standbild aus einem eigenen Video), relativ zum Projektordner
  quad   vier Bildpunkte [x, y] in Quellpixeln: links oben, rechts oben, rechts unten, links unten
  ref    das Rechteck an der Wand, das diese vier Punkte zeigen, in Metern: [x0, x1, h0, h1]
         (x von der linken Wandkante, h über Straßenniveau – z. B. [0, Breite, 0, Traufhöhe])
  wall   Größe des Ausgabebildes in Metern: [Breite, Höhe] (so groß wie die Wand bzw. der Bereich in P.photo)
  ppm    optional: Pixel pro Meter (Standard 64 = SHOP_PX im Atlas)
  hide   optional: Rechtecke [x0, x1, h0, h1] in Metern, die durchsichtig werden (Mast, Auto davor …);
         dort scheint im Spiel der Putz der Wand durch
Bereiche der Wand, die das Quellbild nicht zeigt, werden ebenfalls durchsichtig.

Die Rohbilder (assets/imgmuch/, videos/) bleiben lokal (.gitignore) – sie zeigen evtl. Personen oder Kennzeichen.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'nrw', 'much', 'fronts')


def homography(dst_pts, src_pts):
    """3×3-Matrix, die Punkte dst (Ausgabe) auf src (Quelle) abbildet."""
    A, b = [], []
    for (X, Y), (x, y) in zip(dst_pts, src_pts):
        A.append([X, Y, 1, 0, 0, 0, -x * X, -x * Y]); b.append(x)
        A.append([0, 0, 0, X, Y, 1, -y * X, -y * Y]); b.append(y)
    h = np.linalg.solve(np.array(A, float), np.array(b, float))
    return np.append(h, 1.0)


def build(name, spec):
    ppm = spec.get('ppm', 64)
    W, Hm = spec['wall']
    x0, x1, h0, h1 = spec['ref']
    size = (max(8, round(W * ppm)), max(8, round(Hm * ppm)))
    to_px = lambda u, h: (u * ppm, (Hm - h) * ppm)                  # Meter → Ausgabepixel (oben = Hm)
    dst = [to_px(x0, h1), to_px(x1, h1), to_px(x1, h0), to_px(x0, h0)]
    src = ImageOps.exif_transpose(Image.open(os.path.join(ROOT, spec['src']))).convert('RGB')
    rgba = src.convert('RGBA')                                       # Alpha 255 im Bild, außerhalb 0
    coeffs = homography(dst, spec['quad'])[:8]
    out = rgba.transform(size, Image.PERSPECTIVE, tuple(coeffs), Image.BICUBIC)
    if spec.get('hide'):
        mask = Image.new('L', size, 255)
        d = ImageDraw.Draw(mask)
        for a, b, c, e in spec['hide']:
            (px0, py1), (px1, py0) = to_px(a, c), to_px(b, e)
            d.rectangle([px0, py0, px1, py1], fill=0)
        out.putalpha(Image.fromarray(np.minimum(np.array(out.getchannel('A')), np.array(mask))))
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + '.webp')
    out.save(path, 'WEBP', quality=86, method=6)
    print(f'{name}: {size[0]}x{size[1]} px, {os.path.getsize(path) // 1024} KB -> {os.path.relpath(path, ROOT)}')


def main():
    with open(os.path.join(ROOT, 'tools', 'fronts.json'), encoding='utf-8') as f:
        fronts = json.load(f)['fronts']
    names = sys.argv[1:] or list(fronts)
    for n in names:
        build(n, fronts[n])


if __name__ == '__main__':
    main()
