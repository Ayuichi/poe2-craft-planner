#!/usr/bin/env python3
"""
PoE2 Crafting Calculator - data pipeline
=========================================
Downloads RePoE2 game-file exports and normalizes them into a lean dataset
keyed by item class, with prefix/suffix pools (ilvl gates, mod groups, spawn
tags, stat ranges, essence-only flags). This dataset is the foundation the
goal->path planner reasons over.

Source: https://repoe-fork.github.io/poe2/  (JSON exported from 0.5 game files)

Notes
-----
* Spawn weights in 0.5 are flattened to 1 (GGG did not ship differential
  weights). So we record tag *eligibility* (can this mod roll on this base at
  all) but treat probabilities as uniform-within-eligible-pool, not true odds.
* Eligibility = base.tags intersects the mod's positive-weight tags.

Usage:  python build_dataset.py [--out DIR] [--cache DIR]
Output: <out>/poe2_mods_by_class.json   (normalized, the main artifact)
        <out>/poe2_bases.json           (base list per class)
        <out>/poe2_meta.json            (version, counts, build info)
"""
import argparse, json, os, sys, urllib.request, datetime

BASE_URL = "https://repoe-fork.github.io/poe2/"
FILES = {
    "base_items": "base_items.min.json",
    "mods": "mods.min.json",
    "tags": "tags.min.json",
}

def fetch(fname, cache_dir):
    """Download a RePoE2 file, caching locally to avoid re-downloads."""
    os.makedirs(cache_dir, exist_ok=True)
    local = os.path.join(cache_dir, fname)
    if os.path.exists(local) and os.path.getsize(local) > 0:
        return open(local, "rb").read()
    req = urllib.request.Request(BASE_URL + fname, headers={"User-Agent": "Mozilla/5.0"})
    data = urllib.request.urlopen(req, timeout=120).read()
    open(local, "wb").write(data)
    return data

def load_repoe(cache_dir):
    out = {}
    for key, fname in FILES.items():
        raw = fetch(fname, cache_dir)
        out[key] = json.loads(raw)
        print(f"  loaded {key}: {len(out[key])} entries ({len(raw)//1024} KB)")
    return out

def positive_tags(mod):
    return {sw["tag"] for sw in mod.get("spawn_weights", []) if sw.get("weight", 0) > 0}

def normalize_mod(mod_id, mod):
    """Compact, planner-friendly record for one craftable mod."""
    stats = [{"id": s.get("id"), "min": s.get("min"), "max": s.get("max")}
             for s in mod.get("stats", [])]
    return {
        "id": mod_id,
        "name": mod.get("name", ""),          # affix name e.g. "Beryl"
        "text": mod.get("text", ""),          # human text w/ ranges
        "side": mod.get("generation_type"),   # prefix | suffix
        "group": mod.get("groups", []),       # exclusivity group(s)
        "ilvl": mod.get("required_level", 1), # ilvl gate for this tier
        "tags": sorted(positive_tags(mod)),   # spawn tags (eligibility)
        "stat_ids": [s.get("id") for s in mod.get("stats", [])],
        "stats": stats,
        "essence_only": mod.get("is_essence_only", False),
    }

def build(repoe):
    base_items, mods = repoe["base_items"], repoe["mods"]

    # 1) Released item bases grouped by item_class
    bases_by_class = {}
    base_meta = {}
    for meta_id, b in base_items.items():
        if b.get("domain") != "item":
            continue
        if b.get("release_state") not in (None, "released"):
            continue
        ic = b.get("item_class")
        if not ic or not b.get("name"):
            continue
        rec = {
            "id": meta_id,
            "name": b["name"],
            "item_class": ic,
            "tags": sorted(b.get("tags", [])),
            "drop_level": b.get("drop_level", 1),
            "implicits": b.get("implicits", []),
        }
        base_meta[meta_id] = rec
        bases_by_class.setdefault(ic, []).append(rec)

    # 2) Craftable item-domain prefix/suffix mods + essence mods
    pref_suf, essence_mods = [], []
    for mid, m in mods.items():
        dom, gen = m.get("domain"), m.get("generation_type")
        if dom == "item" and gen in ("prefix", "suffix"):
            pref_suf.append((mid, m))
        elif gen == "essence":
            essence_mods.append((mid, m))

    # 3) Per item_class, the eligible prefix/suffix pool.
    #    A mod is eligible for a class if its positive tags intersect the
    #    union of tags across that class's bases.
    out_classes = {}
    for ic, bases in bases_by_class.items():
        class_tags = set()
        for b in bases:
            class_tags.update(b["tags"])
        prefixes, suffixes = [], []
        for mid, m in pref_suf:
            if positive_tags(m) & class_tags:
                nm = normalize_mod(mid, m)
                (prefixes if nm["side"] == "prefix" else suffixes).append(nm)
        if not prefixes and not suffixes:
            continue
        prefixes.sort(key=lambda x: (x["group"], x["ilvl"]))
        suffixes.sort(key=lambda x: (x["group"], x["ilvl"]))
        out_classes[ic] = {
            "item_class": ic,
            "base_count": len(bases),
            "prefix_count": len(prefixes),
            "suffix_count": len(suffixes),
            "prefixes": prefixes,
            "suffixes": suffixes,
        }

    return bases_by_class, out_classes, len(pref_suf), len(essence_mods)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="../data")
    ap.add_argument("--cache", default="./.cache")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    print("Downloading RePoE2 export...")
    repoe = load_repoe(args.cache)
    print("Normalizing...")
    bases_by_class, classes, n_ps, n_ess = build(repoe)

    json.dump(classes, open(os.path.join(args.out, "poe2_mods_by_class.json"), "w"))
    json.dump(bases_by_class, open(os.path.join(args.out, "poe2_bases.json"), "w"))
    meta = {
        "source": BASE_URL,
        "built_at": datetime.datetime.utcnow().isoformat() + "Z",
        "item_classes": len(classes),
        "craftable_prefix_suffix_mods": n_ps,
        "essence_mods": n_ess,
        "note": "0.5 spawn weights are flattened to 1; eligibility is tag-based, odds are uniform-approx only.",
    }
    json.dump(meta, open(os.path.join(args.out, "poe2_meta.json"), "w"), indent=2)
    print(f"Done. {len(classes)} item classes -> {args.out}")

if __name__ == "__main__":
    main()
