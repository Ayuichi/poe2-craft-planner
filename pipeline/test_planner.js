/* Node smoke test for the Stage 3 planner. Run: node pipeline/test_planner.js
 * Loads the real browser dataset + planner, builds a realistic legal goal, and asserts
 * the routes are well-formed and legal under the 0.5 transition rules.
 */
const path = require("path");
global.window = {};
require(path.join(__dirname, "..", "app", "poe2_data.js")); // populates window.POE2
const DB = global.window.POE2;
const planner = require(path.join(__dirname, "..", "app", "planner.js"));

let fails = 0;
const ok = (cond, msg) => { if (!cond) { console.error("  ✗ " + msg); fails++; } else console.log("  ✓ " + msg); };

// --- Build a realistic goal: a Ring with life + a resistance + one more, at ilvl 82.
function pickGoal(itemClass, wants) {
  const c = DB.classes[itemClass];
  const base = c.bases[c.bases.length - 1]; // highest-level base in the class
  const pool = c.prefixes.concat(c.suffixes)
    .filter(m => m.ilvl <= 82 && m.tags.some(t => base.tags.includes(t)) && !m.essence_only);
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
  return { itemClass, baseName: base.name, baseTags: base.tags, itemLevel: 82, rarity: "Rare", mods };
}

console.log("\n== Goal: Ring, life + resistance + mana ==");
const goal = pickGoal("Ring", [
  { re: /maximum Life/i },
  { re: /Resistance/i },
  { re: /maximum Mana/i },
]);
console.log("  base:", goal.baseName, "| mods:", goal.mods.map(m => `${m.side[0].toUpperCase()}:${m.text}`).join(" | "));
ok(goal.mods.length >= 2, "constructed a multi-mod goal from real data");

const plan = planner.planRoutes(goal, DB);
ok(plan.routes.length >= 2, `generated ${plan.routes.length} routes`);
ok(plan.notes.length > 0, `generated ${plan.notes.length} advisory notes`);
ok(typeof plan.reqIlvl === "number", "computed required base ilvl = " + plan.reqIlvl);

// Essence route should exist because Life/Mana/Resistance are all anchorable.
const ess = plan.routes.find(r => /Essence anchor/.test(r.name));
ok(!!ess, "essence-anchor route present (life/mana/res are anchorable)");
if (ess) ok(ess.steps.some(s => s.determinism === "deterministic" && /GUARANTEES/.test(s.detail)), "  essence step is deterministic + guarantees the anchor");

// --- Transition legality: no state may exceed rarity caps; rarity only moves forward.
const CAP = { Normal: { p: 0, s: 0 }, Magic: { p: 1, s: 1 }, Rare: { p: 3, s: 3 } };
const RANK = { Normal: 0, Magic: 1, Rare: 2 };
for (const r of plan.routes) {
  console.log("\n== Route:", r.name, "==");
  ok(r.steps.length >= 3, `  ${r.steps.length} steps`);
  ok(!!r.tagline && !!r.best, "  has tagline + 'best for' blurb");

  let prevRank = -1;
  for (const s of r.steps) {
    const st = s.state;
    const p = st.mods.filter(m => m.side === "prefix").length;
    const sf = st.mods.filter(m => m.side === "suffix").length;
    const cap = CAP[st.rarity];
    ok(p <= cap.p && sf <= cap.s, `  [${st.rarity}] ${p}p/${sf}s within cap ${cap.p}p/${cap.s}s — "${s.action}"`);
    ok(["deterministic", "likely", "gamble"].includes(s.determinism), `  determinism flag valid: ${s.determinism}`);
    ok(RANK[st.rarity] >= prevRank, `  rarity never regresses (${st.rarity})`);
    prevRank = Math.max(prevRank, RANK[st.rarity]);
  }
  // final state should contain every target mod
  const finalTexts = r.steps[r.steps.length - 1].state.mods.map(m => m.text);
  const allPresent = goal.mods.every(m => finalTexts.includes(m.text));
  ok(allPresent, "  final state contains every target mod");
}

// --- A goal with NO anchorable mod should still produce the manual/alchemy routes.
console.log("\n== Goal with no essence anchor (Sceptre 'Allies' mods) ==");
const sceptre = DB.classes["Sceptre"];
const sbase = sceptre.bases[sceptre.bases.length - 1];
const odd = sceptre.prefixes.concat(sceptre.suffixes)
  .filter(m => m.ilvl <= 82 && m.tags.some(t => sbase.tags.includes(t)) && !planner.essenceFor(m))
  .slice(0, 2);
const goal2 = { itemClass: "Sceptre", baseName: sbase.name, baseTags: sbase.tags, itemLevel: 82, rarity: "Rare", mods: odd };
const plan2 = planner.planRoutes(goal2, DB);
ok(!plan2.routes.find(r => /Essence anchor/.test(r.name)), "no essence route when nothing is anchorable");
ok(plan2.routes.length >= 1, "still produces manual/alchemy routes (" + plan2.routes.map(r => r.name).join(", ") + ")");

console.log("\n" + (fails ? `FAILED: ${fails} assertion(s)` : "ALL PASSED"));
process.exit(fails ? 1 : 0);
