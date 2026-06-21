/* PoE2 Craft Planner — Stage 3: hybrid path planner
 * Pure browser JS, no deps. Consumes window.POE2 (poe2_data.js) + a legal goal
 * produced by the target builder in app.js.
 *
 * Design (from the handoff):
 *   - HYBRID brain: human-idiomatic STRATEGY TEMPLATES generate routes; a
 *     STATE-TRANSITION model (preconditions -> effects) validates each step is legal.
 *   - NO probability engine. 0.5 spawn weights are flattened to 1, so the only honest
 *     odds signal is "how many mods compete for an open slot" (uniform-approx). Every
 *     step is labelled deterministic / likely / gamble instead of given a %.
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
  // Essence-family heuristic.
  // The slim dataset has no essence -> guaranteed-mod map yet (documented gap), so we
  // recover the common anchors by keyword. KB §3 only names some mappings precisely;
  // where it doesn't (which resist essence is which element), we flag verify:true so the
  // step tells the user to confirm on PoE2DB rather than inventing a fact.
  // ---------------------------------------------------------------------------
  const ESSENCE_RULES = [
    [/to maximum Life\b/i,                         { essence: "Essence of the Body" }],
    [/to maximum Mana\b/i,                         { essence: "Essence of the Mind" }],
    [/to maximum Energy Shield\b/i,                { essence: "Essence of Enhancement" }],
    [/increased (Armour|Evasion|Energy Shield)/i,  { essence: "Essence of Enhancement" }],
    [/Adds .* Physical Damage/i,                   { essence: "Essence of Abrasion" }],
    [/Adds .* Fire Damage|increased Fire/i,        { essence: "Essence of Flames" }],
    [/Adds .* Cold Damage|increased Cold/i,        { essence: "Essence of Ice" }],
    [/Adds .* Lightning Damage|increased Lightning/i, { essence: "Essence of Electricity" }],
    [/Spell Damage|to .* Spell Skills/i,           { essence: "Essence of Sorcery" }],
    [/increased Attack Speed/i,                    { essence: "Essence of Haste" }],
    [/increased Cast Speed/i,                      { essence: "Essence of Alacrity" }],
    [/Level of all .* Attack Skills/i,             { essence: "Essence of Battle" }],
    [/Critical/i,                                  { essence: "Essence of Seeking" }],
    [/to (Strength|Dexterity|Intelligence|all Attributes)\b/i, { essence: "Essence of the Infinite" }],
    [/increased .*Rarity of Items/i,               { essence: "Essence of Opulence" }],
    // single-element resist: KB lists Ruin/Insulation/Thawing/Grounding but not which
    // element -> name generically and force a verify.
    [/to .*Resistance/i,                           { essence: "the matching Resistance Essence", verify: true }],
  ];

  // Return { essence, tier, verify } for a mod that a Greater Essence can guarantee, else null.
  function essenceFor(mod) {
    for (const [re, info] of ESSENCE_RULES) {
      if (re.test(mod.text)) return { tier: "Greater", verify: false, ...info };
    }
    return null;
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
    const anchor = target.mods.find(m => essenceFor(m));
    if (!anchor) return null; // no anchorable mod -> this route doesn't apply
    const ess = essenceFor(anchor);
    const elig = eligibleMods(db, target.itemClass, target.baseTags, reqIlvl);
    const usedGroups = new Set();
    (anchor.group || []).forEach(g => usedGroups.add(g));

    const steps = [];
    steps.push(mkStep(
      "Acquire base", [],
      `Get a white (Normal) ${target.baseName} at item level ${reqIlvl}+. ilvl gates tiers — ${reqIlvl}+ unlocks every mod in this goal.`,
      "deterministic", "Normal", []));

    steps.push(mkStep(
      "Orb of Transmutation", ["Transmutation", "Greater Transmutation", "Perfect Transmutation"],
      "Normal → Magic, adds one random mod. (A Greater/Perfect Transmute only guarantees a higher minimum tier on that throwaway mod — plain is fine here.)",
      "gamble", "Magic", [INCIDENTAL]));

    steps.push(mkStep(
      `${ess.tier} ${ess.essence}`, ["Greater", "Perfect"],
      `Magic → Rare and GUARANTEES “${anchor.text}”.${ess.verify ? " ⚠ Verify on PoE2DB which element this essence forces." : ""} This spends your ONE crafted-mod slot — no other essence/alloy/Runic-Ward enchant after this.`,
      "deterministic", "Rare",
      [targetMod(anchor, "anchor"), INCIDENTAL]));

    // The Transmute's collateral mod is still on the item. Removing it cleanly is the
    // genuinely messy part — be honest about it instead of pretending it's free.
    steps.push(mkStep(
      "Clear the collateral", ["Orb of Annulment", "Chaos + Omen of Whittling"],
      "The Transmute mod is probably not a target. If it sits on the opposite side from your anchor, Sinistral/Dextral Annulment removes it cleanly. If it shares your anchor's side, an Annul is a coin-flip — prefer Chaos + Omen of Whittling to delete the lowest-ilvl mod.",
      "gamble", "Rare",
      [targetMod(anchor, "anchor")]));

    // Fill each remaining target with a side-targeted Exalt.
    const placed = [targetMod(anchor, "anchor")];
    const remaining = target.mods.filter(m => m !== anchor).slice().sort(bySide);
    for (const m of remaining) {
      const omen = m.side === "prefix" ? "Sinistral Exaltation (prefix)" : "Dextral Exaltation (suffix)";
      const pool = competing(elig, m.side, usedGroups);
      (m.group || []).forEach(g => usedGroups.add(g));
      placed.push(targetMod(m, "target"));
      steps.push(mkStep(
        "Exalted Orb + Omen", ["Exalted Orb", "Greater Exaltation (adds 2)"],
        `Add a ${m.side} aiming for “${m.text}”. ${omen} forces the side; WHICH ${m.side} is still random — ${pool} ${m.side}es compete (${grindWord(pool)}). Re-roll the slot (Annul that side + Exalt again) until it lands.`,
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
      tagline: `Guarantee “${anchor.text}” with a ${ess.essence}, then slam the rest.`,
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
      const pool = competing(elig, m.side, usedGroups);
      (m.group || []).forEach(g => usedGroups.add(g));
      placed.push(targetMod(m, "target"));

      let action, variants, detail, rarity;
      if (kind === "transmute") {
        action = "Orb of Transmutation"; variants = ["Transmutation", "Greater", "Perfect"]; rarity = "Magic";
        detail = `Normal → Magic. Fish for “${m.text}” — ${pool} ${m.side}es eligible (${grindWord(pool)}). No scour in 0.5, so if it misses, salvage and re-buy a white base.`;
      } else if (kind === "augment") {
        action = "Orb of Augmentation"; variants = ["Augmentation", "Greater", "Perfect"]; rarity = "Magic";
        detail = `Add the OTHER side while still Magic (a Magic item allows only 1 prefix + 1 suffix), aiming for “${m.text}” (${pool} ${m.side}es, ${grindWord(pool)}).`;
      } else if (kind === "regal") {
        action = "Regal Orb"; variants = ["Regal Orb", "Sinistral/Dextral Coronation (pick the side)"]; rarity = "Rare";
        detail = `Magic → Rare, adds a mod. A Coronation omen forces the side toward “${m.text}” (${pool} ${m.side}es, ${grindWord(pool)}).`;
      } else {
        const omen = m.side === "prefix" ? "Sinistral Exaltation" : "Dextral Exaltation";
        action = "Exalted Orb + Omen"; variants = ["Exalted Orb", "Greater Exaltation (adds 2)"]; rarity = "Rare";
        detail = `${omen} adds a ${m.side} aiming for “${m.text}” (${pool} ${m.side}es, ${grindWord(pool)}). Annul-and-retry that side if it misses.`;
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

  // ---------------------------------------------------------------------------
  // Advanced-alternative notes. These tactics are real and idiomatic but the slim
  // dataset can't yet generate exact steps for them (no alloy/desecrate/essence-mod
  // map), so we surface them honestly as pointers rather than faking precision.
  // ---------------------------------------------------------------------------
  function buildNotes(target) {
    const notes = [];
    const anchor = target.mods.find(m => essenceFor(m));
    if (anchor) {
      const ess = essenceFor(anchor);
      notes.push(`Perfect Essence swap: already have a finished Rare? A Perfect ${ess.essence} removes one random mod and forces “${anchor.text}” in a single orb — pair with Sinistral/Dextral Crystallisation to protect the side you care about.`);
    }
    notes.push("Fracture to protect: before Chaos/Annul spamming, a Fracturing Orb can lock one hard-won mod in place so it survives the rerolls (fracture → annul/chaos the rest freely).");
    notes.push("Runic Alloys & Lich mods: some endgame mods only come from a Runic Alloy or from Desecration at the Well of Souls. An Alloy mod uses your one crafted slot (mutually exclusive with essences); a desecrated mod uses the separate one-desecrated slot. Cross-check the target on PoE2DB to see if any mod here is alloy/desecrate-only — the dataset doesn't flag those yet.");
    notes.push("Odds caveat: 0.5 spawn weights are flattened to 1, so 'competing pool' counts are a grindiness proxy, not true probabilities. Treat 'tight/moderate/wide pool' as relative effort.");
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
    const r1 = routeEssenceFill(target, db, reqIlvl);
    if (r1) routes.push(r1);
    routes.push(routeLadder(target, db, reqIlvl));
    // Alchemy fits a Rare; for a Magic goal it's not applicable.
    if (target.rarity === "Rare") routes.push(routeAlchemy(target, db, reqIlvl));

    return { routes, notes: buildNotes(target), reqIlvl };
  }

  // ---- expose (node tests + browser), mirroring app.js ----
  const api = { planRoutes, essenceFor, eligibleMods, familyText };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.POE2Planner = api;
})();
