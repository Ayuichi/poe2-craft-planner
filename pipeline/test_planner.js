/* Node smoke test for the Stage 3 planner. Run: node pipeline/test_planner.js
 * Loads the real browser dataset + planner, builds realistic legal goals, and asserts
 * the routes are well-formed, legal under the 0.5 transition rules, and — crucially —
 * that essence advice is item-class-correct (the gold-amulet regression).
 */
const path = require("path");
global.window = {};
require(path.join(__dirname, "..", "app", "poe2_data.js")); // populates window.POE2
const DB = global.window.POE2;
const planner = require(path.join(__dirname, "..", "app", "planner.js"));

let fails = 0;
const ok = (cond, msg) => { if (!cond) { console.error("  ✗ " + msg); fails++; } else console.log("  ✓ " + msg); };

function poolFor(itemClass, ilvl = 82) {
  const c = DB.classes[itemClass];
  const base = c.bases[c.bases.length - 1];
  const pool = c.prefixes.concat(c.suffixes)
    .filter(m => m.ilvl <= ilvl && m.tags.some(t => base.tags.includes(t)) && !m.essence_only);
  return { base, pool };
}

function pickGoal(itemClass, wants, ilvl = 82) {
  const { base, pool } = poolFor(itemClass, ilvl);
  const mods = [];
  const usedGroups = new Set();
  for (const want of wants) {
    const hit = pool.find(m =>
      want.re.test(m.text) &&
      (!want.side || m.side === want.side) &&
      !(m.group || []).some(g => usedGroups.has(g)) &&
      !mods.includes(m));
    if (hit) { mods.push(hit); (hit.group || []).forEach(g => usedGroups.add(g)); }
  }
  return { itemClass, baseName: base.name, baseTags: base.tags, itemLevel: ilvl, rarity: "Rare", mods };
}

console.log("\n== Goal: Ring, life + resistance + mana ==");
const goal = pickGoal("Ring", [{ re: /maximum Life/i }, { re: /Resistance/i }, { re: /maximum Mana/i }]);
console.log("  base:", goal.baseName, "| mods:", goal.mods.map(m => `${m.side[0].toUpperCase()}:${m.text}`).join(" | "));
ok(goal.mods.length >= 2, "constructed a multi-mod goal from real data");

const plan = planner.planRoutes(goal, DB);
ok(plan.routes.length >= 2, `generated ${plan.routes.length} routes`);
ok(plan.notes.length > 0, `generated ${plan.notes.length} advisory notes`);
ok(typeof plan.reqIlvl === "number", "computed required base ilvl = " + plan.reqIlvl);

// Essence routes are TIER-AWARE: an essence only counts if its value reaches the target tier.
const rLife = DB.classes.Ring.prefixes.find(m => /maximum Life/.test(m.name) && m.bw.Ring);
const rLad = rLife.bw.Ring;
const mx = txt => Math.max(...(txt.match(/\d+/g) || [0]).map(Number));
const lifeReach = rLad.filter(x => mx(x[2]) <= 84).pop();   // essence of body caps ~84
const lifeTop = rLad[rLad.length - 1];                       // top tier (~100), above essence cap
const reachMod = Object.assign({}, rLife, { text: lifeReach[2], ilvl: lifeReach[0] });
const topMod = Object.assign({}, rLife, { text: lifeTop[2], ilvl: lifeTop[0], mustHave: true });
ok(planner.essenceFor(reachMod, "Ring", DB) !== null, "essence reaches an achievable life tier (" + lifeReach[2] + ")");
ok(planner.essenceFor(topMod, "Ring", DB) === null, "MUST-HAVE top life tier: essence suppressed (" + lifeTop[2] + ", above the essence cap)");
const essGoal = { itemClass: "Ring", baseName: "Ring", baseTags: ["Ring"], itemLevel: 82, rarity: "Rare", mods: [reachMod] };
const essPlan = planner.planRoutes(essGoal, DB);
const ess = essPlan.routes.find(r => /Essence anchor/.test(r.name));
ok(!!ess, "essence-anchor route present for an achievable-tier goal");
ok(ess.steps.some(s => s.determinism === "deterministic" && /GUARANTEES/.test(s.detail)), "  essence step is deterministic + guarantees the anchor");
ok(essPlan.routes.some(r => r.steps.some(s => /Divine Orb \(finish\)/.test(s.action))),
   "Divine finish present when a target mod has a value range (life)");

// --- Transition legality: no state may exceed rarity caps; rarity only moves forward.
const CAP = { Normal: { p: 0, s: 0 }, Magic: { p: 1, s: 1 }, Rare: { p: 3, s: 3 } };
const RANK = { Normal: 0, Magic: 1, Rare: 2 };
function checkLegal(p) {
  for (const r of p.routes) {
    console.log("\n== Route:", r.name, "==");
    ok(r.steps.length >= 3, `  ${r.steps.length} steps`);
    ok(!!r.tagline && !!r.best, "  has tagline + 'best for' blurb");
    let prevRank = -1;
    for (const s of r.steps) {
      const st = s.state;
      const pc = st.mods.filter(m => m.side === "prefix").length;
      const sf = st.mods.filter(m => m.side === "suffix").length;
      const cap = CAP[st.rarity];
      ok(pc <= cap.p && sf <= cap.s, `  [${st.rarity}] ${pc}p/${sf}s within cap ${cap.p}p/${cap.s}s — "${s.action}"`);
      ok(["deterministic", "likely", "gamble"].includes(s.determinism), `  determinism flag valid: ${s.determinism}`);
      ok(RANK[st.rarity] >= prevRank, `  rarity never regresses (${st.rarity})`);
      prevRank = Math.max(prevRank, RANK[st.rarity]);
    }
  }
}
checkLegal(plan);

// === REGRESSION: the gold-amulet bug ============================================
// The tool used to advise "Greater Essence of Sorcery -> +3 Spell Skills" on an
// AMULET. That is triple-wrong: wrong tier (Greater = spell damage), wrong mod, and
// no Sorcery essence touches amulets at all. Assert the data now refuses to claim it.
console.log("\n== REGRESSION: Gold Amulet + '+Level of all Spell Skills' ==");
const spellSkill = { text: "+3 to Level of all Spell Skills", side: "suffix" };
ok(planner.essenceFor(spellSkill, "Amulet", DB) === null,
   "no essence claims +Spell Skills on an Amulet (the original bug)");
const wandHit = planner.essenceFor(spellSkill, "Wand", DB);
ok(wandHit && /Perfect Essence of Sorcery/.test(wandHit.best.name) && wandHit.mode === "remove_add",
   "+Spell Skills on a Wand correctly resolves to Perfect Essence of Sorcery (remove+add)");

// Build a real amulet goal that INCLUDES the spell-skill mod, and verify no route
// step ever claims to essence-guarantee spell skills.
const amuletGoal = pickGoal("Amulet", [
  { re: /Level of all Spell Skills/i },
  { re: /Rarity of Items/i },
  { re: /Critical/i },
]);
console.log("  base:", amuletGoal.baseName, "| mods:", amuletGoal.mods.map(m => m.text).join(" | "));
if (amuletGoal.mods.some(m => /Spell Skills/i.test(m.text))) {
  const aplan = planner.planRoutes(amuletGoal, DB);
  const eroute = aplan.routes.find(r => /Essence anchor/.test(r.name));
  if (eroute) {
    const lies = eroute.steps.some(s => s.determinism === "deterministic" && /Spell Skills/i.test(s.detail));
    ok(!lies, "essence route never guarantees +Spell Skills on the amulet");
    const anchorsRarity = eroute.steps.some(s => /Opulence/.test(s.action));
    ok(anchorsRarity, "essence route correctly anchors on Opulence (rarity), the real amulet essence");
  } else {
    ok(true, "no essence route surfaced for the amulet (also acceptable)");
  }
} else {
  console.log("  (dataset lacks an amulet spell-skill mod to select; class-gate assertions above still cover the bug)");
}

// --- A goal with NO anchorable mod should still produce manual/alchemy routes only.
console.log("\n== Goal with genuinely no essence anchor ==");
const { base: qb, pool: qpool } = poolFor("Quiver");
const odd = qpool.filter(m => !planner.essenceFor(m, "Quiver", DB)).slice(0, 2);
const goal2 = { itemClass: "Quiver", baseName: qb.name, baseTags: qb.tags, itemLevel: 82, rarity: "Rare", mods: odd };
const plan2 = planner.planRoutes(goal2, DB);
ok(odd.length >= 1, `built a ${odd.length}-mod non-anchorable Quiver goal`);
ok(!plan2.routes.find(r => /Essence anchor/.test(r.name)), "no essence route when nothing is anchorable");
ok(plan2.routes.length >= 1, "still produces manual/alchemy routes (" + plan2.routes.map(r => r.name).join(", ") + ")");


// === "best path" brain: ranking, recommendation, pool-forcing ===================
console.log("\n== Best-path brain (ranking + forcing) ==");
const bp = planner.planRoutes(goal, DB);
ok(bp.routes.every(r => typeof r.effort === "number" && r.effort > 0), "every route has a numeric effort estimate");
ok(bp.routes.filter(r => r.recommended).length === 1, "exactly one route is tagged recommended");
ok(bp.routes[0].recommended === true, "recommended route is first (lowest effort = " + bp.routes[0].effort + ")");
const sorted = bp.routes.every((r, i) => i === 0 || bp.routes[i-1].effort <= r.effort);
ok(sorted, "routes sorted best-first by effort: " + bp.routes.map(r => `${r.name.split(" ")[0]}=${r.effort}`).join(", "));
ok(bp.notes.some(t => /Pool-forcing/.test(t)), "pool-forcing targeting note present");
ok(!bp.notes.some(t => /flattened to 1/.test(t)), "stale 'weights flattened' note removed");


// === Desecration: deterministic placement of an exclusive mod =====================
console.log("\n== Desecration tactic ==");
const amc = DB.classes["Amulet"];
const abase = amc.bases[0];
const desMod = amc.desecrated.find(m => m.tags.includes(abase.name));
ok(amc.desecrated.length > 0, `desecrated pool present (${amc.desecrated.length} amulet desecrated mods)`);
ok(desMod && desMod.src === "desecrated", "desecrated mods carry src=desecrated");
const baseSide = amc.prefixes.concat(amc.suffixes)
  .filter(m => m.tags.includes(abase.name) && m.ilvl <= 82 && m.side !== desMod.side).slice(0, 2);
const dGoal = { itemClass: "Amulet", baseName: abase.name, baseTags: abase.tags, itemLevel: 82, rarity: "Rare",
  mods: [desMod, ...baseSide] };
const dPlan = planner.planRoutes(dGoal, DB);
const dRoute = dPlan.routes.find(r => /Desecration/.test(r.name));
ok(!!dRoute, "desecration route generated when goal includes a desecrated-exclusive mod");
ok(dPlan.routes.every(r => /Desecration/.test(r.name)), "slam-only routes correctly gated out (only desecration can make it)");
const dStep = dRoute.steps.find(s => /Well of Souls/.test(s.action));
ok(dStep && dStep.determinism === "deterministic", "the desecration step is DETERMINISTIC, not a gamble");
ok(/Omen of Light/.test(dStep.detail) && /removable/i.test(dStep.detail), "desecration step teaches Omen-of-Light retry + removability");
ok(/NOT immune|plain Annul can remove|stray annul/i.test(dStep.detail), "desecration step is HONEST: warns a plain annul can remove the desecrated mod");
ok(dPlan.notes.some(t => /fractur/i.test(t) && /desecrat/i.test(t) && /immun/i.test(t) && /NOT immune/i.test(t)), "note correctly distinguishes FRACTURE (immune) from DESECRATION (not immune, but targetable via Omen of Light)");
// New philosophy: for a NORMAL goal you BUY the carry (hardest) mod's base — you do NOT spend
// desecration to place it from white. Desecration is reserved INSIDE the acquire route for a
// later hard mod. There is no standalone "Desecration anchor" route for a normal goal.
const ar = DB.classes["Amulet"];
const ab2 = ar.bases[0];
const byW = m => { const l = m.bw[ab2.name]; return l ? Math.max(...l.map(x => x[1])) : 0; };
const normAll = ar.prefixes.concat(ar.suffixes).filter(m => m.tags.includes(ab2.name) && m.ilvl <= 82 && byW(m) > 0);
const sortedByW = normAll.slice().sort((a, b) => byW(a) - byW(b)); // rarest first
const rareP = sortedByW.find(m => m.side === "prefix");
const rareS = sortedByW.find(m => m.side === "suffix");
const nGoal = { itemClass: "Amulet", baseName: ab2.name, baseTags: ab2.tags, itemLevel: 82, rarity: "Rare", mods: [rareP, rareS] };
const nPlan = planner.planRoutes(nGoal, DB);
const acq = nPlan.routes.find(r => /Acquire the carry base/.test(r.name));
ok(!!acq, "normal goal: acquire-carry-base route generated");
ok(acq && /already/i.test(acq.steps[0].detail) && acq.steps[0].determinism === "deterministic",
   "step 1 BUYS a base that already has the carry mod");
const ladderN = nPlan.routes.find(r => /Manual ladder/.test(r.name));
ok(acq && ladderN && acq.effort < ladderN.effort,
   "acquiring the carry beats slamming it from white (acq " + (acq&&acq.effort) + " < ladder " + (ladderN&&ladderN.effort) + ")");
ok(!nPlan.routes.some(r => /^Desecration anchor/.test(r.name)),
   "no standalone desecration route for a normal goal (desecration not spent on the carry)");
ok(nPlan.routes.some(r => !/Acquire/.test(r.name)), "from-white fallback routes still present");
// Safety model: rareP + rareS are on OPPOSITE sides, so each is the lone wanted mod on its side —
// a side-targeted Exalt + same-side Annul retry is clean (no keeper at risk). Desecration would be
// wasted here, so the acquire route must NOT reserve a desecration step for an opposite-side goal.
ok(rareP.side !== rareS.side, "regression goal has its two hard mods on opposite sides");
ok(acq && !acq.steps.some(s => /Desecrate the last hard mod/.test(s.action)),
   "opposite-side goal: NO desecration step (lone-on-side mods exalt cleanly via side-targeted Annul)");

// But when two hard mods COLLIDE on the same side, the retry can't be side-isolated, so the acquire
// route DOES reserve its one desecration slot for the second one (placed LAST, after the carry).
const rarePs = sortedByW.filter(m => m.side === "prefix").slice(0, 2);
const ssGoal = { itemClass: "Amulet", baseName: ab2.name, baseTags: ab2.tags, itemLevel: 82, rarity: "Rare", mods: rarePs };
const ssPlan = planner.planRoutes(ssGoal, DB);
const ssAcq = ssPlan.routes.find(r => /Acquire the carry base/.test(r.name));
ok(rarePs.length === 2 && rarePs[0].side === "prefix" && rarePs[1].side === "prefix",
   "same-side goal: two hard PREFIXES selected");
const desStep = ssAcq && ssAcq.steps.find(s => /Desecrate the last hard mod/.test(s.action));
ok(!!desStep && desStep.determinism === "deterministic",
   "same-side goal: acquire route reserves a deterministic desecration STEP (collision -> safe placement)");

// Fracture-anchor + chaos-target (Stage 4b): fires only when a side has 2+ hard, non-essence mods.
const fr_c = DB.classes["Amulet"]; const fr_b = fr_c.bases[0];
const fr_byW = m => { const l = m.bw[fr_b.name]; return l ? Math.max(...l.map(x => x[1])) : 0; };
const essA = m => { const e = planner.essenceFor(m, "Amulet", DB); return !!(e && e.mode === "magic_to_rare"); };
const fr_suf = fr_c.suffixes
  .filter(m => m.tags.includes(fr_b.name) && m.ilvl <= 82 && fr_byW(m) > 0 && !essA(m))
  .sort((a, b) => fr_byW(a) - fr_byW(b)); // rarest (hardest), non-essence first
const fr_pre = fr_c.prefixes.find(m => m.tags.includes(fr_b.name) && m.ilvl <= 82 && fr_byW(m) > 0);
const frGoal = { itemClass: "Amulet", baseName: fr_b.name, baseTags: fr_b.tags, itemLevel: 82, rarity: "Rare", mods: fr_suf.slice(0, 2).concat([fr_pre]) };
const frPlan = planner.planRoutes(frGoal, DB);
const frRoute = frPlan.routes.find(r => /Fracture-anchor/.test(r.name));
ok(!!frRoute, "fracture-anchor route fires when a side has 2+ hard non-essence mods");
ok(frRoute && frRoute.recommended === true, "fracture-anchor is RECOMMENDED when it fires (acquire route surcharged for brick risk)");
ok(frRoute && /brick/i.test(frRoute.warning || ""), "fracture route carries an explicit BRICK warning");
const frFr = frRoute && frRoute.steps.find(s => /Fracturing/.test(s.action));
ok(frFr && frFr.determinism === "gamble", "the fracture step is a GAMBLE (honest brick risk)");
ok(frFr && /1 in 3/i.test(frFr.detail), "fracture step states the improved 1-in-3 odds");
const frAbyss = frRoute && frRoute.steps.find(s => /Essence of the Abyss/.test((s.variants || []).join(" ") + (s.detail || "")));
ok(frAbyss && /Sinistral Crystallisation/.test((frAbyss.variants || []).join(" ") + frAbyss.detail),
   "Abyss-mark step uses Sinistral Crystallisation (carry is a suffix -> removes a prefix)");
const iDes = frRoute ? frRoute.steps.findIndex(s => /Desecrate a veiled blocker/.test(s.action)) : -1;
const iFrac = frRoute ? frRoute.steps.findIndex(s => /Fracturing/.test(s.action)) : -1;
ok(iDes > -1 && iFrac > -1 && iDes < iFrac, "the veiled-blocker desecrate comes BEFORE the fracture");
ok(iDes > -1 && /Collarbone/.test(frRoute.steps[iDes].variants.join(" ")), "amulet desecrate uses a Collarbone (jewellery bone)");
const frCh = frRoute && frRoute.steps.find(s => /Chaos-target/i.test(s.action));
ok(frCh && frCh.determinism === "deterministic", "chaos-target step present and DETERMINISTIC (fracture forces the reroll)");
ok(frCh && /FORCED|forced/.test(frCh.detail) && /fractured/i.test(frCh.detail), "chaos-target explains the fracture-forces-single-slot-reroll mechanic");
// Must NOT fire when hard mods are split across sides (one per side):
const spreadGoal = { itemClass: "Amulet", baseName: fr_b.name, baseTags: fr_b.tags, itemLevel: 82, rarity: "Rare", mods: [fr_suf[0], fr_pre] };
ok(!planner.planRoutes(spreadGoal, DB).routes.some(r => /Fracture-anchor/.test(r.name)), "no fracture route when hard mods don't jam one side");

// Per-tier picker data: bw ladders carry [ilvl, weight, tierText] so the picker can show
// the real tier ladder per base (regression: migration had collapsed to one bogus tier).
const tcls = DB.classes["Amulet"]; const tbase = tcls.bases[0].name;
const ssMod = tcls.prefixes.concat(tcls.suffixes).find(m => /Spell Skills/.test(m.text) && m.bw[tbase]);
ok(ssMod && ssMod.bw[tbase].every(t => t.length === 3 && typeof t[2] === "string"),
   "bw ladder entries are [ilvl, weight, tierText]");
const ssTiers = ssMod.bw[tbase].map(t => t[2]);
ok(new Set(ssTiers).size === ssTiers.length && ssTiers.length >= 2,
   `multi-tier mod exposes distinct per-tier texts (${ssTiers.length}: ${ssTiers.map(x=>x.match(/\+\d+/)[0]).join("/")})`);
ok(ssMod.bw[tbase][0][0] < ssMod.bw[tbase][ssMod.bw[tbase].length-1][0],
   "tiers span ascending ilvls (not all collapsed to the min)");

// odds pool must NOT include desecrated/essence mods anymore
const elig = DB.classes["Ring"].prefixes.concat(DB.classes["Ring"].suffixes);
ok(elig.every(m => m.src === "base" || m.src === undefined), "slam pool contains only base mods (no desecrated/essence contamination)");

console.log("\n== Must-have / nice-to-have flag (Stage 4b-iii) ==");
const mc2 = DB.classes["Amulet"]; const mb2 = mc2.bases[0];
const mp = (arr, n, side) => arr.find(x => x.name === n && x.side === side);
const mMelee = mp(mc2.suffixes, "+# to Level of all Melee Skills", "suffix");
const mCrit = mp(mc2.suffixes, "#% increased Critical Hit Chance", "suffix");
const mSpirit = mp(mc2.prefixes, "+# to Spirit", "prefix");
const gUn = { itemClass: "Amulet", baseName: mb2.name, baseTags: mb2.tags, itemLevel: 82, rarity: "Rare", mods: [mMelee, mCrit, mSpirit] };
ok(planner.planRoutes(gUn, DB).routes.some(r => /Fracture-anchor/.test(r.name)),
   "unflagged goal: 2 hard suffixes still trigger the fracture route (all treated as must-have)");
const gFl = { itemClass: "Amulet", baseName: mb2.name, baseTags: mb2.tags, itemLevel: 82, rarity: "Rare",
  mods: [ Object.assign({}, mMelee), Object.assign({}, mCrit), Object.assign({}, mSpirit, { mustHave: true }) ] };
const flPlan = planner.planRoutes(gFl, DB);
ok(!flPlan.routes.some(r => /Fracture-anchor/.test(r.name)),
   "flagging only Spirit must-have stops the fracture inflation (the suffixes are now best-effort)");
const acqF = flPlan.routes.find(r => /Acquire the carry base/.test(r.name));
ok(acqF && /Spirit/.test(acqF.steps[0].detail),
   "carry = the flagged must-have (Spirit), not the hardest mod overall");

console.log("\n== Whittling + desecrate reveal-loop (Stage 4b-iv) ==");
const wPlan = planner.planRoutes(goal, DB); // the Ring life+res+mana goal from the top
ok(wPlan.notes.some(t => /removal by ilvl/i.test(t) && /lowest wanted/i.test(t)),
   "whittling note explains ilvl-targeting + this goal's lowest wanted mod");
ok(wPlan.notes.some(t => /Desecrate reveal loop/i.test(t) && /Abyssal Echoes/.test(t) && /Omen of Light/.test(t)),
   "desecrate reveal-loop note covers Abyssal Echoes -> Omen of Light");
const dGoal2 = { itemClass: "Amulet", baseName: DB.classes.Amulet.bases[0].name, baseTags: DB.classes.Amulet.bases[0].tags, itemLevel: 82, rarity: "Rare",
  mods: [ mp(DB.classes.Amulet.prefixes, "+# to Spirit", "prefix"),
          mp(DB.classes.Amulet.prefixes, "#% increased Rarity of Items found", "prefix"),
          mp(DB.classes.Amulet.suffixes, "+# to Level of all Melee Skills", "suffix") ] };
const dPlan2 = planner.planRoutes(dGoal2, DB);
ok(dPlan2.routes.some(r => r.steps.some(s => /Desecrate/.test(s.action) &&
     (/Abyssal Echoes/.test(s.detail || "") || /Abyssal Echoes/.test((s.variants || []).join(" "))))),
   "a desecrate step spells out the Abyssal Echoes reveal-reroll");

console.log("\n== Essence tier sufficiency: strict for MUST-HAVE, lenient for wish (Boots MS) ==");
const bc = DB.classes["Boots"]; const bb = bc.bases.find(b => /DEX/.test(b.name)) || bc.bases[0];
const msMod = bc.prefixes.concat(bc.suffixes).find(m => /Movement Speed/.test(m.name) && m.bw[bb.name]);
const msLad = msMod.bw[bb.name];
const t1txt = msLad[msLad.length - 1];
const msWish = Object.assign({}, msMod, { text: t1txt[2], ilvl: t1txt[0] });               // wish 35%
const msMust = Object.assign({}, msMod, { text: t1txt[2], ilvl: t1txt[0], mustHave: true }); // must-have 35%
const lowtxt = msLad.find(x => /30%/.test(x[2])) || msLad[0];
const msLow = Object.assign({}, msMod, { text: lowtxt[2], ilvl: lowtxt[0], mustHave: true });
ok(/35%/.test(msWish.text), "T1 boots MS is 35% (" + msWish.text + ")");
ok(planner.essenceFor(msMust, "Boots", DB) === null, "MUST-HAVE 35% MS: essence suppressed (Hysteria only reaches 30%)");
ok(planner.essenceFor(msWish, "Boots", DB) !== null, "WISH 35% MS: essence still offered (30% is fine for a wish)");
ok(planner.essenceFor(msLow, "Boots", DB) !== null, "MUST-HAVE 30% MS: essence satisfies it (Hysteria)");
const msGoal = { itemClass: "Boots", baseName: bb.name, baseTags: bb.tags, itemLevel: 82, rarity: "Rare", mods: [msMust] };
const msPlan = planner.planRoutes(msGoal, DB);
ok(!msPlan.routes.some(r => /Essence anchor/.test(r.name)), "no essence-anchor route for the MUST-HAVE 35% MS goal");
ok(msPlan.notes.some(t => /Essence tier shortfall/.test(t) && /Movement Speed/.test(t)),
   "a note explains the essence under-delivers (30% < 35%) for the must-have");
ok(msPlan.routes.every(r => !r.steps.some(s => /Divine Orb/.test(s.action))),
   "no Divine finish for a flat-value goal: 35% MS has no range to roll");
ok(msPlan.routes.every(r => r.steps.some(s => /no Divine needed/.test(s.action))),
   "flat-value goal gets a no-Divine-needed finish instead")

console.log("\n== Catalyst + implicit wiring (Stage 4b-ii) ==");
const jc = DB.classes["Amulet"]; const jb = jc.bases[0];
const jm = (arr, n, side) => arr.find(m => m.name === n && m.side === side);
const jGoal = { itemClass: "Amulet", baseName: jb.name, baseTags: jb.tags, itemLevel: 82, rarity: "Rare",
  mods: [ jm(jc.prefixes, "#% increased Rarity of Items found", "prefix"),
          jm(jc.suffixes, "+#% to Fire Resistance", "suffix"),
          jm(jc.prefixes, "+# to maximum Energy Shield", "prefix") ] };
const jPlan = planner.planRoutes(jGoal, DB);
ok(jPlan.notes.some(t => /Catalysts \(jewellery\)/.test(t) && /Catalysing Exaltation/.test(t)),
   "jewellery goal surfaces a catalyst-biasing note");
ok(jPlan.notes.some(t => /Catalysts/.test(t) && /Carapace/.test(t)),
   "catalyst note names the right catalyst (Carapace for ES)");
ok(jPlan.notes.some(t => /Base implicits/.test(t) && /Gold Amulet/.test(t)),
   "implicit shortcut surfaced: Rarity is a Gold Amulet implicit");
ok(jPlan.routes.some(r => r.steps.some(s => /Catalysing Exaltation/.test(s.detail || ""))),
   "a route's exalt step wires in the catalyst + Catalysing Exaltation");
ok(jPlan.notes.some(t => /Essence of the Breach/.test(t) && /max quality/i.test(t)),
   "quality-cap note names the data-backed +max-quality essence (separate from the bias)");
const scPlan = planner.planRoutes({ itemClass: "Sceptre", baseName: "Sceptre", baseTags: ["Sceptre"], itemLevel: 82, rarity: "Rare",
  mods: [ DB.classes.Sceptre.suffixes.find(m => /Level of all Minion/.test(m.name)),
          DB.classes.Sceptre.prefixes.find(m => /increased Spirit/.test(m.name)) ] }, DB);
ok(!scPlan.notes.some(t => /Catalysts \(jewellery\)/.test(t)), "no catalyst note on non-jewellery (sceptre)");

console.log("\n" + (fails ? `FAILED: ${fails} assertion(s)` : "ALL PASSED"));
process.exit(fails ? 1 : 0);
