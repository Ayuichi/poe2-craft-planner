/* QA20 — 20 diverse goal items run through the planner, scored on DETERMINISM:
 * for every wanted stat, how does the recommended route place it?
 *   secured = BOUGHT (carry) | ESSENCE | DESECRATE | CHAOS-SET (bounded retries)
 *   gamble  = EXALT/REGAL/TRANSMUTE slam (which mod is random)
 * Plus: tier-honesty (does a secured wish hit a usable value?), and idle-crafted-slot
 * detection (a gambled mod that an essence COULD have guaranteed while the crafted slot sat empty).
 * Run: node qa20.js          (or `node qa20.js 7` for a single run, `node qa20.js sum` for the scorecard only)
 */
const ROOT = require("path").join(__dirname, "..");
const path = require("path");
global.window = {};
require(path.join(ROOT, "app", "poe2_data.js"));
const DB = global.window.POE2;
const planner = require(path.join(ROOT, "app", "planner.js"));

// ---- goal construction from REAL data (mirrors pipeline/qa_runs.js) ----
function eligible(itemClass, ilvl, baseName) {
  const c = DB.classes[itemClass];
  if (!c) throw new Error("no class " + itemClass);
  const base = baseName ? c.bases.find(b => b.name === baseName) : c.bases[c.bases.length - 1];
  if (!base) throw new Error("no base " + baseName + " in " + itemClass);
  const pool = c.prefixes.concat(c.suffixes)
    .filter(m => m.ilvl <= ilvl && m.tags.includes(base.name) && !m.essence_only);
  return { base, pool, c };
}
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
  const mods = []; const used = new Set();
  for (const sp of specs) {
    const m = pick(pool.filter(x => !mods.includes(x) && !(x.group || []).some(g => used.has(g))), sp.re, sp);
    if (m) { mods.push(m); (m.group || []).forEach(g => used.add(g)); }
    else console.error(`  !! could not find mod for ${sp.re} (${itemClass})`);
  }
  return { itemClass, baseName: base.name, baseTags: base.tags, itemLevel: ilvl, rarity: "Rare", mods };
}
function desecGoal(itemClass, ilvl, specs, exclRe, exclSide) {
  const { base, pool, c } = eligible(itemClass, ilvl);
  const ex = (c.desecrated || []).find(d => exclRe.test(d.text) && (!exclSide || d.side === exclSide) && (d.tags || []).includes(base.name));
  const g = goal(itemClass, ilvl, specs);
  if (ex) g.mods.unshift(Object.assign({}, ex, { mustHave: true }));
  return g;
}

// ---- 20 runs ----
const RUNS = [
  { t: "1. Ring — Life* + Cold Res* + Mana~ (bread & butter)",
    g: () => goal("Ring", 82, [
      { re: /maximum Life/i, side: "prefix", mustHave: true },
      { re: /to Cold Resistance/i, side: "suffix", mustHave: true },
      { re: /maximum Mana/i, side: "prefix" }]) },

  { t: "2. Ring — Life* + Cold Res* + Lightning Res* + Chaos Res~ (triple res)",
    g: () => goal("Ring", 82, [
      { re: /maximum Life/i, side: "prefix", mustHave: true },
      { re: /to Cold Resistance/i, side: "suffix", mustHave: true },
      { re: /to Lightning Resistance/i, side: "suffix", mustHave: true },
      { re: /to Chaos Resistance/i, side: "suffix" }]) },

  { t: "3. Amulet — Spirit*(pre) + Crit~ + Melee~ (only Spirit must -> should NOT fracture)",
    g: () => goal("Amulet", 82, [
      { re: /to Spirit$/i, side: "prefix", mustHave: true },
      { re: /increased Critical Hit Chance/i, side: "suffix" },
      { re: /Level of all Melee Skills/i, side: "suffix" }]) },

  { t: "4. Amulet — Spirit* + Crit* + Melee* (all must; 2 hard suffixes -> fracture?)",
    g: () => goal("Amulet", 82, [
      { re: /to Spirit$/i, side: "prefix", mustHave: true },
      { re: /increased Critical Hit Chance/i, side: "suffix", mustHave: true },
      { re: /Level of all Melee Skills/i, side: "suffix", mustHave: true }]) },

  { t: "5. Boots — Movement Speed T1*(flat) + Life* + Cold Res~ (MS essence shortfall)",
    g: () => goal("Boots", 82, [
      { re: /Movement Speed/i, topTier: true, mustHave: true },
      { re: /maximum Life/i, side: "prefix", mustHave: true },
      { re: /to Cold Resistance/i, side: "suffix" }]) },

  { t: "6. Boots — Movement Speed T1* + Life~ + Cold Res~ + Chaos Res~ (MS must, rest wishes)",
    g: () => goal("Boots", 82, [
      { re: /Movement Speed/i, topTier: true, mustHave: true },
      { re: /maximum Life/i, side: "prefix" },
      { re: /to Cold Resistance/i, side: "suffix" },
      { re: /to Chaos Resistance/i, side: "suffix" }]) },

  { t: "7. Sceptre — +Minion Skills* + increased Spirit* + Minion Life~",
    g: () => goal("Sceptre", 82, [
      { re: /Level of all Minion Skills/i, side: "suffix", mustHave: true },
      { re: /increased Spirit/i, side: "prefix", mustHave: true },
      { re: /Minions have .*increased maximum Life/i, side: "suffix" }]) },

  { t: "8. Body Armour — Life* + Spirit*(pre) + Fire Res~ (2 prefixes)",
    g: () => goal("Body Armour", 82, [
      { re: /maximum Life/i, side: "prefix", mustHave: true },
      { re: /to Spirit$/i, side: "prefix", mustHave: true },
      { re: /to Fire Resistance/i, side: "suffix" }]) },

  { t: "9. Belt — Life* + Fire Res* + Cold Res~ (jewellery: catalyst note)",
    g: () => goal("Belt", 82, [
      { re: /maximum Life/i, side: "prefix", mustHave: true },
      { re: /to Fire Resistance/i, side: "suffix", mustHave: true },
      { re: /to Cold Resistance/i, side: "suffix" }]) },

  { t: "10. Gloves — Attack Speed*(suf) + Life*(pre) + Lightning Res~(suf)",
    g: () => goal("Gloves", 82, [
      { re: /increased Attack Speed/i, side: "suffix", mustHave: true },
      { re: /maximum Life/i, side: "prefix", mustHave: true },
      { re: /to Lightning Resistance/i, side: "suffix" }]) },

  { t: "11. Wand — +Spell Skills*(suf) + Spell Damage*(pre) + Cast Speed~(suf)",
    g: () => goal("Wand", 82, [
      { re: /Level of all Spell Skills/i, side: "suffix", mustHave: true },
      { re: /increased Spell Damage$/i, side: "prefix", mustHave: true },
      { re: /increased Cast Speed/i, side: "suffix" }]) },

  { t: "12. Wand — Spell Damage*(pre) + Cold Damage*(pre) + Cast Speed~(suf) (2 hard prefixes?)",
    g: () => goal("Wand", 82, [
      { re: /increased Spell Damage$/i, side: "prefix", mustHave: true },
      { re: /increased Cold Damage/i, side: "prefix", mustHave: true },
      { re: /increased Cast Speed/i, side: "suffix" }]) },

  { t: "13. Quiver — Attack Speed* + Proj Skills* + Crit for Attacks~",
    g: () => goal("Quiver", 82, [
      { re: /increased Attack Speed/i, side: "suffix", mustHave: true },
      { re: /Level of all Projectile Skills/i, side: "suffix", mustHave: true },
      { re: /Critical Hit Chance for Attacks/i, side: "suffix" }]) },

  { t: "14. Helmet — Life* + Crit*(suf) + Fire Res~",
    g: () => goal("Helmet", 82, [
      { re: /maximum Life/i, side: "prefix", mustHave: true },
      { re: /increased Critical Hit Chance/i, side: "suffix", mustHave: true },
      { re: /to Fire Resistance/i, side: "suffix" }]) },

  { t: "15. Amulet — desecrate-EXCLUSIVE* + Life* + Fire Res~ (desecration mandatory)",
    g: () => desecGoal("Amulet", 82, [
      { re: /maximum Life/i, side: "prefix", mustHave: true },
      { re: /to Fire Resistance/i, side: "suffix" }], /./, null) },

  { t: "16. Ring — Cold Res* + Fire Res* + Rarity~(pre) + Lightning Res~ (rarity not catalyst-able)",
    g: () => goal("Ring", 82, [
      { re: /to Cold Resistance/i, side: "suffix", mustHave: true },
      { re: /to Fire Resistance/i, side: "suffix", mustHave: true },
      { re: /increased Rarity of Items found/i, side: "prefix" },
      { re: /to Lightning Resistance/i, side: "suffix" }]) },

  { t: "17. Body Armour — Life* + Armour/ES hybrid*(pre) + Chaos Res~ (2 prefixes)",
    g: () => goal("Body Armour", 82, [
      { re: /maximum Life/i, side: "prefix", mustHave: true },
      { re: /increased Armour and Energy Shield$/i, side: "prefix", mustHave: true },
      { re: /to Chaos Resistance/i, side: "suffix" }]) },

  { t: "18. Sceptre — +Minion Skills* + Minion Crit~ + Allies Cast Speed~ + Mana~",
    g: () => goal("Sceptre", 82, [
      { re: /Level of all Minion Skills/i, side: "suffix", mustHave: true },
      { re: /Allies in your Presence have .*increased Critical Hit Chance/i, side: "suffix" },
      { re: /Allies in your Presence have .*increased Cast Speed/i, side: "suffix" },
      { re: /maximum Mana/i, side: "prefix" }]) },

  { t: "19. Amulet — Spirit*(pre) + all Ele Res~ + Cast Speed~ (wishes essence-able lower tier?)",
    g: () => goal("Amulet", 82, [
      { re: /to Spirit$/i, side: "prefix", mustHave: true },
      { re: /to all Elemental Resistances/i, side: "suffix" },
      { re: /increased Cast Speed/i, side: "suffix" }]) },

  { t: "20. Gloves — flat Phys*(pre) + Attack Speed*(suf) + Life~(pre) + Cold Res~(suf)",
    g: () => goal("Gloves", 82, [
      { re: /Physical Damage to Attacks/i, side: "prefix", mustHave: true },
      { re: /increased Attack Speed/i, side: "suffix", mustHave: true },
      { re: /maximum Life/i, side: "prefix" },
      { re: /to Cold Resistance/i, side: "suffix" }]) },
];

// ---- determinism scorer ----
function familyText(text) {
  return (text || "")
    .replace(/\(\s*-?\d+(?:\.\d+)?\s*-\s*-?\d+(?:\.\d+)?\s*\)/g, "#")
    .replace(/-?\d+(?:\.\d+)?/g, "#");
}
function classifyMethod(step) {
  const a = step.action || "";
  if (/^Buy a base/.test(a) || /Acquire a cheap Rare carrying/.test(a)) return "BOUGHT";
  if (/^Desecrate/.test(a)) return "DESECRATE";
  if (/^Chaos-target/.test(a)) return "CHAOS-SET";
  if (/^Fracturing Orb/.test(a)) return "FRACTURE";
  if (/Essence/.test(a)) return "ESSENCE";              // essence-name action
  if (/^Exalted Orb|^Orb of Transmutation|^Orb of Augmentation|^Regal Orb|^Orb of Alchemy|^Chaos Orb/.test(a)) return "EXALT/SLAM";
  return "OTHER";
}
const SECURED = new Set(["BOUGHT", "ESSENCE", "DESECRATE", "CHAOS-SET"]);

function placeOf(route, gm) {
  const key = familyText(gm.text);
  for (const s of route.steps) {
    for (const sm of s.state.mods) {
      if ((sm.kind === "anchor" || sm.kind === "target") &&
          sm.side === gm.side && familyText(sm.text) === key) {
        return { method: classifyMethod(s), determ: s.determinism, action: s.action, kind: sm.kind };
      }
    }
  }
  return null;
}
function maxNum(t){ const ns=(t||"").match(/-?\d+(?:\.\d+)?/g); return ns?Math.max(...ns.map(Number)):null; }

function scoreRun(g) {
  const plan = planner.planRoutes(g, DB);
  const rec = plan.routes.find(r => r.recommended);
  const rows = [];
  let mustTot=0, mustSec=0, wishTot=0, wishSec=0, gambleSlams=0;
  const essenceSlotUsed = rec ? rec.steps.some(s => classifyMethod(s) === "ESSENCE") : false;
  const missedEssence = [];
  for (const gm of g.mods) {
    const must = !!gm.mustHave;
    if (must) mustTot++; else wishTot++;
    const p = rec ? placeOf(rec, gm) : null;
    const method = p ? p.method : "UNPLACED";
    const secured = p ? SECURED.has(method) : false;
    if (secured) { if (must) mustSec++; else wishSec++; }
    let slams = null;
    if (!secured && p) { slams = expSlams(gm, g); gambleSlams += slams || 0; }
    let essAvail = null;
    const e = planner.essenceFor ? planner.essenceFor(Object.assign({}, gm, { mustHave:false }), g.itemClass, DB) : null;
    if (e && e.mode === "magic_to_rare") essAvail = `${e.best.name} -> "${e.grantMod}"`;
    if (!secured && essAvail && !essenceSlotUsed) missedEssence.push(`${gm.text} (could: ${essAvail})`);
    rows.push({ side: gm.side, text: gm.text, must, method, determ: p?p.determ:"-", secured, slams, essAvail });
  }
  return { plan, rec, rows, mustTot, mustSec, wishTot, wishSec, gambleSlams, essenceSlotUsed, missedEssence };
}
function expSlams(gm, g){
  const c = DB.classes[g.itemClass]; if(!c) return null;
  const reqIlvl = Math.max(1, ...g.mods.map(m=>m.ilvl||1));
  const elig = c.prefixes.concat(c.suffixes).filter(m=>m.ilvl<=reqIlvl && m.tags.some(t=>g.baseTags.includes(t)) && !m.essence_only);
  const wt = m => { const lad=m.bw&&m.bw[g.baseName]; if(!lad) return 0; let w=0; for(const t of lad) if(t[0]<=reqIlvl&&t[1]>w) w=t[1]; return w; };
  const tw = wt(gm); if(!tw) return null;
  let pw=0; for(const m of elig){ if(m.side!==gm.side) continue; pw+=wt(m); }
  return pw>0 ? Math.max(1, Math.round(pw/tw)) : null;
}

// ---- run ----
const arg = process.argv[2];
const sumOnly = arg === "sum";
const only = (arg && arg !== "sum") ? Number(arg) : null;
let TM=0,TMS=0,TW=0,TWS=0; const flags=[];

for (let i=0;i<RUNS.length;i++){
  const run = RUNS[i];
  if (only && i+1 !== only) continue;
  const g = run.g();
  const r = scoreRun(g);
  TM+=r.mustTot; TMS+=r.mustSec; TW+=r.wishTot; TWS+=r.wishSec;
  if (r.missedEssence.length) flags.push(`Run ${i+1}: idle crafted slot — ${r.missedEssence.join("; ")}`);
  if (r.mustSec < r.mustTot) {
    const gambledMust = r.rows.filter(x=>x.must && !x.secured).map(x=>`${x.text} [${x.method}, ~${x.slams} slams]`);
    flags.push(`Run ${i+1}: ${r.mustTot-r.mustSec}/${r.mustTot} must-have(s) GAMBLED — ${gambledMust.join("; ")}`);
  }
  if (sumOnly) continue;
  console.log("\n"+"=".repeat(96));
  console.log(run.t);
  console.log("base="+g.baseName+" ilvl"+g.itemLevel+" | recommended: "+(r.rec?r.rec.name:"NONE")+" (effort "+(r.rec?r.rec.effort:"-")+")"+(r.rec&&r.rec.warning?"  WARN":""));
  console.log("routes: "+r.plan.routes.map(x=>`${x.recommended?"*":""}${x.name}(${x.effort})`).join("  |  "));
  console.log(`  MUST secured ${r.mustSec}/${r.mustTot} | WISH secured ${r.wishSec}/${r.wishTot} | est. gamble slams ${r.gambleSlams}`);
  for (const x of r.rows){
    const tag = x.secured ? "OK secured" : "XX gamble ";
    console.log(`   ${x.must?"*":"~"} [${x.side.padEnd(6)}] ${tag} ${x.method.padEnd(11)} ${x.slams?("~"+x.slams+"sl ").padStart(7):"       "} ${x.text}${x.essAvail&&!x.secured?"   (essence avail: "+x.essAvail+")":""}`);
  }
  if (r.missedEssence.length) console.log("   !! IDLE CRAFTED SLOT: "+r.missedEssence.join("; "));
}

console.log("\n"+"#".repeat(96));
console.log(`TOTALS across ${only?1:RUNS.length} run(s):  MUST-HAVES secured ${TMS}/${TM} (${(100*TMS/TM).toFixed(0)}%)   WISHES secured ${TWS}/${TW} (${TW?(100*TWS/TW).toFixed(0):0}%)`);
console.log("#".repeat(96));
if (flags.length){ console.log("\nFLAGS:"); flags.forEach(f=>console.log("  • "+f)); }
else console.log("\nNo flags: every must-have secured deterministically.");
