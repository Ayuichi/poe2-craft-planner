#!/usr/bin/env python3
"""
Specific item-base builder -- Craft of Exile backbone
=====================================================
The main dataset (build_dataset.py) keys everything off the CRAFTING base: the
crafting-equivalent group that determines the mod pool (e.g. a single "Warstaff",
or "Body Armour (STR)"). Within one crafting base there are many SPECIFIC named
in-game bases that share an identical mod pool (Wrapped / Long / Gothic / ...
Quarterstaff). Guides tell people to pick a specific one (higher base crit etc.),
so surfacing them makes the tool far easier to grasp for new crafters.

These specific bases live in CoE's `bitems` collection (which build_dataset.py
ignores). Each bitem carries an image path -- exactly the in-game icon -- so the
app can show "this is the thing you picked".

This is a DISPLAY-only layer: the specific base never changes mod eligibility or
odds (every specific base under a crafting base shares the same pool). The app
keeps keying legality/odds off the crafting base; the specific base only drives
the shown name + image.

Source: pipeline/cache/coe_poec_data.json (the same `poecd={...}` dump).
Output: ../data/poe2_item_bases.json
  { "byClass": { <itemClass>: [ {name, base, drop_level, img, implicits?}, ... ] },
    "meta": {...} }
  where `base` = the crafting base name (matches poe2_bases.json), so the app can
  filter the specific bases down to whichever crafting base is selected.

`img` is CoE's relative path (e.g. "Weapons/TwoHandWeapons/Staves/FourQuarterstaff1.webp").
The app references it under app/assets/bases/<img>; run fetch_base_images.py to
download the files there (kept out of this script so the data build needs no network).
"""
import argparse, json, os, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)  # reuse classify()/load_coe() so the class mapping never drifts
from build_dataset import classify, load_coe  # noqa: E402

DEFAULT_CACHE = os.path.join(HERE, "cache", "coe_poec_data.json")
DATA = os.path.join(HERE, "..", "data")


def _int(v, default=1):
    s = str(v if v is not None else "")
    return int(s) if s.isdigit() else default


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=DEFAULT_CACHE)
    ap.add_argument("--out", default=DATA)
    ap.add_argument("--keep-legacy", action="store_true",
                    help="include is_legacy bases (removed from the game); off by default")
    a = ap.parse_args()
    j = load_coe(a.cache)

    bgroups = {b["id_bgroup"]: b for b in j["bgroups"]["seq"]}
    craftable_bg = {gid for gid, g in bgroups.items() if g.get("is_craftable") == "1"}
    bases = {b["id_base"]: b for b in j["bases"]["seq"]}

    # base id -> (class, crafting-base name) -- identical rule to build_dataset.py.
    base_class, base_name = {}, {}
    for bid, b in bases.items():
        if b["id_bgroup"] not in craftable_bg:
            continue
        cls = classify(b["name_base"])
        if not cls:
            continue
        base_class[bid] = cls
        base_name[bid] = b["name_base"]

    by_class = {}
    skipped_legacy = 0
    no_img = 0
    for it in j["bitems"]["seq"]:
        bid = it.get("id_base")
        if bid not in base_class:
            continue  # bitem of a non-craftable / unmapped base (flasks, jewels, ...)
        if it.get("is_legacy") == "1" and not a.keep_legacy:
            skipped_legacy += 1
            continue
        cls = base_class[bid]
        img = it.get("imgurl") or ""
        if not img:
            no_img += 1
        rec = {
            "name": it["name_bitem"],
            "base": base_name[bid],          # crafting base -> matches poe2_bases.json
            "drop_level": _int(it.get("drop_level")),
            "img": img,                       # relative; see fetch_base_images.py
        }
        # keep implicits when present -- not used by v1 UI, but free for a later
        # "why this base" stat callout, and tiny in the file.
        try:
            imp = json.loads(it.get("implicits") or "null")
            if imp:
                rec["implicits"] = imp
        except Exception:
            pass
        by_class.setdefault(cls, []).append(rec)

    for cls in by_class:
        by_class[cls].sort(key=lambda r: (r["base"], r["drop_level"], r["name"]))

    payload = {
        "byClass": by_class,
        "meta": {
            "source": "craftofexile.com poec_data.json (bitems)",
            "built": datetime.datetime.utcnow().isoformat() + "Z",
            "note": "specific in-game bases; display-only, do not affect mod pool",
            "classes": len(by_class),
            "bases": sum(len(v) for v in by_class.values()),
        },
    }
    os.makedirs(os.path.abspath(a.out), exist_ok=True)
    path = os.path.join(a.out, "poe2_item_bases.json")
    json.dump(payload, open(path, "w"), separators=(",", ":"))

    total = payload["meta"]["bases"]
    print(f"Wrote {path}: {len(by_class)} classes, {total} specific bases "
          f"(skipped {skipped_legacy} legacy, {no_img} without an image).")
    for cls in sorted(by_class):
        print(f"  {cls:<18} {len(by_class[cls]):>3}")


if __name__ == "__main__":
    main()
