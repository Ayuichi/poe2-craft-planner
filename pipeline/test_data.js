/* Stage 4 data sanity test. Run: node pipeline/test_data.js
 * Asserts the catalyst + implicit data is present, well-shaped, and that the
 * catalyst tag-matching model agrees with how the video craft actually works
 * (resistances/ES/melee ARE catalyst-boostable; rarity + crit are NOT). */
const path = require("path");
global.window = {};
require(path.join(__dirname, "..", "app", "poe2_data.js"));
const D = global.window.POE2;

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("  ✗ " + m); fails++; } else console.log("  ✓ " + m); };
const cat = name => D.catalysts.find(c => c.name === name);
const amuMod = needle => D.classes.Amulet.prefixes.concat(D.classes.Amulet.suffixes)
  .find(m => m.name.toLowerCase().includes(needle.toLowerCase()));
const boosts = (c, mod) => c.tags.some(t => (mod.mtags || []).includes(t));

console.log("\n== Catalysts ==");
ok(Array.isArray(D.catalysts) && D.catalysts.length === 13, `13 catalysts present (${D.catalysts && D.catalysts.length})`);
ok(D.catalysts.every(c => c.id && c.name && Array.isArray(c.tags)), "every catalyst has id/name/tags[]");
ok(D.catalysts.every(c => c.tags.length > 0), "every catalyst resolved to >=1 mod tag");
ok(cat("Carapace").tags.includes("Defences"), "Carapace -> Defences");
ok(cat("Reaver").tags.includes("Attack"), "Reaver -> Attack");
ok(cat("Xoph's").tags.includes("Fire"), "Xoph's -> Fire");

console.log("\n== Catalyst matching agrees with the craft method ==");
ok(boosts(cat("Carapace"), amuMod("maximum Energy Shield")), "Carapace boosts +max ES (Defences mod)");
ok(boosts(cat("Reaver"), amuMod("Level of all Melee")), "Reaver boosts +Level of all Melee (Attack mod)");
ok(boosts(cat("Xoph's"), amuMod("Fire Resistance")), "Xoph's boosts Fire Resistance (carries the Fire tag)");
const rarity = amuMod("Rarity of Items");
const crit = amuMod("Critical Hit Chance");
ok(!D.catalysts.some(c => boosts(c, rarity)), "NO catalyst boosts Rarity (tag Drop) — must be essence'd, per the craft");
ok(!D.catalysts.some(c => boosts(c, crit)), "NO catalyst boosts Crit Hit Chance (tag Critical) — fracture/chaos-target only");

console.log("\n== Base implicits ==");
ok(D.implicits && typeof D.implicits === "object", "implicits map present");
ok(Object.keys(D.implicits).length >= 20, `implicits cover many classes (${Object.keys(D.implicits).length})`);
const gold = D.implicits.Amulet.find(b => b.name === "Gold Amulet");
const solar = D.implicits.Amulet.find(b => b.name === "Solar Amulet");
ok(gold && /Rarity/.test(gold.implicits[0]), "Gold Amulet implicit = increased Rarity");
ok(solar && /Spirit/.test(solar.implicits[0]), "Solar Amulet implicit = +Spirit");
ok(D.implicits.Amulet.some(b => /Prefix Modifier/.test(b.implicits.join(" "))),
   "modifier-slot implicit bases captured (e.g. +/-1 prefix bases for open-slot starts)");

console.log("\n" + (fails ? `FAILED: ${fails}` : "ALL PASSED"));
process.exit(fails ? 1 : 0);
