# PoE2 Craft Planner — TODO / Working Backlog

> Created 2026-06-22 from the 20-run determinism QA (`pipeline/qa20.js`). Living doc:
> we have more cases to add and more items to walk through, so this is the place to park
> issues, the agreed fix, and the open design calls before we actually code them.
>
> Companions: `planner-qa-findings.md` (prior 10-run audit + safety model),
> `high-end-crafting-principles.md` (P1-P15), `HANDOFF.md` (project state).

## How this backlog was built

`pipeline/qa20.js` builds 20 diverse goal items from the real CoE dataset (rings, amulets,
boots, sceptres, body armour, belts, gloves, wands, quivers, helmets), flags must-haves vs
wishes, runs `planRoutes`, and then scores how the RECOMMENDED route places each wanted stat:

- **secured** = BOUGHT (carry), ESSENCE (crafted slot), DESECRATE, or CHAOS-SET (bounded retries)
- **gamble** = a raw Exalt/Regal/Transmute slam where which mod lands is random

Headline scorecard:

- Baseline (before fixes): must-haves **32 / 38 (84%)**, wishes **0 / 27 (0%)**.
- After T1 + D1 + D2 (2026-06-22): must-haves **36 / 38 (95%)**, wishes **13 / 27 (48%)**.

Re-run anytime: `node pipeline/qa20.js` (full), `node pipeline/qa20.js 7` (one run),
`node pipeline/qa20.js sum` (scorecard + flags only).

---

## T1 (✅ DONE 2026-06-22) — Essence/crafted slot never fills a wish (the idle crafted slot)

This is the known-open **HIGH-2** from `HANDOFF.md`, and the QA shows it is not a corner case:
it is the dominant pattern. The one guaranteed-mod (crafted) slot was used to place a wanted
mod in **0 of 20 runs**, while mods an essence could have guaranteed got slammed instead.

### Symptom

In 12 of the 20 acquire-route runs, a mod that a Greater Essence could guarantee (often a wish,
sometimes the second must-have) is sent to a raw Exalt grind while the crafted slot sits empty.
Examples straight from the run log:

- Run 1 (Ring): buys Cold Res (carry), desecrates Life, then **gambles Mana ~6 slams** even
  though Greater Essence of the Mind would guarantee it. Crafted slot idle.
- Run 6 (Boots): MS bought, then **gambles Life + Cold Res + Chaos Res (~57 slams total)**, all
  three essence-able. Crafted slot idle.
- Run 11 (Wand): Spell Skills bought, then slams Spell Damage and Cast Speed, both essence-able.
- Run 20 (Gloves): Phys + Attack Speed secured, then slams Life and Cold Res, both essence-able.

### Root cause (the logic chain)

It is a chain of individually-reasonable rules that combine badly:

1. Real goals are entered at or near **top tier** for the stats you care about.
2. Greater Essences cap **well below top tier** (Greater Essence of the Body grants ~85-99 Life;
   a T1 want is 200-214). So `essenceFor` honestly returns `null` for a top-tier must-have. This
   tier-honesty is correct and we do not want to break it (it is the Boots MS bug fix, P3).
3. `routeAcquireAnchor` only ever considers **must-haves** for the crafted (essence) slot
   (`mustRem` in the route). Wishes are never candidates for the slot.
4. Net effect: no must-have qualifies (tier shortfall), so `essTarget` stays `null`, the route
   does a bare Regal, and the crafted slot is wasted. Meanwhile the wish that an essence COULD
   guarantee at a lower-but-useful tier is left to a raw slam.

So the planner will happily spend the DESECRATE slot to make a must-have deterministic, but it
never spends the ESSENCE slot to make anything deterministic. That asymmetry is the whole bug.

### Why it matters

The crafted slot is one of only two premium, one-per-item tools. Leaving it idle is the single
biggest determinism loss in the engine. Filling a wish at a lower tier is exactly the trade the
user wants: a guaranteed 31-35% Cold Res beats an open-ended slam for 41-45%, as long as the tool
is honest that it is the lower tier and lets the user accept it.

### Proposed fix

After must-haves fail to claim the crafted (essence) slot, **fall through and essence the hardest
essence-able WISH** (or a must-have the user has explicitly said they accept at a lower tier),
instead of leaving the slot empty and slamming the mod.

Sketch (in `routeAcquireAnchor`, where `essTarget` is chosen):

1. First pass unchanged: try to claim the crafted slot with the hardest essence-able MUST-HAVE
   that reaches its target tier (`essenceFor` with the must-have tier gate).
2. New fallback: if no must-have claimed it, scan the WISH mods (and, optionally, lower-tier-OK
   must-haves) for the one with the best essence value-per-slam-saved, using `essenceFor` in the
   lenient (wish) mode that accepts a sub-target tier. Claim the slot with that.
3. The chosen wish becomes an `anchor`-kind step (deterministic), not an exalt-fill, and is
   removed from `exaltFills`.

Pick the wish to essence by **slams saved**: prefer the essence-able wish with the highest
`expectedSlams` (biggest grind avoided), tie-break on smallest tier drop from the wanted value.

### Honesty / labelling requirements (do not skip)

- The step must state the GUARANTEED value and that it is **below** the entered tier, e.g.
  "Greater Essence of Thawing guarantees +(31-35)% Cold Resistance (your goal wanted 41-45%:
  this is the deterministic lower-tier fill, take it or slam for the higher roll)."
- Keep the existing essence-tier-shortfall note (P3). The new behaviour should read as a
  deliberate "secure the wish low" choice, never as silently hitting the wanted tier.
- Only one crafted slot exists. If the slot is already claimed by a must-have, the fallback does
  nothing. If a route is corrupted before the slot can be used (Abyss/fracture line, P6), the
  fallback must NOT fire (you cannot essence after the corrupt). The current fracture route
  already blocks this, keep it blocked.

### Edge cases to handle

- A wish that has no essence at all (e.g. Crit, Rarity, Movement Speed at T1) stays an exalt-fill.
- A wish whose only essence is a Perfect (remove+add) essence: do not auto-claim a Rare-state
  Perfect essence as the wish fill unless the route is already at Rare with a sacrificial mod
  (mirror the existing `routeEssenceFill` Perfect-mode handling).
- Do not let the fallback steal the slot from a must-have that could legitimately use it at a tier
  the user accepts (must-haves keep priority for the slot).
- Recompute pool-forcing / odds for the remaining exalt-fills after one mod leaves the fill list.

### Acceptance check

Re-run `node pipeline/qa20.js`. Expect:

- Wishes secured climbs from 0 toward roughly 13-15 / 27 (every run that currently shows an
  "IDLE CRAFTED SLOT" flag with an essence-able wish should convert).
- No regression in must-haves secured (still 32 / 38 or better).
- The idle-crafted-slot flag count drops to near zero for acquire-route runs.
- Update `test_planner.js` with a regression: a goal whose only essence-able mod is a wish must
  produce a route that essences that wish (asserts the crafted slot is used).

- [x] Implement the wish fallback in `routeAcquireAnchor` (DONE 2026-06-22)
- [x] Add honest lower-tier labelling to the essence step (DONE: "deterministic LOWER-TIER fill of a wish")
- [x] Handle the edge cases above (no-essence wishes stay slams; Perfect essences excluded; must-haves keep slot priority; fills recomputed)
- [x] Add the `test_planner.js` regression (DONE: Ring Life/ColdRes/Mana, asserts the wish gets essenced)
- [x] Re-run qa20 and record the new scorecard (below)

**RESULT (2026-06-22, T1 + D1 + D2 together):**
- Wishes secured: **0/27 → 13/27 (48%)** — every acquire-route run with an essence-able wish now fills it.
- Must-haves secured: **32/38 → 36/38 (95%)** — D1 (below) secured the lone-on-side musts.
- Two must-haves still gambled, both defensible: **Run 2** (a 4-mod triple-res ring: the acquire route has only 3 deterministic slots, and T1 correctly spends the essence on the ~41-slam Chaos-Res WISH, leaving Life as a clean ~9-slam grind rather than taking the fracture route's brick risk) and **Run 15** (desecrate-exclusive route has no carry/essence logic yet — separate enhancement).

---

## Design calls (RESOLVED 2026-06-22)

### D1 — Lone-on-side must-haves get gambled while the desecrate slot is free  ✅ DECIDED: go for determinism

**Decision (Aiyu, 2026-06-22): go for determinism.** Implemented: the same-side-keeper gate in
`routeAcquireAnchor` is removed, so a lone-on-side hard must-have (expected slams ≥ 4, desecrate-able)
now takes the one desecrate slot instead of being exalt-slammed. Effect in qa20: the lone-prefix
Life/Spirit/Spell-Damage gambles in runs 7/9/10/11/14 became deterministic desecrations
(must-haves 32 → 36 / 38). The HIGH-1 test was flipped to assert the new behaviour. Original note:

Runs 9 / 10 / 14 gamble a lone-prefix Life (~5-6 slams) with the desecrate slot unused. The
HIGH-1 same-side-keeper gate skips these on purpose, but that gate was a SAFETY optimization (an
Exalt-then-side-Annul retry is clean when the mod is alone on its side). Under a pure determinism
objective, that clean-but-still-random grind is less deterministic than just desecrating the mod.

Question: when the desecrate slot would otherwise go unused and the user is optimizing for
determinism over slam-count, should a lone-on-side hard must-have be allowed to take it? It is a
real trade (a bone + omens + Well trips vs a bounded ~5-slam exalt grind), so this is a values
call, not an obvious fix. Decide the policy, then encode it (probably a "max determinism" vs
"min currency" preference flag rather than hard-coding one side).

### D2 — Effort metric is unreliable whenever desecration is in the route  ✅ DECIDED: fold the fix in

**Decision (Aiyu, 2026-06-22): fold the bug fix in.** Implemented: `desecrateReveals` now CAPS its
estimate at 12 (desecration is a bounded, guided placement via side/lich omens + Abyssal Echoes +
Omen of Light, not a raw weight-share gamble). Run 15's effort dropped 3331 → 39, with no change to
any recommendation in qa20 (the totals held at 36/38 must, 13/27 wish). Original note:

Run 15 (desecrate-exclusive) scored effort **3331**. `desecrateReveals` explodes for tiny-weight
exclusive mods and under-prices desecration elsewhere (it is part of why Life gets desecrated over
an exalt in Run 1). This does not hurt determinism, but it makes the route-ranking number
untrustworthy when a bone is involved, and route ranking is what picks the recommended path.
This is the LOW-8 item from `planner-qa-findings.md`; fold the fix in here so ranking is honest
once the wish fallback changes the route mix.

---

## Cases to add (next QA expansion)

The first 20 covered the common item classes and the main triggers. Still want coverage for:

- [ ] Wishes that are explicitly accepted at a lower tier (flag a must-have as "tier-flexible" and
      confirm the essence fallback claims it before a wish).
- [ ] Goals with NO essence-able mod at all (pure Crit / Rarity / MS) to confirm the fallback
      correctly does nothing and does not invent an essence.
- [ ] Mixed must + wish where two different wishes are both essence-able (which one wins the slot?
      confirms the slams-saved tie-break).
- [ ] Jewellery goals where a catalyst-biased exalt competes with an essence wish fill (does the
      planner prefer the guaranteed essence over the biased gamble?).
- [ ] Two-hard-same-side PLUS an essence-able wish (fracture route + does the wish still get a
      deterministic home, given the Abyss corrupt blocks essences?).
- [ ] Runic Alloy mods once that data lands (alloy also eats the one crafted slot: it competes
      with the essence wish fill, so the slot-allocation logic must consider both).
- [ ] Higher and lower ilvl bases (not just 82) to confirm tier gates and essence reach shift
      correctly.
- [ ] Single-mod and 6-mod (full) goals at the rarity caps.

---

## T2 — New mechanics from the crafting-video analysis (2026-06-22)

Full write-up in `transcript-gap-analysis.md`. Four endgame crafting videos were checked against
P1-P15 and the planner. The strategy skeleton holds (every video follows our principles), but
several TOOLS are missing, and three of them break our hardest assumptions. Names below are from
auto-captioned transcripts and are GARBLED: verify the real name + exact effect + numbers on
poe2db before encoding anything (our no-inventing-facts rule).

### T2a (high) — Slot/cap/pool socketables (CONFIRMED in our CoE cache, no poe2db needed)

Big update (2026-06-22): these are ALL already in `pipeline/cache/coe_poec_data.json` under the
`socketables` section (287 entries: 209 runes, 60 soul cores, 18 idols), with exact granted-mod
text and class restrictions. We never extracted them into app data. The garbled video names resolve
cleanly. Our planner assumes one crafted slot + one desecrated slot + 3 prefixes / 3 suffixes; these
runes relax exactly those limits, so a real craft can be MORE deterministic than we can express.

The two CAP-BREAKERS (runes, affect `checkLegality`):

- [ ] **Astrid's Creativity** = "Can have # additional Crafted Modifier" → +1 crafted slot (place a
      SECOND guaranteed essence / Runic Alloy). Biggest determinism multiplier in any video. Lets
      `routeAcquireAnchor` secure two mods deterministically instead of one.
- [ ] **Serle's Triumph** = "+# Suffix Modifier allowed" → 7th modifier. Note: SUFFIX only, there is
      no prefix equivalent in the data. Breaks the 6-mod cap.

The POOL-UNLOCK family (6 runes, each "Can roll X modifiers", affect `modEligible` + eligible pool):

- [ ] **Kolr's Hunt** → Marksman (this is the gloves "Caller's Hunt"; confirms WHY our gloves data
      has zero projectile mods, they are gated behind this rune, bgroup 5 = Gloves)
- [ ] **Katla's Gloom** → Decay  ·  **Medved's Tending** → Soul  ·  **Thrud's Might** → Destruction
- [ ] **Uhtred's Sidereus** → Chronomancy  ·  **Vorana's Carnage** → Berserking
- [ ] Build step: add `pipeline/build_socketables.py` (CoE `socketables` → `data/poe2_socketables.json`),
      resolving each `mods` ref + `class`/bgroup restriction, bundle into app data. Model a socketable
      as either (a) a cap raise or (b) a tag-family added to an item class's eligible pool.

Also confirmed in the same data and worth extracting: **Perfect/Greater Iron Rune** = weapon
% increased Physical Damage (the V1 "Perfect Iron Runes"), and the lich **Gazes** (soul cores) for
lich mods, see T2d.

### T2b (excluded) — Buy-pre-fractured: OUT of scope (user decision 2026-06-22)

Buying a pre-fractured base is a MONEY question and we have no live market data, so it is out of
scope. Whether a user self-fractures or buys the fracture is their call; the planner presents the
self-fracture path and the user can substitute "buy it" if they prefer. No work item here.

- [ ] Minor (kept): the videos self-fracture more simply than our route (chaos to carry → desecrate
      one filler veiled → fracture 1-in-3) and use Abyss + Crystallisation for ESSENCE placement, not
      fracture setup. Review whether our fracture route's Abyss-mark step is heavier than needed.

### T2c (medium) — Tiered Exalt / Chaos currency

- [x] Confirmed real (2026-06-22): Greater = min mod level 35, Perfect = min mod level 50 (both
      Exalt and Chaos), a true tier-bias floor.
- [ ] Implementation: show the high-tier bias on odds steps (a min-mod-level floor reweights the
      pool toward higher tiers, similar in spirit to how `oddsForBiased` handles catalysts).

### T2d (medium) — Lich desecration: omens are confirmed; the Gazes are a red herring

- [x] CORRECTION (2026-06-23): the **Gazes** (`Kurgal's/Amanamu's/Ulaman's/Tecrod's Gaze`) are equip-
      stat SOUL CORES ("Abyssal Eye" augments) that grant a fixed stat per item type — they are NOT a
      crafting/desecration tool and have nothing to do with the lich desecration pools. An earlier note
      wrongly called them "the socket-based way to add a lich mod." They stay in the socketables
      catalogue (as `grant_mod`) but the planner does not use them. See `crafting-knowledge-base.md` §6.
- [x] The lich desecrate OMENS are confirmed (poe2db): Blackblooded→Kurgal, Liege→Amanamu,
      Sovereign→Ulaman; "Omen of the Leech" was the Liege. Surfaced as desecrate-step guidance.
- [ ] Still open (data): a real mod→lich map (which lich's pool carries each desecrated-exclusive mod)
      needs a poe2db Desecrated-Modifiers pull before the planner can name the exact omen per mod.

### T2e (medium) — Magic-rarity final goals

- [ ] Support a MAGIC item as a final goal (Video 2's talisman): 1 prefix + 1 suffix plus
      rune-granted extras, tighter caps, different route shape. Today we treat Magic as scaffolding.

### T2f (low / scope) — Corruption + finishing layer

- [ ] Vaal Blacksmith's Infuser (confirmed: weapon/armour quality 20% → up to 30%, rising corrupt
      risk): pull in alongside the P13 quality-breakpoint feature as the weapon/armour quality lever.
      Note the 30% cap may sit below some breakpoints (e.g. jewellery's 34% needs Essence of the
      Breach), so it crosses a breakpoint only when the breakpoint is at/under 30%.
- [ ] Architect's Orb (confirmed: twice-corrupt, 50% extra enchant / 50% destroy) + multi-corruption
      / force-socket: note only, low.
- [ ] Idols (Idol Osiris → gloves attack speed): separate augment layer, note only, low.
- [ ] Perfect Iron Runes and other socket runes: note only, low.

### T2 data status — what's closed vs what still needs poe2db

CLOSED from our own CoE cache (no fetch needed): all runes / soul cores / idols, including the 8
structural socketables (T2a), the lich Gazes (T2d), Iron runes, and the full rune ladder. These are
an EXTRACTION job, not a research job.

NOW RESOLVED from poe2db / poe2wiki (2026-06-22) — full details in `crafting-knowledge-base.md`:

- Tiered **Exalted / Chaos** orbs (T2c): REAL distinct currencies. Greater = min mod level 35,
  Perfect = min mod level 50 (both Exalt and Chaos). The floor is a real tier-bias, not "orb + omen".
- **Architect's Orb** (T2f): corrupts an already-corrupted item → Twice-Corrupted (50% extra
  enchantment / 50% destroyed; no mod outcomes). High-risk finisher.
- **Vaal Blacksmith's Infuser** (T2f): weapon/armour quality 20% → up to 30%, +1–2% per use with a
  rising corrupt chance (~10% @22% → ~45% @29%); safe at 20–21%. This is the weapon/armour lever for
  the P13 quality breakpoints.
- **Omens** (T2d): lich-pool forcing = Blackblooded→Kurgal, Liege→Amanamu, Sovereign→Ulaman; side =
  Sinistral/Dextral Necromancy; Omen of Light = annul only the desecrated mod. The video's "Omen of
  the Leech" = **Omen of the Liege** (Amanamu). Our KB mapping was already correct, now verified.

Nothing outstanding on the research side: all T2 items are now either extractable from cache (T2a/T2d
Gazes) or confirmed from poe2db (T2c/T2d omens/T2f). Remaining work is implementation, not research.

---

## Implementation plan — new crafting tools (T2 → code)

Sequenced build order. Research is complete (see T2 data status), so every step below is code/data.
Phases are ordered by dependency: A (data) unlocks C (legality), which unlocks D (planner). B, E, F
are mostly independent. Each step lists the files it touches and an acceptance check.

### Phase A — Data foundation: extract socketables (no engine change yet)

- [x] **A1. `pipeline/build_socketables.py`** (DONE 2026-06-22 — 287 socketables extracted) — parse CoE `socketables` (in `coe_poec_data.json`) →
      `data/poe2_socketables.json`. For each entry resolve `mods` ref → mod text and `class`/bgroup →
      our item-class names (bgroup map: 1 Jewellery, 2 Body Armour, 3 Boots, 4 Helmet, 5 Gloves, ...).
      Tag each with an `effect` kind: `cap_crafted` (Astrid's Creativity), `cap_suffix` (Serle's
      Triumph), `pool_unlock` (the 6 "Can roll X modifiers" runes → the unlocked tag family),
      `grant_mod` (lich Gazes + the rune ladder like Iron runes). Keep stype (rune/soulcore/idol).
- [x] **A2. Bundle** (DONE — `window.POE2.socketables`, slimmed; gazes keep `byScope`) — `pipeline/build_app_data.py` to fold `poe2_socketables.json` into
      `app/poe2_data.js` as `window.POE2.socketables`.
- [x] **A3. `pipeline/test_data.js`** (DONE — 12 socketable assertions, all passing) assertions: Astrid's Creativity → `cap_crafted`; Serle's Triumph
      → `cap_suffix`; Kolr's Hunt → `pool_unlock` Marksman on Gloves; a lich Gaze resolves to a
      per-class mod. Rebuild + run `node pipeline/test_data.js`.

### Phase B — Currency: tiered Exalt/Chaos min-mod-level floors

- [ ] **B1.** Add an optional `minModLevel` floor to the odds helpers in `app/planner.js`
      (`modWeight` / `poolWeight` / `oddsFor`): when set, a mod's eligible tiers below the floor are
      dropped from the weight sum (unless ALL its tiers are below the floor, in which case its top
      tier still counts — the confirmed exception). Greater = 35, Perfect = 50.
- [ ] **B2.** In every Exalt and Chaos step, list Greater/Perfect as variants and show the
      floor-adjusted odds next to the base odds (mirror how `catBiasClause` shows catalyst odds).
- [ ] **B3.** `test_planner.js`: a Perfect Exalt (floor 50) reports higher target share than a plain
      Exalt on a base where low tiers exist.

### Phase C — Legality: socketable loadout (cap + pool expanders)  ✅ DONE 2026-06-22

- [x] **C1.** (DONE) `app/app.js` gains `socketableLoadout(target)` and `checkLegality` reads
      `target.socketables`: `cap_suffix`/`cap_prefix` raise the affix cap (Serle's Triumph: Rare 3
      suffixes → 4, verified legal); `cap_crafted` is surfaced as `craftedSlots` in the result (the
      legality engine has no crafted-count check — that rule lives in the planner, so this just feeds
      Phase D); socketables apply only when their `scope` covers the item class. Result now carries
      `craftedSlots`, `prefixCap`, `suffixCap`, `unlocked`.
- [x] **C2.** (DONE) Builder UI: an "Equipped socketables" picker in `index.html` + `renderSockets()`
      in `app/app.js` lists the cap/pool runes that apply to the current class (Amulet → Astrid's +
      Serle's; Gloves → those + Kolr's/Katla's). Toggling updates `state.socketables` and recomputes
      legality live (verified with jsdom: 4 suffixes flips illegal → legal when Serle's is checked).
- [x] **C-followup (data gap): pool_unlock mod-eligibility.** DONE 2026-06-23. The off-pool mods are
      NOT in the CoE dump (no family tag), so they were pulled from **poe2db** (Aiyu's screenshots,
      Chrome wasn't usable to scrape directly) into `data/poe2_rune_pools.json` (6 runes, 78 mods:
      text + side + ilvl + approximate weights). Bundled as `window.POE2.runePools`. `app.js` gains
      `runePoolMods(target)` which, for each equipped pool_unlock rune in scope, builds the unlocked
      mods tagged to the current base; `renderPicker` shows them (RUNE tag) and `checkLegality` flags a
      rune mod whose rune isn't socketed. Verified with jsdom (equipping Kolr's Hunt live-adds its 12
      Marksman mods to the gloves picker) + 4 new `test_planner.js` assertions.
- [ ] **C-followup (planner odds for rune mods).** The planner's `eligibleMods` does not yet include
      rune-pool mods, so a goal containing a rune mod plans fine but its slam-odds denominator is a
      touch optimistic (the rune pool isn't counted as competition). Thread the loadout into
      `eligibleMods` during Phase D so odds are exact. Low impact (rune mods are rare/low-weight).
- [ ] **C-followup (socket-count limit).** An item can hold only as many socketables as it has sockets
      (Gloves 1, Body Armour 2, Jewellery 0). Not enforced yet (needs per-class socket counts, which
      ARE in the CoE bgroup data — `max_sockets`). Add when it matters.
- [x] **C3.** (DONE) `test_planner.js`: 6 assertions, Serle's makes a 4-suffix goal legal (cap 4);
      Astrid's gives `craftedSlots` 2; Kolr's Hunt scope respected (no-op on Amulet, records Marksman
      on Gloves). The "Marksman mod eligible on Gloves" assertion is deferred to the C-followup data
      gap above (we can't yet identify Marksman mods). All suites green.

### Phase D — Planner: spend the expanded budget (the determinism win)  ✅ mostly DONE 2026-06-23

- [x] **D1. Second crafted slot (Astrid's Creativity).** DONE. `routeAcquireAnchor` reads
      `craftedSlots(target, db)`; with Astrid's (cap_crafted ≥ 2) it places a SECOND guaranteed mod
      via a **Perfect essence** (remove+add, since the item is already Rare after the 1st magic→rare
      essence) steered with a Crystallisation omen, exactly like the V4 caster-gloves video. Composes
      with T1 (must-haves at tier first, else the slams-saving wish). Demo: Ring Life/ColdRes/ManaRegen
      with Astrid's goes from 1 gamble to 0 (Mana Regen → Essence of Hysteria). Data-gated: only fires
      when a goal mod has a Perfect essence (few do). Regression test added.
- [x] **D2. Lich-omen guidance (corrected scope).** ⚠ The original plan ("offer a lich Gaze as a
      deterministic placement") was WRONG: the **Gazes are equip-stat soul cores ("Abyssal Eye"
      augments), NOT a crafting/desecration tool** (confirmed 2026-06-23, Aiyu screenshot). Removed
      that inference (`lichForMod`). What shipped: an honest desecrate-step + note giving the real lich
      OMEN mapping (Blackblooded→Kurgal, Liege→Amanamu, Sovereign→Ulaman) and pointing to poe2db for
      which lich carries a mod. **Still open (needs data):** naming the exact omen per mod requires a
      real mod→lich desecration-pool map (a poe2db Desecrated-Modifiers pull, like the rune pools).
- [x] **D3. 7th suffix (Serle's Triumph).** DONE. Added `affixCaps(target, db)`; `forcingNote` uses
      effective caps so a 4-suffix goal (legal via Serle's) plans all 4 and the pool-forcing note reads
      "3 prefixes / 4 suffixes". Regression test added.
- [x] **D4.** `test_planner.js` regressions for D1–D3 added (all suites green; qa20 unchanged at
      36/38, 13/27 since none of the qa20 goals equip socketables).
- [ ] **D-followup (low): rune-mod odds in the planner.** `eligibleMods` still doesn't count
      rune-pool mods in the slam-odds denominator, so a goal with a rune mod plans fine but its odds
      read slightly optimistic. Low impact (rune mods are rare/low-weight). Thread the loadout in later.
- [ ] **D-followup (data): mod→lich desecration map.** Pull poe2db's Desecrated Modifiers (by lich) so
      desecrate steps can name the exact lich omen for any desecrated-exclusive mod (see D2).

### Phase E — Magic-rarity final goals (T2e)

- [ ] **E1.** Support `rarity: "Magic"` as a final goal: cap at 1 prefix + 1 suffix, allow
      rune-granted extras (Serle's), and give it its own short route shape (fracture/essence the one
      important mod, done). Today Magic is only scaffolding.

### Phase F — Corruption / finishing layer (T2f, low priority)

- [ ] **F1.** Vaal Blacksmith's Infuser as a quality-finish step (20% → up to 30%, rising corrupt
      risk), wired to the P13 quality-breakpoint feature when that lands.
- [ ] **F2.** Architect's Orb + multi-corruption / force-socket as optional finisher notes via
      `buildNotes` (no deterministic steps; pure end-of-craft gambles).

### Suggested order

A1→A2→A3, then C1→C3 (legality must understand the loadout), then D1/D2/D3 (the payoff). B and E
slot in anywhere after A. F last. T1 (wish fallthrough) should land before or with D1 since they
share the essence-slot allocation code.

---

## Done / verified working (so we do not re-test blindly)

- Carry mod is BOUGHT, never gambled: 20 / 20 (P1 holds).
- Fracture fires only on 2+ hard same-side must-haves: Run 4 yes, Run 3 (same mods, only Spirit
  flagged) correctly drops to Acquire.
- Desecrate-LAST ordering holds in the fracture route (P10): Run 4 desecrates Spirit at the end.
- Desecrate-exclusive goal forces the desecration route and secures the exclusive mod: Run 15.
- Tier-honesty holds: no must-have is ever faked with a too-weak essence (P3).
