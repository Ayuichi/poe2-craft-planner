# PoE2 Craft Planner — Handoff / Project State

> Living state doc for anyone (incl. other Claude instances) picking up this project.
> Last updated: 2026-06-23 — after the full **socketable arc** (Phases A/C/D) plus the **T1**
> determinism fix. Prior work (2026-06-22 and before): CoE data migration (real weights), best-path
> ranking, desecration + fracture tactics, the **acquire-carry-base** philosophy, the full Stage 4b
> pass, and the 10-run Q&A audit + safety-model refinement.
> Newest (2026-06-23): **T1** = the acquire route now fills its otherwise-idle crafted slot by
> essencing a WISH at a lower tier; **D1/D2 design calls** = lone-on-side hard must-haves take the
> desecrate slot (determinism over currency) + the desecrate effort metric is capped; **Phase A** =
> socketables extracted from CoE; **Phase C** = legality + builder read an equipped-socketable loadout
> AND pool-unlock runes add their poe2db-sourced mod pools; **Phase D** = the planner spends the budget
> (Astrid's 2nd crafted slot via a Perfect essence, Serle's 7th suffix). Determinism QA (`qa20.js`):
> must-haves **36/38 (95%)**, wishes **13/27 (48%)** — up from 32/38 and 0/27.
>
> ⚠ **READ FIRST: `planner-design-spec.md`** — the agreed endgame craft model (fracture-anchor →
> chaos-targeting → quality/catalysts → desecrate-loop). Stage 4b has now BUILT most of it
> (catalysts, implicits, must-have flag, fracture route, whittling/desecrate-loop). Still open:
> the +3→+4 @ 34% **quality breakpoints** (not in CoE) and a few later items — see Status + Suggested next tasks.
>
> ⚠ **ALSO READ: `TODO.md`** — the live backlog (supersedes "Suggested next tasks" below). T1 +
> Phases A/C/D are DONE; what's left is **Phase E** (Magic-rarity final goals), **Phase F** (corruption
> / quality-breakpoint layer, incl. the +3→+4 @ 34% quality piece + Vaal Blacksmith's Infuser), and two
> small Phase-D follow-ups (count rune mods in the odds denominator; a mod→lich desecration map).
> The socketables: **Astrid's Creativity** = +1 crafted slot, **Serle's Triumph** = +1 suffix (7th mod),
> the **"Can roll X" runes** (Kolr's Hunt → Marksman on gloves, etc.) = off-pool unlocks whose mod
> pools were pulled from **poe2db** into `data/poe2_rune_pools.json`.
>
> ⚠ **GOTCHA (don't relitigate):** the lich **Gazes** (Kurgal's/Amanamu's/Ulaman's/Tecrod's Gaze) are
> equip-stat SOUL CORES ("Abyssal Eye" augments), NOT a crafting/desecration tool. An earlier draft
> wrongly tied them to the lich desecration pools; that was removed. The real lich crafting tools are
> the desecration OMENS (Blackblooded→Kurgal, Liege→Amanamu, Sovereign→Ulaman).

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
- **Essences**: real item-class-aware guaranteed-mod table from poe2db (82 essences, tier-aware —
  a must-have mod only counts an essence that REACHES its target tier; wishes accept lower).
- **Best-path brain**: routes ranked by estimated effort (weights), ★ best tagged, pool-forcing taught.
- **6 strategy templates**: ★ **Acquire-carry-base** (buy a base that already has the hardest mod,
  then build the rest — the realistic default), Essence anchor (from white, only when the essence
  anchors the HARDEST mod), Manual ladder, Alchemy cleanup, Desecration anchor (only for
  desecrate-EXCLUSIVE goals now), **Fracture-anchor → chaos-target** (the §3.5 endgame route:
  Abyss-mark setup → sacrificial veiled blocker → Fracture 1-in-3 → chaos the SET → honest
  grind-loop fills → desecrate LAST). Desecration is no longer spent placing the carry mod from
  white — it's reserved for a later hard mod, after essences/exalts can't cleanly target it.
- **Stage 4 wiring live**: jewellery exalt steps name the right catalyst + Omen of Catalysing
  Exaltation with biased odds; base-implicit shortcuts surfaced; per-mod ★/☆ must-have toggle.
- **Socketable layer (NEW 2026-06-23):** the builder reads an equipped-socketable loadout — Astrid's
  Creativity (+1 crafted slot), Serle's Triumph (+1 suffix / 7th mod), and the "Can roll X" runes
  (off-pool mod pools pulled from poe2db into `poe2_rune_pools.json`). Legality + the planner spend the
  bigger budget: Astrid's 2nd crafted mod via a Perfect essence, Serle's 7th suffix.
- **Determinism (NEW):** T1 (wish-essence fallthrough) + the D1/D2 fixes took the qa20 scorecard to
  must-haves **36/38 (95%)**, wishes **13/27 (48%)** (from 32/38, 0/27).
- 161 `test_planner.js` assertions + the `test_data.js` catalyst/implicit/socketable checks pass.
Next up (not built): Magic-rarity goals (Phase E), the corruption/quality-breakpoint layer (Phase F,
incl. +3→+4 @ 34% + Vaal Blacksmith's Infuser), runic alloys, tier-aware paste parsing.

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
| 3.10 | **Acquire-carry-base philosophy** (routes start from a base with the hardest mod; desecration/fracture reserved for later constrained mods, not the carry) | ✅ done |
| 4a | **Stage 4 data foundation** — catalysts (type→boosted tags) + base implicits, extracted from CoE, bundled into the app, `test_data.js` green | ✅ done |
| 4b-i | **Fracture-anchor → chaos-target route** (§3.5-gated: fires only when a side has 2+ hard non-essence mods; acquire route surcharged for the same-side brick risk so fracture is ★ when justified) | ✅ done |
| 4b-ii | **Catalyst + implicit wiring** — jewelry exalt steps now show the right catalyst + Omen of Catalysing Exaltation with BIASED odds (~2–3× / 40%≈3×); notes surface catalyst guidance + base-implicit shortcuts (Gold Amulet→Rarity etc.). Helpers: `catalystFor`, `oddsForBiased`, `catBiasClause`, `implicitBaseFor` | ✅ done |
| 4b-iii | **Must-have / nice-to-have flag** — `mustHaveSet(target)` (flagged mods drive carry/essence/desecrate/fracture + §3.5 gating; none flagged ⇒ all must-have); builder shows a ★/☆ toggle per mod. Flagging the criticals stops over-specified wishlists from inflating the tier. | ✅ done |
| 4b-iv | **Whittling-by-ilvl + desecrate reveal-loop** — desecrate steps now spell out the full loop (bone + Necromancy → reveal 1-of-3 → Omen of Abyssal Echoes free reroll → Omen of Light + Annul strip & retry); a whittling note explains ilvl-targeting + names the goal's lowest wanted mod (the safety floor) | ✅ done |
| 4b-v | **Quality breakpoints** (+3→+4 @ 34% etc.) — the one piece NOT in CoE; lever confirmed = Vaal Blacksmith's Infuser (weapon/armour quality 20→30%) + Essence of the Breach (jewellery). Folded into Phase F. | ⏳ gated |
| T1 | **Wish-essence fallthrough** — when no must-have can claim the crafted slot, `routeAcquireAnchor` essences the hardest essence-able WISH at a lower tier (honestly labelled). Wishes 0/27 → 13/27. | ✅ done |
| D1/D2 | **Determinism design calls** — lone-on-side hard must-haves take the desecrate slot (determinism > currency); `desecrateReveals` capped (effort-metric fix). Must-haves 32→36/38. | ✅ done |
| A | **Socketables data** — `build_socketables.py` extracts 287 runes/soul-cores/idols from CoE → `poe2_socketables.json` → `window.POE2.socketables` (cap_crafted / cap_suffix / pool_unlock / grant_mod) | ✅ done |
| C | **Legality + builder read the loadout** — `socketableLoadout` raises affix caps (Serle's) + surfaces crafted slots (Astrid's); a builder picker toggles socketables live; **pool-unlock runes** add their poe2db-sourced mod pools (`poe2_rune_pools.json`, `runePoolMods`) so off-pool mods become selectable | ✅ done |
| D | **Planner spends the budget** — Astrid's 2nd crafted slot (Perfect essence + Crystallisation), Serle's 7th suffix (`affixCaps` + cap-aware pool-forcing), honest lich-omen guidance | ✅ done |
| E | **Magic-rarity final goals** (1p/1s + rune extras, distinct route shape) | ⏳ next |
| F | **Corruption / quality layer** — Vaal Blacksmith's Infuser + quality breakpoints, Architect's Orb notes | ⏳ later |
| — | Real alloy guaranteed-mod data | ⏳ later |
| — | Tauri wrap (small .exe) | ⏳ later |

## Repo layout
```
app/                  Self-contained web app (open app/index.html, runs offline via file://)
  index.html          UI: left = goal builder, right = goal card + legality + crafting path
  app.js              target builder + legality engine + paste parser + plan rendering
  planner.js          Stage 3: state-transition model + strategy templates → routes
  poe2_data.js        generated slim dataset (window.POE2); loaded via <script src>
data/                 poe2_mods_by_class.json (per class: bases, prefixes, suffixes [exalt-rollable, with `bw` weights], desecrated [exclusive pool]), poe2_bases.json, poe2_meta.json, poe2_essences.json, poe2_catalysts.json (Stage 4), poe2_implicits.json (Stage 4), poe2_socketables.json (Phase A: runes/soul cores/idols), poe2_rune_pools.json (Phase C: poe2db pool-unlock mods per rune)
pipeline/
  build_dataset.py    Craft of Exile (cache/coe_poec_data.json) → ../data/*.json (with WEIGHTS)
  build_essences.py   cached poe2db essence page → ../data/poe2_essences.json
  build_extras.py     CoE → ../data/poe2_catalysts.json + poe2_implicits.json (Stage 4)
  build_socketables.py CoE socketables → ../data/poe2_socketables.json (runes/soul cores/idols; Phase A)
  build_app_data.py   ../data/*.json → ../app/poe2_data.js  (bundles mods+essences+catalysts+implicits)
  cache/coe_poec_data.json  cached Craft of Exile data dump (mods/bases/tiers/weights/catalysts/bitems)
  cache/poe2db_essence.md   cached poe2db /us/Essence render
  test_planner.js     node smoke test for the planner (incl. gold-amulet + same-side-keeper regressions)
  test_data.js        node sanity test for Stage 4 data (catalysts + implicits)
  qa_runs.js          Q&A harness: builds 10 realistic wish-items, dumps recommended route + effort + notes
  qa20.js             DETERMINISM harness (20 goals): scores secured-vs-gamble per wanted stat (`node qa20.js sum`)
crafting-knowledge-base.md   0.5 crafting systems reference (essences, omens, desecration, alloys)
poe2-crafting-reference.md   distilled crafting guide (the video walkthrough → clean reference)
high-end-crafting-principles.md  named, pointable endgame techniques (P1–P15) we've verified
planner-design-spec.md       the endgame craft model the Stage 4b engine targets (READ FIRST)
planner-qa-findings.md       10-run Q&A audit + the safety model (what makes a Chaos/Annul safe)
TODO.md                      LIVE backlog: T1 wish-fallthrough, T2 new tools, Phase A–F implementation plan
transcript-gap-analysis.md   4 crafting videos vs P1–P15 + planner (what's covered / what's missing)
HANDOFF.md, README.md, .gitignore
CHANGELOG.md                 PUBLIC, user-facing changelog (pushed to git)
CHANGELOG-internal.md        INTERNAL maintainer log (detailed dev notes; gitignored, not pushed)
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
- SIX strategy templates (ranked by estimated effort; best tagged ★):
  0. **Acquire the carry base → craft the rest** (`routeAcquireAnchor`, the realistic DEFAULT) —
     offered whenever the hardest mod's est. slams ≥ 4. Step 1 = BUY a base that already has the
     single hardest-to-roll mod (you never gamble for your carry mod). Then it allocates the two
     premium slots cheapest-deterministic first: ESSENCE the hardest remaining essence-forceable
     mod (crafted slot), DESECRATE the hardest remaining mod essence can't get IF it's grindy +
     desecrate-able (the one desecrated slot — reserved for LATE, when the affix pool can't cleanly
     target it), Exalt-fill the rest with pool-forcing. Prices itself via `fixedEffort` (bought
     carry ≈ 0), so it ranks first for rare carries. This is the fix for the "don't waste
     desecration on the first mod" trap.
  1. **Essence anchor → Exalt fill** (from white) — only when the essence can anchor the
     HARDEST mod (guarded; otherwise it would slam the carry, which template 0 handles by buying).
     Uses the BEST essence tier (`essenceFor` returns highest-tier `best`).
  2. **Manual ladder** (Transmute → Augment → Regal → Exalt) — from-white baseline fallback
     (no pre-rolled base). Respects the Magic 1p/1s cap (Transmute one side, Augment the *other*).
  3. **Alchemy → Chaos/Whittling cleanup** — brute force; Rare-goals only.
  4. **Desecration anchor → fill** — now ONLY for goals containing a desecrated-EXCLUSIVE mod
     (CoE mod-group 10; selectable in the picker, marked DESEC, one-per-item). Places it
     DETERMINISTICALLY (bone + Omen of Necromancy forces side; Well reveal + Omen of Light
     retry guarantees it; cost = retries, not luck). MECHANIC: a desecrated mod is NOT immune to
     a plain annul — Omen of Light just makes an Annul TARGET it (to re-roll the reveal, or swap
     it later). Only FRACTURE is true immunity. Slam routes are gated OUT when an EXCLUSIVE
     desecrated mod is in the goal (only desecration makes it). NOTE: desecration CAN reveal both
     normal-pool and desecrated-exclusive mods — `desecrateInfo`/`desecrateReveals` model the
     combined pool. The old standalone "desecrate any NORMAL mod from white" lock-in route was
     removed; that placement now lives inside template 0, reserved for a later hard mod.
     Helpers: `desecrateInfo`, `desecrateReveals`.
  5. **Fracture-anchor → chaos-target** (`routeFractureAnchor` + `fractureContest`) — the §3.5
     escalation for "2+ hard mods on the SAME side." `fractureContest` returns `{side, anchor,
     chaosTarget}` only when a side has 2+ hard, NON-essence-forceable mods (`HARD_SLAMS=4`), so it
     never fires for easy goals. REWRITTEN flow (the real, cheap setup): acquire a **cheap Rare**
     with the carry + an open slot (~1 ex, NOT a 3-open-slot rare and NOT a ~1-div Magic base) →
     **Omen of [opp-of-carry] Crystallisation + Essence of the Abyss** (eats a mod on the carry's
     OPPOSITE side so the carry is safe; adds Mark of the Abyssal Lord) → **bone desecrate**
     (jawbone/collarbone/rib by class) consumes the Mark into a **veiled** mod, left unrevealed →
     **Fracturing Orb** at 1-in-3 → **annul down to fracture+1** (the veiled blocker is SACRIFICIAL
     and dies here; it only ever bought the 1-in-3) → **chaos-spam the SET of remaining must-haves**
     (at fracture+1 Chaos adds a random-SIDED mod, so it lands chaosTarget OR desTarget, whichever
     first — combined odds; take it) → **exalt-fill the wishes** (HONEST grind loop: only the
     fractured mod is safe, a junk exalt is an annul gamble that can eat a wanted mod, recover via
     re-chaos) → **desecrate the leftover must-have LAST** (a desecrated mod isn't fracture-proof,
     so placing it before the exalts would make it collateral on a strip). Crystallisation side
     rule: suffix carry → Sinistral (removes prefix), prefix carry → Dextral. Bone by class:
     jawbone/collarbone/rib. `routeAcquireAnchor` SURCHARGES its effort + shows a `warning` when
     `fractureContest` fires, so the Fracture route ranks ★ when it's genuinely the safe play.
     KEY PRINCIPLES (from live testing, apply elsewhere too): **desecrate LAST**; **only the
     fractured mod is strip-safe** (everything else is recover-via-chaos); the pre-fracture veiled
     mod is **sacrificial**, not reused.
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
  item-class-aware table parsed from poe2db (`data/poe2_essences.json`, 82 essences across
  4 tiers, incl. the corrected Essence of the Breach). `essenceFor(mod, itemClass, db)` is
  tier-aware and only claims an essence when poe2db actually
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
> **`TODO.md` is now the authoritative backlog** (T1 wish-fallthrough, T2 new tools, Phase A–F plan).
> Phase A (socketable data) is done. Next up there: T1 + Phase C (legality reads the socketable
> loadout) → Phase D (planner spends the bigger budget). The list below predates TODO.md and is kept
> for history.

1. ~~**Stage 4b engine**~~ **DONE.** Catalysts/Catalysing Exaltation wired into jewellery routes;
   fracture-anchor + chaos-targeting taught and §3.5-gated to 2+ hard MUST-HAVE same-side mods;
   must-have/wish flag shipped; whittling + desecrate-loop spelled out. The fracture route was
   rebuilt and verified against a real Warstaff craft. Remaining 4b piece = quality breakpoints (below).
2. **Quality breakpoints** — the +3→+4 @ 34% rule (not in CoE; derive or pull poe2db) so the
   catalyst layer can promise breakpoint upgrades, not just biasing. This is the last 4b input.
3. **Runic alloys** — like Perfect essences but alloy-exclusive mods (CoE has them); wire a route.
4. **Essence of the Abyss** — already used in the fracture route (prefix → Mark of the Abyssal Lord);
   could become its own standalone slot-conversion route too.
5. **Tier-aware paste parsing** — read the pasted number, pick the matching tier.
6. **Tauri wrap** for a distributable .exe.
7. **Apply desecrate-LAST to `routeAcquireAnchor`** — the principle established in the fracture
   rebuild (a desecrated mod isn't strip-safe) likely applies to the acquire route too, where the
   desecrate currently sits mid-sequence. Low-risk cleanup, flagged but not yet done.
8. ~~**Same-side-keeper desecrate gate**~~ **DONE (2026-06-22, Q&A audit).** `routeAcquireAnchor`
   now reserves desecration only when the hard target shares its side with another wanted mod
   (so the Exalt-retry can't be side-isolated and Omen of Light is the cheapest SAFE placement);
   a target alone on its side falls through to exalt-fill. See `planner-qa-findings.md` HIGH-1 +
   the safety model. Regression added to `test_planner.js` (opposite-side → no desecrate, same-side
   → desecrate). Fixed the wasted-bone cases in Q&A runs 5/7/8.
9. **HIGH-2 (open): crafted slot for a wish.** When the must-have isn't essence-able (e.g. 35% MS
   shortfall), `routeAcquireAnchor` does a bare Regal and GAMBLES a guaranteeable wish (Life) while
   the one crafted-mod slot sits idle. Fix: after must-haves fail to claim the essence slot, fall
   through to guarantee the hardest essence-able WISH instead of leaving the slot empty. See
   `planner-qa-findings.md` HIGH-2 (Run 4).
10. **Verify crafted-mod annul behaviour (0.5)** — the same-side safety model assumes a teal
    essence/crafted mod CAN be hit by a plain Annul (planner already assumes this). If 0.5 makes
    crafted mods annul-immune like PoE1, even same-side collisions are safe and the desecrate gate
    could relax further. Confirm on poe2db before tightening.

## How to run / test / rebuild
```bash
# Run: just open app/index.html in a browser (offline, no server needed).
#   or serve it:  python -m http.server 8753 --directory app

# Test:
node pipeline/test_planner.js          # planner smoke test, asserts every step is legal
node pipeline/test_data.js             # Stage 4 data sanity (catalysts + implicits)
node pipeline/qa_runs.js [n]           # Q&A audit: 10 wish-items (or just run n) → routes + notes

# Rebuild data after a patch:
cd pipeline
python build_dataset.py                # Craft of Exile cache → ../data/*.json (weights)
python build_essences.py               # poe2db essence cache → ../data/poe2_essences.json
python build_extras.py                 # CoE → ../data/poe2_catalysts.json + poe2_implicits.json
python build_app_data.py               # → ../app/poe2_data.js (bundles all of the above)
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
  **Stage 4 also pulls from the SAME dump:** `catalysts` (13; `tags` resolved to mod `mtags`, so a
  catalyst boosts a mod when its tags ∩ the mod's `mtags`) and `bitems` (named bases + `implicits`,
  e.g. Gold Amulet→Rarity, Solar→Spirit, Dusk→+1 prefix slot). See `build_extras.py`.
- **RePoE2** (https://repoe-fork.github.io/poe2/) — RETIRED as backbone (spawn weights flattened
  to 0/1, no odds). Kept only as a cross-check reference; its per-mod weight fields are unusable for
  odds, so nothing in the live pipeline reads from it anymore.
- **poe2db** (poe2db.tw / poe2wiki.net) — used for data CoE doesn't carry: the essence table
  (`build_essences.py`), and (2026-06-22) the confirmed currency/omen facts now in
  `crafting-knowledge-base.md` (tiered Exalt/Chaos floors 35/50, Architect's Orb, Vaal Blacksmith's
  Infuser, the lich-omen mapping). Socketables come from the CoE dump, not poe2db.