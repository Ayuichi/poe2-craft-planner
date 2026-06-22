# Changelog

All notable changes to the PoE2 Craft Planner. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are YYYY-MM-DD.

## [Unreleased] — 2026-06-22

Q&A audit pass: ran 10 realistic wish-items through the planner, checked every recommended route
against `poe2-crafting-reference.md`, and landed a **safety-model** correctness fix.

### Added
- **`pipeline/qa_runs.js`** — Q&A harness that builds 10 representative wish-items from the real
  dataset (ring/amulet/boots/sceptre/body armour/belt/gloves/quiver + a flagged-must-have case + a
  desecrate-exclusive case) and dumps each recommended route (full steps), every route's effort,
  and the advisory notes. Run `node pipeline/qa_runs.js [n]` for all or a single run.
- **`planner-qa-findings.md`** — the audit write-up: a per-run table, what the planner gets right,
  graded findings, and **the safety model** — the unifying rule behind premium-tool decisions:
  a Chaos/Annul is safe only toward mods it can't hit, and the two ways to get there are FRACTURE
  (true immunity — ignore it) and DESECRATE + Omen of Light (targetable, not immune). Side omens
  only resolve cross-side safety; nothing isolates two mods on the SAME side.

### Fixed
- **Same-side-keeper desecrate gate (HIGH-1).** `routeAcquireAnchor` used to reserve its one
  desecration slot for any remaining must-have with `expectedSlams ≥ 4`. But an Exalt only ADDS
  (zero risk) — the risk is the RETRY removal, and a side-targeted Annul cleanly removes the failed
  junk *when the target is the lone wanted mod on its side*. So desecration was being wasted on
  lone-on-side mods (Q&A runs 5/7/8: Spirit, Life, Life — all the only wanted mod on the prefix
  side). The gate now also requires a **same-side keeper** (`target.mods.some(k => k !== m &&
  k.side === m.side)`); a lone-on-side target falls through to exalt-fill. Verified: runs 5/7/8 now
  exalt cleanly, run 1 still correctly desecrates (Mana shares the prefix side with the Life keeper),
  run 10's desecrate-exclusive route is unchanged. NOTE: the effort metric actually scored the old
  desecrate path *cheaper* (it prices Well reveals as near-free and ignores bone/omen cost), so the
  fix routes on **safety**, not the effort number — see `planner-qa-findings.md` LOW-8.

### Tests
- `test_planner.js` extended: an opposite-side 2-mod goal must NOT desecrate (lone-on-side mods
  exalt cleanly), and a same-side 2-hard-prefix goal MUST reserve the desecrate step. 157 assertions
  total (planner 141 + data 16), all passing.

### Known-open (next up)
- **HIGH-2:** when the must-have isn't essence-able, the acquire route does a bare Regal and gambles
  a guaranteeable WISH (e.g. Life) while the crafted slot sits idle — should fall through to essence
  the hardest wish. **Verify:** whether 0.5 teal/crafted mods are annul-immune (the safety model
  assumes they're annullable, as the planner already does).

---

## [Unreleased] — 2026-06-21

Big one: migrated the data backbone to get **real mod weights/odds**, then built the
endgame tactics (desecration, fracture) on top of an effort-ranked "best path" planner.

### Added
- **Stage 4b-iv: whittling-by-ilvl + full desecrate reveal-loop.** Every desecrate step now spells
  out the complete loop — bone + Omen of Necromancy → reveal 1-of-3 at the Well → Omen of Abyssal
  Echoes for a free reroll of the 3 → Omen of Light + Annul to strip & re-desecrate → repeat (in
  the step variants and detail across all three routes that desecrate). `buildNotes` gains a
  general **whittling** note: it explains that Omen of Whittling removes the LOWEST required-level
  mod (so it cleanly evicts low-ilvl junk like a spent +max-quality, but only isolates junk below
  everything you want) and names the goal's actual lowest wanted mod as the safety floor. Plus a
  desecrate-reveal-loop note. Test suite extended.
- **Stage 4b-iii: must-have / nice-to-have flag.** Mods can be flagged `mustHave`; `mustHaveSet`
  threads through the engine so the carry, essence slot, desecration slot, fracture, and the §3.5
  tier gating all consider ONLY the must-haves — unflagged mods become best-effort exalt fills.
  If nothing is flagged, all mods are treated as must-have (unchanged behaviour). This fixes the
  over-specification problem: e.g. an amulet goal of +melee/crit/spirit fires the Fracture-anchor
  route when unflagged, but flagging only Spirit drops the two suffixes to best-effort and the
  recommendation becomes the cheaper Acquire-carry route. The builder (`app.js`) shows a per-mod
  ★/☆ toggle. Test suite extended.
- **Stage 4b-ii: catalyst + base-implicit wiring (jewellery).** Every jewellery exalt step now
  names the matching catalyst + Omen of Catalysing Exaltation and shows the BIASED per-slam odds
  (`oddsForBiased`, ~2–3× weight, 40% quality ≈ 3×) next to the raw odds — e.g. "+max ES: 11.2%
  → with Carapace at 40% ≈ 21.6% (1 in 5)". `buildNotes` now surfaces a catalyst summary (which
  catalyst biases which mod, plus the Essence-of-the-Breach +max-quality / breakpoint mechanic,
  and that Rarity/Crit are NOT catalyst-coverable) and base-implicit shortcuts (e.g. Rarity is a
  Gold Amulet implicit, ES a Lunar Amulet implicit — granted without spending an explicit slot).
  Helpers: `catalystFor`, `oddsForBiased`, `catBiasClause`, `implicitBaseFor`. Test suite extended.
- **Stage 4b-i: Fracture-anchor → chaos-target route.** Replaces the old "Fracture-protected"
  side-route with the spec's endgame paradigm. New `fractureContest` gates it to the §3.5 trigger
  (a side with 2+ hard, non-essence-forceable mods — `HARD_SLAMS=4`), so it never fires for easy
  goals. `routeFractureAnchor` lays out acquire-4-mod-base → **Fracturing Orb** (gamble, BRICK
  warning, desecrate-filler→1-in-3 trick) → strip to the fractured anchor → **chaos-target** the
  2nd same-side mod (deterministic: the fracture forces Chaos onto the lone non-fractured slot) →
  essence + desecrate + exalt the rest. `routeAcquireAnchor` now surcharges its effort and shows a
  `warning` when two hard mods share a side (rerolling one risks the other), so the fracture route
  is correctly ranked ★ only when it's the safe play. Reproduces the canonical amulet craft
  (fracture +melee, chaos-target crit, Opulence→rarity, desecrate spirit). Test suite updated.
- **Stage 4 data foundation (catalysts + base implicits).** New `pipeline/build_extras.py`
  extracts, from the existing CoE dump, the two data sets the endgame-method planner needs
  (`planner-design-spec.md`): **catalysts** (`data/poe2_catalysts.json` — 13, each catalyst's
  tags resolved to the mod `mtags` it boosts, so Catalysing Exaltation bias = catalyst.tags ∩
  mod.mtags) and **base implicits** (`data/poe2_implicits.json` — 296 named bases incl. Gold
  Amulet→Rarity, Solar→Spirit, and the +/-prefix/suffix-slot bases). Bundled into
  `app/poe2_data.js`. New `pipeline/test_data.js` (17 assertions) verifies the catalyst model
  even agrees with the craft (resistances/ES/melee ARE boostable; rarity + crit are NOT — they
  must come from essence / fracture-targeting, exactly as in the reference craft). NOTE: quality
  BREAKPOINTS (+3→+4 @ 34%) aren't in CoE and remain a Stage-4b input. Planner engine NOT yet
  wired to this data — it's the foundation for the Stage 4b solver rebuild.
- **`planner-design-spec.md`** — the agreed target model for the next engine (lock-anchor →
  deterministic toolkit → gamble the rest; wishlist+must-have input; fracture gated to 2+ hard
  same-side must-haves).
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
- `pipeline/build_essences.py`, `data/poe2_essences.json` (82 item-class-aware essences,
  incl. the corrected Essence of the Breach supplement).
- `CHANGELOG.md` (this file).
- Test coverage: two node suites — `test_planner.js` (138 assertions) + `test_data.js`
  (16 assertions, Stage 4 data) — 154 total, all passing.

### Changed
- **Data backbone: RePoE2 → Craft of Exile** (`poec_data.json`, cached). RePoE2's 0.5 export
  flattens spawn weights to 0/1 (no odds); CoE ships community-extrapolated weights + per-tier
  ilvl/value ranges. 27 item classes; attribute/elemental base variants are now SEPARATE
  weighted bases. App data shrank 1.6 MB → ~0.45 MB.
- **Essences are data-driven** (`essenceFor`), reading the real per-item-class table; the
  route branches on essence mode (magic→rare ADD vs Perfect REMOVE+ADD).
- Mod records now carry `bw[baseName] = [[ilvl, weight, tierText], ...]`, `mtags`, and `src`.

### Fixed
- **Fracture route rebuilt around the real, cheap setup.** The old route hand-waved "acquire a
  4-mod rare and desecrate a filler" — but (a) a rare with your carry + open slots you can buy for
  ~1 ex (a 3-open-slot rare doesn't exist; a Magic base with the carry is ~1 div), and (b) only a
  VEILED desecrated mod is fracture-proof, so the desecrate must happen BEFORE the fracture. New
  flow: acquire a cheap Rare with the carry + an open slot → **Omen of [opposite-side]
  Crystallisation + Essence of the Abyss** (eats a mod on the carry's OPPOSITE side so the carry is
  never at risk, leaving a Mark of the Abyssal Lord) → **bone desecrate** (class-correct:
  jawbone/collarbone/rib) which consumes the Mark into a **veiled** mod, left unrevealed → **Fracture
  at 1-in-3** → chaos-target the 2nd same-side mod → reveal the veiled mod into a wanted
  opposite-side mod (double duty) → exalt/essence the rest. The Crystallisation omen side is derived
  from the carry: suffix carry → Sinistral (removes a prefix), prefix carry → Dextral.
- **Fracture route sequencing + honesty pass (from live testing).** Three more corrections on top
  of the Abyss setup: (1) the pre-fracture veiled mod is **sacrificial** — you annul down to
  fracture+1 to chaos-spam, which strips it away; it exists only to buy the 1-in-3, it never
  becomes a kept mod. (2) The chaos step targets the **SET** of remaining must-haves, not one fixed
  mod: at fracture+1 the Chaos adds a random-SIDED mod, so you spam until *either* remaining must
  lands (combined odds), take the first, and desecrate the leftover. (3) **Desecration is the LAST
  deterministic step**, after the gambly exalts — a desecrated mod isn't fracture-proof, so placed
  early a later strip would make it collateral. And the exalt-fill steps no longer claim "reroll
  freely": only the fractured mod is safe, so a junk exalt is an **annul gamble** that can eat a
  wanted mod (which you then re-chaos-spam to recover) — an honest grind loop, not a free reroll.
- **Useless Divine finish on flat-value goals.** The finish step always suggested a Divine Orb,
  but Divine only rerolls a mod's value *within its range* — for a flat tier like T1 35% Movement
  Speed (no min-max) it does nothing. All six routes now go through a shared `finishStep(target)`
  that checks `hasRange()`: a target with a real `(min-max)` range gets the Divine step; an
  all-fixed goal gets a "Finish — no Divine needed" step instead (which notes that only Sanctify
  ×78–122% or a Vaal corrupt remain as optional gambles).
- **Essence tier-sufficiency (Boots Movement-Speed bug).** `essenceFor` is now tier-aware: for a
  MUST-HAVE mod it only counts an essence whose granted value REACHES the target tier (essences
  cap below top — Essence of Hysteria gives 30% Movement Speed, which no longer falsely satisfies
  a 35%/T1 must-have). WISH mods still accept a lower-tier essence (30% is fine if you only wished
  for 35%). When a must-have can't be essence-reached, a note explains why (slam / Perfect orb to
  bias high / buy a pre-rolled base).
- **Added the missing Essence of the Breach + fixed the catalyst/quality note.** The catalyst note
  had hardcoded "Essence of the Breach"; it turned out to be a REAL corrupted essence our poe2db
  scrape had missed (it caught the other 5 corrupted essences but not this one). Added via a cited
  in-game supplement in `build_essences.py` (remove_add; Jewellery → +20% to Maximum Quality) — now
  82 essences. The catalyst-bias line is now essence-free (Catalysing Exaltation biases exalted
  orbs only — essences are guaranteed and don't interact with the bias); a SEPARATE, data-driven
  note names the +max-quality essence as the cap-raiser, explicitly distinct from the bias step.
- **Acquire-carry-base philosophy (big planner correctness fix):** routes used to start from a
  white base and spend a premium tool (often desecration) to lock in the very first/hardest mod —
  which no real crafter does. New ★ default route `routeAcquireAnchor` BUYS a base that already
  has the single hardest mod, then builds the rest with cheap clean manipulation, reserving the one
  desecration slot (and fracture) for a LATER mod the affix pool can't cleanly target. The old
  standalone "desecrate a normal mod from white" lock-in route was removed; the essence route is
  now guarded so it never slams the carry (only anchors when the essence IS the hardest mod). For a
  +4-minion Sceptre the recommendation is now "buy a +4 base → Greater Essence of Command → Divine"
  instead of the old "white → desecrate +4 minions". (Note: desecration still CAN roll normal mods
  — the earlier over-restriction was reverted; the issue was *when* to spend it, not *what* it rolls.)
- **Essence tier:** `essenceFor` now names the BEST (highest) available tier as the anchor
  (e.g. Greater Essence of Command), not the cheapest Lesser one.
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
