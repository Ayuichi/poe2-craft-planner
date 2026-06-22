/* PoE2 Craft Planner — Stage 3: hybrid path planner
 * Pure browser JS, no deps. Consumes window.POE2 (poe2_data.js) + a legal goal
 * produced by the target builder in app.js.
 *
 * Design (from the handoff):
 *   - HYBRID brain: human-idiomatic STRATEGY TEMPLATES generate routes; a
 *     STATE-TRANSITION model (preconditions -> effects) validates each step is legal.
 *   - ODDS from Craft of Exile's extrapolated weights (community estimates, not official):
 *     each gamble shows "~X% per slam (1 in N)"; steps are also labelled
 *     deterministic / likely / gamble. Desecration/essence = deterministic placements.
 *   - A path = a sequence of item STATES with a crafting ACTION between each. The goal
 *     sits at the end; each target mod gets a step that places it.
 *
 * Exports planRoutes(target, db) -> { routes:[...], notes:[...] } for both the browser
 * (window.POE2Planner) and node tests (module.exports), mirroring app.js.
 */
(function () {
  "use strict";

  const RARITY_CAP = { Normal: { p: 0, s: 0 }, Magic: { p: 1, s: 1 }, Rare: { p: 3, s: 3 } };

  // Blank numbers/ranges so two tiers of the same mod collapse to one "family"
  // (same helper as app.js familyText; duplicated to keep planner.js self-contained).
  function familyText(text) {
    return (text || "")
      .replace(/\(\s*-?\d+(?:\.\d+)?\s*-\s*-?\d+(?:\.\d+)?\s*\)/g, "#")
      .replace(/-?\d+(?:\.\d+)?/g, "#");
  }

  // ---------------------------------------------------------------------------
  // Essence lookup — DATA-DRIVEN (data/poe2_essences.json -> window.POE2.essences).
  // Replaces the old keyword heuristic, which invented facts (it claimed a Greater
  // Essence of Sorcery guaranteed "+Spell Skills" on an amulet: wrong tier, wrong mod,
  // wrong item class). We now only claim an essence when poe2db actually lists that
  // exact mod for that exact item class. No match -> null (honest: no essence route).
  // ---------------------------------------------------------------------------
  const TIER_ORDER = { Lesser: 0, Normal: 1, Greater: 2, Perfect: 3 };

  // Stat "family" signature: strip numbers/ranges/punctuation so the planner's mod text
  // and poe2db's grant text compare on the stat phrase alone. Folds ascii '-' and
  // poe2db's em/en-dash ranges to the same thing.
  function statKey(text) {
    return (text || "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  }

  // Max numeric magnitude in a mod text (handles "(10-14)", "35%", "+3"). Drives tier-aware
  // essence matching: an essence only "guarantees" a target if its granted value reaches it.
  function maxNum(text) {
    const ns = (text || "").match(/-?\d+(?:\.\d+)?/g);
    return ns ? Math.max(...ns.map(Number)) : null;
  }

  // Find the essence(s) that actually guarantee `mod` on `itemClass`. Returns null when
  // none do. Prefers a Magic->Rare ADD essence (cleanest anchor) over a Perfect
  // REMOVE+ADD. Shape:
  //   { family, mode, classRaw, grantMod, best:{tier,name}, tiers:[{tier,name},...] }
  function essenceFor(mod, itemClass, db) {
    const list = db && db.essences;
    if (!list || !itemClass || !mod) return null;
    const key = statKey(mod.text);
    const targetMag = maxNum(mod.text);
    const matches = [];
    for (const e of list) {
      for (const g of e.grants) {
        if (g.classes.includes(itemClass) && statKey(g.mod) === key) {
          // Tier-aware, MUST-HAVE only: for a starred mod the essence must REACH the target tier
          // (essences cap below top, so they're rarely used for must-haves). A WISH mod still
          // accepts a lower-tier essence (30% MS is fine if you only wished for 35%).
          const gMag = maxNum(g.mod);
          if (!(mod.mustHave && targetMag != null && gMag != null && gMag < targetMag - 1e-9)) {
            matches.push({ name: e.name, family: e.family, tier: e.tier, mode: e.mode,
                           grantMod: g.mod, classRaw: g.classes_raw });
          }
          break;
        }
      }
    }
    if (!matches.length) return null;
    const additive = matches.filter(m => m.mode === "magic_to_rare");
    const chosen = (additive.length ? additive : matches)
      .slice().sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]); // ascending, for display
    // Best = HIGHEST available tier: it guarantees the top value range of the mod (the video
    // uses "Greater Essence of … the best version for this"). Lower tiers only lower the floor.
    const best = chosen[chosen.length - 1];
    return {
      family: best.family, mode: best.mode, classRaw: best.classRaw, grantMod: best.grantMod,
      best: { tier: best.tier, name: best.name },
      tiers: chosen.map(m => ({ tier: m.tier, name: m.name })),
    };
  }

  // The best essence that matches `mod`'s family but FALLS SHORT of its target tier (or null).
  // Used to explain WHY a target has no essence route (e.g. Hysteria only reaches 30% MS).
  function essenceUnderTier(mod, itemClass, db) {
    const list = db && db.essences;
    if (!list) return null;
    const key = statKey(mod.text);
    const tMag = maxNum(mod.text);
    if (tMag == null) return null;
    let best = null;
    for (const e of list) for (const g of e.grants) {
      if (g.classes.includes(itemClass) && statKey(g.mod) === key) {
        const gMag = maxNum(g.mod);
        if (gMag != null && gMag < tMag - 1e-9 && (!best || gMag > best.mag)) {
          best = { name: e.name, grantMod: g.mod, mag: gMag };
        }
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Eligible-pool helpers — the honest "grindiness" signal.
  // ---------------------------------------------------------------------------
  function eligibleMods(db, itemClass, baseTags, itemLevel) {
    const c = db.classes[itemClass];
    if (!c) return [];
    return c.prefixes.concat(c.suffixes).filter(m =>
      m.ilvl <= itemLevel &&
      m.tags.some(t => baseTags.includes(t)) &&
      !m.essence_only);
  }

  // How many mods could land on one open <side> slot, given the families already used
  // (one mod per group). This is the gamble pool: smaller = better odds on a slam.
  function competing(elig, side, usedGroups) {
    return elig.filter(m =>
      m.side === side &&
      !(m.group || []).some(g => usedGroups.has(g))).length;
  }

  function grindWord(n) {
    if (n <= 12) return "tight pool";
    if (n <= 30) return "moderate pool";
    return "wide pool";
  }

  // Must-have set (Stage 4b-iii): flagged mods drive the plan — premium tools (carry/essence/
  // desecration/fracture) and the §3.5 tier gating consider ONLY these. If the user flags NONE,
  // every entered mod is treated as must-have (assume you want them all). Flagging focuses the
  // deterministic tools on the starred subset; unflagged mods become best-effort exalt fills.
  function mustHaveSet(target) {
    const flagged = target.mods.filter(m => m.mustHave);
    return new Set(flagged.length ? flagged : target.mods);
  }

  // Weight-aware odds. CoE-extrapolated spawn weights (community estimates, not
  // official) let us say "~X% per slam (1 in N)" instead of a bare pool count.
  // modWeight = a mod's weight on THIS base at THIS ilvl (top eligible tier).
  function modWeight(mod, baseName, ilvl) {
    const lad = mod.bw && mod.bw[baseName];
    if (!lad) return 0;
    let w = 0;
    for (const t of lad) if (t[0] <= ilvl && t[1] > w) w = t[1];
    return w;
  }
  function poolWeight(elig, side, usedGroups, baseName, ilvl) {
    let s = 0;
    for (const m of elig) {
      if (m.side !== side) continue;
      if ((m.group || []).some(g => usedGroups.has(g))) continue;
      s += modWeight(m, baseName, ilvl);
    }
    return s;
  }
  function oddsFor(tm, elig, usedGroups, baseName, ilvl) {
    const count = competing(elig, tm.side, usedGroups);
    const tw = modWeight(tm, baseName, ilvl);
    const pw = poolWeight(elig, tm.side, usedGroups, baseName, ilvl);
    let pct = null, one = null;
    if (tw > 0 && pw > 0) { pct = Math.round((tw / pw) * 1000) / 10; one = Math.max(1, Math.round(pw / tw)); }
    return { count, pct, one };
  }
  function oddsPhrase(od, side) {
    if (od.one) return `${od.count} ${side}es compete; this one ≈ ${od.pct}% per slam (about 1 in ${od.one})`;
    return `${od.count} ${side}es compete (${grindWord(od.count)})`;
  }

  // ---- Stage 4b-ii: jewellery quality / catalyst biasing + base implicits ------
  const JEWELRY = new Set(["Amulet", "Ring", "Belt"]);

  // Catalyst whose quality-tags best match this mod's mtags (jewellery only), or null.
  function catalystFor(mod, target, db) {
    if (!JEWELRY.has(target.itemClass)) return null;
    const mt = mod.mtags || [];
    let best = null, bestN = 0;
    for (const c of (db.catalysts || [])) {
      const n = (c.tags || []).filter(t => mt.includes(t)).length;
      if (n > bestN) { bestN = n; best = c; }
    }
    return best;
  }

  // Per-slam odds for `tm` when Catalysing Exaltation biases mods carrying `catTags` by `mult`.
  function oddsForBiased(tm, elig, usedGroups, baseName, ilvl, catTags, mult) {
    let pw = 0; const tw = modWeight(tm, baseName, ilvl);
    for (const m of elig) {
      if (m.side !== tm.side) continue;
      if ((m.group || []).some(g => usedGroups.has(g))) continue;
      let w = modWeight(m, baseName, ilvl);
      if ((m.mtags || []).some(t => catTags.includes(t))) w *= mult;
      pw += w;
    }
    const tb = tw * mult;
    return (tb > 0 && pw > 0)
      ? { pct: Math.round((tb / pw) * 1000) / 10, one: Math.max(1, Math.round(pw / tb)) }
      : { pct: null, one: null };
  }

  // Clause appended to a jewellery exalt step: which catalyst to stack + the biased odds (40% ≈ 3×).
  function catBiasClause(m, target, db, elig, usedGroups, reqIlvl) {
    const c = catalystFor(m, target, db);
    if (!c) return "";
    const od = oddsForBiased(m, elig, usedGroups, target.baseName, reqIlvl, c.tags, 3);
    const odPart = od.one ? ` → ${c.name} catalysts at 40% quality ≈ ${od.pct}% (about 1 in ${od.one})` : "";
    return ` Stack ${c.name} catalysts + Omen of Catalysing Exaltation to bias ~2–3× toward ${c.tags.join("/")} mods${odPart}.`;
  }

  // A named base whose IMPLICIT already grants this mod (a base-selection shortcut).
  function implicitBaseFor(mod, target, db) {
    const list = (db.implicits && db.implicits[target.itemClass]) || [];
    const key = statKey(mod.text);
    for (const b of list) for (const imp of (b.implicits || [])) {
      if (statKey(imp) === key) return { base: b.name, implicit: imp };
    }
    return null;
  }

  // ---- "best path" brain: weight-based effort estimate + ranking -------------
  // A mod's share of its side's open pool (real CoE weights). 1/share ~ expected slams.
  function modShare(m, target, db, reqIlvl) {
    const elig = eligibleMods(db, target.itemClass, target.baseTags, reqIlvl);
    const tw = modWeight(m, target.baseName, reqIlvl);
    const pw = poolWeight(elig, m.side, new Set(), target.baseName, reqIlvl);
    return (tw > 0 && pw > 0) ? tw / pw : null;
  }
  function expectedSlams(m, target, db, reqIlvl) {
    const sh = modShare(m, target, db, reqIlvl);
    return sh ? Math.max(1, Math.round(1 / sh)) : 8;
  }
  // Estimated total effort for a route: guaranteed (anchor) mods ~1, gambled targets
  // ~1/share. Lower = better; drives ranking + the recommended tag.
  function scoreRoute(route, target, db, reqIlvl) {
    if (route.fixedEffort != null) return Math.max(1, route.fixedEffort); // route priced its own steps
    let effort = 0; const seen = new Set();
    for (const st of route.steps) for (const sm of st.state.mods) {
      if (seen.has(sm.text) || sm.kind === "incidental" || sm.kind === "fixed") continue;
      if (sm.kind === "anchor") {
        seen.add(sm.text);
        if (/Desecration/.test(route.name)) {
          const full = target.mods.find(t => t.text === sm.text) || sm;
          effort += desecrateReveals(full, target, db, reqIlvl);
        } else if (/Fracture/.test(route.name)) {
          effort += 8; // ~4 fracture attempts, weighted up for the brick risk
        } else effort += 1; // essence anchor ~ 1 orb
      }
      else if (sm.kind === "target") {
        seen.add(sm.text);
        const full = target.mods.find(t => t.text === sm.text);
        effort += full ? expectedSlams(full, target, db, reqIlvl) : 4;
      }
    }
    if (/Alchemy/.test(route.name)) effort = Math.round(effort * 1.6); // swingiest brute force
    return Math.max(1, effort);
  }
  // Expected Well reveals to land `m` by desecration: its weight-share of the COMBINED
  // reveal pool (normal side pool + desecrated-exclusive mods), 3 shown per reveal.
  function desecrateReveals(m, target, db, reqIlvl) {
    const c = db.classes[target.itemClass];
    const elig = eligibleMods(db, target.itemClass, target.baseTags, reqIlvl);
    let pw = poolWeight(elig, m.side, new Set(), target.baseName, reqIlvl);
    for (const d of (c.desecrated || [])) {
      if (d.side === m.side && (d.tags || []).includes(target.baseName)) pw += modWeight(d, target.baseName, reqIlvl) || 1;
    }
    let tw = modWeight(m, target.baseName, reqIlvl);
    if (!tw) { const dd = (c.desecrated || []).find(d => d.id === m.id); tw = dd ? (modWeight(dd, target.baseName, reqIlvl) || 1) : 1; }
    if (!tw) tw = 1;
    return Math.max(1, Math.round((pw / tw) / 3));
  }

  // Pool-separation literacy (the master targeting trick): a Rare caps at 3p/3s;
  // filling one side FORCES exalts onto the other -> deterministic targeting.
  function forcingNote(target) {
    const p = target.mods.filter(m => m.side === "prefix").length;
    const s = target.mods.filter(m => m.side === "suffix").length;
    const lines = ["Pool-forcing (the key targeting trick): a Rare caps at 3 prefixes / 3 suffixes. Fill the side you DON'T need up to 3, and every later Exalt is FORCED onto the open side — no Sinistral/Dextral omen, no Annul-retry needed."];
    if (p >= 3 && s < 3) lines.push("Here your 3 prefixes fill that pool, so suffix Exalts land on the guaranteed side once the prefixes are placed.");
    else if (s >= 3 && p < 3) lines.push("Here your 3 suffixes fill that pool, so prefix Exalts land on the guaranteed side once the suffixes are placed.");
    else if (p && s) lines.push(`Here you have ${p} prefix + ${s} suffix target(s): whichever side is rarer to hit, fill the OTHER side first to force it.`);
    return lines.join(" ");
  }

  // Desecration lookup. A desecrated mod comes only from the Well of Souls (a bone) and
  // is chosen from a revealed set, so placing a specific one is DETERMINISTIC (cost =
  // retries). Omen of Light makes an Annul TARGET the desecrated mod (used to re-roll the
  // reveal, or to swap it later). NOTE: it is NOT immune to a plain annul — only Fracture
  // is true protection. Returns the desecrated-pool context if obtainable on this base.
  //
  // The Well's reveal draws from BOTH the normal side pool AND the desecrated-exclusive mods,
  // so a NORMAL mod can be locked in via desecration; exclusive mods come ONLY this way.
  // Returns null only if the mod can't appear in the reveal at all. (Desecration is a premium,
  // one-per-item tool — see routeAcquireAnchor for WHEN to spend it: not on the carry mod you
  // buy pre-rolled, but on a later hard-to-target mod once the affix pools are constrained.)
  function desecrateInfo(mod, itemClass, baseName, db) {
    const c = db.classes[itemClass];
    if (!c) return null;
    const key = statKey(mod.text);
    const des = c.desecrated || [];
    const onBase = arr => arr.filter(x => x.side === mod.side && (x.tags || []).includes(baseName));
    const exclusive = (mod.src === "desecrated") ||
      des.some(d => d.side === mod.side && statKey(d.text) === key && (d.tags || []).includes(baseName));
    const inNormal = c.prefixes.concat(c.suffixes)
      .some(m => m.side === mod.side && statKey(m.text) === key && (m.tags || []).includes(baseName));
    if (!exclusive && !inNormal) return null;
    const poolN = onBase(des).length + onBase(c.prefixes.concat(c.suffixes)).length;
    return { side: mod.side, exclusive, poolN };
  }

  // ---------------------------------------------------------------------------
  // Step / state construction.
  // A step carries the ACTION (with tier-variants) + a determinism flag, and the item
  // STATE it produces. `kind` on each mod drives colour in the UI:
  //   anchor (guaranteed), target (the one you want, gambled), incidental (collateral
  //   junk to remove), fixed (placed earlier).
  // ---------------------------------------------------------------------------
  function mkStep(action, variants, detail, determinism, rarity, mods) {
    return { action, variants: variants || [], detail, determinism, state: { rarity, mods } };
  }

  function targetMod(m, kind) {
    return { text: m.text, side: m.side, kind: kind || "target" };
  }

  // Order prefixes before suffixes for stable display.
  function bySide(a, b) {
    const o = { prefix: 0, suffix: 1, "?": 2 };
    return (o[a.side] ?? 9) - (o[b.side] ?? 9);
  }

  const INCIDENTAL = { text: "one random mod (collateral)", side: "?", kind: "incidental" };

  // A mod is "divinable" only if its tier text carries a numeric RANGE (min != max). Flat-value
  // tiers (e.g. "35% increased Movement Speed", "+4 to Level of all Melee Skills") leave a Divine
  // Orb nothing to roll, so the finish step must NOT suggest one.
  function hasRange(text) {
    return /\(\s*-?\d[\d.]*\s*-\s*-?\d[\d.]*\s*\)/.test(text || "");
  }
  function finishStep(target) {
    const stateMods = target.mods.slice().sort(bySide).map(m => targetMod(m, "fixed"));
    const rarity = target.rarity || "Rare";
    if (target.mods.some(m => hasRange(m.text))) {
      return mkStep("Divine Orb (finish)", ["Divine Orb", "Omen of Sanctification (multiply + lock)"],
        "Once every target mod is present, Divine to perfect the numeric rolls within their ranges (or Omen of Sanctification to multiply all values ×78–122% and lock). Corrupt with Vaal only if chasing an enchant/extra socket — it ends all crafting.",
        "likely", rarity, stateMods);
    }
    return mkStep("Finish — no Divine needed", ["Omen of Sanctification (gamble: ×78–122%, then locks)", "Vaal Orb (enchant/socket only)"],
      "Every target value here is FIXED (no min-max range), so a Divine Orb does nothing — the item is essentially done. Optional gambles only: Omen of Sanctification multiplies fixed values ×78–122% (can nudge a top tier higher, e.g. +4 → +5) but then LOCKS the item; Vaal-corrupt only if chasing an enchant/extra socket.",
      "likely", rarity, stateMods);
  }

  // ===========================================================================
  // STRATEGY TEMPLATE 1 — Essence anchor → Exalt fill   (the endgame workhorse)
  //   white → Transmute → Magic → Greater Essence (guaranteed anchor) → Rare,
  //   then Exalt + side omen for each remaining target. Anchor is deterministic;
  //   fills are honest gambles sized by the competing pool.
  // ===========================================================================
  function routeEssenceFill(target, db, reqIlvl) {
    // Anchor the HARDEST essence-forceable target: guaranteeing the rarest mod you
    // can saves the most slams (this is what makes the route "best").
    let anchor = null, ess = null, bestShare = Infinity;
    for (const m of target.mods) {
      const e = essenceFor(m, target.itemClass, db);
      if (!e) continue;
      const sh = modShare(m, target, db, reqIlvl);
      const s = (sh == null) ? 0.5 : sh;
      if (anchor === null || s < bestShare) { anchor = m; ess = e; bestShare = s; }
    }
    if (!anchor) return null; // nothing here is essence-forceable -> route doesn't apply

    // Only offer this from-white route when the essence can anchor the HARDEST mod. If the
    // hardest mod isn't essence-forceable, this route would SLAM it (insane for a rare carry) —
    // routeAcquireAnchor handles that correctly by buying a base that already has it.
    const _must = mustHaveSet(target);
    let globalHardest = null, gh = -1;
    for (const m of target.mods) { if (!_must.has(m)) continue; const es = expectedSlams(m, target, db, reqIlvl); if (es > gh) { gh = es; globalHardest = m; } }
    if (globalHardest && anchor !== globalHardest && gh >= 4) return null;

    const elig = eligibleMods(db, target.itemClass, target.baseTags, reqIlvl);
    const usedGroups = new Set();
    (anchor.group || []).forEach(g => usedGroups.add(g));
    const tierVariants = ess.tiers.map(t => t.name);
    const grantNote = `${ess.classRaw} mod “${ess.grantMod}”`;

    const steps = [];
    steps.push(mkStep(
      "Acquire base", [],
      `Get a white (Normal) ${target.baseName} at item level ${reqIlvl}+. ilvl gates tiers — ${reqIlvl}+ unlocks every mod in this goal.`,
      "deterministic", "Normal", []));

    if (ess.mode === "magic_to_rare") {
      // Lesser/Normal/Greater essence: applied to a MAGIC item, upgrades it to Rare and
      // ADDS the guaranteed mod. So: white -> Transmute -> essence -> clear collateral -> fill.
      steps.push(mkStep(
        "Orb of Transmutation", ["Transmutation", "Greater Transmutation", "Perfect Transmutation"],
        "Normal → Magic, adds one random mod. (A Greater/Perfect Transmute only guarantees a higher minimum tier on that throwaway mod — plain is fine here.)",
        "gamble", "Magic", [INCIDENTAL]));

      steps.push(mkStep(
        ess.best.name, tierVariants,
        `Magic → Rare and GUARANTEES the ${grantNote}. This is the highest tier (best value); lower tiers (${tierVariants.join(" / ")}) are cheaper but guarantee a lower value range. This spends your ONE crafted-mod slot — no other essence/alloy/Runic-Ward enchant after this.`,
        "deterministic", "Rare",
        [targetMod(anchor, "anchor"), INCIDENTAL]));

      steps.push(mkStep(
        "Clear the collateral", ["Orb of Annulment", "Chaos + Omen of Whittling"],
        "The Transmute mod is probably not a target. If it sits on the opposite side from your anchor, Sinistral/Dextral Annulment removes it cleanly. If it shares your anchor's side, an Annul is a coin-flip — prefer Chaos + Omen of Whittling to delete the lowest-ilvl mod.",
        "gamble", "Rare",
        [targetMod(anchor, "anchor")]));
    } else {
      // Perfect essence: REMOVES a random mod and ADDS the guaranteed mod, and needs a
      // RARE item. So: white -> alchemy/regal to a junk Rare -> Perfect essence swaps a
      // junk mod for the anchor (steer the removal with a Crystallisation omen).
      steps.push(mkStep(
        "Make a junk Rare", ["Orb of Alchemy", "Transmutation → Regal Orb"],
        "Normal → Rare with throwaway mods. A Perfect essence needs a Rare and will REMOVE one random mod, so you want a sacrificial mod (ideally on the anchor's side) for it to eat.",
        "gamble", "Rare",
        [INCIDENTAL]));

      steps.push(mkStep(
        ess.best.name, [ess.best.name, "+ Omen of Sinistral/Dextral Crystallisation"],
        `Removes a random modifier and ADDS the guaranteed ${grantNote}. Pair with Omen of Sinistral (prefix) / Dextral (suffix) Crystallisation so it eats a mod from the side you DON'T need. This spends your ONE crafted-mod slot.`,
        "deterministic", "Rare",
        [targetMod(anchor, "anchor")]));
    }

    // Fill each remaining target with a side-targeted Exalt.
    const placed = [targetMod(anchor, "anchor")];
    const remaining = target.mods.filter(m => m !== anchor).slice().sort(bySide);
    for (const m of remaining) {
      const omen = m.side === "prefix" ? "Sinistral Exaltation (prefix)" : "Dextral Exaltation (suffix)";
      const od = oddsFor(m, elig, usedGroups, target.baseName, reqIlvl);
      (m.group || []).forEach(g => usedGroups.add(g));
      placed.push(targetMod(m, "target"));
      steps.push(mkStep(
        "Exalted Orb + Omen", ["Exalted Orb", "Greater Exaltation (adds 2)"],
        `Add a ${m.side} aiming for “${m.text}”. ${omen} forces the side; WHICH ${m.side} is still random — ${oddsPhrase(od, m.side)}.${catBiasClause(m, target, db, elig, usedGroups, reqIlvl)} Re-roll the slot (Annul that side + Exalt again) until it lands.`,
        "gamble", "Rare",
        placed.slice().sort(bySide)));
    }

    steps.push(finishStep(target));

    return {
      name: "Essence anchor → Exalt fill",
      tagline: `Guarantee “${ess.grantMod}” with ${ess.best.name}, then slam the rest.`,
      best: "the cleanest endgame route when one target mod is essence-forceable",
      steps,
    };
  }

  // ===========================================================================
  // STRATEGY TEMPLATE 2 — Manual ladder: Transmute → Augment → Regal → Exalt
  //   No essence dependency. Builds the affix skeleton by hand. Every add is a
  //   gamble on WHICH mod; deterministic only on rarity/slot count. The baseline
  //   route that always exists.
  // ===========================================================================
  function routeLadder(target, db, reqIlvl) {
    const elig = eligibleMods(db, target.itemClass, target.baseTags, reqIlvl);
    const usedGroups = new Set();
    const steps = [];

    steps.push(mkStep(
      "Acquire base", [],
      `White (Normal) ${target.baseName}, item level ${reqIlvl}+.`,
      "deterministic", "Normal", []));

    // Plan the action per mod by respecting rarity caps. The Magic stage holds at most
    // ONE prefix + ONE suffix, so Transmute takes one side and Augment must take the
    // OTHER side; everything left becomes a Regal (the first one) then Exalts on the Rare.
    const pres = target.mods.filter(m => m.side === "prefix");
    const sufs = target.mods.filter(m => m.side === "suffix");
    const seq = []; // [{ mod, kind }]  kind ∈ transmute|augment|regal|exalt
    const magicPair = [];
    if (pres.length) magicPair.push(pres.shift());
    if (sufs.length) magicPair.push(sufs.shift());
    seq.push({ mod: magicPair[0], kind: "transmute" });
    if (magicPair[1]) seq.push({ mod: magicPair[1], kind: "augment" });
    [...pres, ...sufs].sort(bySide).forEach((m, i) =>
      seq.push({ mod: m, kind: i === 0 ? "regal" : "exalt" }));

    const placed = [];
    for (const { mod: m, kind } of seq) {
      const od = oddsFor(m, elig, usedGroups, target.baseName, reqIlvl);
      (m.group || []).forEach(g => usedGroups.add(g));
      placed.push(targetMod(m, "target"));

      let action, variants, detail, rarity;
      if (kind === "transmute") {
        action = "Orb of Transmutation"; variants = ["Transmutation", "Greater", "Perfect"]; rarity = "Magic";
        detail = `Normal → Magic. Fish for “${m.text}” — ${oddsPhrase(od, m.side)}. No scour in 0.5, so if it misses, salvage and re-buy a white base.`;
      } else if (kind === "augment") {
        action = "Orb of Augmentation"; variants = ["Augmentation", "Greater", "Perfect"]; rarity = "Magic";
        detail = `Add the OTHER side while still Magic (a Magic item allows only 1 prefix + 1 suffix), aiming for “${m.text}” ${oddsPhrase(od, m.side)}.`;
      } else if (kind === "regal") {
        action = "Regal Orb"; variants = ["Regal Orb", "Sinistral/Dextral Coronation (pick the side)"]; rarity = "Rare";
        detail = `Magic → Rare, adds a mod. A Coronation omen forces the side toward “${m.text}” ${oddsPhrase(od, m.side)}.`;
      } else {
        const omen = m.side === "prefix" ? "Sinistral Exaltation" : "Dextral Exaltation";
        action = "Exalted Orb + Omen"; variants = ["Exalted Orb", "Greater Exaltation (adds 2)"]; rarity = "Rare";
        detail = `${omen} adds a ${m.side} aiming for “${m.text}” ${oddsPhrase(od, m.side)}. Annul-and-retry that side if it misses.`;
      }
      steps.push(mkStep(action, variants, detail, "gamble", rarity, placed.slice().sort(bySide)));
    }

    steps.push(finishStep(target));

    return {
      name: "Manual ladder (Transmute → Regal → Exalt)",
      tagline: "Build the skeleton by hand. No essence needed; pure slam-and-pray.",
      best: "when no target mod is essence-forceable, or you want full manual control",
      steps,
    };
  }

  // ===========================================================================
  // STRATEGY TEMPLATE 3 — Alchemy → Chaos/Whittling cleanup   (brute force)
  //   Alchemy fills a Rare with 4 random mods in one orb, then Chaos + Omen of
  //   Whittling cycles the junk toward targets. Fewest distinct orbs, most luck.
  // ===========================================================================
  function routeAlchemy(target, db, reqIlvl) {
    const elig = eligibleMods(db, target.itemClass, target.baseTags, reqIlvl);
    const pPool = competing(elig, "prefix", new Set());
    const sPool = competing(elig, "suffix", new Set());
    const steps = [];

    steps.push(mkStep(
      "Acquire base", [],
      `White (Normal) ${target.baseName}, item level ${reqIlvl}+.`,
      "deterministic", "Normal", []));

    steps.push(mkStep(
      "Orb of Alchemy", ["Orb of Alchemy", "Sinistral/Dextral Alchemy (max one side)"],
      `Normal → Rare with 4 random mods in one orb. Sinistral/Dextral Alchemy maxes one side (4 prefixes / 4 suffixes). Pool: ${pPool} prefixes / ${sPool} suffixes — pure luck which you get.`,
      "gamble", "Rare",
      [
        { text: "random mod", side: "?", kind: "incidental" },
        { text: "random mod", side: "?", kind: "incidental" },
        { text: "random mod", side: "?", kind: "incidental" },
        { text: "random mod", side: "?", kind: "incidental" },
      ]));

    steps.push(mkStep(
      "Chaos Orb + Omen of Whittling", ["Chaos Orb", "Chaos + Omen of Whittling", "Sinistral/Dextral Erasure (pick side)"],
      "Each Chaos removes 1 mod and adds 1. Omen of Whittling forces it to delete the LOWEST-ilvl mod — the cleanup tool for a 'good/good/good/junk' item. Erasure omens pick which side gets rerolled. Repeat until your targets show up; protect good mods with a Fracturing Orb first (see notes).",
      "gamble", "Rare",
      target.mods.slice().sort(bySide).map(m => targetMod(m, "target"))));

    steps.push(finishStep(target));

    return {
      name: "Alchemy → Chaos/Whittling cleanup",
      tagline: "One orb fills the item; Chaos + Whittling grinds it toward the goal.",
      best: "fast and cheap to start, but the swingiest — best for 2–3 common mods",
      steps,
    };
  }

  // ===========================================================================
  // STRATEGY TEMPLATE 4 — Desecration anchor (DETERMINISTIC placement for a mod with
  //   NO essence). Bone + Necromancy omen forces the side; the Well reveal + Omen of
  //   Light retry guarantees your mod (cost = retries, not luck). Omen of Light makes an
  //   Annul TARGET the desecrated mod (to re-roll the reveal). NOTE: a desecrated mod is
  //   NOT immune to a plain annul — only FRACTURE is true protection.
  // ===========================================================================
  function routeDesecrate(target, db, reqIlvl) {
    let anchor = null, di = null, bestShare = Infinity;
    for (const m of target.mods) {
      const info = desecrateInfo(m, target.itemClass, target.baseName, db);
      if (!info) continue;
      if (m.src === "desecrated") { anchor = m; di = info; break; } // exclusive -> must desecrate
      const sh = modShare(m, target, db, reqIlvl);
      const sc = (sh == null) ? 0.5 : sh;
      if (anchor === null || sc < bestShare) { anchor = m; di = info; bestShare = sc; }
    }
    if (!anchor) return null;

    const elig = eligibleMods(db, target.itemClass, target.baseTags, reqIlvl);
    const usedGroups = new Set(); (anchor.group || []).forEach(g => usedGroups.add(g));
    const omen = anchor.side === "prefix" ? "Sinistral Necromancy" : "Dextral Necromancy";
    const steps = [];

    steps.push(mkStep("Acquire base", [],
      `Get a white (Normal) ${target.baseName} at item level ${reqIlvl}+.`,
      "deterministic", "Normal", []));
    steps.push(mkStep("Orb of Transmutation", ["Transmutation"],
      "Normal → Magic (one random mod, just scaffolding to reach Rare).",
      "gamble", "Magic", [INCIDENTAL]));
    steps.push(mkStep("Regal Orb", ["Regal Orb"],
      "Magic → Rare so the item can be desecrated.",
      "gamble", "Rare", [INCIDENTAL, INCIDENTAL]));
    steps.push(mkStep(
      "Desecrate at the Well of Souls",
      ["Preserved/Ancient Bone (collarbone=jewellery, jawbone=weapon, rib=armour)", `+ Omen of ${omen}`, "+ Omen of Abyssal Echoes (1 free reroll of the 3)", "+ Omen of Light + Annul (strip & re-desecrate)"],
      `${di.exclusive ? "“" + anchor.text + "” is desecrate-ONLY — the Well is the only way to get it. " : "Placing a normal mod DETERMINISTICALLY (you pick it at the Well). "}Add a desecrated ${anchor.side} with a bone; Omen of ${omen} forces the ${anchor.side} side. Reveal at the Well (drawn from the normal ${anchor.side} pool + the exclusive desecrated mods, ~${di.poolN} options); if it isn't “${anchor.text}”, Omen of Abyssal Echoes rerolls the 3 options once (cheap — try first); still no, Omen of Light + Annul strips the desecrated mod so you re-desecrate. You WILL land it, cost = retries. It's also precisely REMOVABLE later (Omen of Light + Annul targets it) if you want to swap it. ⚠ But it is NOT immune to a stray annul — a plain Annul can remove it — so finish the rest with side-targeted (Sinistral/Dextral) removals.`,
      "deterministic", "Rare", [targetMod(anchor, "anchor"), INCIDENTAL]));
    steps.push(mkStep("Clear the scaffolding", ["Orb of Annulment", "Chaos + Omen of Whittling"],
      "Remove the leftover junk — but a plain Annul CAN hit your desecrated mod too. Use Omen of Whittling (deletes the lowest-ilvl mod, i.e. the junk) or a side-targeted (Sinistral/Dextral) Annul on the junk's side so you don't lose the anchor.",
      "gamble", "Rare", [targetMod(anchor, "anchor")]));

    const placed = [targetMod(anchor, "anchor")];
    const remaining = target.mods.filter(m => m !== anchor).slice().sort(bySide);
    for (const m of remaining) {
      const ex = m.side === "prefix" ? "Sinistral Exaltation (prefix)" : "Dextral Exaltation (suffix)";
      const od = oddsFor(m, elig, usedGroups, target.baseName, reqIlvl);
      (m.group || []).forEach(g => usedGroups.add(g));
      placed.push(targetMod(m, "target"));
      steps.push(mkStep("Exalted Orb + Omen", ["Exalted Orb", "Greater Exaltation (adds 2)"],
        `Add a ${m.side} aiming for “${m.text}”. ${ex} forces the side — ${oddsPhrase(od, m.side)}.${catBiasClause(m, target, db, elig, usedGroups, reqIlvl)} Annul-and-retry with a ${m.side}-targeted (Sinistral/Dextral) Annul or Whittling so you reroll only this slot — a plain Annul could remove your desecrated mod.`,
        "gamble", "Rare", placed.slice().sort(bySide)));
    }
    steps.push(finishStep(target));

    return {
      name: "Desecration anchor → fill",
      tagline: di.exclusive
        ? `“${anchor.text}” is desecrate-only — guarantee it at the Well, then build around it.`
        : `Place “${anchor.text}” deterministically (and keep it precisely swappable), then craft the rest.`,
      best: di.exclusive
        ? "the ONLY path when a target mod is desecrate-exclusive"
        : "when you want to protect your hardest mod so the rest can be crafted safely",
      steps,
    };
  }

  // ===========================================================================
  // STRATEGY TEMPLATE 5 — Fracture-anchor → chaos-target (Stage 4b). The endgame
  //   answer to "two hard mods on the SAME side." Side omens isolate sides, not mods
  //   within a side, so to keep BOTH you fracture one (true immunity) and chaos-target
  //   the other (the fracture forces chaos onto the lone non-fractured slot). Gated by
  //   §3.5: fires only when a side carries 2+ hard, non-essence-forceable mods, so it
  //   never appears for easy goals (fracturing is expensive + a brick gamble).
  // ===========================================================================
  const HARD_SLAMS = 4;

  // Does one side carry 2+ hard mods that essence can't cheaply guarantee? If so, return
  // {side, anchor (fracture-lock), chaosTarget (chaos-reroll)}; else null.
  function fractureContest(target, db, reqIlvl) {
    const must = mustHaveSet(target);
    const isHard = m => m.src !== "desecrated" && expectedSlams(m, target, db, reqIlvl) >= HARD_SLAMS;
    const essenceable = m => { const e = essenceFor(m, target.itemClass, db); return !!(e && e.mode === "magic_to_rare"); };
    const byHardDesc = arr => arr.slice().sort((a, b) =>
      expectedSlams(b, target, db, reqIlvl) - expectedSlams(a, target, db, reqIlvl));
    for (const side of ["prefix", "suffix"]) {
      const c = byHardDesc(target.mods.filter(m => m.side === side && isHard(m) && !essenceable(m) && must.has(m)));
      if (c.length >= 2) return { side, anchor: c[0], chaosTarget: c[1] };
    }
    return null;
  }

  function routeFractureAnchor(target, db, reqIlvl) {
    const ctx = fractureContest(target, db, reqIlvl);
    if (!ctx) return null;
    const { side, anchor, chaosTarget } = ctx;
    const elig = eligibleMods(db, target.itemClass, target.baseTags, reqIlvl);
    const usedGroups = new Set();
    [anchor, chaosTarget].forEach(m => (m.group || []).forEach(g => usedGroups.add(g)));
    const must = mustHaveSet(target);
    const byHardDesc = arr => arr.slice().sort((a, b) =>
      expectedSlams(b, target, db, reqIlvl) - expectedSlams(a, target, db, reqIlvl));

    // desTarget = a SEPARATE hard must-have (not the fractured anchor, not the chaos mod) that we
    // place by desecration LAST. The chaos-spam at fracture+1 adds a RANDOM-side mod, so it can
    // actually land chaosTarget OR desTarget — whichever shows first; the leftover gets desecrated.
    let desTarget = null;
    for (const m of byHardDesc(target.mods.filter(m =>
      m !== anchor && m !== chaosTarget && must.has(m) && expectedSlams(m, target, db, reqIlvl) >= HARD_SLAMS))) {
      if (desecrateInfo(m, target.itemClass, target.baseName, db)) { desTarget = m; break; }
    }
    const chaosSet = [chaosTarget, desTarget].filter(Boolean);

    // The veiled blocker (for the 1-in-3 fracture) sits OPPOSITE the anchor, placed safely via
    // Essence of the Abyss + a Crystallisation omen that removes only that side.
    const oppSide = anchor.side === "prefix" ? "suffix" : "prefix";
    const cryst = (oppSide === "prefix" ? "Sinistral" : "Dextral") + " Crystallisation";
    const bone = (JEWELRY.has(target.itemClass) || target.itemClass === "Talisman") ? "Collarbone (jewellery bone)"
      : ["Body Armour", "Helmet", "Gloves", "Boots", "Shield", "Focus", "Buckler"].includes(target.itemClass) ? "Rib (armour bone)"
      : "Jawbone (weapon bone)";
    const veiled = { text: "veiled blocker (sacrificial)", side: oppSide, kind: "incidental" };

    const handled = new Set([anchor, chaosTarget, desTarget].filter(Boolean));
    const exaltFills = target.mods.filter(m => !handled.has(m));

    const steps = [];
    const placed = [];
    const snap = () => placed.slice().sort(bySide);
    placed.push(targetMod(anchor, "anchor"));

    // 1 — cheap rare with the carry + an open slot.
    steps.push(mkStep(
      "Acquire a cheap Rare carrying your carry mod",
      ["Buy a Rare with this mod + an open prefix/suffix (~1 exalt)", "much cheaper than a Magic base with it (~1 div)"],
      `“${anchor.text}” is the hardest must-have, so it gets the fracture. Buy a CHEAP Rare already showing it with at least one open affix slot (~1 ex; a Magic base with the carry is ~1 div, and a 3-open-slot rare doesn't exist).`,
      "likely", "Rare", snap().concat([INCIDENTAL])));

    // 2 — Abyss Mark, eating an opposite-side mod so the carry is safe.
    steps.push(mkStep(
      "Mark the item (safe): Essence of the Abyss",
      ["Omen of " + cryst + " (removes only a " + oppSide + ")", "+ Essence of the Abyss"],
      `Set Omen of ${cryst} so the next corrupted essence removes only a ${oppSide} — your carry is a ${anchor.side}, so it can't be touched — then Essence of the Abyss eats a ${oppSide} and adds Mark of the Abyssal Lord (the "desecration targets ME" marker).`,
      "deterministic", "Rare", snap()));

    // 3 — bone desecrate -> VEILED blocker, BEFORE the fracture. Sacrificial.
    steps.push(mkStep(
      "Desecrate a veiled blocker — BEFORE fracturing",
      [bone, "leave it VEILED (do NOT reveal)"],
      `Desecrate with a ${bone}: it consumes the Mark into a VEILED mod on the ${oppSide} side. LEAVE IT VEILED — only a veiled mod is fracture-proof, so this is purely what makes the fracture 1-in-3 instead of 1-in-4. It is SACRIFICIAL: the strip two steps down annuls it away. (The Mark alone is a normal mod and would NOT block the fracture.)`,
      "deterministic", "Rare", snap().concat([veiled])));

    // 4 — fracture, 1-in-3.
    steps.push(mkStep(
      "Fracturing Orb  ⚠ can BRICK",
      ["Fracturing Orb"],
      `Locks ONE RANDOM non-veiled mod forever (immune to chaos + annul). With the veiled blocker present, “${anchor.text}” is ~1 in 3 (not 1 in 4). A WRONG lock bricks it — salvage and restart from a fresh cheap rare. Once it lands, the carry can never be lost.`,
      "gamble", "Rare", snap().concat([veiled])));

    // 5 — strip to fracture + 1 (the veiled blocker dies here).
    steps.push(mkStep(
      "Annul down to the fractured mod",
      ["Orb of Annulment (repeat)"],
      `Annul everything off except the fractured “${anchor.text}” — the veiled blocker included; it has done its only job (the 1-in-3). You want the board at fracture + one open slot so the next Chaos is forced onto that single slot.`,
      "deterministic", "Rare", snap()));

    // 6 — chaos-spam the SET of remaining must-haves; take whichever lands first.
    if (chaosTarget) {
      placed.push(targetMod(chaosTarget, "target"));
      let cw = 0; for (const m of chaosSet) cw += modWeight(m, target.baseName, reqIlvl);
      let pool = 0; for (const m of elig) { if ((m.group || []).some(g => usedGroups.has(g))) continue; pool += modWeight(m, target.baseName, reqIlvl); }
      const one = (cw > 0 && pool > 0) ? Math.max(1, Math.round(pool / cw)) : null;
      const pct = (cw > 0 && pool > 0) ? Math.round(cw / pool * 1000) / 10 : null;
      const setTxt = chaosSet.map(m => `“${m.text}”`).join(" or ");
      const oddsTxt = one ? `≈ ${pct}% combined (about 1 in ${one}) per Chaos` : "their combined share per Chaos";
      steps.push(mkStep(
        "Chaos-target a remaining must-have",
        ["Exalt one slot", "Chaos Orb — repeat", "take the FIRST that lands"],
        `At fracture + 1, “${anchor.text}” is fractured so every Chaos is FORCED to reroll the one open slot. The added mod is random-SIDED, so spam until you land ${setTxt} — whichever remaining must-have shows first (${oddsTxt}); take it.${desTarget ? " The other one is then your desecrate target (last step)." : ""} Deterministic = bounded by retries.`,
        "deterministic", "Rare", snap()));
    }

    // 7 — exalt-fill the wishes. HONEST: only the fracture is safe; bad rolls are an annul gamble.
    for (const m of exaltFills.slice().sort(bySide)) {
      const omen = m.side === "prefix" ? "Sinistral Exaltation (prefix)" : "Dextral Exaltation (suffix)";
      const od = oddsFor(m, elig, usedGroups, target.baseName, reqIlvl);
      (m.group || []).forEach(g => usedGroups.add(g));
      placed.push(targetMod(m, "target"));
      steps.push(mkStep("Exalted Orb + Omen", ["Exalted Orb", "Greater Exaltation (adds 2)"],
        `Exalt for “${m.text}” — ${omen} forces the side, ${oddsPhrase(od, m.side)}.${catBiasClause(m, target, db, elig, usedGroups, reqIlvl)} ⚠ Only the fractured “${anchor.text}” is safe: a junk roll must be ANNULLED, and the annul is random across the non-fractured mods, so it can eat a mod you wanted. If it does, recover that mod by chaos-spamming again. It is a grind loop — exalt → annul junk → re-chaos to recover — NOT a free reroll. (Wishes: take a decent roll rather than risking your must-haves chasing a perfect one.)`,
        "gamble", "Rare", snap()));
    }

    // 8 — desecrate the leftover must-have LAST (after the gambly exalts, so it can't be collateral).
    if (desTarget) {
      const nec = desTarget.side === "prefix" ? "Sinistral Necromancy" : "Dextral Necromancy";
      (desTarget.group || []).forEach(g => usedGroups.add(g));
      placed.push(targetMod(desTarget, "anchor"));
      steps.push(mkStep(
        "Desecrate the leftover must-have — LAST",
        [bone, "+ Omen of " + nec, "+ Omen of Abyssal Echoes (free reroll)", "+ Omen of Light + Annul (re-desecrate)"],
        `With the gambly exalts done and the board no longer being stripped, desecrate whichever of ${chaosSet.map(m => `“${m.text}”`).join(" / ")} you did NOT land from the chaos (shown here as “${desTarget.text}”). Omen of ${nec} forces the ${desTarget.side}; reveal 1-of-3 → Abyssal Echoes → Omen of Light + Annul to retry. Desecrate LAST: a desecrated mod isn't fracture-proof, so placed earlier a later strip would make it collateral.`,
        "deterministic", "Rare", snap()));
    }

    steps.push(finishStep(target));

    let effort = 4 + (chaosTarget ? expectedSlams(chaosTarget, target, db, reqIlvl) : 0)
      + (desTarget ? desecrateReveals(desTarget, target, db, reqIlvl) : 0);
    for (const m of exaltFills) effort += expectedSlams(m, target, db, reqIlvl);

    return {
      name: "Fracture-anchor → chaos-target",
      tagline: `Fracture “${anchor.text}”, chaos-spam the other must-have(s), desecrate the leftover last.`,
      best: "the endgame answer when 2+ hard mods jam one side — lock one, grind the rest with only the fracture safe",
      warning: `Fracturing locks a RANDOM non-veiled mod. Desecrate a veiled blocker FIRST (Essence of the Abyss + ${cryst}, then a ${bone}) so the carry is ~1 in 3. After it lands it's a grind: ONLY the fractured mod is safe, so fixing a bad exalt (annul) can eat a wanted mod, which you re-chaos to recover. A wrong fracture bricks the attempt — restart from a fresh cheap rare.`,
      fixedEffort: Math.max(1, effort),
      steps,
    };
  }

  // ===========================================================================
  // STRATEGY TEMPLATE 0 — Acquire the carry base → craft the rest (the REALISTIC default).
  //   You never start a serious craft on a base that lacks your most important (= hardest to
  //   roll) mod. You BUY a base that already carries it, then build the rest with cheap, clean
  //   prefix/suffix manipulation. Premium one-per-item tools (desecration, fracture) are saved
  //   for a LATER hard mod the affix pools can no longer cleanly target — NOT spent locking in
  //   the carry mod you could simply buy pre-rolled.
  // ===========================================================================
  function routeAcquireAnchor(target, db, reqIlvl) {
    if (target.mods.length < 2) return null; // a 1-mod goal: just buy/slam it, no "rest" to build
    const elig = eligibleMods(db, target.itemClass, target.baseTags, reqIlvl);

    // anchor = the single hardest mod to roll = the carry you buy the base for.
    const must = mustHaveSet(target);
    const mustArr = target.mods.filter(m => must.has(m));
    let anchor = mustArr[0], worst = -1;
    for (const m of mustArr) {
      const es = expectedSlams(m, target, db, reqIlvl);
      if (es > worst) { worst = es; anchor = m; }
    }
    const usedGroups = new Set(); (anchor.group || []).forEach(g => usedGroups.add(g));
    const oddsTxt = m => oddsPhrase(oddsFor(m, elig, usedGroups, target.baseName, reqIlvl), m.side);

    // remaining mods, easiest -> hardest
    const remaining = target.mods.filter(m => m !== anchor).slice()
      .sort((a, b) => expectedSlams(a, target, db, reqIlvl) - expectedSlams(b, target, db, reqIlvl));

    // Allocate the two premium slots cheapest-deterministic FIRST:
    // 1) ESSENCE the hardest remaining mod an essence can guarantee (magic->rare ADD). Essence
    //    is cheaper & cleaner than desecration, so it wins the crafted slot when available.
    const mustRem = remaining.filter(m => must.has(m)); // premium slots guarantee must-haves first
    let essTarget = null, ess = null, essShare = Infinity;
    for (const m of mustRem) {
      const e = essenceFor(m, target.itemClass, db);
      if (!e || e.mode !== "magic_to_rare") continue;
      const sh = modShare(m, target, db, reqIlvl); const s = (sh == null) ? 0.5 : sh;
      if (s < essShare) { essShare = s; essTarget = m; ess = e; }
    }
    // 2) DESECRATE the hardest remaining MUST-HAVE essence can't get — but ONLY when it COLLIDES
    //    with a same-side keeper. Safety model: an Exalt only ADDS (zero risk); the risk is the
    //    RETRY removal. If the target is the LONE wanted mod on its side, a side-targeted Annul
    //    removes just the failed junk (clean), so exalt-fill is cheaper and desecration would be
    //    wasted. Desecration earns its one slot only when another wanted mod shares the target's
    //    side — then no side omen can isolate the retry, and Omen of Light's precise removal (or
    //    the no-removal Abyssal Echoes reroll) is the cheapest SAFE placement. (Nothing is fractured
    //    in this route, and the essence/teal mod is treated as annullable, so every other goal mod
    //    on the same side counts as an at-risk keeper.)
    let hardRem = null, di = null;
    for (let i = mustRem.length - 1; i >= 0; i--) {
      const m = mustRem[i];
      if (m === essTarget) continue;
      if (expectedSlams(m, target, db, reqIlvl) < 4) continue;
      const sameSideKeeper = target.mods.some(k => k !== m && k.side === m.side);
      if (!sameSideKeeper) continue; // lone on its side -> exalt + side-Annul is clean & cheaper
      const info = desecrateInfo(m, target.itemClass, target.baseName, db);
      if (info) { hardRem = m; di = info; break; }
    }
    const useDesecrate = !!hardRem;

    const steps = [];
    // 1 — buy the carry base.
    steps.push(mkStep(
      "Buy a base that already has your carry mod",
      ["Trade for a Magic base carrying this mod", "or a Rare with it + filler you can annul"],
      `“${anchor.text}” is the hardest mod in this goal (${oddsTxt(anchor)}), so you do NOT gamble for it. Buy a ${target.baseName} (item level ${reqIlvl}+) that ALREADY rolls it — ideally a Magic one carrying just this mod, so the rest of the item is a clean slate. Rule of thumb: never start a serious craft on a base missing your carry mod.`,
      "deterministic", "Magic", [targetMod(anchor, "anchor")]));

    const placed = [targetMod(anchor, "anchor")];

    // 2 — go Rare, guaranteeing a 2nd mod with an essence when possible.
    if (essTarget) {
      (essTarget.group || []).forEach(g => usedGroups.add(g));
      placed.push(targetMod(essTarget, "anchor"));
      steps.push(mkStep(
        ess.best.name, ess.tiers.map(t => t.name),
        `Apply to the Magic base: Magic → Rare and GUARANTEES “${ess.grantMod}” (top tier), your next-hardest mod. Spends your ONE crafted-mod slot. Two mods now locked, open slots to fill.`,
        "deterministic", "Rare", placed.slice().sort(bySide)));
    } else {
      steps.push(mkStep(
        "Regal Orb", ["Regal Orb", "Sinistral/Dextral Coronation (pick the side)"],
        "Magic → Rare so you can keep adding mods. A Coronation omen forces the new mod onto the side you still need; if it's junk, annul that side later.",
        "gamble", "Rare", placed.concat([INCIDENTAL]).slice().sort(bySide)));
    }

    // 3 — fill the cheap remaining mods with side-forced Exalts (skip the desecrate target).
    const exaltFills = remaining.filter(m => m !== essTarget && !(useDesecrate && m === hardRem));
    for (const m of exaltFills) {
      const omen = m.side === "prefix" ? "Sinistral Exaltation (prefix)" : "Dextral Exaltation (suffix)";
      const od = oddsFor(m, elig, usedGroups, target.baseName, reqIlvl);
      (m.group || []).forEach(g => usedGroups.add(g));
      placed.push(targetMod(m, "target"));
      steps.push(mkStep(
        "Exalted Orb + Omen", ["Exalted Orb", "Greater Exaltation (adds 2)"],
        `Add a ${m.side} aiming for “${m.text}”. ${omen} forces the side — ${oddsPhrase(od, m.side)}.${catBiasClause(m, target, db, elig, usedGroups, reqIlvl)} Annul that side + re-Exalt until it lands. Do ALL of these cheap clean-manipulation slots BEFORE spending desecration.`,
        "gamble", "Rare", placed.slice().sort(bySide)));
    }

    // 4 — reserve desecration for the last hard mod (the correct, late use of the one slot).
    if (useDesecrate) {
      const omen = hardRem.side === "prefix" ? "Sinistral Necromancy" : "Dextral Necromancy";
      (hardRem.group || []).forEach(g => usedGroups.add(g));
      placed.push(targetMod(hardRem, "anchor"));
      steps.push(mkStep(
        "Desecrate the last hard mod",
        ["Preserved/Ancient Bone", `+ Omen of ${omen}`, "+ Omen of Abyssal Echoes (1 free reroll)", "+ Omen of Light + Annul (strip & retry)"],
        `With the cheap slots filled, the ${hardRem.side} pool is now constrained and “${hardRem.text}” is hard to land by Exalt (${oddsTxt(hardRem)}). THIS is what your one desecration slot is for: bone + Omen of ${omen} forces a ${hardRem.side}; pick it from the Well reveal (bad reveal? Omen of Abyssal Echoes rerolls the 3 once; then Omen of Light + Annul strips & re-desecrates). Deterministic, cost = retries — saved for here, not wasted on the carry mod you bought.`,
        "deterministic", "Rare", placed.slice().sort(bySide)));
    }

    steps.push(finishStep(target));

    // Price the route ourselves: the bought carry costs ~0 slams; essence/regal ~1; each exalt
    // fill ~ its expected slams; the reserved desecration ~ its reveal count.
    let effort = essTarget ? 1 : 1;
    for (const m of exaltFills) effort += expectedSlams(m, target, db, reqIlvl);
    if (useDesecrate) effort += desecrateReveals(hardRem, target, db, reqIlvl);

    // If 2+ hard mods jam ONE side, this route must reroll one while the other sits UNPROTECTED
    // (only a fracture gives true immunity) — surcharge for that brick risk and point to fracture.
    const contest = fractureContest(target, db, reqIlvl);
    let warning;
    if (contest) {
      effort += expectedSlams(contest.chaosTarget, target, db, reqIlvl);
      warning = `Two hard ${contest.side}es (“${contest.anchor.text}” + “${contest.chaosTarget.text}”) share a side: rerolling one risks the other, since only a fracture gives true immunity. The Fracture-anchor route is the safer play for this goal.`;
    }

    return {
      name: "Acquire the carry base → craft the rest",
      tagline: `Start from a base that already has “${anchor.text}”, then build around it${useDesecrate ? " (desecration saved for the last hard mod)" : ""}.`,
      best: "the realistic default — never gamble for your hardest mod; buy it on the base, then craft the rest cleanly",
      fixedEffort: Math.max(1, effort),
      warning,
      steps,
    };
  }

  // ---------------------------------------------------------------------------
  // Advanced-alternative notes. These tactics are real and idiomatic but the slim
  // dataset can't yet generate exact steps for them (no alloy/desecrate/essence-mod
  // map), so we surface them honestly as pointers rather than faking precision.
  // ---------------------------------------------------------------------------
  function buildNotes(target, db) {
    const notes = [
      "Start from your carry mod: find the single hardest-to-roll mod in the goal and BUY a base that already has it — don't gamble it onto a white base. Then build the rest with cheap clean prefix/suffix manipulation (Transmute/Regal/Exalt + side omens), and SAVE the one-per-item premium tools (desecration, fracture) for a later mod that the affix pools can no longer cleanly target. Spending desecration on the very first mod is the classic beginner trap.",
      forcingNote(target),
    ];
    // Essence tier shortfall: an essence matches the family but can't reach the chosen tier.
    const shortfalls = [];
    for (const m of target.mods) {
      if (essenceFor(m, target.itemClass, db)) continue; // an essence DOES reach it -> no shortfall
      const u = essenceUnderTier(m, target.itemClass, db);
      if (u) shortfalls.push(`${u.name} only reaches “${u.grantMod}”, below your “${m.text}” target — an essence can't hit that tier, so slam (a Perfect orb biases high) or buy a base that already rolls it`);
    }
    if (shortfalls.length) notes.push("Essence tier shortfall: " + shortfalls.join("; ") + ".");
    let ess = null;
    for (const m of target.mods) {
      const e = essenceFor(m, target.itemClass, db);
      if (e) { ess = e; break; }
    }
    if (ess && ess.mode === "magic_to_rare") {
      // Only worth surfacing the Perfect-swap tactic when one actually exists for this mod.
      const perfect = (db.essences || []).find(e =>
        e.family === ess.family && e.mode === "remove_add" &&
        e.grants.some(g => g.classes.includes(target.itemClass)));
      if (perfect) {
        notes.push(`Perfect Essence swap: already have a finished Rare? ${perfect.name} removes one random mod and forces its guaranteed ${target.itemClass} mod in a single orb — pair with Sinistral/Dextral Crystallisation to protect the side you care about.`);
      }
    }
    notes.push("Two different tools, often confused. FRACTURE = true immunity: a fractured mod can't be removed by annul/chaos at all, so once you fracture e.g. a prefix you can chaos/exalt-spam the OTHER side with zero risk to it. DESECRATION is NOT immune — a plain annul can still remove a desecrated mod — but Omen of Light lets you TARGET it (an Annul under Omen of Light always hits the desecrated mod), making it deterministically placeable and precisely swappable. Use FRACTURE to lock, DESECRATION to place-and-control.");
    notes.push("Runic Alloys & Lich mods: some endgame mods only come from a Runic Alloy or from Desecration at the Well of Souls. An Alloy mod uses your one crafted slot (mutually exclusive with essences); a desecrated mod uses the separate one-desecrated slot. Cross-check the target on PoE2DB to see if any mod here is alloy/desecrate-only.");
    notes.push("Odds note: '~X% per slam' uses Craft of Exile's extrapolated weights — community estimates, not official GGG data. Treat them as solid relative effort, not exact probability.");
    // Stage 4b-ii: base-implicit shortcuts.
    const impHits = [];
    for (const m of target.mods) {
      const ib = implicitBaseFor(m, target, db);
      if (ib) impHits.push(`“${m.text}” is available as a ${ib.base} implicit (${ib.implicit}) — choosing that base grants it without spending an explicit mod slot`);
    }
    if (impHits.length) notes.push("Base implicits: " + impHits.join("; ") + ".");
    // Stage 4b-ii: jewellery catalyst guidance.
    if (JEWELRY.has(target.itemClass)) {
      const cm = [];
      for (const m of target.mods) { const c = catalystFor(m, target, db); if (c) cm.push(`${c.name} → ${m.name}`); }
      if (cm.length) notes.push(`Catalysts (jewellery): bias exalts with Omen of Catalysing Exaltation toward ${cm.join(", ")}. Quality scales the bias (~2× at 20% quality, ~3× at 40%); pushing quality higher can also cross a tier breakpoint (e.g. +3→+4 for the matching type). Mods no catalyst covers (e.g. Rarity, Crit) come from essence / desecrate / fracture instead.`);
      const qEss = (db.essences || []).find(e => (e.grants || []).some(g => g.classes.includes(target.itemClass) && /Maximum Quality/i.test(g.mod)));
      if (qEss) notes.push(`Quality cap: to reach the higher quality that strengthens the bias, ${qEss.name} grants +max quality — a SEPARATE, guaranteed step that raises the cap. (It does NOT interact with the Catalysing Exaltation bias, which only affects exalted orbs.)`);
    }
    // Stage 4b-iv: whittling-by-ilvl + the desecrate reveal loop.
    const loIlvl = Math.min(...target.mods.map(m => m.ilvl || 1));
    const loMod = target.mods.find(m => (m.ilvl || 1) === loIlvl) || target.mods[0];
    notes.push(`Whittling (removal by ilvl): Omen of Whittling makes a Chaos remove the LOWEST required-level mod, then add one — the clean way to evict a known low-ilvl junk (a Transmute/Regal filler, or a spent +max-quality at ilvl 1) and reroll that slot. It always hits the current floor, so it only isolates junk sitting BELOW everything you want. Here your lowest wanted mod is “${loMod.text}” (ilvl ${loIlvl}); whittling safely removes anything under that. Stack Sinistral/Dextral Erasure to also pin the side.`);
    notes.push(`Desecrate reveal loop: bone + Omen of Sinistral/Dextral Necromancy adds a veiled mod on the chosen side; reveal 1-of-3 at the Well of Souls. Bad reveal? Omen of Abyssal Echoes rerolls the 3 ONCE (cheap — use first); still bad? Omen of Light + Annul strips the desecrated mod so you re-desecrate (pricier). Repeat — deterministic, cost = retries.`);
    return notes;
  }

  // ===========================================================================
  // Public entry point.
  // ===========================================================================
  function planRoutes(target, db) {
    if (!target || !target.mods || !target.mods.length) return { routes: [], notes: [] };

    // Required base ilvl = the highest tier gate among the chosen mods.
    const reqIlvl = Math.max(1, ...target.mods.map(m => m.ilvl || 1));

    const routes = [];
    const hasExclusive = target.mods.some(m => m.src === "desecrated");
    const _must = mustHaveSet(target);
    const hardest = Math.max(0, ...target.mods.filter(m => _must.has(m)).map(m => expectedSlams(m, target, db, reqIlvl)));
    if (hasExclusive) {
      // A desecrate-EXCLUSIVE mod can only come from the Well -> desecration route is mandatory.
      const r0 = routeDesecrate(target, db, reqIlvl);
      if (r0) routes.push(r0);
    } else {
      // PRIMARY: when the hardest mod is non-trivial, the realistic craft buys a base that
      // already has it, then builds the rest (desecration reserved for a later hard mod).
      if (hardest >= 4) {
        const r0 = routeAcquireAnchor(target, db, reqIlvl);
        if (r0) routes.push(r0);
      }
      // Essence-from-white: clean & cheap, but only when the essence anchors the HARDEST mod
      // (otherwise it would slam the carry — guarded inside the route).
      const r1 = routeEssenceFill(target, db, reqIlvl);
      if (r1) routes.push(r1);
      // Build-from-white fallbacks (when no pre-rolled base is available/affordable).
      routes.push(routeLadder(target, db, reqIlvl));
      if (target.rarity === "Rare") routes.push(routeAlchemy(target, db, reqIlvl));
      // Fracture-anchor → chaos-target: the §3.5 escalation. routeFractureAnchor self-gates
      // (returns null unless a side has 2+ hard, non-essence mods), so it never fires for easy goals.
      if (target.rarity === "Rare" && target.mods.length >= 2) {
        const rf = routeFractureAnchor(target, db, reqIlvl);
        if (rf) routes.push(rf);
      }
    }

    // Rank by estimated effort from real weights. Best first; tag the recommendation.
    for (const r of routes) {
      r.effort = scoreRoute(r, target, db, reqIlvl);
      r.effortLabel = `≈ ${r.effort} targeted slams (est.)`;
    }
    routes.sort((a, b) => a.effort - b.effort);
    if (routes.length) routes[0].recommended = true;

    return { routes, notes: buildNotes(target, db), reqIlvl };
  }

  // ---- expose (node tests + browser), mirroring app.js ----
  // (Stage 3.10: acquire-carry-base philosophy — see routeAcquireAnchor.)
  const api = { planRoutes, essenceFor, eligibleMods, familyText };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.POE2Planner = api;
})();
