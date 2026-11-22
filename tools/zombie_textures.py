#!/usr/bin/env python3
"""
Zombie-Texturen (CGTrader-Paket "Zombie", 3 Texture-Sets à 4096² TGA) → spieltaugliche WebP-Dateien.

    python tools/zombie_textures.py            # liest images/net/, schreibt images/net/build/ (danach: node tools/zombie_pack.mjs)
    python tools/zombie_textures.py --size 2048

Je Hautvariante (skin1..3):
  skinN_albedo.webp   Farbe + Alpha (Ausschnittmaske für zerrissene Kleidung)
  skinN_normal.webp   Normal-Map
  skinN_orm.webp      R = Umgebungsverdeckung (AO), G = Rauheit (aus Unity-Glätte, gedämpft), B = Metall
Gemeinsam:
  eyes.webp           Leuchtmaske der Augen (aus der Emission-Map)

Braucht Pillow mit WebP-Unterstützung.
"""
import argparse
import glob
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Image.MAX_IMAGE_PIXELS = None


def find(folder, suffix):
    hits = sorted(glob.glob(os.path.join(folder, f"*_{suffix}.tga")))
    if not hits:
        sys.exit(f"Fehlt: {folder}/*_{suffix}.tga")
    return hits[0]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", default=os.path.join(ROOT, "images", "net"), help="Ordner mit den entpackten CGTrader-Dateien")
    ap.add_argument("--out", default=os.path.join(ROOT, "images", "net", "build"))   # Einzeldateien: nicht ins Repo, nicht auf den Webserver
    ap.add_argument("--size", type=int, default=1024)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    S = (a.size, a.size)
    sets = sorted(glob.glob(os.path.join(a.src, "Texture*set*", "Texture set *")))
    if len(sets) < 1:
        sys.exit(f"Keine 'Texture set'-Ordner unter {a.src} gefunden")
    best_eyes = None
    for n, folder in enumerate(sets, 1):
        print(f"Hautvariante {n}: {os.path.basename(folder)}")
        alb = Image.open(find(folder, "Albedo")).convert("RGBA").resize(S, Image.LANCZOS)
        alb.save(os.path.join(a.out, f"skin{n}_albedo.webp"), "WEBP", quality=86, method=6)
        nrm = Image.open(find(folder, "Normal")).convert("RGB").resize(S, Image.LANCZOS)
        nrm.save(os.path.join(a.out, f"skin{n}_normal.webp"), "WEBP", quality=92, method=6)
        met = Image.open(find(folder, "Metallic")).convert("RGBA").resize(S, Image.LANCZOS)
        metal, smooth = met.getchannel("R"), met.getchannel("A")       # Unity: Metall in R, Glätte in Alpha
        rough = smooth.point(lambda v: 255 - int(v * 0.35))       # Glätte ist fast überall ~0,9 → sonst wirkt alles nass lackiert
        ao = Image.open(find(folder, "Occlusion")).convert("L").resize(S, Image.LANCZOS)
        Image.merge("RGB", (ao, rough, metal)).save(os.path.join(a.out, f"skin{n}_orm.webp"), "WEBP", quality=90, method=6)
        emis = Image.open(find(folder, "Emission")).convert("L")
        peak = emis.getextrema()[1]
        if best_eyes is None or peak > best_eyes[0]:
            best_eyes = (peak, emis)
    # Augen-Leuchtmaske: hellste Emission der Sets, auf volle Helligkeit gestreckt
    peak, emis = best_eyes
    eyes = emis.resize(S, Image.LANCZOS).point(lambda v: min(255, int(v * 255 / max(peak, 1) * 1.6)))
    eyes.convert("RGB").save(os.path.join(a.out, "eyes.webp"), "WEBP", quality=90, method=6)
    total = sum(os.path.getsize(os.path.join(a.out, f)) for f in os.listdir(a.out) if f.endswith(".webp"))
    print(f"OK: {len(sets)} Hautvarianten + Augenmaske nach {a.out} ({total // 1024} KB)")


if __name__ == "__main__":
    main()
