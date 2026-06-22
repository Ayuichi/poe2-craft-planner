#!/usr/bin/env python3
"""
Stage 4 data extras -- Craft of Exile backbone
==============================================
Extracts the data the endgame-method planner needs (see ../planner-design-spec.md):

  * CATALYSTS (jewellery): catalyst -> the mod tag(s) it boosts. Pairs with the
    Omen of Catalysing Exaltation, which biases an exalt toward mods sharing the
    applied catalyst's tag. A catalyst boosts a target mod when its resolved tags
    intersect that mod's `mtags`.
  * BASE IMPLICITS: named bases carry implicit mods (Gold Amulet -> Rarity,
    Solar Amulet -> Spirit, Dusk Amulet -> +1 Prefix slot, ...). Lets the planner
    say "buy a base whose IMPLICIT already gives this stat" instead of crafting it.

Source: the same cached CoE dump used by build_dataset.py (pipeline/cache/coe_poec_data.json).
Output: ../data/poe2_catalysts.json, ../data/poe2_implicits.json

NOTE: quality BREAKPOINTS (e.g. +3 -> +4 Level of all Melee Skills at 34% attack
quality) are a quality-scaling rule, not present in the CoE dump. The catalyst
table here establishes WHICH quality type scales WHICH mods (the prerequisite);
the exact breakpoint % per mod family is still a TODO (derive or pull from poe2db).
"""
import json, os, datetime
import build_dataset as bd  # reuse load_coe() + classify()

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")


def resolve_catalyst_tags(raw, mtype_names_lower):
    """Map a catalyst's raw '|defences|jewellery_defense|' tag string to the mod
    tag-vocabulary (mtype names) used in each mod's `mtags`."""
    out = []
    for t in (raw or "").split("|"):
        t = t.strip()
        if not t:
            continue
        for cand in (t, t.replace("jewellery_", ""), t.replace("_", " ")):
            key = cand.lower()
            if key in mtype_names_lower:
                out.append(mtype_names_lower[key])
                break
    return sorted(set(out))


def main():
    j = bd.load_coe(bd.DEFAULT_CACHE)

    # mtype id->name and a lowercase name->name index for tag resolution.
    mtype_names_lower = {m["name_mtype"].lower(): m["name_mtype"] for m in j["mtypes"]["seq"]}

    # ---- catalysts ----
    catalysts = []
    for c in j["catalysts"]["seq"]:
        tags = resolve_catalyst_tags(c.get("tags"), mtype_names_lower)
        catalysts.append({
            "id": c["id_catalyst"],
            "name": c["name_catalyst"],
            "tags": tags,            # resolved mtag names this catalyst boosts
            "raw": c.get("tags"),
        })
    catalysts.sort(key=lambda c: c["name"])

    # ---- base implicits ----
    bases = {b["id_base"]: b for b in j["bases"]["seq"]}
    by_class = {}
    for b in j["bitems"]["seq"]:
        raw_imp = b.get("implicits")
        if not raw_imp:
            continue
        gen = bases.get(b["id_base"])
        if not gen:
            continue
        cls = bd.classify(gen["name_base"])
        if not cls:
            continue
        try:
            imps = json.loads(raw_imp)
        except Exception:
            continue
        # CoE occasionally joins two implicits with the literal token "SEP".
        flat = []
        for s in imps:
            flat.extend(part.strip() for part in str(s).split("SEP") if part.strip())
        if not flat:
            continue
        try:
            dl = int(b.get("drop_level") or 1)
        except Exception:
            dl = 1
        by_class.setdefault(cls, []).append({
            "name": b["name_bitem"], "drop_level": dl, "implicits": flat,
        })
    for cls in by_class:
        by_class[cls].sort(key=lambda x: (x["drop_level"], x["name"]))

    built = datetime.datetime.utcnow().isoformat() + "Z"
    json.dump({"_meta": {"source": "craftofexile.com poec_data.json", "built": built,
                         "count": len(catalysts)}, "catalysts": catalysts},
              open(os.path.join(DATA, "poe2_catalysts.json"), "w"), indent=1)
    json.dump({"_meta": {"source": "craftofexile.com poec_data.json", "built": built,
                         "classes": len(by_class),
                         "bases": sum(len(v) for v in by_class.values())}, "byClass": by_class},
              open(os.path.join(DATA, "poe2_implicits.json"), "w"), separators=(",", ":"))

    print(f"catalysts={len(catalysts)}  implicit-bases={sum(len(v) for v in by_class.values())} across {len(by_class)} classes")
    print("\nCATALYSTS:")
    for c in catalysts:
        print(f"  {c['name']:14} -> {c['tags']}")
    print("\nIMPLICITS per class:")
    for cls in sorted(by_class):
        print(f"  {cls:14} {len(by_class[cls])}")


if __name__ == "__main__":
    main()
