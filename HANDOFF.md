# PoE2 Craft Planner — Handoff / Project State

> Living state doc for anyone (incl. other Claude instances) picking up this project.
> Last updated: 2026-06-21 — after the CoE data migration (real weights), best-path ranking,
> and the desecration + fracture tactics. Working tree has uncommitted work on top of the
> `Stage 3` commit; see CHANGELOG.md for the push.

## What this is
A **goal → path** crafting planner for Path of Exile 2 (patch 0.5, *Return of the Ancients*).
Craft of Exile / Path of Crafting answer *method → odds*. This answers the reverse, underserved
question: **"I want THIS item — what's a path to actually make it?"** Mission = crafting
**literacy**: a clear, human-followable step-by-step route so anyone can craft. Exact COSTS stay
out of scope; odds are now shown as CoE-estimated weight-share ("~X% per slam"), with each step
honestly labelled deterministic / likely / gamble.

## Current state (TL;DR)
Works end-to-end: pick item class → base → mods (with real per-tier ladders), get ranked
crafting routes on the right with honest per-slam odds. What's live:
- **Data backbone = Craft of Exile** (`poec_data.json`): 27 classes, real per-base mod WEIGHTS
  + per-tier ilvl/value ranges, essences, desecrated-exclusive pool. RePoE2 retired.
- **Essences**: real item-class-aware guaranteed-mod table from poe2db (81 essences).
- **Best-path brain**: routes ranked by estimated effort (weights), ★ best tagged, pool-forcing taught.
- **5 strategy templates**: Essence anchor, Manual ladder, Alchemy cleanup, Desecration anchor
  (deterministic placement; honest that it's NOT annul-immune), Fracture-protected (gamble, can BRICK).
- 136 node assertions pass (`node pipeline/test_planner.js`).
Next up (not built): catalysts + the 34% quality → +4 breakpoint, runic alloys, Essence-of-Abyss
slot conversion, tier-aware paste parsing.

## Where it lives
- Folder: `G:\Sage-Cowork\Projects\PoE2 Tools`
- Repo: **https://github.com/Ayuichi/poe2-craft-planner** (public, default branch `main`)
- Git is already initialized, `origin` is set, and both commits are pushed. Pushing works via
  Windows Git Credential Manager (login `Ayuichi`) — no extra auth setup needed on this machine.

## Status
| Stage | What | State |
|---|---|---|
| 1 | Data pipeline (**Craft of Exile** → normalized mod/base dataset, RePoE2 retired) | ✅ done |
| 2 | Target builder + legality checker + item paste parser | ✅ done |
| 3 | Hybrid path planner (strategy templates + state-model validation) | ✅ done |
| 3.5 | Real ESSENCE data (poe2db → item-class-aware guaranteed-mod table) | ✅ done |
| 3.6 | **Real mod WEIGHTS** (CoE backbone migration → honest per-slam odds) | ✅ done |
| 3.7 | **Best-path brain** (weight-based route ranking + recommended tag + pool-forcing) | ✅ done |
| 3.8 | **Desecration tactic** (deterministic exclusive-mod placement + protected-slot teaching) | ✅ done |
| 3.9 | **Fracture tactic** (protect-a-mod route with HONEST brick risk + desecrate-denominator trick) | ✅ done |
| — | Real alloy/desecrate guaranteed-mod data | ⏳ next big win |
| — | Tauri wrap (small .exe) | ⏳ later |

## Repo layout
```
app/                  Self-contained web app (open app/index.html, runs offline via file://)
  index.html          UI: left = goal builder, right = goal card + legality + crafting path
  app.js              target builder + legality engine + paste parser + plan rendering
  planner.js          Stage 3: state-transition model + strategy templates → routes
  poe2_data.js        generated slim dataset (window.POE2); loaded via <script src>
data/                 poe2_mods_by_class.json (per class: bases, prefixes, suffixes [exalt-rollable, with `bw` weights], desecrated [exclusive pool]), poe2_bases.json, poe2_meta.json, poe2_essences.json
pipeline/
  build_dataset.py    Craft of Exile (cache/coe_poec_data.json) → ../data/*.json (with WEIGHTS)
  build_essences.py   cached poe2db essence page → ../data/poe2_essences.json
  build_app_data.py   ../data/*.json → ../app/poe2_data.js  (now also bundles essences)
  cache/coe_poec_data.json  cached Craft of Exile data dump (mods/bases/tiers/weights)
  cache/poe2db_essence.md   cached poe2db /us/Essence render
  test_planner.js     node smoke test for the planner (incl. gold-amulet regression)
crafting-knowledge-base.md   0.5 crafting systems reference (essences, omens, desecration, alloys)
README.md, .gitignore
```

## Key design decisions (don't relitigate without reason)
- **Planner brain = HYBRID.** Human-idiomatic *strategy templates* generate routes; a
  *state-transition model* (preconditions → effects) validates every emitted step is legal.
  Pure search was rejected — it misses non-obvious elaborate flows.
- **Odds via CoE weights (UPDATED 2026-06-21).** RePoE2's 0.5 export flattens spawn weights to
  0/1 (eligibility only), so it can't give odds. We migrated the data backbone to **Craft of
  Exile's `poec_data.json`**, which ships community-EXTRAPOLATED weights (not official GGG data,
  labelled as estimates). The planner now reports honest **weight-share odds** ("~X% per slam,
  about 1 in N") instead of a bare pool count. Steps are still labeled deterministic/likely/gamble.
  No official probabilities exist for 0.5; these are the best estimates available.
- **Output model.** A path = a sequence of item STATES with a crafting ACTION between each.
  Goal sits at the end; each target mod gets a step that places it. Actions list tier-variants
  (e.g. Transmute / Greater / Perfect) + a determinism flag.
- **Two 0.5 hard rules the model honors:** one crafted-mod slot per item; one desecrated-mod
  slot per item. No Orb of Scouring exists, so crafting is additive (good white bases matter).
- **Tech:** self-contained web app first (double-click `app/index.html`, offline; data via
  `<script src>` so `file://` works). Tauri wrap later. Distribute via the git repo.

## The engines (reuse these; don't rebuild)
**Legality (`app/app.js`)** — exported for node via `module.exports`:
- `modEligible(mod, baseTags, itemLevel)` — tag overlap ∩ ilvl gate
- `buildFamilies(...)` — groups a pool into mod families w/ tier ladders
- `checkLegality(target)` — rarity caps (Magic 1p/1s, Rare 3p/3s), group exclusivity
  (one mod per group), wrong-base + ilvl-gated + essence-only flags
- `parseItem(text)` — best-effort clipboard parse
- **Per-base filtering (EXACT now):** each base carries `tags:[its own name]` and each mod's
  `tags` = the exact list of base names it rolls on (from CoE `tiers[mod][base]`). Tag-intersection
  then yields exact per-base eligibility. Attribute/elemental variants (Body Armour (STR) vs (INT),
  Fire Wand vs Wand) are SEPARATE bases with their own weighted pools.

**Planner (`app/planner.js`)** — `window.POE2Planner` in browser, `module.exports` for node:
- `planRoutes(target, db)` → `{ routes:[...], notes:[...], reqIlvl }`
  - `target` = the builder's state object: `{ itemClass, baseName, baseTags, itemLevel, rarity, mods:[modObj...] }`
  - each `route` = `{ name, tagline, best, steps:[{ action, variants[], detail, determinism, state:{rarity, mods:[{text,side,kind}]} }] }`
  - `kind` on a state mod: `anchor` (guaranteed) | `target` (the one you want, gambled) |
    `incidental` (collateral junk to remove) | `fixed` (placed earlier)
- FIVE strategy templates (ranked by estimated effort; best tagged ★):
  1. **Essence anchor → Exalt fill** — only when a target mod is essence-forceable; guarantees
     the anchor, slams the rest.
  2. **Manual ladder** (Transmute → Augment → Regal → Exalt) — always available baseline.
     Respects the Magic 1p/1s cap (Transmute one side, Augment the *other*).
  3. **Alchemy → Chaos/Whittling cleanup** — brute force; Rare-goals only.
  4. **Desecration anchor → fill** — for goals containing a desecrated-EXCLUSIVE mod
     (CoE mod-group 10; selectable in the picker, marked DESEC, one-per-item). Places it
     DETERMINISTICALLY (bone + Omen of Necromancy forces side; Well reveal + Omen of Light
     retry guarantees it; cost = retries, not luck). MECHANIC (corrected): a desecrated mod
     is NOT immune to a plain annul — Omen of Light just makes an Annul TARGET it (to re-roll
     the reveal, or swap it later). Only FRACTURE is true immunity. Then fills the rest. Slam routes are
     gated OUT when an EXCLUSIVE desecrated mod is in the goal (only desecration makes it).
     TWO modes: (a) exclusive mod -> mandatory; (b) NORMAL mod -> optional "lock-in" (the
     Well's reveal draws from the normal side pool + exclusive mods, so any mod can be
     desecrated into a deterministically-placed, target-swappable slot — NOT immune to a stray
     annul). Offered when the hardest mod's est. slams
     >= 4; ranked by `desecrateReveals` (combined-pool weight-share, 3 shown per reveal).
     Helpers: `desecrateInfo`, `desecrateReveals`.
  5. **Fracture-protected → free-roll** — for a VERY hard mod (est. slams >= 8) on a Rare.
     A Fracturing Orb LOCKS one RANDOM mod (needs 4+ mods), so it's a GAMBLE that can BRICK
     (wrong fracture = restart) — surfaced via `route.warning` (orange banner in the app) and
     a `gamble`-flagged step, NOT faked as deterministic. Teaches: lock the hard mod, then the
     other affixes are immune to annul/chaos so you roll them risk-free; and desecrate a filler
     first (desecrated mods can't be fractured) to drop 1-in-4 -> 1-in-3. `routeFracture`.
- `essenceFor(mod, itemClass, db)` — **data-driven** (reads `db.essences`). Returns the real
  essence(s) that guarantee `mod` on `itemClass`: `{ family, mode, classRaw, grantMod,
  best:{tier,name}, tiers:[...] }`, or `null` if none do (honest under-claim). Prefers a
  magic→rare ADD essence over a Perfect REMOVE+ADD. Matches via `statKey()` (strips numbers/
  punctuation so dataset text and poe2db grant text compare on the stat phrase alone).
- **Best-path ranking (NEW 2026-06-21):** `planRoutes` now scores each route with `scoreRoute`
  (guaranteed mods ~1 slam, gambled targets ~1/weight-share), sorts best-first, and sets
  `route.recommended` + `route.effortLabel` on the winner (app shows a ★ BEST PATH badge).
  The essence route anchors the HARDEST essence-forceable mod (max slam savings). `forcingNote`
  teaches pool-separation (fill one side to force exalts to the other). Helpers: `modShare`,
  `expectedSlams`, `scoreRoute`, `forcingNote`.
- `buildNotes(...)` — surfaces advanced tactics the slim data can't yet step out precisely
  (Perfect Essence swap, Fracture-to-protect, Runic Alloys / Lich desecration).

## Known limitations (good iteration targets)
- ~~Essence mapping is a keyword heuristic~~ **FIXED 2026-06-21.** Essences are now a real,
  item-class-aware table parsed from poe2db (`data/poe2_essences.json`, 81 essences across
  4 tiers). `essenceFor(mod, itemClass, db)` only claims an essence when poe2db actually
  lists that exact mod for that exact item class — no more inventing facts (the gold-amulet
  "Greater Essence of Sorcery → +Spell Skills" bug is gone). Resist essences now carry their
  element from data (Insulation=fire, Thawing=cold, Grounding=lightning, Ruin=chaos), so the
  old `verify` guess is retired. The route also branches on essence **mode**: magic→rare ADD
  (Lesser/Normal/Greater) vs Perfect REMOVE+ADD (needs a Rare, steered with a Crystallisation
  omen). Refresh after a patch: re-fetch poe2db /us/Essence into `pipeline/cache/`, rerun
  `build_essences.py` then `build_app_data.py`.
- **Desecration is now a real tactic** (mod-group 10 parsed, deterministic route). **Alloys / Lich** are still notes only.
- **Builder buckets by source mgroup** (`SOURCE` in build_dataset.py): Base=exalt pool, Desecrated=own pool, Essence-only(13)=excluded. This fixed the slam-odds (they no longer count un-slammable mods).
- **Paste parser** matches a mod's family but defaults to the lowest tier (doesn't read the
  pasted number's exact tier yet).
- **No implicit / corrupted handling** yet.
- The essence route's "clear the collateral" step is honestly messy (the Transmute junk mod can
  share a side with the anchor, making the annul a coin-flip) — kept honest rather than faked.

## Suggested next tasks
1. **Catalysts + quality** — CoE `catalysts` table (13) + the 34% quality → +3-becomes-+4 skill
   breakpoint; annotate slam steps with the right tag-biasing catalyst (Catalyzing Exaltation).
2. **Runic alloys** — like Perfect essences but alloy-exclusive mods (CoE has them); wire a route.
3. **Essence of the Abyss** — converts a prefix into a desecrated slot (Mark of the Abyssal Lord).
4. **Tier-aware paste parsing** — read the pasted number, pick the matching tier (now that per-tier
   data exists in `bw` as `[ilvl, weight, tierText]`).
5. **Tauri wrap** for a distributable .exe.

## How to run / test / rebuild
```bash
# Run: just open app/index.html in a browser (offline, no server needed).
#   or serve it:  python -m http.server 8753 --directory app

# Test the planner:
node pipeline/test_planner.js          # node smoke test, asserts every step is legal

# Rebuild data after a patch:
cd pipeline
python build_dataset.py                # Craft of Exile cache → ../data/*.json (weights)
python build_app_data.py               # → ../app/poe2_data.js
```

## Data sources
- **Craft of Exile** (`craftofexile.com/json/poe2/main/poec_data.json`) — PRIMARY backbone now.
  A `poecd={...}` JS blob (cached at `pipeline/cache/coe_poec_data.json`). Gives item classes
  (bgroups), bases, modifiers (affix/text/tags/mod-group), and `tiers[mod][base]` = per-tier
  ilvl + `weighting` + numeric ranges. Weights are CoE's EXTRAPOLATED estimates (no official 0.5
  weights exist), good enough for relative odds. CoE base groups are coarse (One-Handed Weapons);
  we re-split to our 27 classes via base name in `build_dataset.py::classify`.
  Each mod's `bw[baseName]` is the per-tier ladder `[[ilvl, weight, tierText], ...]` — drives both
  the picker's tier dropdown and the planner's weight-share odds.
- **RePoE2** (https://repoe-fork.github.io/poe2/) — RETIRED as backbone (spawn weights flattened
  to 0/1, no odds). Kept only as a cross-check reference. Old fields: `