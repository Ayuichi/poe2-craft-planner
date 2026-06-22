# Changelog

User-facing changes to the **PoE2 Craft Planner** — a goal → path crafting planner
for Path of Exile 2 (patch 0.5, *Return of the Ancients*). Format follows
[Keep a Changelog](https://keepachangelog.com/); dates are YYYY-MM-DD.

Entries describe what the tool can do for you, not its internal development. Odds shown
in the app are derived from Craft of Exile's community-extrapolated weights (no official
0.5 weights exist) — treat them as solid relative effort, not exact probability.

## [Unreleased]

## 2026-06-23

The socketable arc: equip the runes, soul cores, and idols on your item and the planner
plans around the bigger budget they unlock — plus a determinism pass that fills more of
your slots deterministically instead of gambling them.

### Added
- **Socketable reference data** — runes, soul cores, and idols (including lich Gazes) are
  now in the dataset, tagged by what they do: extra crafted/suffix slots, off-pool
  unlocks, and granted mods. Groundwork for routes that plan around them.
- **Equip socketables in the builder.** A new picker lets you toggle the runes that apply to
  your item (e.g. Serle's Triumph for a 7th modifier, Astrid's Creativity for a second crafted
  mod), and the legality check updates live — so a 4-suffix item reads as legal once Serle's
  Triumph is equipped.
- **Rune-unlocked modifiers.** Equipping a "Can roll X" rune (Kolr's Hunt for Marksman/projectile
  mods on gloves, Katla's Gloom, Medved's Tending, Thrud's Might, Uhtred's Sidereus, Vorana's
  Carnage) now adds that rune's mod pool to the builder, so those off-pool mods become selectable
  goal stats on the item types that can use them.

### Changed
- **Smarter use of your one guaranteed-mod slot.** When none of your must-have stats can be
  guaranteed by an essence (essences cap below the top tier), the planner now spends that crafted
  slot to lock in a *wish* stat at a guaranteed lower tier, instead of leaving it empty and
  gambling. Across the test goals, wishes secured without gambling went from 0% to about 48%.
- **More of your must-haves locked in.** A hard must-have sitting alone on its affix side now
  claims the desecration slot to place it deterministically, rather than being left to a slam.
  Must-haves secured without gambling rose to about 95% of the test goals.
- **The planner now plans around your equipped socketables.** With Astrid's Creativity it will
  guarantee a *second* mod using a Perfect essence, and with Serle's Triumph it builds toward a
  7th modifier (a 4-suffix item). Desecration steps also point you to the right lich omen.

## 2026-06-22

### Changed
- **Smarter desecration.** The planner now reserves its single desecration only when a
  hard target shares an affix side with another mod you want — a target alone on its side
  fills cleanly with an Exalt instead, so the bone is no longer spent when it isn't needed.

## 2026-06-21

The big one: real odds, best-path ranking, and the endgame tactics layer.

### Added
- **Real per-slam odds.** Every gamble step shows `~X% per slam (about 1 in N)` from
  per-base mod weights, and each step is honestly labelled **deterministic / likely / gamble**.
- **Best-path ranking.** Routes are scored by estimated effort and sorted best-first; the
  winner gets a ★ **BEST PATH** badge with an effort estimate.
- **Acquire-carry-base routes.** The default recommendation now starts by *buying* a base
  that already has the single hardest-to-roll mod, then builds the rest with cheap
  manipulation — the way crafting actually works, instead of gambling for your carry mod.
- **Endgame tactics.** Two new strategies: deterministic **desecration** placement for
  desecrated-exclusive mods, and a **Fracture-anchor → chaos-target** route for items with
  two or more hard mods on the same affix side (with an honest brick-risk warning).
- **Must-have / nice-to-have flags.** A ★/☆ toggle per mod: the planner secures the
  criticals and treats the rest as best-effort fills, so an over-specified wishlist no
  longer inflates the recommended route.
- **Catalyst & base-implicit guidance for jewellery.** Exalt steps name the right catalyst
  + Omen of Catalysing Exaltation and show the biased odds; base implicits (e.g. Gold
  Amulet → Rarity) are surfaced as free shortcuts.
- **Per-tier mod picker** showing the real tier ladder and item-level for the chosen base.
- **Real essence data** — an item-class-aware guaranteed-mod table (82 essences across
  four tiers), so essence suggestions only claim what actually rolls on that item class.
- **Pool-separation guidance** — the planner teaches the core targeting trick (fill one
  affix side to force exalts onto the other).

### Changed
- **Data backbone moved to Craft of Exile** (community-extrapolated weights + per-tier
  ilvl/value ranges), which is what enables the real odds above. Attribute/elemental base
  variants are now treated as separate weighted bases. App data shrank ~1.6 MB → ~0.45 MB.

## Earlier

- **Stage 3** — hybrid path planner: human-idiomatic strategy templates, with every emitted
  step validated against a state-transition model so the route is always legal.
- **Stage 2** — target builder, legality checker (rarity caps, group exclusivity, ilvl/base
  gates), and best-effort item paste parser.
- **Stage 1** — data pipeline producing the normalized mod/base dataset the app runs on.
