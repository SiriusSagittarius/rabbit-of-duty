import os
import re
import tempfile
import json

cache = os.path.join(tempfile.gettempdir(), "rod_nrw_cache")
gml_files = [os.path.join(cache, f) for f in os.listdir(cache) if f.startswith("LoD2_") and f.endswith(".gml")]
print("GML files found:", len(gml_files))

addr_map = {}

# Match individual Building blocks
bldg_regex = re.compile(r'<bldg:Building\s+gml:id="([^"]+)">.*?</bldg:Building>', re.DOTALL)
nr_regex = re.compile(r'<xal:ThoroughfareNumber>([^<]+)</xal:ThoroughfareNumber>')
name_regex = re.compile(r'<xal:ThoroughfareName>([^<]+)</xal:ThoroughfareName>')

for gml in gml_files:
    print("Reading", os.path.basename(gml))
    with open(gml, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
    for m in bldg_regex.finditer(content):
        bid = m.group(1)
        b_block = m.group(0)
        nr_m = nr_regex.search(b_block)
        name_m = name_regex.search(b_block)
        if nr_m and name_m:
            nr = nr_m.group(1).strip()
            street = name_m.group(1).strip()
            addr_map[bid] = {"street": street, "nr": nr, "address": f"{street} {nr}"}

print(f"Total building addresses extracted: {len(addr_map)}")

# Save to assets/nrw/much/addresses.json
out_path = os.path.join("rabbit-of-duty", "assets", "nrw", "much", "addresses.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(addr_map, f, ensure_ascii=False, indent=2)

print(f"Saved {len(addr_map)} addresses to {out_path}")

# Check buildings on Hauptstraße
hauptstr = {bid: data["address"] for bid, data in addr_map.items() if "Haupt" in data["street"]}
print(f"Buildings on Hauptstraße: {len(hauptstr)}")
for bid, addr in sorted(hauptstr.items(), key=lambda x: x[1])[:40]:
    print(f"  {bid} -> {addr}")
