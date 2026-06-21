#!/usr/bin/env python3
"""
PoE2 dataset builder -- Craft of Exile backbone
===============================================
Parses Craft of Exile's PoE2 data dump (poec_data.json) into our normalized,
item-class-keyed dataset WITH real (community-extrapolated) mod weights, per-tier
ilvl + numeric ranges, tags, and exclusivity groups.

This REPLACES the old RePoE2 builder (kept as build_dataset_repoe.py). RePoE2's
spawn weights are flattened to 0/1 in the 0.5 export, so it cannot give odds. CoE
publishes extrapolated weights (their own "special method" -- not official GGG
data, so weights are ESTIMATES; labelled as such downstream).

Source: https://www.craftofexile.com/json/poe2/main/poec_data.json  (a `poecd={...}`
JS assignment; cached at pipeline/cache/coe_poec_data.json). Re-fetch to refresh.

Output: ../data/poe2_mods_by_class.json   class -> {bases[], prefixes[], suffixes[]}
        ../data/poe2_bases.json           class -> [bases]
        ../data/poe2_meta.json

Mod record (one per modifier, NOT per tier):
  { id, name, text, side, group[], tags[], mtags[], essence_only,
    ilvl,                      # min tier ilvl across the bases it rolls on
    bw: { baseName: [[ilvl, weight], ...] } }   # per-base tier ladder (odds source)
`tags` = the list of base names this mod rolls on within its class. With each
base carrying tags=[its own name], the existing tag-intersection eligibility
engine (app.js modEligible) then yields EXACT per-base eligibility for free.
"""
import argparse, json, os, re, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CACHE = os.path.join(HERE, "cache", "coe_poec_data.json")
DATA = os.path.join(HERE, "..", "data")

# CoE base name -> our planner item class.
CLASS_OVERRIDES = {
    "Wand": "Wand", "Sceptre": "Sceptre", "Staff": "Staff", "Warstaff": "Warstaff",
    "Talisman": "Talisman", "Bow": "Bow", "Crossbow": "Crossbow", "Spear": "Spear",
    "Claw": "Claw", "Dagger": "Dagger", "Flail": "Flail", "Quiver": "Quiver",
    "Focus": "Focus", "Amulet": "Amulet", "Belt": "Belt", "Ring": "Ring",
    "One Hand Axe": "One Hand Axe", "One Hand Mace": "One Hand Mace",
    "One Hand Sword": "One Hand Sword", "Two Hand Axe": "Two Hand Axe",
    "Two Hand Mace": "Two Hand Mace", "Two Hand Sword": "Two Hand Sword",
}
PREFIX_CLASS = [
    ("Body Armour", "Body Armour"), ("Helmet", "Helmet"), ("Boots", "Boots"),
    ("Gloves", "Gloves"), ("Buckler", "Buckler"), ("Shield", "Shield"),
    ("Wand", "Wand"), ("Staff", "Staff"),
]

def classify(name_base):
    if name_base in CLASS_OVERRIDES:
        return CLASS_OVERRIDES[name_base]
    for pfx, cls in PREFIX_CLASS:
        if name_base.startswith(pfx):
            return cls
    # elemental/attribute weapon variants: "Fire Wand", "Chaos Staff", ...
    if name_base.endswith(" Wand"):
        return "Wand"
    if name_base.endswith(" Staff"):
        return "Staff"
    return None  # unmapped (Charms/Flasks/Jewels/Tablets/Waystones etc.) -> skipped

def load_coe(cache):
    raw = open(cache, encoding="utf-8").read()
    raw = raw[raw.index("=") + 1:]
    return json.loads(raw)

def fill_text(template, nvalues):
    """'+# to maximum Mana' + [[10,14]] -> '+(10-14) to maximum Mana'."""
    vals = list(nvalues)
    def repl(_):
        if not vals:
            return "#"
        v = vals.pop(0)
        if isinstance(v, (list, tuple)):
            lo, hi = (list(v) + [v[0]])[:2] if v else (0, 0)
        else:
            lo = hi = v
        return f"({lo}-{hi})" if lo != hi else f"{lo}"
    return re.sub(r"#", repl, template)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=DEFAULT_CACHE)
    ap.add_argument("--out", default=DATA)
    a = ap.parse_args()
    j = load_coe(a.cache)

    bgroups = {b["id_bgroup"]: b for b in j["bgroups"]["seq"]}
    craftable_bg = {gid for gid, g in bgroups.items() if g.get("is_craftable") == "1"}
    bases = {b["id_base"]: b for b in j["bases"]["seq"]}
    mods = {m["id_modifier"]: m for m in j["modifiers"]["seq"]}
    mtype_name = {m["id_mtype"]: m["name_mtype"] for m in j["mtypes"]["seq"]}
    tiers = j["tiers"]

    # base id -> (class, base name).  Only craftable bgroups, only mappable bases.
    base_class, base_name = {}, {}
    for bid, b in bases.items():
        if b["id_bgroup"] not in craftable_bg:
            continue
        cls = classify(b["name_base"])
        if not cls:
            continue
        base_class[bid] = cls
        base_name[bid] = b["name_base"]

    def mtags(m):
        ids = [t for t in (m.get("mtypes") or "").split("|") if t]
        return sorted({mtype_name.get(t, t) for t in ids})

    def exclusivity(m):
        try:
            g = json.loads(m.get("modgroups") or "[]")
            return g if isinstance(g, list) else []
        except Exception:
            return []

    # Assemble per-class mod pools, bucketed by SOURCE (mgroup): Base mods are
    # exalt-rollable (the real slam pool); Desecrated mods come ONLY from desecration
    # (own pool); Essence-only / influence mods are excluded (not slammable).
    SOURCE = {"1": "base", "10": "desecrated"}
    classes = {}  # cls -> {bases, prefixes, suffixes, desecrated}
    for mid, m in mods.items():
        if m["affix"] not in ("prefix", "suffix"):
            continue
        src = SOURCE.get(m.get("id_mgroup"))
        if src is None:
            continue  # essence-only (13) / influence etc. are not exalt-rollable
        tb = tiers.get(mid)
        if not tb:
            continue
        # group this modifier's per-base ladders by class
        by_class = {}  # cls -> {baseName: [[ilvl,weight],...]}
        for bid, tlist in tb.items():
            if bid not in base_class:
                continue
            cls, bname = base_class[bid], base_name[bid]
            ladder = []
            for x in tlist:
                w = int(x["weighting"])
                if w <= 0:
                    continue
                try:
                    nv = json.loads(x.get("nvalues") or "[]")
                except Exception:
                    nv = []
                # per-tier: [ilvl, weight, filled tier text] so the picker can show the
                # real tier ladder for THIS base (tiers/values differ per base).
                ladder.append([int(x["ilvl"]), w, fill_text(m["name_modifier"], nv)])
            if not ladder:
                continue
            ladder.sort(key=lambda r: r[0])
            by_class.setdefault(cls, {})[bname] = ladder
        if not by_class:
            continue
        # representative display text: top tier (max ilvl) of any base
        rep_base = max(tb.items(), key=lambda kv: max((int(x["ilvl"]) for x in kv[1]), default=0))
        rep_tier = max(rep_base[1], key=lambda x: int(x["ilvl"]))
        try:
            nvals = json.loads(rep_tier.get("nvalues") or "[]")
        except Exception:
            nvals = []
        text = fill_text(m["name_modifier"], nvals)
        for cls, bw in by_class.items():
            c = classes.setdefault(cls, {"bases": {}, "prefixes": {}, "suffixes": {}, "desecrated": {}})
            min_ilvl = min(l[0][0] for l in bw.values())
            rec = {
                "id": mid, "name": m["name_modifier"], "text": text,
                "side": m["affix"], "group": exclusivity(m), "tags": sorted(bw.keys()),
                "mtags": mtags(m), "essence_only": False, "ilvl": min_ilvl, "bw": bw, "src": src,
            }
            if src == "desecrated":
                c["desecrated"][mid] = rec
            else:
                (c["prefixes"] if m["affix"] == "prefix" else c["suffixes"])[mid] = rec

    # Bases per class (only those that actually carry mods).
    for bid, cls in base_class.items():
        if cls not in classes:
            continue
        b = bases[bid]
        classes[cls]["bases"][base_name[bid]] = {
            "name": base_name[bid], "tags": [base_name[bid]],
            "drop_level": int(b.get("drop_level") or 1) if str(b.get("drop_level") or "1").isdigit() else 1,
            "id": bid,
        }

    # Finalize -> lists.
    out, bases_out = {}, {}
    for cls, c in sorted(classes.items()):
        blist = sorted(c["bases"].values(), key=lambda b: (b["drop_level"], b["name"]))
        out[cls] = {
            "bases": blist,
            "prefixes": sorted(c["prefixes"].values(), key=lambda m: (m["ilvl"], m["name"])),
            "suffixes": sorted(c["suffixes"].values(), key=lambda m: (m["ilvl"], m["name"])),
            "desecrated": sorted(c["desecrated"].values(), key=lambda m: (m["side"], m["name"])),
        }
        bases_out[cls] = blist

    os.makedirs(os.path.abspath(a.out), exist_ok=True)
    json.dump(out, open(os.path.join(a.out, "poe2_mods_by_class.json"), "w"), separators=(",", ":"))
    json.dump(bases_out, open(os.path.join(a.out, "poe2_bases.json"), "w"), separators=(",", ":"))
    meta = {"source": "craftofexile.com poec_data.json (extrapolated weights)",
            "built": datetime.datetime.utcnow().isoformat() + "Z",
            "patch": "0.5 (Return of the Ancients)",
            "weights": "community-estimated (CoE), not official GGG data",
            "classes": len(out)}
    json.dump(meta, open(os.path.join(a.out, "poe2_meta.json"), "w"), indent=1)
    np = sum(len(v["prefixes"]) for v in out.values())
    ns = sum(len(v["suffixes"]) for v in out.values())
    nd = sum(len(v["desecrated"]) for v in out.values())
    print(f"classes={len(out)} prefixes={np} suffixes={ns} desecrated={nd}")
    for cls in sorted(out):
        print(f"  {cls:<16} bases={len(out[cls]['bases']):>2} P={len(out[cls]['prefixes']):>3} S={len(out[cls]['suffixes']):>3}")

if __name__ == "__main__":
    main()
