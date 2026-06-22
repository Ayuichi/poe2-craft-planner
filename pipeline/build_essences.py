#!/usr/bin/env python3
"""Parses cached poe2db essence index -> ../data/poe2_essences.json (item-class-aware)."""
import argparse, json, os, re, datetime

HERE = os.path.dirname(os.path.abspath(__file__))

ARMOUR_ALL = ["Body Armour", "Helmet", "Gloves", "Boots", "Shield", "Buckler"]
ONEH_MELEE = ["One Hand Sword", "One Hand Axe", "One Hand Mace", "Claw", "Dagger", "Flail", "Spear"]
TWOH_MELEE = ["Two Hand Sword", "Two Hand Axe", "Two Hand Mace", "Warstaff"]
MARTIAL = ONEH_MELEE + TWOH_MELEE + ["Bow", "Crossbow"]
JEWELLERY = ["Amulet", "Talisman", "Ring", "Belt"]
EQUIPMENT = sorted(set(ARMOUR_ALL + JEWELLERY + MARTIAL + ["Wand", "Staff", "Focus", "Sceptre", "Quiver"]))

DIRECT = {
    "belt": ["Belt"], "body armour": ["Body Armour"], "helmet": ["Helmet"],
    "shield": ["Shield", "Buckler"], "amulet": ["Amulet", "Talisman"],
    "boots": ["Boots"], "gloves": ["Gloves"], "ring": ["Ring"],
    "wand": ["Wand"], "staff": ["Staff"], "focus": ["Focus"], "foci": ["Focus"],
    "sceptre": ["Sceptre"], "bow": ["Bow"], "crossbow": ["Crossbow"],
    "quiver": ["Quiver"], "spear": ["Spear"], "flail": ["Flail"],
    "claw": ["Claw"], "dagger": ["Dagger"],
}
GROUPS = {
    "jewellery": JEWELLERY, "equipment": EQUIPMENT,
    "armour": ARMOUR_ALL, "equippable armours": ARMOUR_ALL, "equippable armour": ARMOUR_ALL,
    "martial weapon": MARTIAL, "martial weapons": MARTIAL,
    "melee weapon": ONEH_MELEE + TWOH_MELEE, "melee weapons": ONEH_MELEE + TWOH_MELEE,
    "one handed melee weapon": ONEH_MELEE, "one hand melee weapon": ONEH_MELEE,
    "two handed melee weapon": TWOH_MELEE, "two hand melee weapon": TWOH_MELEE,
}

IMG_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
LINK_RE = re.compile(r"\[([^\]]*)\]\([^)]*\)")
HEADER_RE = re.compile(r"^(Lesser |Greater |Perfect )?Essence of .+$")

def strip_md(line):
    return LINK_RE.sub(r"\1", IMG_RE.sub("", line)).strip()

def parse_classes(spec):
    spec = spec.replace(" or ", ",")
    out, seen = [], set()
    for tok in spec.split(","):
        key = tok.strip().lower()
        if not key:
            continue
        mapped = DIRECT.get(key) or GROUPS.get(key) or [tok.strip()]
        for c in mapped:
            if c not in seen:
                seen.add(c); out.append(c)
    return out

def family_from_name(name):
    m = re.match(r"^(?:Lesser |Greater |Perfect )?Essence of (?:the )?(.+)$", name)
    return m.group(1) if m else name

def tier_from_name(name):
    for t in ("Lesser", "Greater", "Perfect"):
        if name.startswith(t + " "):
            return t
    return "Normal"

def parse(text):
    essences, cur = [], None
    for raw in text.splitlines():
        s = strip_md(raw)
        if s.startswith("##### Essence Ref"):
            break
        if not s:
            continue
        if HEADER_RE.match(s) and "Stack Size" not in s:
            cur = {"name": s, "family": family_from_name(s), "tier": tier_from_name(s), "mode": None, "grants": []}
            essences.append(cur); continue
        if cur is None or s.startswith("Stack Size"):
            continue
        if "guaranteed modifier" in s:
            cur["mode"] = "remove_add" if "Removes a random modifier" in s else "magic_to_rare"; continue
        if ":" in s:
            spec, mod = s.split(":", 1)
            cur["grants"].append({"classes_raw": spec.strip(), "classes": parse_classes(spec), "mod": mod.strip()})
    return [e for e in essences if e["grants"]]


# Essences VERIFIED in-game but absent from the cached poe2db scrape (added after the cache, or
# missed by the parser). Source: in-game screenshot. Keep minimal + cite. Merged in main().
SUPPLEMENT = [
    {"name": "Essence of the Breach", "family": "Breach", "tier": "Normal", "mode": "remove_add",
     "grants": [{"classes_raw": "Jewellery", "classes": ["Amulet", "Talisman", "Ring", "Belt"],
                 "mod": "+20% to Maximum Quality"}]},
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(HERE, "cache", "poe2db_essence.md"))
    ap.add_argument("--out", default=os.path.join(HERE, "..", "data", "poe2_essences.json"))
    a = ap.parse_args()
    with open(a.cache, encoding="utf-8") as f:
        essences = parse(f.read())
    have = {e["name"] for e in essences}
    for sup in SUPPLEMENT:
        if sup["name"] not in have:
            essences.append(sup)
    payload = {"_meta": {"source": "https://poe2db.tw/us/Essence (cached markdown render)",
        "built": datetime.datetime.utcnow().isoformat() + "Z", "count": len(essences),
        "note": "Real per-item-class guaranteed-mod table. tier=Lesser|Normal|Greater|Perfect; mode=magic_to_rare (add) | remove_add (Perfect)."},
        "essences": essences}
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)
    print("parsed %d essences -> %s" % (len(essences), a.out))

if __name__ == "__main__":
    main()
