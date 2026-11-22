import json
import os

b_path = os.path.join("rabbit-of-duty", "assets", "nrw", "much", "buildings.json")
a_path = os.path.join("rabbit-of-duty", "assets", "nrw", "much", "addresses.json")

with open(b_path, "r", encoding="utf-8") as f:
    bj = json.load(f)

with open(a_path, "r", encoding="utf-8") as f:
    addrs = json.load(f)

updated = 0
for b in bj["b"]:
    bid = b.get("id")
    if bid in addrs:
        b["addr"] = addrs[bid]["address"]
        b["street"] = addrs[bid]["street"]
        b["nr"] = addrs[bid]["nr"]
        updated += 1

with open(b_path, "w", encoding="utf-8") as f:
    json.dump(bj, f, ensure_ascii=False)

print(f"Enriched {updated} buildings with official address in {b_path}")
