# PoE2 Craft Planner

A **goal → path** crafting planner for Path of Exile 2 (patch 0.5, *Return of the Ancients*).

Most crafting tools ([Craft of Exile](https://www.craftofexile.com/?game=poe2),
[Path of Crafting](https://pathofcrafting.net/)) answer *"if I do this craft, what are my odds?"*
This one answers the opposite, underserved question:

> **"I want this item. What's a path to actually make it?"**

The goal is crafting *literacy*: lay out a clear, human-followable sequence of steps so that
anyone, including veterans staring at 600 Divines with no idea how to make their dream item,
can stop bouncing off the system and just craft. Cost and exact odds are deliberately out of
scope (a few crafts are fully deterministic; the tool is honest about which steps are gambles).

## Status

| Stage | What | State |
|---|---|---|
| 1 | Data pipeline (**Craft of Exile** → normalized mod/base dataset with real weights) | ✅ done |
| 2 | Target builder + legality checker + item paste parser | ✅ done |
| 3 | Hybrid path planner (strategy templates + state-model validation) | ✅ done |
| 3.5–3.10 | Real essences, real weights/odds, best-path ranking, desecration + fracture tactics, **acquire-carry-base** philosophy | ✅ done |

See `HANDOFF.md` for the detailed living state and `CHANGELOG.md` for the history.

## Layout

```
app/        Self-contained web app (open app/index.html in a browser, runs offline)
  index.html
  app.js          target builder, legality engine, paste parser
  planner.js      Stage 3: state-transition model + strategy templates → crafting routes
  poe2_data.js    generated, slim dataset baked in for double-click use
  assets/bases/   bundled base icons (populated by fetch_base_images.py)
data/       Normalized dataset (poe2_mods_by_class.json w/ weights, poe2_bases.json, poe2_essences.json,
            poe2_item_bases.json [specific named bases + icons, display-only], meta) + schema README
pipeline/   build_dataset.py (Craft of Exile -> normalized, with weights), build_essences.py,
            build_item_bases.py (specific named bases + icon paths), build_app_data.py (-> app module),
            fetch_base_images.py (download base icons), test_planner.js (node smoke test)
crafting-knowledge-base.md   0.5 crafting systems reference
poe2-crafting-reference.md   mechanics reference distilled from a community crafting guide
```

## Run it

Open `app/index.html` in any browser. No install, no server (data loads via `<script src>`,
so `file://` works). Pick a base, add mods, watch the legality panel; or paste a PoE2 item.

## Rebuild the data (after a patch)

```bash
cd pipeline
python build_dataset.py      # Craft of Exile cache → ../data/*.json (with weights)
python build_essences.py     # poe2db essence cache → ../data/poe2_essences.json
python build_item_bases.py   # specific named bases + icon paths → ../data/poe2_item_bases.json
python build_app_data.py     # → ../app/poe2_data.js
```

### Base icons (separate, needs network)

The specific-base picker shows each base's in-game icon. The data build records the icon
*paths*; downloading the files is a separate step so the data build stays offline-only (and
because some sandboxes block craftofexile.com). Run this from a machine that can reach it:

```bash
cd pipeline
python fetch_base_images.py  # → ../app/assets/bases/ (auto-detects the CoE image URL prefix)
```

Until the icons are present the app shows a clean "image pending" placeholder; no rebuild is
needed once they land.

## Data sources

- **[Craft of Exile](https://www.craftofexile.com/)** (`poec_data.json`) — PRIMARY backbone: item
  classes, bases, mods, mod-groups, and per-tier ilvl + **weighting** + value ranges. Weights are
  CoE's community-EXTRAPOLATED estimates (no official 0.5 weights exist) — good for relative odds.
- **[poe2db.tw](https://poe2db.tw/us/)** — essence guaranteed-mod data (item-class-aware).
- **[RePoE2](https://repoe-fork.github.io/poe2/)** — RETIRED as backbone (its 0.5 export flattens
  spawn weights to 0/1, so it can't give odds). Kept only as a cross-check.

> Odds shown as "~X% per slam" come from CoE's extrapolated weights (community estimates, not
> official GGG data). Treat them as solid relative effort, not exact probability.

## License / data

Game data © Grinding Gear Games, surfaced via Craft of Exile / poe2db. This tool is a fan-made
utility, not affiliated with GGG.
