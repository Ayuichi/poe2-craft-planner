# PoE2 Crafting Knowledge Base — Patch 0.5 "Return of the Ancients"

> Foundation reference for the PoE2 Tools project. Compiled from the official 0.5.0
> patch notes (released 21 May 2026), the community "PoE2 Crafting Codex", and
> Maxroll's crafting overview. League **Runes of Aldur** went live **29 May 2026**.
>
> **Trust note:** patch-note facts and base mechanics are reliable. Exact magnitudes
> (roll ranges, alloy mod values, rune recipes) shift with live balance, so any tool
> that depends on precise numbers should pull from PoE2DB / the trade API rather than
> hard-coding values from this doc.

---

## 0. The two things that changed everything in 0.5

Two rule changes dominate how crafting works this patch, and any tool we build has to model them:

1. **One crafted modifier per item.** "All crafted modifiers are now guaranteed, but items can only have 1 crafted modifier at a time." An Essence craft, a Perfect Essence craft, a **Runic Alloy** mod, and certain Runic Ward enchants all compete for that *same single slot*. You pick exactly one route per piece.
2. **One desecrated modifier per item.** Desecrated mods no longer count as "crafted," so an item can hold **one crafted + one desecrated** simultaneously, but only one of each. This kills the old "6 desecrated mod" Omen of Putrefaction blowout (legacy items still work; Standard-only now).

Other notable shifts: Divine Orbs are more common; Greater Transmute/Augment are rarer (but now drop from Act 4 with a min mod level of 44); the **Recombinator is disabled** (Expedition is folded into Runes of Aldur for the league) and **Omen of Corruption / Omen of Recombination were removed**.

---

## 1. Item anatomy (the model everything builds on)

Every item is a **base** (item class, e.g. Rattling Sceptre) at an **item level (ilvl)**, with a **rarity** that gates modifier count, and modifiers split into **prefixes** and **suffixes**.

| Rarity | Mods |
|---|---|
| Normal (white) | 0 |
| Magic (blue) | up to 1 prefix + 1 suffix (2) |
| Rare (yellow) | up to 3 prefixes + 3 suffixes (6) |
| Unique (orange) | fixed pool |
| Fractured | one mod locked in place |
| Desecrated | hidden mod, revealed at Well of Souls |
| Corrupted | no further changes allowed |

Key facts:

- **No Orb of Scouring exists.** You cannot revert a Rare/Magic back to white. This makes good white/uncrafted bases valuable and makes crafting *additive* by design.
- **Prefix/suffix sides are independent.** Most "deterministic" crafting is really just *controlling which side an orb hits* (via Omens).
- **ilvl gates tiers.** T1 mods generally need ilvl 80+ (often 82), T2 ~75. Below a mod's min ilvl it can't appear at all. For endgame bases you usually want **ilvl 81–82**.
- **Mod tags are not shown in-game.** Look them up on PoE2DB. Tags matter because some currencies (Catalysing Exaltation, essence selection) bias toward shared tags.
- Sockets live on **gems**, not gear; gems are auto-linked. Gear sockets hold **Runes / Soul Cores** instead.

---

## 2. Currency index (the orb ladder)

Basic transforms:

| Orb | Effect |
|---|---|
| Scroll of Wisdom | Identify item |
| Orb of Transmutation | Normal → Magic (1 mod) |
| Orb of Augmentation | Add 1 mod to a Magic item |
| Regal Orb | Magic → Rare (+1 mod) |
| Orb of Alchemy | Normal → Rare (4 mods) |
| Exalted Orb | Add 1 random mod to a Rare |
| Orb of Annulment | Remove 1 random mod |
| Chaos Orb | Remove 1 random mod **and** add 1 random mod |
| Divine Orb | Reroll the numeric values of existing mods |
| Orb of Chance | Normal → random Unique (destroys item on fail without an omen) |
| Vaal Orb | Corrupt: random outcome, locks the item from further crafting |

**Tiered currency:** Lesser / Greater / Perfect variants guarantee a higher **minimum modifier
level** on the mod they add/roll. Confirmed values (poe2db / poe2wiki, 2026-06-22):

| Orb | Greater (min mod lvl) | Perfect (min mod lvl) |
|---|---|---|
| Transmute / Augment / Jeweller's | higher floor | higher floor |
| **Exalted Orb** | 35 | 50 |
| **Chaos Orb** | 35 | 50 |

So a Greater/Perfect **Exalted** Orb adds a random mod at min level 35/50, and a Greater/Perfect
**Chaos** Orb removes-and-adds at min level 35/50. The floor mechanic: the added mod is at least
that level, EXCEPT a mod type whose every tier is below the floor still rolls its highest available
tier (respecting ilvl), so nothing is excluded entirely. These are the videos' "perfect exalt /
greater chaos" tier-bias tools. Greater/Perfect are rarer in 0.5.

**Jeweller's Orbs** add sockets to *gems* (Lesser → 3rd socket, Greater → 4th, Perfect → 5th). In 0.5 they also add sockets to skills granted by items.

**Vaal/corruption outcomes:** add enchant, reroll up to 3 mods, add a socket past the limit, or nothing. Corruption is a finishing step.

**Architect's Orb** (confirmed 2026-06-22): corrupts an ALREADY-corrupted item into Twice-Corrupted.
50% adds an additional corruption enchantment, 50% destroys the item (no other mod outcomes). From
the Tier-3 Corruption Chamber / Royal Trove in Atziri's Temple. High-risk gamble on finished items.

**Vaal Blacksmith's Infuser** (confirmed 2026-06-22): pushes a Martial/Caster weapon or Armour's
quality **above 20%, up to 30%**. Each use always adds 1–2% quality, then a weighted chance to
corrupt that scales with quality (~10% at 22% → ~45% at 29%); safe at 20–21% (one free use). The
corruption only ever adds quality (it cannot reroll mods like a Vaal Orb), but once it corrupts, the
item is locked. This is the weapon/armour lever for the P13 quality breakpoints (the jewellery lever
is catalysts + Essence of the Breach's +20% max quality).

**Disenchant / salvage:** Magic items disenchant into Transmute shards, Rares into Regal shards; quality items salvage into Armourer's Scraps / Blacksmith's Whetstones; socketed items salvage into Artificer's Orbs.

---

## 3. Essences (guaranteed single mods)

Four tiers: **Lesser → Normal → Greater → Perfect.**

| Tier | Acts on | Effect |
|---|---|---|
| Lesser | Magic | → Rare, 1 guaranteed low-tier mod (leveling) |
| Normal | Magic | → Rare, 1 guaranteed mid-tier mod |
| Greater | Magic | → Rare, 1 guaranteed higher-tier mod (endgame workhorse) |
| Perfect | Rare | Removes 1 random mod, adds 1 specific powerful mod |

- Drop from **imprisoned essence monsters** (click monolith 3×, kill). Tradeable via Currency Exchange. **Silent Cave** is a dedicated essence-farm map.
- **Remnant of Corruption** on the monolith can upgrade tier, change type, or roll a corrupted essence: **Hysteria, Delirium, Insanity, Horror**.
- Named essences map to mod families: of the Body (life), of the Mind (mana), of Enhancement (def %), of Flames/Ice/Electricity (elemental dmg), of Abrasion (flat phys), of Sorcery (spell), of Haste/Alacrity (atk/cast speed), of Battle (+attack skill levels), of Seeking (crit), of the Infinite (attributes), of Ruin/Insulation/Thawing/Grounding (resists), of Opulence (rarity), etc.
- **0.5:** more campaign essences overall but far fewer "of the Infinite"; Perfect Essence of Battle nerfed (+3/+2, was +5/+3); Essence of Hysteria ES recharge on Foci now 20–23%.
- Special: **Essence of the Abyss** removes a mod and imprints a *Mark of the Abyssal Lord* meta-mod (synergy with desecration).

Remember: an essence craft consumes the item's **one crafted-mod slot**.

---

## 4. Omens (meta-modifiers — the precision layer)

Omens are right-click **activated** in inventory, then modify the *next* compatible currency use. Multiple compatible omens stack. Mostly from Ritual.

**Side-targeting** (Sinistral = prefix, Dextral = suffix):

| Omen | Pairs with | Effect |
|---|---|---|
| Sinistral/Dextral Exaltation | Exalted | Add only a prefix / suffix |
| Sinistral/Dextral Annulment | Annul | Remove only a prefix / suffix |
| Sinistral/Dextral Erasure | Chaos | Remove only a prefix / suffix |
| Sinistral/Dextral Coronation | Regal | Add only a prefix / suffix |
| Sinistral/Dextral Crystallisation | Perfect Essence | Remove only a prefix / suffix before adding the guaranteed mod |
| Sinistral/Dextral Necromancy | Abyssal Bone | Desecrate only a prefix / suffix |
| Sinistral/Dextral Alchemy | Alchemy | Add max prefixes / suffixes |

**Quantity:** Greater Exaltation (Exalt adds 2 mods), Greater Annulment (Annul removes 2).

**Mod-pool heavy hitters:**
- **Omen of Whittling** (Chaos): replaces the mod with the *lowest ilvl requirement*. The T1/T1/T1/garbage cleanup tool. T11+ only.
- **Omen of Sanctification** (Divine): "Sanctifies" instead of rerolling — multiplies each mod value ×78–122%, then locks the item. Finishing step.
- **Omen of the Blessed** (Divine): only rerolls implicit mods.
- **Omen of Catalysing Exaltation** (Exalt, jewellery): biases the slam toward mods sharing the applied catalyst's tag.
- **Omen of Chance** (Chance): item is *not destroyed* on fail.
- **Omen of the Ancients** (Chance): *guarantees* a Unique of the same item class.

**Abyss/desecration omens:**
- **Omen of Abyssal Echoes**: reroll the 3 offered desecrate options once.
- **Omen of Light** (Annul): removes only the *desecrated* mod (the "redo my desecrate" tool).
- **Lich-pool omens** (force the next desecration into one lich's pool; verified poe2db 2026-06-22):
  Omen of the **Blackblooded → Kurgal**, Omen of the **Liege → Amanamu**, Omen of the **Sovereign →
  Ulaman**. (The video's garbled "Omen of the Leech" = **Omen of the Liege**: it forces an *Amanamu*
  ("namu") modifier, which matches.) Each drops only from a rare Abyssal monster carrying that lich's
  Lichborn modifier. Pair with Sinistral/Dextral Necromancy to also fix the side.
- **Omen of Putrefaction**: legacy 6-desecrate effect — neutered by the 0.5 one-desecrated cap; treat as Standard-only.

**0.5 notes:** Omen of Corruption removed. Chaotic Rarity/Quantity/Monsters omens were *inverted* (now *prevent* a mod type rather than guarantee it; up to 3 stack). New Omen of Chaotic Effectiveness (Waystones).

---

## 5. Desecration / Abyss — the Well of Souls

Added in 0.3 (Rise of the Abyssal). The only source of **Lich modifiers**.

Flow: get an **Abyssal Bone** from Abyss content (fissure → Abyssal Trove → Abyssal Depths → Dark Domain) → apply to a Rare of the matching class (adds a hidden desecrated mod; if the item has 6 mods, one is removed first) → go to the **Well of Souls** (Act 2) → pick 1 of 3 offered mods.

**Bones by body part:** Jawbone (weapons/quivers), Collarbone (amulets/rings/belts), Rib (armour), Cranium (jewels), Vertebrae (waystones).

**Bone quality:** Gnawed (ilvl ≤64, campaign), Preserved (any ilvl, workhorse), Ancient (any ilvl, min mod level ≥40, endgame, no garbage options).

**Liches** (each ~60–70 mods, all archetypes): Kurgal, Amanamu, Ulaman — force with the matching omen. Discover which lich carries a target mod via PoE2DB's Desecrated Modifiers list.

Loop: side omen + lich omen → bone → (Abyssal Echoes for a reroll) → reveal → if bad, Omen of Light + Annul to strip the desecrated mod and retry.

**0.5:** desecrated **Instant Leech can no longer roll**; one desecrated mod cap.

---

## 6. Sockets, Runes & Soul Cores

- Gear sockets hold **Runes** (and stronger **Soul Cores**). Body armour / 2H weapons get 2 sockets, everything else 1. Vaal Orb can add sockets past the limit.
- **Runes and Soul Cores cannot be removed** once placed — choose carefully.
- Soul Cores have mods unavailable on regular Runes.
- 0.5 heavily rebalanced rune values (Body/Mind/Rebirth/Inspiration/Stone/Vision/elemental runes etc.) — pull current numbers from PoE2DB.

### Crafting-relevant socketables (confirmed from Craft of Exile data, 2026-06-22)

The CoE dump (`pipeline/cache/coe_poec_data.json` → `socketables`, 287 entries: 209 runes,
60 soul cores, 18 idols) carries the socketables that actually change how an item can be crafted.
The ones that matter for a craft planner, because they relax our structural assumptions, are runes:

| Rune | Grants | Crafting effect |
|---|---|---|
| **Astrid's Creativity** | "Can have # additional Crafted Modifier" | **+1 crafted slot** — lets an item hold TWO crafted mods (e.g. two essences). Breaks the one-crafted-slot rule. |
| **Serle's Triumph** | "+# Suffix Modifier allowed" | **7th modifier** (suffix only; no prefix equivalent in data). Breaks the 6-mod cap. |
| **Kolr's Hunt** | "Can roll Marksman modifiers" | Unlocks Marksman (projectile/bow) mods on the item (e.g. projectile levels on gloves). |
| **Katla's Gloom** | "Can roll Decay modifiers" | Unlocks the Decay mod family. |
| **Medved's Tending** | "Can roll Soul modifiers" | Unlocks the Soul mod family. |
| **Thrud's Might** | "Can roll Destruction modifiers" | Unlocks the Destruction mod family. |
| **Uhtred's Sidereus** | "Can roll Chronomancy modifiers" | Unlocks the Chronomancy mod family. |
| **Vorana's Carnage** | "Can roll Berserking modifiers" | Unlocks the Berserking mod family. |

Also confirmed in the same data: **Greater/Perfect Iron Rune** = % increased Physical Damage on
weapons (Armour/Evasion/ES on armour); the lich **Gazes** are SOUL CORES (`Kurgal's Gaze`,
`Amanamu's Gaze`, `Ulaman's Gaze`, `Tecrod's Gaze`), each granting a class-specific lich mod via a
socket (an alternative to desecration omens). bgroup → item-type map (from the same dump):
1=Jewellery, 2=Body Armours, 3=Boots, 4=Helmets, 5=Gloves, 9=Jewels, 10=Flasks, 13=Charms; socket
counts confirm Body Armour=2, Gloves/Boots/Helmets=1, Jewellery=0.

These have NOT yet been extracted into app data. See `TODO.md` T2a for the planned
`build_socketables.py` extraction. The "Can roll X" runes are how off-pool mods (like the gloves
projectile crafts in the videos) become legal, which is why our base mod pools correctly lack them.

---

## 7. Quality & Catalysts

- Quality on weapons/armour boosts base stats (via Whetstones/Scraps).
- **Catalysts** add quality to **jewellery** (and, new in 0.5, **jewels** — 12 new catalysts), boosting tagged mods up to 20% (higher on Breach Rings). In 0.5 catalysts **only come from the Genesis Tree**, not monster drops.

---

## 8. NEW 0.5 systems (Runes of Aldur)

### Ezomyte Remnants & the Runebook
Stone monuments with rune slots found through campaign + endgame. NPC **Farrow** teaches you to inscribe runes to complete recipes (recorded permanently in your **Runebook**). Inscribing resurrects nearby corpses as empowered undead — defeat the wave, claim the crafted item. Bigger remnants = more slots (up to 8 → rarer currency but tougher waves). The **Inland Heath** ocean island has a master remnant ringed by runestones — best place to chase specific recipes.

### Verisium & Runic Ward
**Verisium** is the league's core new currency (drops from Remnants, Expedition, ocean exploration). Powers:
- **Runic Ward** — a new defense layer that kicks in at 1 life and regenerates independently. Added to armour at the **Verisium Anvil**. Armours <lvl 55 gain it free; ≥55 trade some base defense for it.
- **Kalguuran skills/supports** — new gems that spend Runic Ward instead of mana (23 skills + 7 supports), class- and weapon-agnostic.

### Verisium Runeforging — upgrading Uniques
Unlocked Act 3. Upgrades the base type of low-level (<55) **Unique** weapons/armours to be endgame-competitive (more damage / more defense + Runic Ward). Some Kalguuran uniques have multiple gamble-style Runeforge outcomes. Designed to rescue "interesting but weak" uniques.

### Runic Alloys — new exclusive mod pools
**13 Alloys** (unlock after Farrow's Act 2 quest, drop from Remnant encounters). Each works like a Perfect Essence: **removes a random mod, adds a guaranteed mod exclusive to that alloy** (not obtainable any other way). The added mod **counts as the item's one crafted mod** — mutually exclusive with essence crafts / Runic Ward enchants. Family: Runic, Adaptive, Protective, Expansive, Swift, Cyclonic, Prismatic, Mystic, Sovereign, Celestial, Transcendent, Runebinder's, Runefather's. Mod rolls are slot-dependent; verify exact values on PoE2DB.

Also: 13 Ancient Runes (weapon-type bonuses), 13 Mythical early-game runes, 3 Fluxes (convert resistances element→element), 15 meta-crafting runes (unlock new mod pools on a socket), 60+ "destroy a unique → make a rune of its property" runes, 15+ Runic Ward runes.

### Genesis Tree (under Breach)
A crafting bench at the Monastery of the Keepers. Consumes **Wombgifts** and **Hiveblood** (drop from Breach) to craft Rings, Amulets, Belts, and Currency. Allocate tree nodes to control what's crafted; Wombgifts unlock new nodes. Adds 6 exclusive ring bases, 4 amulet bases, 4 belt bases, new caster/minion mods for rings/belts, and is now the **only source of Catalysts**. Breachstone Splinters stack into a special wombgift → Breachstone.

### Liquid Emotions & Timelost Jewels (under Delirium)
- **Liquid Emotions** craft mods on **Jewels** (work like Greater Essences — replace a random mod).
- **Potent Emotions** (3, from Delirious map bosses) craft jewel mods outside the normal pool + instill 16 new passive notables.
- **Ancient Emotions** (10, Atlas-tree unlocked) craft **Timelost Jewels**; 3 **Ancient Potent Emotions** add off-pool Timelost mods.

---

## 9. Canonical crafting order (rule of thumb)

1. Pick the right **base** (correct item class + ilvl 81/82 for T1 access).
2. Build the affix skeleton: Transmute/Augment → Regal, or Alchemy, or an **Essence** for a guaranteed anchor mod.
3. Add mods with **Exalts** (+ side/quantity omens to control them).
4. Fix mistakes with **Annul** (+ side omens) or **Chaos + Whittling**.
5. Spend your **one crafted slot** (Essence / Perfect Essence / Runic Alloy / Runic Ward) and your **one desecrated slot** (Bone + Well of Souls + lich/side omens).
6. Add **Runes/Soul Cores**, **quality/catalysts**.
7. Finish: **Divine** to perfect rolls (or **Sanctify** omen), then **corrupt** with Vaal if chasing an enchant/extra socket.

---

## 10. Implications for tooling (where this project goes)

The 0.5 ruleset is *swingier* than 0.4 — fewer deterministic locks, a hard one-crafted/one-desecrated budget. That makes **cost/EV planning** genuinely valuable. Candidate tools:

- **Craft planner / cost simulator** — model a target item, the orb+omen sequence, and expected currency spend / success probability per step (Monte Carlo over mod weights).
- **"One slot" advisor** — given a target build, recommend whether the single crafted slot is best spent on an Essence, a specific Runic Alloy, or Runic Ward.
- **Base finder** — given a target mod set, compute the min ilvl and best base, and pull live listings.
- **Desecration helper** — map target mods → lich → required omens; estimate cycles.
- **Profit/flip tools** (existing interest) — value crafted outcomes against trade prices.

All of these need live data: **PoE2DB** for mod pools/tiers/tags/weights and the **trade API** for prices. Hard-coded magnitudes from this doc are a fallback, not the source of truth.

---

## Sources
- [Official 0.5.0 Patch Notes — Return of the Ancients (pathofexile.com)](https://www.pathofexile.com/forum/view-thread/3932540)
- [PoE2 Crafting Codex — Patch 0.5 Reference (domistae.github.io)](https://domistae.github.io/poe2-leveling/poe2_crafting_codex.html)
- [Maxroll — PoE2 Crafting Overview](https://maxroll.gg/poe2/resources/path-of-exile-2-crafting-overview)
- [Maxroll — 0.5.0 Return of the Ancients Guide Updates](https://maxroll.gg/poe2/news/path-of-exile-2-0-5-0-return-of-the-ancients-guide-updates-more)
