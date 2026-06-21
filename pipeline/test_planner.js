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

const ess = plan.routes.find(r => /Essence anchor/.test(r.name));
ok(!!ess, "essence-anchor route present (life/mana/res are anchorable)");
if (ess) ok(ess.steps.some(s => s.determinism === "deterministic" && /GUARANTEES/.test(s.detail)), "  essence step is deterministic + guarantees the anchor");

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
// Normal lock-in: desecration offered as an OPTION (not mandatory) for a hard normal mod.
const ar = DB.classes["Amulet"];
const ab2 = ar.bases[0];
const byW = m => { const l = m.bw[ab2.name]; return l ? Math.max(...l.map(x => x[1])) : 0; };
const normAll = ar.prefixes.concat(ar.suffixes).filter(m => m.tags.includes(ab2.name) && m.ilvl <= 82 && byW(m) > 0);
const hardN = normAll.slice().sort((a, b) => byW(a) - byW(b))[0];
const oth = normAll.filter(m => m !== hardN && m.side !== hardN.side).slice(0, 2);
const nGoal = { itemClass: "Amulet", baseName: ab2.name, baseTags: ab2.tags, itemLevel: 82, rarity: "Rare", mods: [hardN, ...oth] };
const nPlan = planner.planRoutes(nGoal, DB);
ok(nPlan.routes.some(r => /Desecration/.test(r.name)), "normal goal: desecration offered as a lock-in OPTION");
ok(nPlan.routes.some(r => !/Desecration/.test(r.name)), "normal goal: slam routes still present (desecration not mandatory)");
const ndr = nPlan.routes.find(r => /Desecration/.test(r.name));
ok(/deterministic|swappable|Place/i.test(ndr.tagline), "lock-in route framed as deterministic placement (not false protection): " + ndr.tagline.slice(0, 50));

// Fracture: protection route with HONEST brick risk for a very hard mod.
const fr_c = DB.classes["Amulet"]; const fr_b = fr_c.bases[0];
const fr_byW = m => { const l = m.bw[fr_b.name]; return l ? Math.max(...l.map(x => x[1])) : 0; };
const fr_norm = fr_c.prefixes.concat(fr_c.suffixes).filter(m => m.tags.includes(fr_b.name) && m.ilvl <= 82 && fr_byW(m) > 0);
const fr_hard = fr_norm.slice().sort((a, b) => fr_byW(a) - fr_byW(b))[0];
const fr_other = fr_norm.find(m => m.side !== fr_hard.side);
const frGoal = { itemClass: "Amulet", baseName: fr_b.name, baseTags: fr_b.tags, itemLevel: 82, rarity: "Rare", mods: [fr_hard, fr_other] };
const frPlan = planner.planRoutes(frGoal, DB);
const frRoute = frPlan.routes.find(r => /Fracture/.test(r.name));
ok(!!frRoute, "fracture route offered for a very hard mod");
ok(!!frRoute.warning && /brick/i.test(frRoute.warning), "fracture route carries an explicit BRICK warning");
const frStep = frRoute.steps.find(s => /Fracturing/.test(s.action));
ok(frStep && frStep.determinism === "gamble", "the fracture step is a GAMBLE (not deterministic — honest about brick risk)");
ok(/random/i.test(frStep.detail) && /1 in/i.test(frStep.detail), "fracture step explains it locks a RANDOM mod with odds");
ok(/desecrate/i.test(frStep.detail), "fracture step teaches the desecrate-to-improve-odds trick");

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

console.log("\n" + (fails ? `FAILED: ${fails} assertion(s)` : "ALL PASSED"));
process.exit(fails ? 1 : 0);
