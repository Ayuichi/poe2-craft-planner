#!/usr/bin/env python3
"""
Socketables builder -- Craft of Exile backbone (Phase A of the T2 plan)
======================================================================
Extracts the runes / soul cores / idols that CHANGE how an item can be crafted,
from the same cached CoE dump used by build_dataset.py (the `socketables` block).

Why this matters: the planner assumes one crafted slot + one desecrated slot + 3
prefixes / 3 suffixes. Some socketables relax exactly those limits, so a real craft
can be MORE deterministic than the engine can currently express. This step makes that
data available; Phases C/D wire it into legality + the planner.

Each socketable is classified by EFFECT:
  * cap_crafted  -- "Can have # additional Crafted Modifier"  (e.g. Astrid's Creativity)
                    => +1 crafted-mod slot (place a 2nd guaranteed essence/alloy)
  * cap_suffix   -- "+# Suffix Modifier allowed"              (e.g. Serle's Triumph)
                    => 7th modifier (suffix only; no prefix equivalent exists in the data)
  * cap_prefix   -- "+# Prefix Modifier allowed"              (none found yet; handled anyway)
  * pool_unlock  -- "Can roll <Family> modifiers"             (e.g. Kolr's Hunt -> Marksman)
                    => adds a tag family to the eligible pool for the listed item classes
  * grant_mod    -- everything else (the rune ladder, lich Gazes, Iron runes, idols)

Lich Gazes (soul cores) are tagged with `lich` (Kurgal / Amanamu / Ulaman) so the planner
can offer a socket-based alternative to desecration and name the matching omen
(Blackblooded->Kurgal, Liege->Amanamu, Sovereign->Ulaman).

Output: ../data/poe2_socketables.json
"""
import json, os, re, datetime
import build_dataset as bd  # reuse load_coe(), classify(), DEFAULT_CACHE, DATA

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")

CAP_CRAFTED = re.compile(r"additional Crafted Modifier", re.I)
CAP_SUFFIX  = re.compile(r"Suffix Modifier allowed", re.I)
CAP_PREFIX  = re.compile(r"Prefix Modifier allowed", re.I)
POOL_UNLOCK = re.compile(r"Can roll (.+?) modifiers", re.I)
LICH        = re.compile(r"^(Kurgal|Amanamu|Ulaman)'s Gaze$")
NUM         = re.compile(r"-?\d+(?:\.\d+)?")

CATEGORY_SLOTS = ("all", "armour", "weapons", "caster")


def classify_effect(text):
    """Return (effect, value, unlocks) for a granted-mod text."""
    if CAP_CRAFTED.search(text):
        m = NUM.search(text)
        return "cap_crafted", int(float(m.group())) if m else 1, None
    if CAP_SUFFIX.search(text):
        m = NUM.search(text)
        return "cap_suffix", int(float(m.group())) if m else 1, None
    if CAP_PREFIX.search(text):
        m = NUM.search(text)
        return "cap_prefix", int(float(m.group())) if m else 1, None
    mu = POOL_UNLOCK.search(text)
    if mu:
        return "pool_unlock", None, mu.group(1).strip()
    return "grant_mod", None, None


def main():
    j = bd.load_coe(bd.DEFAULT_CACHE)
    modname = {m["id_modifier"]: (m.get("name_modifier") or "") for m in j["modifiers"]["seq"]}
    bgname = {b["id_bgroup"]: b["name_bgroup"] for b in j["bgroups"]["seq"]}
    basename = {b["id_base"]: b["name_base"] for b in j["bases"]["seq"]}

    def resolve_bases_to_classes(base_ids):
        out = set()
        for bid in (base_ids or []):
            nm = basename.get(str(bid))
            if not nm:
                continue
            cls = bd.classify(nm)
            if cls:
                out.add(cls)
        return sorted(out)

    socketables = []
    for it in j["socketables"]["seq"]:
        try:
            mm = json.loads(it.get("mods") or "{}")
        except Exception:
            mm = {}

        # placements: list of (scope_key, granted_text). scope_key is a class name,
        # or one of the broad category labels (all/armour/weapons/caster), or a bgroup name.
        placements = []
        for cat in CATEGORY_SLOTS:
            mid = mm.get(cat)
            if mid:
                placements.append((cat, modname.get(str(mid), "").strip()))
        for entry in (mm.get("class") or []):
            text = modname.get(str(entry.get("mod")), "").strip()
            if not text:
                continue
            classes = resolve_bases_to_classes(entry.get("bases"))
            if not classes:
                bg = bgname.get(str(entry.get("bgroup")))
                classes = [bg] if bg else ["(unmapped)"]
            for c in classes:
                placements.append((c, text))

        if not placements:
            # no resolvable granted mod (rare); still record name/type for completeness
            socketables.append({"id": it["id_socketable"], "name": it["name_socketable"],
                                 "stype": it.get("stype"), "effect": "grant_mod",
                                 "value": None, "unlocks": None, "lich": None,
                                 "scope": [], "grants": [], "byScope": {}})
            continue

        # effect = the strongest structural pattern any placement matches
        effect, value, unlocks = "grant_mod", None, None
        for _, text in placements:
            e, v, u = classify_effect(text)
            if e != "grant_mod":
                effect, value, unlocks = e, v, u
                break

        by_scope = {}
        for scope, text in placements:
            by_scope.setdefault(scope, [])
            if text not in by_scope[scope]:
                by_scope[scope].append(text)

        lich = None
        ml = LICH.match(it["name_socketable"])
        if ml:
            lich = ml.group(1)

        socketables.append({
            "id": it["id_socketable"],
            "name": it["name_socketable"],
            "stype": it.get("stype"),
            "effect": effect,
            "value": value,                 # caps: how many slots added (default 1)
            "unlocks": unlocks,             # pool_unlock: the tag family (e.g. "Marksman")
            "lich": lich,                   # Kurgal/Amanamu/Ulaman for the lich Gazes
            "scope": sorted(by_scope.keys()),
            "grants": sorted({t for ts in by_scope.values() for t in ts}),
            "byScope": by_scope,            # scope -> [granted mod texts] (precise per-class)
        })

    socketables.sort(key=lambda s: (s["stype"] or "", s["name"]))

    structural = [s for s in socketables if s["effect"] in ("cap_crafted", "cap_suffix", "cap_prefix", "pool_unlock")]
    gazes = [s for s in socketables if s["lich"]]

    built = datetime.datetime.utcnow().isoformat() + "Z"
    payload = {
        "_meta": {"source": "craftofexile.com poec_data.json (socketables)", "built": built,
                  "count": len(socketables),
                  "structural": len(structural), "gazes": len(gazes)},
        "socketables": socketables,
    }
    out_path = os.path.join(DATA, "poe2_socketables.json")
    json.dump(payload, open(out_path, "w"), separators=(",", ":"))

    # ---- report ----
    from collections import Counter
    print(f"socketables={len(socketables)}  by stype:", dict(Counter(s["stype"] for s in socketables)))
    print(f"structural (cap/pool) = {len(structural)}, lich gazes = {len(gazes)}\n")
    print("STRUCTURAL (the engine-relevant ones):")
    for s in structural:
        extra = f"x{s['value']}" if s["value"] else (s["unlocks"] or "")
        print(f"  [{s['effect']:11}] {s['name']:22} {extra:10} scope={s['scope']}")
    print("\nLICH GAZES:")
    for s in gazes:
        print(f"  {s['name']:18} lich={s['lich']:8} -> {s['byScope']}")


if __name__ == "__main__":
    main()
