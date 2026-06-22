# PoE2 Planner — Endgame Craft Method Spec

> Target model for the planner's "brain." This captures the REAL deterministic crafting
> method (as practiced at mid/high end), which the current engine does NOT model. The
> current planner produces a beginner/mid route (acquire carry → essence → side-omen exalts
> → desecrate last). This spec is the thing we rebuild toward. Companion docs:
> `crafting-knowledge-base.md` (0.5 systems) and `poe2-crafting-reference.md` (mechanics).
> Source: walkthrough of a full amulet craft + the general crafting guide.

---

## 0. The paradigm shift

The current planner thinks in **from-white strategy templates** and treats **fracture as a
risky optional side-route**. The real endgame method is the opposite:

> **Lock a foundation mod permanently, then place each remaining mod with the most
> deterministic tool available given what's already locked, and gamble only the final 1–2
> slots.**

Fracture is not a niche gamble route — it is the *anchor step* that makes the rest of the
craft safe and (mostly) deterministic. "Deterministic" here means **bounded-and-repeatable**:
repeat the same forced step until the outcome lands. It is not free; it costs currency.

A craft is therefore a **sequence of placements**, each using the cleanest tool for that mod,
not a single template. The planner should solve: *"for THIS mod, given what's already locked
and which slots/tools remain, what's the most deterministic way to place it?"*

---

## 0.5 Input model — wishlist by default, must-have flags

A goal is a **wishlist**, not a hard spec. By default the planner treats entered mods as
"get me as close as is reasonable." The user can flag individual stats as **MUST-HAVE** (e.g.
build a dream item, then star the 2–3 stats that actually matter).

- **Must-have mods drive the plan.** They are guaranteed with deterministic tools, they
  determine the method tier (§3.5), and they are what feasibility is judged against. The
  base-carry, the essence slot, the desecration slot, and any fracture are all spent on
  must-haves only.
- **Nice-to-have mods are best-effort.** The planner aims the *remaining* open slots at them
  (biased exalts / catalysts on jewelry) and reports the per-slam chance, but **never escalates
  tooling to chase one** — no fracture, no spending the crafted/desecrated slot on a wishlist
  mod. A nice-to-have that doesn't land is an acceptable outcome.

Consequences for the solver:
- The **carry** (the mod you buy the base for) = the hardest **must-have**, not the hardest mod
  overall.
- **Difficulty / tier (§3.5) counts only hard must-have mods.** Nice-to-haves can never push a
  craft into the fracture tier.
- **Feasibility is bounded.** Guaranteed placements ≈ 1 carry + 1 essence + 1 desecration +
  (at most) 1 fracture-anchor + 1 chaos-target on that side + pool-forcing. If the must-have
  set exceeds that, conflicts (one-per-group), or piles too many on one side, the planner
  **warns and proposes the nearest feasible must-have subset** instead of silently contorting.
- **Builder UI:** a per-mod must-have toggle (★/☆), default off (wishlist).
- **Implemented default (4b-iii):** if the user flags NONE, the planner treats *all* mods as
  must-have (assume you want them all) — this keeps behaviour sensible/backward-compatible for
  un-annotated goals. Flagging some mods is what focuses the premium tools on that subset and
  drops the rest to best-effort. (So the over-specification fix kicks in once you star the criticals.)

---

## 1. The deterministic toolkit (composable operations)

Each operation has: preconditions, effect, what it locks/protects, and a determinism class
(deterministic = bounded-repeatable · biased-gamble = loaded dice · pure-gamble = raw RNG).

### 1.1 Fracturing Orb — the anchor
- **Pre:** Rare with **4+ mods**. Expensive currency.
- **Effect:** permanently locks **one RANDOM** non-fractured, non-desecrated mod. The locked
  mod is **immune to Chaos and Annulment** forever.
- **Targeting:** which mod gets locked is a **gamble** (1/N over eligible mods). A **veiled
  desecrated mod cannot be fractured** (only a *veiled* one — a revealed desecrated mod or a Mark
  IS fracturable), so you place a veiled blocker FIRST to shrink the pool (e.g. 1/4 → 1/3). The
  cheap, safe way to set that up (see §1.x Abyss setup): a cheap Rare with the carry + an open slot
  (~1 ex, vs ~1 div for a Magic base) → **Omen of [opposite-of-carry-side] Crystallisation +
  Essence of the Abyss** (eats a mod on the carry's opposite side, adds Mark of the Abyssal Lord) →
  **bone desecrate** (jawbone/collarbone/rib) consumes the Mark into a veiled mod → THEN fracture.
  The desecrate must precede the fracture. On a miss you restart from a fresh cheap rare.
- **Why it's the anchor:** (1) **safety net** — your centerpiece can never be lost; worst case
  annul everything else down to it and rebuild. (2) **enabler** — see chaos-targeting below.
- **Determinism:** the lock itself is a *biased-gamble*; once it lands, the mod is *permanent*.

### 1.2 Chaos-targeting via fracture — deterministic single-slot reroll
- **Pre:** a fractured anchor + exactly **one** other non-fractured eligible mod.
- **Effect:** Chaos removes 1 random + adds 1 random. Removal **can't** pick the fractured mod,
  so it is **forced onto the single other mod** → that slot rerolls, anchor untouched. Repeat
  Chaos until the slot lands on the desired mod.
- **Caveats:** the **add side is uncontrolled** — the new mod may land prefix or suffix; if it
  takes the "wrong" open side it only swaps which filler ends up where (equivalent outcome).
  Works cleanly only while there is a **single** non-fractured eligible mod; with 2+ you must
  constrain with side omens (below).
- **Determinism:** *deterministic* (bounded-repeatable) for the targeted slot.

### 1.3 Side omens — protection & confinement (Sinistral = prefix, Dextral = suffix)
| Omen | Pairs with | Effect |
|---|---|---|
| Sinistral/Dextral Exaltation | Exalt | add only a prefix / suffix |
| Greater Exaltation | Exalt | add **two** mods |
| Sinistral/Dextral Annulment | Annul | remove only a prefix / suffix |
| Sinistral/Dextral Erasure | Chaos | chaos acts only on a prefix / suffix |
| Sinistral/Dextral Coronation | Regal | add only a prefix / suffix |
| Sinistral/Dextral Crystallisation | Perfect Essence | remove only a prefix / suffix before the add |
| Sinistral/Dextral Necromancy | Desecration (bone) | desecrate only a prefix / suffix |
- **Use:** confine every operation to one side so locked/wanted mods on the **other** side are
  physically untouchable. Side-protection is how you keep non-fractured wanted mods safe.

### 1.4 Essences — the one crafted slot
- **Magic→Rare ADD** (Lesser/Normal/Greater): upgrade + guarantee a mod. Spends the **one
  crafted-mod slot**. Prefer the **highest available tier** for value.
- **Perfect** (remove+add on a Rare): steer the removal with Sinistral/Dextral Crystallisation.
  Trick: exalt a **junk mod on the target side first** to give the removal a safe sacrifice.
- **Essence of the Breach** (jewelry): a corrupted essence (remove_add) granting **+20% to Maximum
  Quality** (raises the cap toward 40%). VERIFIED in-game (screenshot) and added to
  `poe2_essences.json` via a cited supplement in `build_essences.py` (the poe2db scrape had missed
  it). Not a goal mod — an **amplifier** for the catalyst/breakpoint steps (§1.6). It is a separate,
  guaranteed GRANT; it does NOT interact with the Catalysing Exaltation *bias* (which applies only
  to exalted orbs) — the tool surfaces it as its own quality-cap step, not on the catalyst step.
- **Determinism:** *deterministic* placement (one orb).

### 1.5 Desecration reveal loop — the desecrated slot (3rd deterministic placement)
- **Pre:** Rare. Bone by slot: **collarbone = jewelry, rib = body armour, jawbone = weapon**
  (gnawed ilvl≤64 / preserved any ilvl / ancient = min-mod-level, no junk).
- **Flow:** Omen of Sinistral/Dextral **Necromancy** forces the side → bone adds a **veiled**
  desecrated mod (if the side pool is full, one is removed first) → reveal at the **Well of
  Souls**, pick **1 of 3**. Reveal draws from the **normal side pool + the desecrated/Lich
  exclusive pool**.
- **Retry loop:** **Omen of Abyssal Echoes** rerolls the 3 options once (cheap, use first).
  **Omen of Light** makes an Annul **target the desecrated mod specifically** to remove it and
  re-desecrate (expensive — fallback). NB: a desecrated mod is **not** immune to a plain annul;
  Light just *forces* the annul onto it. Only **fracture** is true immunity.
- **Determinism:** *deterministic* (bounded by reveal odds + retry currency).

### 1.6 Quality + Catalysts + Catalysing Exaltation — JEWELRY ONLY
- **Catalysts** add quality of a **type** (e.g. Carapace = defensive armour/eva/ES; Reaver =
  attack; etc.), up to the cap (20% base, 40% with +max quality).
- **Omen of Catalysing Exaltation**: consumes the quality and **biases the next exalt toward
  mods matching the quality type** — ≈ **2× weight at 20%**, ≈ **3× at 40%** (community-tested,
  not official). Biases, does **not** guarantee → *biased-gamble*.
- **Quality breakpoints:** quality scales matching mod magnitudes, crossing tier breakpoints —
  e.g. **+3 → +4 to Level of all Melee Skills at 34% attack (Reaver) quality**. The +max
  quality mod exists to reach these thresholds.
- **Quality is sticky:** it persists on the item even after the +max-quality mod is removed —
  so that mod is disposable once it's done its job (delete it via Whittling, §1.7).
- **Perfect-exalt min-ilvl nuance:** a Perfect Exalt forces min mod ilvl 50. For resistances,
  cold-res T4 is ilvl 50 (included) but fire/lightning T4 sit below 50 (excluded → T3+). So for
  a guaranteed-higher resistance, bias with **fire/lightning** catalysts, **not cold**.
- **Selling:** re-apply catalysts at the very end to boost displayed values (amulet quality
  doesn't render on trade otherwise).

### 1.7 Whittling — deterministic removal of the LOWEST-ilvl mod (a GENERAL tool)
- **Omen of Whittling** + Chaos: the chaos's removal is forced onto the modifier with the
  **lowest required level (mod ilvl)**; it then adds a random mod (add-side uncontrolled, as usual).
- **General, not a one-off.** It evicts whatever mod is currently the lowest-ilvl — any low/junk
  filler, not just spent +max quality (that's merely the cleanest case, sitting at ilvl 1). Use it
  to surgically drop the floor mod and reroll that slot, in cleanup OR mid-craft.
- **Strategic precondition (the planner MUST check this):** to target a *specific* mod, that mod
  has to actually BE the lowest-ilvl on the item. If a lower-ilvl mod is present, whittling hits
  that one instead. So the planner compares the per-tier ilvls of the placed mods, confirms the
  intended removal is the floor (or that lower mods are fractured/absent), and otherwise notes
  that whittling can't surgically target it yet. Stack with Sinistral/Dextral Erasure to also
  pin which side it acts on.
- **Modeling:** use each placed mod's chosen-tier ilvl (from the `bw` ladder) as the level proxy;
  `whittleTarget(state) = argmin(tier-ilvl)`.
- **Determinism:** *deterministic* removal of the lowest-ilvl mod (bounded only by the random add).

### 1.8 Greater/Perfect tiers — floor control
- Greater/Perfect variants of Transmute/Augment/Exalt impose a **minimum modifier level**
  (raise the value floor, shrink the rollable pool). Match tier to the base ilvl so you don't
  accidentally exclude a wanted mod whose only tiers fall below the floor.

### 1.9 Pure gamble — the leftover slot(s)
- The final 1–2 open slots that no tool can safely target (rerolling them would endanger a
  non-fractured wanted mod) are **exalt-slam-and-pray**. Honest gambling; label as such.

---

## 2. Slot & resource budget (hard constraints)
- **6 mod slots:** 3 prefixes + 3 suffixes. Prefix/suffix pools are independent.
- **One crafted-mod slot:** essence **or** runic alloy **or** runic-ward enchant — mutually
  exclusive, pick one.
- **One desecrated-mod slot:** desecration. Separate from the crafted slot (one of each OK).
- **Fracture** and **quality** are separate from both budgets.
- Rarity is one-way (no scour) → order of operations matters; lock the anchor before slamming.

---

## 3. The method as an algorithm (what the planner should emit)

**Phase A — split must-have vs nice-to-have (§0.5), then classify each MUST-HAVE** by its
cleanest acquisition, given side and weights (nice-to-haves are parked for best-effort fill):
- `foundation` — the single hardest **must-have** → carry (buy the base) / fracture anchor.
- `chaos-target` — a same-side mod you can force via fracture-enabled chaos.
- `essence` — essence-forceable (uses the crafted slot).
- `desecrate` — present in the desecrated/normal reveal pool (uses the desecrated slot).
- `catalyst-bias` / `breakpoint` — jewelry type-matched / quality-threshold mods.
- `gamble` — none of the above; pure exalt slam.

**Phase B — execute anchor-first:**
1. Get the foundation mod onto a 4+ mod Rare (buy a base that has it, or roll it), then
   **fracture** it (gamble; desecrate a filler first to improve odds). Miss → restart.
2. **Chaos-target** the 2nd same-side mod (fracture forces the reroll). Stop once it lands.
3. Spend the **crafted slot** (essence) and the **desecrated slot** (desecration reveal loop),
   each **side-protected** so they can't eat the anchor's side.
4. **Jewelry:** stack the right **catalyst** type, then Catalysing Exaltation + side omen +
   greater/perfect exalt to land type-matched mods; use **+max quality** (breach essence) to
   hit **breakpoints**; **whittle** away spent quality mods.
5. **Best-effort fill** the remaining open slots aiming at the **nice-to-haves** (side-omen
   exalts; catalyst-biased on jewelry), reporting per-slam odds. Whatever doesn't land is fine.
- **Throughout:** side omens confine every op to one side; the fractured anchor is the only
  mod with true immunity, everything else is protected by careful targeting.

**Ordering rules (from live testing — these matter):**
- **Only the fractured mod is strip-safe.** Every other placed mod (chaos-targeted, exalted,
  desecrated) can be lost when you fix a bad roll, because annul/chaos removal is random across
  the non-fractured mods. So a "reroll" is never free: exalt → if junk, annul (a gamble that may
  eat a wanted mod) → if it eats one, **re-chaos-spam to recover it**. Frame fills as this grind
  loop, not "reroll freely."
- **Desecrate LAST.** A desecrated mod isn't fracture-proof, so place it AFTER the gambly exalts —
  if you desecrate early and a later bad exalt forces a strip, the desecrated mod is collateral.
- **The pre-fracture veiled mod is sacrificial.** To chaos-spam you annul down to fracture+1,
  which strips the veiled blocker. It exists only to buy the 1-in-3; it is not reused.
- **Chaos-spam targets the SET.** At fracture+1 the Chaos adds a random-SIDED mod, so it can land
  any remaining must-have — spam for the set, take the first, desecrate the leftover (last).

**Phase C — finish:** Divine (or Omen of Sanctification) to perfect rolls; re-apply catalysts
for display; corrupt (Vaal) only as a separate terminal gamble.

---

## 3.5 When the endgame flow is justified (method-tier selection) — CRITICAL

Fracture (and the chaos-targeting it enables) is **expensive**: the orb itself, plus a 1/N hit
gamble, plus likely re-buying the base on misses. It is **only worth it when the goal is
valuable/hard enough to justify it.** Cost is out of scope (project mission), so the planner
uses **difficulty as the proxy** and must **default to the cheapest route that realistically
reaches the goal.** It must NOT staple a fracturing orb onto an easy craft.

**Placements available WITHOUT fracture** (the cheap tier):
- buy a base that already carries the hardest mod (the carry)
- 1 × essence (the crafted slot)
- 1 × desecration reveal loop (the desecrated slot)
- pool-forcing (fill one side → exalts forced to the other) + side-omen protection

**Fracture is justified ONLY when a single side carries 2+ hard MUST-HAVE mods you must grind
among.** That is the one situation side-omens can't handle — they isolate *sides*, not mods
*within* a side — so only fracture's true immunity lets you reroll one while protecting the
other (via chaos-targeting). Otherwise: no fracture. (Nice-to-haves never count here — §0.5.)

**Decision sketch:**
1. Consider **must-have** mods only (§0.5). Tag each `hard` if its weight-share is low (high
   expected slams) and it isn't trivially common.
2. Remove from consideration the must-haves covered by the bought-base carry, the 1 essence,
   and the 1 desecration (the cheap deterministic placements).
3. Count the remaining `hard` must-have mods **per side**.
4. **Any side with ≥2 → fracture tier** (lock one, chaos-target the other). **Else → cheap
   tier**, and the output contains **no fracturing orb**.

**Worked check (the user's case):** a 3-mod goal where 2 are reliably hittable (common, or
essence/desecrate-coverable) leaves ≤1 hard uncovered mod on any side → cheap tier → the
planner must output **no fracture**. Reserve the fracture flow for the 4–5 hard-mod, high-value
goals (like the §8 amulet, which had two hard same-side suffixes).

**Other (non-goal) fracture use — out of scope here:** profit-gamblers fracture one bomb mod
then chaos-fish the whole item for extra value. That's an open-ended gambling workflow, not a
goal-directed plan, so the planner doesn't emit it.

### User-input model (RESOLVED — see §0.5)
Goals are **wishlists with opt-in must-have flags**. Difficulty and the fracture decision count
**must-haves only**, so an over-specified wishlist no longer inflates the tier — the user simply
stars the 2–3 stats that matter and the rest are best-effort. Still on the Stage-4 list:
- **Feasibility warning** when the *must-have* set alone is mirror-tier / unreachable ("these 4
  starred suffixes need fracture + N hard slams; unstar one and it's a clean essence+desecrate
  craft") instead of silently contorting.

---

## 4. Determinism labeling (honest per-step)
- **Deterministic (cost = retries):** essence ADD, chaos-target single-slot, desecrate reveal
  loop, whittling removal, fracture *safety* (once landed).
- **Biased-gamble (loaded dice):** fracture hitting the *right* mod, catalyst-biased exalt,
  desecrate reveal odds.
- **Pure gamble:** final exalt slam, raw chaos with 2+ eligible mods.

The planner already shows weight-share odds ("~X% per slam"); extend that with the
determinism class so users see *what kind* of step each is.

---

## 5. Item-class scaling (how clean a craft can be)
- **Jewelry (amulet / ring / belt):** full quality + catalyst + Catalysing Exaltation layer →
  the **cleanest, most deterministic** crafts. The amulet method in §3 is the canonical case.
- **Armour / weapons:** **no catalyst type-biasing** (quality via whetstones doesn't steer mod
  types the same way) → **more annulment gambling**. Lean on fracture + chaos-target +
  desecration + side omens; expect more raw RNG and brick risk.
- **Bases & implicits:** some bases are chosen for their **implicit** (gold amulet = rarity,
  solar amulet = spirit) and bought with an **open prefix**; the planner currently has no
  concept of implicits.

---

## 6. Budget tiers (scale the recommendation to the goal — gated by §3.5)
The tier is **chosen by goal difficulty (§3.5), not offered as a menu.** Pick the lowest tier
that reaches the goal.
- **Cheap / early:** buy base → essence anchor → desecrate a high-value prefix → exalt-fill.
  No fracture, no catalysts. *(≈ what the planner does today; correct for easy goals.)*
- **Mid (jewelry):** + quality/catalysts + Catalysing Exaltation for type-biased mods and
  breakpoints. Still **no fracture** unless §3.5 fires.
- **Endgame:** the fracture-anchor + chaos-targeting flow — **only** when a side has 2+ hard
  must-keep mods (§3.5). Mirror-tier adds Hinekora's Lock (foresee next currency) and
  Sanctification (×78–122% all values, then unmodifiable) as finishers.

---

## 7. Engine implications (the rethink)
- **From template-menu → deterministic-placement solver.** Plan guarantees for the **must-have**
  set (§0.5): for each must-have, compute the most-deterministic acquisition given the current
  locked state + remaining slots + applicable tools; sequence **anchor-first**. Then fill the
  leftover slots with **best-effort** attempts at the nice-to-haves and push **pure gambles
  last**. Side-protection is a global constraint, not a per-route afterthought.
- **Reuse** the existing legality + weight engines for eligibility and odds.
- **Model fracture as a step** (anchor) usable inside the main route, not a separate route.
- **Model chaos-targeting** explicitly (fractured mod shrinks chaos's legal target set).

### Data / modeling gaps to fill for implementation
1. **Catalyst table:** catalyst → mod tags it boosts → quality→weight-multiplier curve (2×/3×).
2. **Quality breakpoints:** per mod, the quality % at which the tier bumps (e.g. +3→+4 @ 34%).
3. **Base implicits:** which bases carry which implicit (gold=rarity, solar=spirit, …).
4. **Perfect-exalt min-ilvl interactions** per mod (we already have per-tier ilvl ladders).
5. **Desecration reveal pool weighting** (already have the desecrated pool + normal pool).
6. **Essence of the Breach / +max-quality** mod and the quality cap mechanic.

### Open questions (community-tested, not official — flag as estimates)
- Exact Catalysing Exaltation multipliers and which catalyst maps to which tags.
- Exact quality-breakpoint thresholds per mod family.
- Cost stays out of scope (project mission); the determinism class is the stand-in for "how
  grindy/expensive," not a currency estimate.

---

## 8. Worked example (the canonical jewelry craft, for test fixtures)
Goal amulet: **+4 Level of all Melee Skills (S), Crit Hit Chance (S), Spirit (P),
% increased max Energy Shield (P)**, + 2 open slots.
1. Acquire amulet with +3 melee on it; **fracture** the +3 (desecrate-block → ~1/3). → +4 via
   later quality.
2. Exalt a junk suffix; **chaos** (forced onto it by the fracture) until **crit** lands. Now
   both wanted suffixes are set (one fractured, one held by side-discipline).
3. Prefixes are now free. Exalt a junk prefix → **Sinistral Crystallisation + Essence of the
   Breach** → **+max quality** prefix (cap → 40%).
4. **Carapace** catalysts → 40% defensive quality; **Catalysing Exaltation + Sinistral
   Exaltation + perfect exalt** → **% max ES** prefix (≈3× biased).
5. **Reaver** catalysts → 34% attack quality → **+3 melee becomes +4**. The +max-quality
   prefix is now spent; **Omen of Whittling + chaos** removes it (ilvl 1) and rerolls that
   prefix.
6. **Sinistral Necromancy + collarbone** → veiled **Spirit** prefix; reveal at the Well, use
   **Abyssal Echoes** then **Omen of Light + Annul** retries until Spirit.
7. Final open suffix: **Dextral Exaltation + exalt** — pure gamble.
8. Finish: Divine; re-apply catalysts for display before sale.

Result: 3 prefixes (max ES, Spirit, leftover) + 3 suffixes (+4 melee fractured, crit, leftover),
with only the 1–2 leftover slots having been true gambles.
