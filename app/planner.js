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

  // Find the essence(s) that actually guarantee `mod` on `itemClass`. Returns null when
  // none do. Prefers a Magic->Rare ADD essence (cleanest anchor) over a Perfect
  // REMOVE+ADD. Shape:
  //   { family, mode, classRaw, grantMod, best:{tier,name}, tiers:[{tier,name},...] }
  function essenceFor(mod, itemClass, db) {
    const list = db && db.essences;
    if (!list || !itemClass || !mod) return null;
    const key = statKey(mod.text);
    const matches = [];
    for (const e of list) {
      for (const g of e.grants) {
        if (g.classes.includes(itemClass) && statKey(g.mod) === key) {
          matches.push({ name: e.name, family: e.family, tier: e.tier, mode: e.mode,
                         grantMod: g.mod, classRaw: g.classes_raw });
          break;
        }
      }
    }
    if (!matches.length) return null;
    const additive = matches.filter(m => m.mode === "magic_to_rare");
    const chosen = (additive.length ? additive : matches)
      .slice().sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
    const best = chosen[0];
    return {
      family: best.family, mode: best.mode, classRaw: best.classRaw, grantMod: best.grantMod,
      best: { tier: best.tier, name: best.name },
      tiers: chosen.map(m => ({ tier: m.tier, name: m.name })),
    };
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
  function desecrateInfo(mod, itemClass, baseName, db) {
    const c = db.classes[itemClass];
    if (!c) return null;
    const key = statKey(mod.text);
    const des = c.desecrated || [];
    const onBase = arr => arr.filter(x => x.side === mod.side && (x.tags || []).includes(baseName));
    // The Well's reveal draws from BOTH the normal side pool AND the desecrated-exclusive
    // mods. So a normal mod CAN be locked in via desecration; exclusive mods come ONLY this
    // way. Returns null only if the mod can't appear in the reveal at all.
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
        `Magic → Rare and GUARANTEES the ${grantNote}. Other tiers (${tierVariants.join(" / ")}) just raise the numeric floor. This spends your ONE crafted-mod slot — no other essence/alloy/Runic-Ward enchant after this.`,
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
        `Add a ${m.side} aiming for “${m.text}”. ${omen} forces the side; WHICH ${m.side} is still random — ${oddsPhrase(od, m.side)}. Re-roll the slot (Annul that side + Exalt again) until it lands.`,
        "gamble", "Rare",
        placed.slice().sort(bySide)));
    }

    steps.push(mkStep(
      "Divine Orb (finish)", ["Divine Orb", "Omen of Sanctification (lock at high rolls)"],
      "Once every target mod is present, Divine to perfect the numeric rolls (or use Omen of Sanctification to multiply + lock). Corrupt with Vaal only if chasing an enchant/extra socket — it ends all crafting.",
      "likely", "Rare",
      target.mods.slice().sort(bySide).map(m => targetMod(m, "fixed"))));

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

    steps.push(mkStep(
      "Divine Orb (finish)", ["Divine Orb", "Omen of Sanctification"],
      "Perfect the rolls once all targets are present.",
      "likely", target.rarity,
      target.mods.slice().sort(bySide).map(m => targetMod(m, "fixed"))));

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

    steps.push(mkStep(
      "Divine Orb (finish)", ["Divine Orb", "Omen of Sanctification"],
      "Perfect the rolls once the board is clean.",
      "likely", "Rare",
      target.mods.slice().sort(bySide).map(m => targetMod(m, "fixed"))));

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
      ["Preserved/Ancient Bone (collarbone=jewellery, jawbone=weapon, rib=armour)", `+ Omen of ${omen}`, "+ Omen of Light (forces Annul onto the desecrated mod, to re-roll)"],
      `${di.exclusive ? "“" + anchor.text + "” is desecrate-ONLY — the Well is the only way to get it. " : "Placing a normal mod DETERMINISTICALLY (you pick it at the Well). "}Add a desecrated ${anchor.side} with a bone; Omen of ${omen} forces the ${anchor.side} side. Reveal at the Well (drawn from the normal ${anchor.side} pool + the exclusive desecrated mods, ~${di.poolN} options); if it isn't “${anchor.text}”, run Omen of Light + an Annul — the omen forces the Annul onto the desecrated mod for sure, removing that bad reveal so you desecrate again. You WILL land it, cost = retries. It's also precisely REMOVABLE later (Omen of Light + Annul targets it) if you want to swap it. ⚠ But it is NOT immune to a stray annul — a plain Annul can remove it — so finish the rest with side-targeted (Sinistral/Dextral) removals.`,
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
        `Add a ${m.side} aiming for “${m.text}”. ${ex} forces the side — ${oddsPhrase(od, m.side)}. Annul-and-retry with a ${m.side}-targeted (Sinistral/Dextral) Annul or Whittling so you reroll only this slot — a plain Annul could remove your desecrated mod.`,
        "gamble", "Rare", placed.slice().sort(bySide)));
    }
    steps.push(mkStep("Divine Orb (finish)", ["Divine Orb", "Omen of Sanctification"],
      "Perfect the numeric rolls once every target is present.",
      "likely", "Rare", target.mods.slice().sort(bySide).map(m => targetMod(m, "fixed"))));

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
  // STRATEGY TEMPLATE 5 — Fracture-protected → free-roll. A Fracturing Orb permanently
  //   locks ONE RANDOM mod (needs a 4+ mod Rare). It's a GAMBLE that can BRICK: a wrong
  //   fracture locks the wrong mod and you restart. But once your hard mod is fractured
  //   it's immune to annul/chaos, so the OTHER affixes become a risk-free playground.
  // ===========================================================================
  function routeFracture(target, db, reqIlvl) {
    let anchor = null, bestShare = Infinity;
    for (const m of target.mods) {
      if (m.src === "desecrated") continue; // desecrated mods can't be fractured
      const sh = modShare(m, target, db, reqIlvl);
      const sc = (sh == null) ? 0.5 : sh;
      if (anchor === null || sc < bestShare) { anchor = m; bestShare = sc; }
    }
    if (!anchor) return null;
    const elig = eligibleMods(db, target.itemClass, target.baseTags, reqIlvl);
    const usedGroups = new Set(); (anchor.group || []).forEach(g => usedGroups.add(g));
    const steps = [];

    steps.push(mkStep("Acquire a 4-mod Rare that has the hard mod",
      ["Buy a cheap multi-mod base that already shows it", "or Alchemy + re-buy on a miss"],
      `Fracturing needs a Rare with 4+ mods. Get one that already has “${anchor.text}” plus filler — buy CHEAP, because the next step misses often and you re-buy.`,
      "gamble", "Rare", [targetMod(anchor, "target"), INCIDENTAL, INCIDENTAL, INCIDENTAL]));

    steps.push(mkStep("Fracturing Orb  ⚠ can BRICK",
      ["Fracturing Orb", "(first: desecrate a filler to drop 1-in-4 → 1-in-3)"],
      `Locks ONE RANDOM mod forever. You want it on “${anchor.text}” — about 1 in 4 (every non-desecrated mod is a candidate). A WRONG fracture locks the wrong mod and bricks the plan: salvage/resell and restart with a fresh cheap base. Trick: a desecrated mod can't be fractured, so desecrate one filler first and it's 1 in 3.`,
      "gamble", "Rare", [targetMod(anchor, "anchor")]));

    const placed = [targetMod(anchor, "anchor")];
    const remaining = target.mods.filter(m => m !== anchor).slice().sort(bySide);
    for (const m of remaining) {
      const od = oddsFor(m, elig, usedGroups, target.baseName, reqIlvl);
      (m.group || []).forEach(g => usedGroups.add(g));
      placed.push(targetMod(m, "target"));
      const era = m.side === "prefix" ? "Sinistral Erasure (chaos prefixes only)" : "Dextral Erasure (chaos suffixes only)";
      steps.push(mkStep("Roll freely (fracture protects)",
        ["Chaos + " + era, "Exalt + Sinistral/Dextral Exaltation"],
        `Aim for “${m.text}” — ${oddsPhrase(od, m.side)}. The fractured “${anchor.text}” can't be removed, so reroll this side as much as you want with ZERO risk to it.`,
        "gamble", "Rare", placed.slice().sort(bySide)));
    }
    steps.push(mkStep("Divine Orb (finish)", ["Divine Orb", "Omen of Sanctification"],
      "Perfect the rolls once everything is present.",
      "likely", "Rare", target.mods.slice().sort(bySide).map(m => targetMod(m, "fixed"))));

    return {
      name: "Fracture-protected → free-roll",
      tagline: `Lock “${anchor.text}” with a Fracturing Orb (a gamble), then reroll the rest risk-free.`,
      best: "to protect ONE very hard mod so you can freely grind the other slots — but the fracture itself can brick",
      warning: `Fracturing locks a RANDOM mod (~1 in 4). A wrong fracture bricks the plan and forces a restart — use a cheap base, and desecrate a filler mod first to improve the odds to ~1 in 3.`,
      steps,
    };
  }

  // ---------------------------------------------------------------------------
  // Advanced-alternative notes. These tactics are real and idiomatic but the slim
  // dataset can't yet generate exact steps for them (no alloy/desecrate/essence-mod
  // map), so we surface them honestly as pointers rather than faking precision.
  // ---------------------------------------------------------------------------
  function buildNotes(target, db) {
    const notes = [forcingNote(target)];
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
    if (hasExclusive) {
      // Only desecration can make an exclusive mod -> slam routes can't produce it.
      const r0 = routeDesecrate(target, db, reqIlvl);
      if (r0) routes.push(r0);
    } else {
      const r1 = routeEssenceFill(target, db, reqIlvl);
      if (r1) routes.push(r1);
      routes.push(routeLadder(target, db, reqIlvl));
      // Alchemy fits a Rare; for a Magic goal it's not applicable.
      if (target.rarity === "Rare") routes.push(routeAlchemy(target, db, reqIlvl));
      // Optional "lock the hardest mod" via desecration — only worth showing when
      // something is grindy enough that protecting it pays off.
      const hardest = Math.max(...target.mods.map(m => expectedSlams(m, target, db, reqIlvl)));
      if (hardest >= 4) {
        const r0 = routeDesecrate(target, db, reqIlvl);
        if (r0) routes.push(r0);
      }
      // Fracture is a heavy, can-brick protection tool — only worth it for a VERY hard
      // mod on a Rare with other slots to grind safely afterwards.
      if (target.rarity === "Rare" && hardest >= 8 && target.mods.length >= 2) {
        const rf = routeFracture(target, db, reqIlvl);
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
  const api = { planRoutes, essenceFor, eligibleMods, familyText };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.POE2Planner = api;
})();
