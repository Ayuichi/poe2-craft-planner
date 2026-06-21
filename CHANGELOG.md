# Changelog

All notable changes to the PoE2 Craft Planner. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are YYYY-MM-DD.

## [Unreleased] — 2026-06-21

Big one: migrated the data backbone to get **real mod weights/odds**, then built the
endgame tactics (desecration, fracture) on top of an effort-ranked "best path" planner.

### Added
- **Real mod WEIGHTS + honest odds.** Every gamble step now shows `~X% per slam (about
  1 in N)` from real per-base weights, replacing the old bare "competing pool" count.
- **Best-path ranking.** Routes are scored by estimated effort and sorted best-first; the
  winner gets a ★ BEST PATH badge + effort estimate in the right panel.
- **Pool-separation guidance.** The planner teaches the core targeting trick (fill one
  affix side to force exalts onto the other) as a prominent note.
- **Desecration tactic** (new strategy template). Desecrated-exclusive mods are now
  selectable goal targets (marked `DESEC`, one-per-item). Two modes: (a) an exclusive mod
  is mandatory-via-desecration (slam routes gated out); (b) a normal mod can be placed
  deterministically as an optional "lock-in". Models the Well reveal + Omen-of-Light re-roll.
- **Fracture tactic** (new strategy template) with HONEST brick risk: a Fracturing Orb locks
  a RANDOM mod, so it's a gamble that can brick (orange ⚠ warning + gamble-flagged step),
  plus the "desecrate a filler to drop 1-in-4 → 1-in-3" trick.
- **Per-tier picker.** Mod dropdowns now list the real tier ladder for the selected base
  (e.g. amulet +1/+2/+3, wand +1…+5), each with its correct ilvl.
- `pipeline/build_essences.py`, `data/poe2_essences.json` (81 item-class-aware essences).
- `CHANGELOG.md` (this file).
- Test suite grown to 136 node assertions covering all of the above.

### Changed
- **Data backbone: RePoE2 → Craft of Exile** (`poec_data.json`, cached). RePoE2's 0.5 export
  flattens spawn weights to 0/1 (no odds); CoE ships community-extrapolated weights + per-tier
  ilvl/value ranges. 27 item classes; attribute/elemental base variants are now SEPARATE
  weighted bases. App data shrank 1.6 MB → ~0.45 MB.
- **Essences are data-driven** (`essenceFor`), reading the real per-item-class table; the
  route branches on essence mode (magic→rare ADD vs Perfect REMOVE+ADD).
- Mod records now carry `bw[baseName] = [[ilvl, weight, tierText], ...]`, `mtags`, and `src`.

### Fixed
- **Gold-amulet essence bug:** the planner used to invent facts (claimed a Greater Essence of
  Sorcery guarantees `+Spell Skills` on an amulet — wrong essence tier, wrong mod, wrong item
  class). Now it only claims an essence poe2db actually lists for that exact item class.
- **Slam-odds contamination:** the builder was mixing desecrated + essence-only mods into the
  exalt-rollable pool, inflating the odds denominator. Now bucketed by source (Base / Desecrated
  / Essence-only).
- **Collapsed tiers:** the CoE migration briefly collapsed each mod to one bogus tier (showed
  "+4 at ilvl 10"); per-tier text is now preserved per base.
- **Desecration mechanic (correctness):** removed the false claim that a desecrated mod is safe
  from annulment. A plain Annul CAN remove a desecrated mod; Omen of Light only makes an Annul
  TARGET it. Only FRACTURE is true immunity. Step text + notes corrected, with a regression test.

### Notes for the maintainer
- `pipeline/cache/` (CoE dump ~3 MB + poe2db essence cache) is NOT gitignored (`.gitignore`
  lists `pipeline/.cache/` with a dot). Committing it keeps builds reproducible offline; if you'd
  rather keep the repo lean, add `pipeline/cache/` to `.gitignore` and re-fetch before rebuilds.
- Rebuild after a patch: `python pipeline/build_dataset.py && python pipeline/build_app_data.py`.
