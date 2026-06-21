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
| 1 | Data pipeline (RePoE2 → normalized mod/base dataset) | ✅ done |
| 2 | Target builder + legality checker + item paste parser | ✅ done |
| 3 | Hybrid path planner (strategy templates + state-model validation) | ✅ done |

## Layout

```
app/        Self-contained web app (open app/index.html in a browser, runs offline)
  index.html
  app.js          target builder, legality engine, paste parser
  planner.js      Stage 3: state-transition model + strategy templates → crafting routes
  poe2_data.js    generated, slim dataset baked in for double-click use
data/       Normalized dataset (poe2_mods_by_class.json, poe2_bases.json, meta) + schema README
pipeline/   build_dataset.py (RePoE2 -> normalized), build_app_data.py (-> app module),
            test_planner.js (node smoke test: `node pipeline/test_planner.js`)
crafting-knowledge-base.md   0.5 crafting systems reference
```

## Run it

Open `app/index.html` in any browser. No install, no server (data loads via `<script src>`,
so `file://` works). Pick a base, add mods, watch the legality panel; or paste a PoE2 item.

## Rebuild the data (after a patch)

```bash
cd pipeline
python build_dataset.py     # downloads RePoE2, writes ../data/*.json
python build_app_data.py    # writes ../app/poe2_data.js
```

## Data sources

- **[RePoE2](https://repoe-fork.github.io/poe2/)** — JSON exported from the game files (bases, mods, tags). Primary backbone.
- **[poe2db.tw](https://poe2db.tw/us/)** — human-readable cross-check; essence/alloy guaranteed-mod data.

> Note: 0.5 game files ship spawn weights flattened to `1`, so true roll probabilities aren't
> available. The planner reasons about *what is possible*, not precise odds.

## License / data

Game data © Grinding Gear Games, surfaced via RePoE2 (CC BY-NC-SA where noted). This tool is a
fan-made utility, not affiliated with GGG.
