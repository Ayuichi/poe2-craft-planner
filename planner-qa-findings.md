# Planner Q&A — 10 Wish-Item Runs (2026-06-22)

Manual evaluation of `planRoutes` output against the established 0.5 systems documented in
`poe2-crafting-reference.md`. Three questions per run:

1. **Sound?** — does the output obey the real mechanics (pools, rarity one-way street, omen/bone/essence rules, caps)?
2. **Deterministic?** — does it guarantee every stat it *could* guarantee (buy / essence / desecrate) instead of gambling?
3. **No waste?** — is any currency or omen spent where a cheaper action would do?

Harness: `pipeline/qa_runs.js` (builds each goal from the real dataset, dumps the recommended route + all-route effort + notes). Re-run with `node pipeline/qa_runs.js [n]`.

---

## The 10 runs at a glance

| # | Wish item | Recommended route | Verdict |
|---|-----------|-------------------|---------|
| 1 | Ring — Life + Cold Res + Mana | Acquire carry (Cold Res) → Essence Life → **desecrate Mana** | ✅ desecrate correct (Mana shares prefix side with Life keeper) |
| 2 | Amulet — Spirit + Crit + Melee (unflagged) | Fracture-anchor → chaos-target | ✅ correct trigger; ⚠ effort undersells brick cost |
| 3 | Amulet — same, **only Spirit** must-have | Acquire carry (Spirit) → exalt wishes | ✅ flag correctly drops fracture |
| 4 | Boots — T1 MS (must) + Life + Cold Res | Acquire carry (MS) → **Regal** → exalt Life/Res | ⚠ gambles a guaranteeable wish (Life); crafted slot unused |
| 5 | Sceptre — +4 Minion + Spirit | Acquire carry (Minion) → Regal → **exalt Spirit** | ✅ FIXED — lone on prefix side, now exalt-fills |
| 6 | Body Armour — Life + ES + Fire Res | Acquire carry (Fire Res) → Essence Life → exalt ES | ✅ clean, no waste |
| 7 | Belt — Life + Fire Res + Cold Res | Acquire (Fire Res) → Essence Cold → **exalt Life** | ✅ FIXED — lone on prefix side, now exalt-fills |
| 8 | Gloves — Atk Spd + Life + Light Res | Acquire (Atk Spd) → Essence Light → **exalt Life** | ✅ FIXED — lone on prefix side, now exalt-fills |
| 9 | Quiver — single Atk Spd suffix | Manual ladder (Transmute) | ⚠ finish step claims "Rare" on a Magic item |
| 10 | Amulet — desecrate-exclusive + Life + Fire Res | Desecration anchor → fill | ✅ correctly mandatory; ⚠ effort = 3331 (nonsense) |

**5 of 10 are clean or only cosmetically off; the other 5 share two real, fixable problems.**

---

## What works well (don't relitigate)

- **Legality holds.** Rarity never regresses within a route, 3p/3s caps respected, one-crafted-slot / one-desecrated-slot rules honored. Omen naming (Sinistral/Dextral, Exaltation/Necromancy/Erasure), bone-by-class (Collarbone = jewellery), and pool-forcing all match the reference doc exactly.
- **Carry-base philosophy is applied correctly** (runs 1–8): the single hardest mod is *bought on the base*, never gambled from white.
- **Essence data is genuinely class-aware.** Run 1 (Ring) caps Life at "Essence of the Body → 70–84" while Run 6 (Body Armour) reaches "Greater Essence of the Body → 100–119" — exactly the reference's "greater version excludes rings." The Boots run correctly *refuses* an essence for 35% MS (Hysteria only reaches 30%) and explains the shortfall.
- **Must-have flag works** (run 2 → 3): flagging only Spirit drops the over-engineered Fracture route and falls back to the cheaper Acquire route — the over-specification fix doing its job.
- **Desecrate-exclusive handling** (run 10): slam routes are correctly gated out; only the Well can make the Glory mod.
- **1-mod goals** correctly skip the Acquire route (nothing to "build around").

---

## The safety model (what makes a Chaos / Annul "safe")

All of the spend-the-premium-slot findings below reduce to one question: **is a destructive action safe with respect to the mods you want to keep?** A Chaos or Annul is safe only toward mods it *cannot hit*, and there are exactly two ways to put a keeper in that category:

1. **Fracture — true immunity.** A fractured mod can never be removed by Annul or Chaos. Its only purpose is to lock a mod permanently; once locked you **subtract it from the board** when reasoning about safety — every other slot can be Chaos/Annul-spammed and the fractured mod just sits there. This is what turns destructive currency into a safe reroll engine. (Fracturing locks a *random* mod, so steering *which* mod locks is itself a gamble — hence the veiled-blocker setup that pushes the carry to ~1-in-3.)
2. **Desecrate + Omen of Light — targetable, not immune.** A plain Annul *can* remove a desecrated mod; Omen of Light forces the Annul onto it specifically, so you can pull it back cleanly (and protect it by side-targeting *away* from it).

Everything else — Sinistral/Dextral side omens — only resolves **cross-side** safety. No omen can distinguish two mods on the **same** side. So the safety test the planner should run for any destructive step is:

> **Is each keeper either fractured (ignore it) or desecrated (targetable)? If a keeper is neither, and it shares the open side with the action, the action is unsafe.**

The planner already applies this correctly inside the Fracture route's exalt-fill step (*"only the fractured mod is safe — a junk Annul can eat a wanted mod"*). HIGH-1 is about extending the same reasoning to the Acquire route's choice between Exalt and desecration.

---

## Findings (by severity)

### HIGH-1 — Desecration is wasted only when the target is ALONE on its side (corrected) — ✅ FIXED
**Runs 5, 7, 8** (NOT Run 1). *Original draft flagged the odds threshold; that reasoning was wrong — corrected here after review.*

> **Status:** Implemented in `routeAcquireAnchor` (`app/planner.js`). The desecrate gate now also requires a same-side keeper (`target.mods.some(k => k !== m && k.side === m.side)`); a target alone on its side falls through to exalt-fill. Verified: Runs 5/7/8 now exalt the lone-side mod, Run 1 still desecrates (Life shares the prefix side), Run 10's exclusive route is unchanged. `test_planner.js` extended (opposite-side goal → no desecrate; same-side goal → desecrate); both suites green.

An Exalted Orb only **adds**, never removes, so placing a mod is zero-risk. The risk is entirely in the **retry**: a failed Exalt leaves a junk mod that must be removed, and no omen can distinguish *two mods on the same side* (side omens pick a side; **Omen of Light** picks the *desecrated* mod). So:

- **Same-side keeper → desecration is correct.** **Run 1** ends with `Life (prefix) + Mana (prefix) + Cold Res (suffix)`. Mana shares the prefix side with the Life keeper, so every failed Mana-Exalt forces a removal that is a coin-flip between Life and the junk. Desecration's retry loop (Abyssal Echoes rerolls the 3 with no removal; Omen of Light + Annul strips only the desecrated mod) never endangers Life. **Run 1 is correctly desecrated.**
- **Lone target → Exalt is clean and cheaper.** Runs 5/7/8 all end with the desecrate target as the **only** wanted mod on the prefix side (every keeper is a suffix):

  | Run | Desecrate target | Other keepers | Same side? |
  |---|---|---|---|
  | 5 | Spirit (pre) | Minion (suf) | no — lone prefix |
  | 7 | Life (pre) | Fire Res (suf) + Cold Res (suf) | no — lone prefix |
  | 8 | Life (pre) | Atk Spd (suf) + Light Res (suf) | no — lone prefix |

  Here Sinistral-Exalt for the target, and any miss is a junk prefix that is the **only** prefix on the item → a Sinistral Annul removes it with zero risk to the suffix keepers. Add-and-side-annul, repeat. A bone + Necromancy omen buys safety against a risk that doesn't exist.

> **Fix:** the gate isn't the odds (`expectedSlams ≥ 4`) — it's **"does a keeper share the target's side?"** Reserve desecration (or fracture) for a hard target that *collides* with a same-side keeper; when the target is the lone wanted mod on its side, exalt-fill + side-targeted Annul and leave the desecration slot unused.
>
> **Verify first:** this assumes the essence/teal crafted mod *can* be hit by a plain Annul (the planner already assumes so — the essence route calls a same-side Annul "a coin-flip"). If 0.5 crafted mods are annul-immune like PoE1, then even Run 1's collision is safe and desecration would be unnecessary there too. Pin this down on poe2db before coding the fix.

### HIGH-2 — A guaranteeable wish gets gambled while the crafted slot sits idle
**Run 4 (Boots).** MS is the flagged must-have but isn't essence-able (shortfall), so the essence search — which only considers must-haves — finds nothing. The route then does a **bare Regal** (gamble) and **exalts Life at 1-in-5**, even though **Essence of the Body would guarantee Life outright**. The one crafted-mod slot is never used at all.

This is a determinism miss: a stat that *could* be guaranteed is instead gambled.

> **Fix:** after must-haves fail to claim the essence/desecrate slots, **fall through to wishes** — guarantee the hardest essence-able wish rather than leaving the crafted slot empty and slamming for it.

### MED-3 — Desecrate-exclusive effort estimate is nonsense and mislabeled
**Run 10.** The only route shows **"≈ 3331 targeted slams (est.)"**. Desecration is *deterministic* (pick 1-of-3, cost = retries) — the route text even says so. The headline number both contradicts that framing and would scare a user off the only legal path.

> **Fix:** for desecrate-exclusive placement, present an *expected-reveals* figure (and cap it), not "targeted slams." Don't let `desecrateReveals` on a weight-≈1 exclusive mod balloon the single-route ranking.

### MED-4 — Fracture route's Abyss-mark step may have nothing to sacrifice
**Run 2.** Step 1 acquires a cheap Rare at **0p/1s** (carry suffix + one *open* slot). Step 2 then fires **Omen of Sinistral Crystallisation (removes a prefix) + Essence of the Abyss** — but there is no prefix to remove. The omen would be wasted (and the mechanic is ambiguous when the targeted side is empty).

> **Fix:** ensure the acquired rare carries an *opposite-side* mod for the Crystallisation to eat (not merely "an open slot"), or drop the Crystallisation omen when the opposite side is already empty. Worth re-verifying Essence-of-the-Abyss behavior on an open pool.

### MED-5 — Finish step claims "Rare" on an item that never left Magic
**Run 9.** A 1-mod goal goes white → Transmute (**Magic**) → "Divine (finish) → **Rare**" with no rarity-upgrade action in between. `finishStep` hard-codes `target.rarity`. For any end-state below Rare the displayed rarity is wrong, and the manual ladder never actually reaches the goal's Rare.

> **Fix:** carry the true running rarity into `finishStep` instead of `target.rarity`; for a Magic end-state, finish as Magic.

### LOW-6 — "Top tier" wording when the essence under-delivers the wished range
**Runs 1, 7.** "GUARANTEES +(70–84) Life **(top tier)**" against a wished "+(200–214)" reads as if you're getting the wished value. It's the *essence's* top tier, below the wish. Clarify, e.g. "guarantees up to 70–84 — below your wished range, fine for a wish."

### LOW-7 — Catalyst note shown with no exalt step to apply it to
**Run 7.** All three mods are placed by buy/essence/desecrate, leaving no Exalt — yet the jewellery catalyst note still appears. Harmless but noisy; suppress when no exalt-fill remains.

### LOW-8 — Effort metric ignores brick-restart cost and treats wishes as must-hit
**Runs 2, 3.** Fracture's "≈26" doesn't price the brick-and-restart loop or the rarity of Essence of the Abyss / Fracturing Orbs; a wish-heavy Acquire route (run 3, effort 48) overstates effort because wishes can be settled on a "good enough" roll. Ranking order stays sensible, but the absolute numbers can mislead.

---

## Caveat on the harness (not a planner bug)
Several runs report `reqIlvl=1` and advise "buy a base item level 1+" even for top-tier mods, because the harness passes *family-level* mod objects (lowest ilvl gate) rather than a specific picked tier. The real UI's tier dropdown sets `ilvl` from the chosen tier, so this is a test-construction artifact. *(Minor robustness idea: the planner could floor the advised ilvl by the selected tier text so a stray low ilvl can't produce "ilvl 1+" advice for a high-tier mod.)*

---

## Bottom line
The planner is **mechanically faithful** to PoE2 0.5 and its determinism instincts are right — it buys the carry, essences what it can, and reserves premium tools. The two findings worth acting on are both about **calibrating when to spend the premium slots**:

- **HIGH-1 (corrected) — ✅ FIXED:** desecrate only when the hard target **shares a side with a keeper** (so the Exalt-retry's removal would be a coin-flip, e.g. Run 1's Mana-vs-Life). When the target is the **lone** wanted mod on its side (Runs 5/7/8), Exalt + side-targeted Annul is clean and cheaper. Implemented as a same-side-keeper gate; tests extended; both suites green.
- **HIGH-2 (open):** use the crafted slot to guarantee a wish when no must-have needs it, instead of gambling it. Affects the must-have-flagged case.

With HIGH-1 fixed the recommended route is now the cheapest *safe* deterministic path in every run except HIGH-2's must-have-flagged case (Run 4), which still gambles a guaranteeable wish.
