#!/usr/bin/env python3
"""
Holt einen Kartenausschnitt aus OpenStreetMap und speichert ihn kompakt als
assets/osm/<name>.json – im selben Format, das src/osm-level.js liest.

    python tools/osm_fetch.py much 50.905265 7.407934
    python tools/osm_fetch.py meinort 51.2345 7.1234 --radius 350

Koordinaten bekommst du auf openstreetmap.org: Rechtsklick auf den Wunsch-Mittelpunkt
-> "Adresse anzeigen" (oder aus der URL: #map=18/<lat>/<lon>).

Danach in src/osm-level.js unter OSM_LOCATIONS einen Eintrag anlegen und in
src/main.js unter MAP_CONFIGS eine Karte darauf zeigen lassen.

Quelle: OSM-API (map.json), Fallback: Overpass. Nur Standardbibliothek.
Daten © OpenStreetMap-Mitwirkende, Lizenz ODbL 1.0 – das Spiel blendet die Quelle ein.
Adress-, Kontakt- und Betreiber-Tags werden verworfen, behalten wird nur, was die
3D-Kulisse braucht.
"""
import argparse
import datetime as dt
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

UA = "rabbit-of-duty-osm-extract/1.0"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Welche Wege überhaupt interessant sind (Schlüssel reicht)
WAY_KEYS = ("building", "building:part", "highway", "landuse", "leisure", "natural",
            "waterway", "water", "barrier")
# Welche Tags erhalten bleiben
KEEP_TAGS = {
    "building", "building:part", "building:levels", "building:min_level", "roof:shape",
    "roof:levels", "roof:height", "height", "min_height", "location", "name", "amenity",
    "highway", "area", "service", "tunnel", "bridge", "layer", "surface", "landuse",
    "leisure", "natural", "waterway", "water", "place", "barrier", "leaf_type", "historic",
    "sport",
}
SKIP_HIGHWAY = {"proposed", "construction", "abandoned", "razed", "elevator", "corridor"}


def log(*a):
    print(*a, file=sys.stderr)


def http_get(url, data=None, timeout=120):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def bbox_for(lat, lon, radius_m):
    dlat = radius_m / 110574.0
    dlon = radius_m / (111320.0 * math.cos(math.radians(lat)))
    return (lat - dlat, lon - dlon, lat + dlat, lon + dlon)  # S, W, N, E


def fetch_osm_api(bbox):
    s, w, n, e = bbox
    url = f"https://api.openstreetmap.org/api/0.6/map.json?bbox={w:.6f},{s:.6f},{e:.6f},{n:.6f}"
    log("OSM-API:", url)
    return json.loads(http_get(url).decode("utf-8"))


def fetch_overpass(bbox):
    s, w, n, e = bbox
    q = (f"[out:json][timeout:90][bbox:{s:.6f},{w:.6f},{n:.6f},{e:.6f}];"
         "(way[building];relation[building];way[\"building:part\"];way[highway];way[landuse];"
         "relation[landuse];way[leisure];way[natural];relation[natural];node[natural=tree];"
         "way[amenity=parking];way[place=square];way[waterway];way[water];way[barrier];);"
         "out body;>;out skel qt;")
    body = urllib.parse.urlencode({"data": q}).encode()
    endpoints = ["https://overpass-api.de/api/interpreter",
                 "https://overpass.private.coffee/api/interpreter"]
    wait = 5
    for attempt in range(4):
        for ep in endpoints:
            try:
                log("Overpass:", ep)
                raw = http_get(ep, body, timeout=150)
                if raw[:1] == b"{":
                    return json.loads(raw.decode("utf-8"))
                log("  -> keine JSON-Antwort (ausgelastet?)")
            except Exception as ex:  # noqa: BLE001
                log("  -> Fehler:", ex)
        log(f"  warte {wait}s …")
        time.sleep(wait)
        wait *= 2
    raise RuntimeError("Overpass nicht erreichbar")


def interesting_way(tags):
    if not tags:
        return False
    if tags.get("amenity") == "parking" or tags.get("place") == "square":
        return True
    if not any(k in tags for k in WAY_KEYS):
        return False
    if tags.get("highway") in SKIP_HIGHWAY or tags.get("tunnel") in ("yes", "building_passage"):
        return "building" in tags  # Gebäude über einer Durchfahrt trotzdem behalten
    if tags.get("location") == "underground" or tags.get("building") == "no":
        return False
    if tags.get("barrier") and tags["barrier"] not in ("hedge", "wall", "fence", "retaining_wall"):
        return any(k in tags for k in WAY_KEYS if k != "barrier")
    return True


def stitch_rings(member_ways):
    """Fügt offene Außen-Wege einer Multipolygon-Relation zu geschlossenen Ringen zusammen."""
    segs = [list(w) for w in member_ways if len(w) >= 2]
    rings = []
    while segs:
        ring = segs.pop(0)
        changed = True
        while ring[0] != ring[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]:
                    ring += s[1:]
                elif s[-1] == ring[-1]:
                    ring += s[-2::-1]
                elif s[-1] == ring[0]:
                    ring = s[:-1] + ring
                elif s[0] == ring[0]:
                    ring = s[:0:-1] + ring
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        if ring[0] == ring[-1] and len(ring) >= 4:
            rings.append(ring)
    return rings


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("name", help="Dateiname ohne Endung, z.B. much")
    ap.add_argument("lat", type=float)
    ap.add_argument("lon", type=float)
    ap.add_argument("--radius", type=float, default=380, help="Radius in Metern (Standard 380)")
    ap.add_argument("--raw", help="bereits heruntergeladene OSM-JSON statt Download verwenden")
    ap.add_argument("--out", help="Zieldatei (Standard assets/osm/<name>.json)")
    a = ap.parse_args()

    bbox = bbox_for(a.lat, a.lon, a.radius + 40)
    if a.raw:
        with open(a.raw, encoding="utf-8") as f:
            raw = json.load(f)
    else:
        try:
            raw = fetch_osm_api(bbox)
        except Exception as ex:  # noqa: BLE001  (z.B. zu viele Knoten im Ausschnitt)
            log("OSM-API fehlgeschlagen:", ex, "-> Overpass")
            raw = fetch_overpass(bbox)

    els = raw.get("elements", [])
    nodes = {e["id"]: e for e in els if e["type"] == "node" and "lat" in e}
    ways = {e["id"]: e for e in els if e["type"] == "way"}
    mlat, mlon = 110574.0, 111320.0 * math.cos(math.radians(a.lat))
    r2 = a.radius * a.radius

    def near(nid):
        n = nodes.get(nid)
        if not n:
            return False
        dx = (n["lon"] - a.lon) * mlon
        dz = (n["lat"] - a.lat) * mlat
        return dx * dx + dz * dz <= r2

    def clean_tags(t):
        return {k: v for k, v in (t or {}).items() if k in KEEP_TAGS}

    out_ways = []
    for w in ways.values():
        t = w.get("tags")
        if interesting_way(t) and any(near(n) for n in w["nodes"]):
            out_ways.append({"type": "way", "id": w["id"], "nodes": w["nodes"], "tags": clean_tags(t)})

    # Multipolygone (Wald, Wiesen, große Gebäude) -> synthetische geschlossene Wege
    synth_id = -1
    for r in (e for e in els if e["type"] == "relation"):
        t = r.get("tags", {})
        if t.get("type") != "multipolygon" or not interesting_way(t):
            continue
        outer = [ways[m["ref"]]["nodes"] for m in r.get("members", [])
                 if m.get("type") == "way" and m.get("role") in ("outer", "") and m["ref"] in ways]
        for ring in stitch_rings(outer):
            if any(near(n) for n in ring) and all(n in nodes for n in ring):
                tags = clean_tags(t)
                out_ways.append({"type": "way", "id": synth_id, "nodes": ring, "tags": tags})
                synth_id -= 1

    used = {n for w in out_ways for n in w["nodes"]}
    out_nodes = []
    for nid, n in nodes.items():
        tree = (n.get("tags") or {}).get("natural") == "tree"
        if nid in used or (tree and near(nid)):
            e = {"type": "node", "id": nid, "lat": round(n["lat"], 7), "lon": round(n["lon"], 7)}
            if tree:
                e["tags"] = {"natural": "tree"}
            out_nodes.append(e)

    out = {
        "version": 0.6,
        "generator": "tools/osm_fetch.py",
        "attribution": "© OpenStreetMap-Mitwirkende",
        "license": "ODbL 1.0 – https://www.openstreetmap.org/copyright",
        "center": [a.lat, a.lon],
        "radius": a.radius,
        "fetched": dt.date.today().isoformat(),
        "elements": out_nodes + out_ways,
    }
    path = a.out or os.path.join(ROOT, "assets", "osm", f"{a.name}.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    nb = sum(1 for w in out_ways if "building" in w["tags"] or "building:part" in w["tags"])
    nh = sum(1 for w in out_ways if "highway" in w["tags"])
    log(f"OK: {path}  ({os.path.getsize(path) // 1024} KB) – {nb} Gebäude, {nh} Wege, "
        f"{len(out_nodes)} Knoten")
    log("Eintrag für OSM_LOCATIONS in src/osm-level.js:")
    log(f"  {a.name}: {{ file: './assets/osm/{a.name}.json', center: [{a.lat}, {a.lon}], style: 'village' }},")


if __name__ == "__main__":
    main()
