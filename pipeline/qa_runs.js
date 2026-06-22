/* Q&A harness: build 10 realistic "wish items", run the planner, and dump the
 * recommended route (full detail) + every route's effort + the advisory notes.
 * For manual review against poe2-crafting-reference.md:
 *   - does the output fit established 0.5 systems?
 *   - does it create as many stats DETERMINISTICALLY as possible?
 *   - is any currency / omen wasted where it needn't be?
 * Run: node pipeline/qa_runs.js   (add a run number to print only that one)
 */
const path = require("path");
global.window = {};
require(path.join(__dirname, "..", "app", "poe2_data.js"));
const DB = global.window.POE2;
const planner = require(path.join(__dirname, "..", "app", "planner.js"));

// --- goal construction from REAL data --------------------------------------
function eligible(itemClass, ilvl, baseName) {
  const c = DB.classes[itemClass];
  if (!c) throw new Error("no class " + itemClass);
  const base = baseName ? c.bases.find(b => b.name === baseName) : c.bases[c.bases.length - 1];
  if (!base) throw new Error("no base " + baseName + " in " + itemClass);
  const pool = c.prefixes.concat(c.suffixes)
    .filter(m => m.ilvl <= ilvl && m.tags.includes(base.name) && !m.essence_only);
  return { base, pool, c };
}
// pick a mod by regex (+ optional side); topTier=true grabs the highest-ilvl tier text.
function pick(pool, re, { side, topTier, mustHave } = {}) {
  const cands = pool.filter(m => re.test(m.text) && (!side || m.side === side));
  if (!cands.length) return null;
  const m = cands[0];
  let text = m.text, ilvl = m.ilvl;
  if (topTier && m.bw) {
    const lad = Object.values(m.bw)[0];
    if (lad && lad.length) { const t = lad[lad.length - 1]; text = t[2]; ilvl = t[0]; }
  }
  return Object.assign({}, m, { text, ilvl }, mustHave ? { mustHave: true } : {});
}
function goal(itemClass, ilvl, specs, baseName) {
  const { base, pool } = eligible(itemClass, ilvl, baseName);
  const mods = [];
  const used = new Set();
  for (const sp of specs) {
    const m = pick(pool.filter(x => !mods.includes(x) && !(x.group || []).some(g => used.has(g))), sp.re, sp);
    if (m) { mods.push(m); (m.group || []).forEach(g => used.add(g)); }
    else console.error(`  !! could not find mod for ${sp.re} (${itemClass})`);
  }
  return { itemClass, baseName: base.name, baseTags: base.tags, itemLevel: ilvl, rarity: "Rare", mods };
}
// desecrated-exclusive mod helper
function desecGoal(itemClass, ilvl, specs, exclRe, exclSide) {
  const { base, pool, c } = eligible(itemClass, ilvl);
  const ex = (c.desecrated || []).find(d => exclRe.test(d.text) && (!exclSide || d.side === exclSide) && (d.tags || []).includes(base.name));
  const g = goal(itemClass, ilvl, specs);
  if (ex) g.mods.unshift(Object.assign({}, ex));
  return g;
}

// --- 10 wish items ----------------------------------------------------------
const RUNS = [
  { title: "1. Ring — Life + Cold Res + Mana (bread-and-butter rare)",
    goal: () => goal("Ring", 82, [
      { re: /maximum Life/i, side: "prefix" },
      { re: /to Cold Resistance/i, side: "suffix" },
      { re: /maximum Mana/i, side: "prefix" }]) },

  { title: "2. Amulet — +Spirit (pre) + Crit (suf) + Melee skills (suf)  [unflagged: 2 hard suffixes]",
    goal: () => goal("Amulet", 82, [
      { re: /to Spirit$/i, side: "prefix" },
      { re: /Critical Hit Chance/i, side: "suffix" },
      { re: /Level of all Melee Skills/i, side: "suffix" }]) },

  { title: "3. Amulet — same goal but ONLY Spirit flagged must-have (should drop fracture)",
    goal: () => goal("Amulet", 82, [
      { re: /to Spirit$/i, side: "prefix", mustHave: true },
      { re: /Critical Hit Chance/i, side: "suffix" },
      { re: /Level of all Melee Skills/i, side: "suffix" }]) },

  { title: "4. Boots — T1 Movement Speed (must-have, flat) + Life + Cold Res",
    goal: () => goal("Boots", 82, [
      { re: /Movement Speed/i, topTier: true, mustHave: true },
      { re: /maximum Life/i, side: "prefix" },
      { re: /to Cold Resistance/i, side: "suffix" }]) },

  { title: "5. Sceptre — +Level of all Minion Skills + increased Spirit (essence-anchorable carry)",
    goal: () => goal("Sceptre", 82, [
      { re: /Level of all Minion Skills/i },
      { re: /increased Spirit/i }]) },

  { title: "6. Body Armour — Life + max ES + Fire Res (defensive triple)",
    goal: () => goal("Body Armour", 82, [
      { re: /maximum Life/i, side: "prefix" },
      { re: /maximum Energy Shield$/i, side: "prefix" },
      { re: /to Fire Resistance/i, side: "suffix" }]) },

  { title: "7. Belt — Life + Fire Res + Cold Res (jewellery: catalyst note expected)",
    goal: () => goal("Belt", 82, [
      { re: /maximum Life/i, side: "prefix" },
      { re: /to Fire Resistance/i, side: "suffix" },
      { re: /to Cold Resistance/i, side: "suffix" }]) },

  { title: "8. Gloves — Attack Speed + Life + Lightning Res",
    goal: () => goal("Gloves", 82, [
      { re: /increased Attack Speed/i, side: "suffix" },
      { re: /maximum Life/i, side: "prefix" },
      { re: /to Lightning Resistance/i, side: "suffix" }]) },

  { title: "9. Quiver — single common suffix (1-mod goal: no 'rest' to build)",
    goal: () => { const { base, pool } = eligible("Quiver", 82);
      const m = pool.find(x => x.side === "suffix"); return { itemClass: "Quiver", baseName: base.name, baseTags: base.tags, itemLevel: 82, rarity: "Rare", mods: [Object.assign({}, m)] }; } },

  { title: "10. Amulet — desecrate-EXCLUSIVE mod + Life + Res (desecration mandatory)",
    goal: () => desecGoal("Amulet", 82, [
      { re: /maximum Life/i, side: "prefix" },
      { re: /to Fire Resistance/i, side: "suffix" }], /./, null) },
];

// --- run + dump -------------------------------------------------------------
function shortDet(d) { return d.length > 320 ? d.slice(0, 317) + "..." : d; }
const only = process.argv[2] ? Number(process.argv[2]) : null;

for (const run of RUNS) {
  if (only && RUNS.indexOf(run) + 1 !== only) continue;
  console.log("\n" + "=".repeat(92));
  console.log(run.title);
  console.log("=".repeat(92));
  const g = run.goal();
  console.log(`base: ${g.baseName} (ilvl ${g.itemLevel}) | mods:`);
  for (const m of g.mods)
    console.log(`   [${m.side}] ${m.text}  ${m.mustHave ? "★must" : "☆wish"}${m.src === "desecrated" ? " (DESEC-exclusive)" : ""}`);
  const plan = planner.planRoutes(g, DB);
  console.log(`\nreqIlvl=${plan.reqIlvl} | routes ranked by effort:`);
  for (const r of plan.routes)
    console.log(`   ${r.recommended ? "★" : " "} ${r.effort.toString().padStart(3)}  ${r.name}${r.warning ? "  ⚠" : ""}`);
  const rec = plan.routes.find(r => r.recommended);
  if (rec) {
    console.log(`\n--- RECOMMENDED: ${rec.name} (effort ${rec.effort}) ---`);
    console.log(`tagline: ${rec.tagline}`);
    if (rec.warning) console.log(`WARNING: ${rec.warning}`);
    rec.steps.forEach((s, i) => {
      const st = s.state;
      const pc = st.mods.filter(m => m.side === "prefix").length;
      const sf = st.mods.filter(m => m.side === "suffix").length;
      console.log(`  ${i + 1}. [${s.determinism}] ${s.action}  → ${st.rarity} (${pc}p/${sf}s)`);
      if (s.variants && s.variants.length) console.log(`       variants: ${s.variants.join(" | ")}`);
      console.log(`       ${shortDet(s.detail)}`);
    });
  }
  console.log(`\n--- NOTES (${plan.notes.length}) ---`);
  plan.notes.forEach((n, i) => console.log(`  (${i + 1}) ${shortDet(n)}`));
}
