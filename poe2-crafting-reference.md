# PoE2 Crafting Reference

A clean, structured breakdown of how items in Path of Exile 2 are "crafted" and how the different crafting methods interact. Distilled from a general PoE2 crafting guide ([YouTube source](https://www.youtube.com/watch?v=HfFkmE_t4SA)). Item/currency name spellings normalized from the auto-transcript where garbled (e.g. "topaz ring", "gnawed collar bone", "vaal orb").

> **Scope note:** This is a mechanics reference for the crafting calculator backbone, not a strategy guide. Where the guide gives market prices (in Exalted/Divine orbs) those are league-snapshot examples and will drift; treat them as relative magnitudes, not constants.

---

## 1. Item Anatomy (the fundamentals everything else builds on)

### Rarity tiers

| Rarity | Color | Max modifiers | Prefixes | Suffixes |
|--------|-------|---------------|----------|----------|
| Normal | White | 0 (a "base") | 0 | 0 |
| Magic  | Blue  | 2 | up to 1 | up to 1 |
| Rare   | Yellow | 6 | up to 3 | up to 3 |

A **white item is the "base"** in crafting terms. Everything starts here.

### The two iron rules

1. **Rarity is a one-way street.** White → Magic → Rare only. You can never strip a rare back to magic, or a magic back to white. Once an item is yellow, your toolset changes permanently.
2. **Prefixes and suffixes draw from completely separate modifier pools.** This is the backbone of *all* deterministic crafting. Because the pools are separate, you can reason about what is *possible* on an item before spending any currency.

### Prefix vs suffix targeting (the core deduction)

Many stat categories live exclusively in one pool. The headline example: **elemental resistances are always suffixes**, on every item type.

So if a rare item already has **3 prefixes + 1 suffix**, you know any mod-adding action *must* land in the suffix pool (2 open slots) — your next Exalted Orb has a real chance to hit a resistance.

If it's the reverse, **3 suffixes + 1 prefix**, you are **hard-locked out of more resistances** no matter how many orbs you throw. The suffix pool is full.

This "look at the open pools, deduce what's possible" habit is the whole point of learning crafting: it lets you value a dropped item and avoid blind currency-slamming.

### Other base rules

- **No duplicate modifiers.** An item can never carry the same mod twice.
- **Hybrid modifiers.** A single prefix or suffix can carry two stats at once (usually at slightly reduced max values). Example: a body armor prefix giving *armor+evasion AND max life* in one slot. Because it counts as one modifier, you can still roll a *separate* standalone max-life prefix next to it. (This is why Alt-hover can show two "maximum life" lines that don't violate the no-duplicates rule.)

### Item level (ilvl)

- Hover an item and hold **Alt** to see its **item level** — distinct from the *required level to equip*, which is irrelevant to crafting.
- **ilvl gates which mod tiers can roll.** Higher ilvl unlocks higher tiers. If the top tier of a mod requires ilvl 82, an ilvl 76 base simply cannot roll it, ever.
- Practical example from the guide: a Rattling Scepter needs **ilvl 78+** to be able to roll **+4 to Level of Minion Skills**; an ilvl 76 base can't, making it far less valuable.

### Base type dictates defensive mods

The base's defense type controls which defensive prefixes are available:

| Base type | Attribute | Rolls |
|-----------|-----------|-------|
| Armor | Strength | Armor mods |
| Evasion | Dexterity | Evasion mods |
| Energy Shield | Intelligence | ES mods |
| Hybrid (Ar/Ev, Ev/ES, Ar/ES) | mixed | both pure + hybrid versions |

**Suffixes stay largely the same across all bases** — it's mainly the defensive prefixes that change with base type.

### Mod weights (the odds)

Each rollable mod has a **weight**. Higher weight = more likely to be hit when a random mod lands in that pool. Examples from a Rattling Scepter:

- Each mana tier ≈ **1000** weight (very common)
- Tier-1 spirit ≈ **50** weight (very rare)
- Tier-1 "+4 minion skills" ≈ **100** weight (rare)

So slamming a prefix on that scepter overwhelmingly tends to give mana. **Weights are why "perfect" items are so hard to hit and why targeted methods (essences, desecration, omens) matter.** [craftofexile.com](https://craftofexile.com) shows the full weighted pools per base/ilvl.

---

## 2. Currency / Orbs — core toolkit

| Orb | Works on | Effect |
|-----|----------|--------|
| **Transmutation** | White | → Magic, adds 1 random mod |
| **Augmentation** | Magic | Adds 1 random mod to the open slot |
| **Regal** | Magic | → Rare, adds 1 random mod |
| **Alchemy** | White | → Rare directly |
| **Exalted** | Rare | Adds 1 random mod (respecting prefix/suffix limits) |
| **Chaos** | Rare | Removes 1 random mod **and** adds 1 random mod |
| **Annulment** ("nullment") | Rare | Removes 1 random mod |
| **Divine** | Any with mods | Rerolls the *values* of existing mods (not the mods themselves) |
| **Vaal** | Any | Corrupts — unpredictable outcome, item becomes unmodifiable (see §8) |
| **Fracturing** | Rare w/ 4+ mods | Locks one random mod permanently (see §8) |

### Exalted Orb behavior (the workhorse)

On a rare, Exalted adds a random mod but **respects the 3/3 limit**. If prefixes are full (3) and suffixes have room, the Exalt is **guaranteed** to add a suffix. This is how you "aim" Exalts: fill one pool, then Exalts are forced into the other.

### Greater / Perfect variants & "minimum modifier level"

Augmentation and Exalted (and some other currencies) come in **Greater** and **Perfect** versions. These add a **"minimum modifier level N"** restriction, which **prevents low tiers from rolling**:

- **Greater** ≈ minimum modifier level **44** → blocks any mod whose required mod level is 43 or lower.
- **Perfect** ≈ minimum modifier level **70** → blocks even more low/mid tiers.

Effect: higher guaranteed tiers, but a **smaller available pool**. Caveat: if a desirable mod's *only* tiers fall below the threshold, Perfect/Greater can make that mod **unrollable entirely** (the guide's example: a life mod that simply can't appear under a Perfect Augment because all its tiers are below mod level 70). Match the orb tier to the base's ilvl so you don't accidentally exclude what you want.

---

## 3. Essences — guaranteed specific mods

Essences let you add a **chosen, guaranteed modifier** instead of gambling. Each essence maps to a specific stat and lists which item categories it can be used on.

- **Regular / Greater essences:** upgrade a Magic item to Rare while **adding one guaranteed mod** (or add a guaranteed mod). The mod they add is a **crafted modifier** — distinct teal color — and you can only have **one crafted modifier per item**.
- **Perfect essences:** behave like a **Chaos Orb with a guaranteed result** — they **remove one random mod, then add the essence's guaranteed mod**. (Use these on items that are already rare/full.)

**Prefix vs suffix still applies.** The mod an essence adds belongs to a fixed pool, which makes Perfect essences a *targeted removal* trick: e.g. a "life" essence adds a **prefix**, so on a full item it must **remove a prefix** to make room — leaving your suffixes untouched.

Essences also respect the "no duplicate / type-conflict" rule: you can't apply a resistance essence for a resistance the item already has (the game blocks it with "the item already has a mod of this type").

Named examples from the guide:

| Essence | Guarantees | Notable usable categories |
|---------|-----------|---------------------------|
| Essence of the Body | Max Life | amulet, boots, gloves, ring (greater version excludes rings) |
| Essence of Thawing | Cold Resistance | armor, belt, jewelry |
| Essence of Insulation | Fire Resistance | (couldn't be used in example — item already had fire res) |
| Essence of Command | Allies in your Presence deal increased Damage (prefix) | scepters / minion weapons |

Essences are typically **cheap on the market**, which makes them the budget backbone of early crafting.

---

## 4. Desecration / Abyss crafting — desecrated modifiers

Desecration adds a **desecrated modifier**: instead of fully random, you get to **choose 1 of 3** options at the **Well of Souls**. This is a major targeting tool.

### How it works

1. Use a **bone item** on a valid base. This adds a desecrated mod (or, if the relevant pool is full, **removes a mod to add the desecrated one** — see interactions).
2. Take the item to the **Well of Souls** and **Reveal** — you're shown **3 random candidate modifiers** and pick one.
3. A higher-tier bone can guarantee higher item-level / higher-tier candidates (more expensive). There's also an omen that lets you **reroll the 3 options once** for a fresh set of 3.

### Bone types (by item category)

| Bone | Used on |
|------|---------|
| Collar Bone | Amulet, Ring, Belt (jewelry) |
| Rib | Body Armour |
| Jawbone | Weapons |

### Bone tiers (item-level cap / minimum mod level)

- **Gnawed** (base): low ilvl cap (e.g. Gnawed Collar Bone max ilvl ~64). Too low for high-ilvl bases.
- **Preserved**: standard tier, works on most endgame bases.
- **Ancient**: adds a **minimum modifier level** restriction (~40), like a Greater orb. Expensive.

### Altered bones — mechanic-exclusive modifiers

**Altered** bones unlock **modifiers exclusive to specific league mechanics**. The guide's key example: an **Altered Collar Bone** can roll **"otherworldly" modifiers exclusive to the Breach mechanic** (e.g. minion melee splash). These are the *only* way to get such mods as a crafted/desecrated mod — and they are very expensive.

---

## 5. Omens — modifiers for how a currency behaves

Omens are consumables you **activate before using a currency** to change *how that currency acts*. They are the heart of deterministic / meta crafting. Naming is systematic:

- **Sinistral = prefixes**, **Dextral = suffixes**
- **Exaltation = affects Exalted Orb**, **Necromancy = affects Desecration**, **Erasure = affects Chaos Orb's removal**

| Omen | Pairs with | Effect |
|------|-----------|--------|
| Omen of Sinistral Exaltation | Exalted | Added mod must be a **prefix** |
| Omen of Dextral Exaltation | Exalted | Added mod must be a **suffix** |
| Omen of Greater Exaltation | Exalted | Adds **two** mods at once |
| Omen of Sinistral Necromancy | Desecration | Desecrated mod must be a **prefix** |
| Omen of Dextral Necromancy | Desecration | Desecrated mod must be a **suffix** |
| Omen of Sinistral Erasure | Chaos | Chaos only rerolls/removes among **prefixes** |
| Omen of Dextral Erasure | Chaos | Chaos only rerolls/removes among **suffixes** |
| Omen of Whittling | Chaos | Chaos removes the **lowest-level modifier** on the item |
| Omen of Light | Annulment | Annul specifically removes a **desecrated** modifier |
| Omen of Sanctification | Divine | **Sanctifies** the item (see §8) |
| (reroll omen) | Desecration | Lets you **reroll the 3 Well-of-Souls options once** |

**Why omens matter:** they convert a coin-flip into protection. Want to add a suffix without risking your good prefixes? Activate Dextral Necromancy, then desecrate — the desecrated mod is forced into the suffix pool. Want a Chaos to only touch your junk prefixes and never your fractured/wanted suffixes? Sinistral Erasure. Omens get expensive fast, and **can be stacked** (e.g. Whittling + Sinistral Erasure = "Chaos, remove only the lowest-level prefix").

---

## 6. Other targeted currencies (0.5 additions)

These all follow the same "remove random + add guaranteed" pattern as Perfect essences, but for specific item classes.

### Delirium emotions / liquids — for jewelry

As of 0.5, Delirium emotions (liquids) act **exactly like a Perfect essence but on jewelry/jewels**: remove a random mod, then add a guaranteed one. The added mod is tied to the liquid type and the base. Example: on a Sapphire jewel, "diluted liquid iron" guarantees **increased Energy Shield** (a prefix), so it removes a random mod and adds ES — a 50/50 on which non-prefix it bumps if prefixes have room. (Guide example turned a 40-Exalted jewel into a 2-Divine jewel with one application.)

Verify each liquid's prefix/suffix and base validity on Craft of Exile before using.

### Alloys — for rare items, base-specific guaranteed mods

Alloys **remove a random mod and augment a rare with a new guaranteed mod** (rare items only). The exact mod depends on the **base type** the alloy is used on:

- **Runic Alloy** → runic ward mods: ring = max runic ward, amulet = increased max runic ward (%), belt = runic ward regeneration.
- **Mystic Alloy** → base-specific utility: helmet = spell skills have increased area; gloves = increased area of effect for attacks; boots = flat spirit.

---

## 7. Practice & research tools

- **craftofexile.com** — search a base + set ilvl to see exactly which mods/tiers can roll, their weights, and prefix/suffix split. The **Emulator** lets you build a mock item and apply currencies/essences/omens *with the site's fake currency* — practice a full craft start-to-finish before spending real currency. Use **Undo** to retry steps.
- **poe.ninja → Builds tab → "Runes of Aldur"** — analyze what popular builds actually wear. Filter by class/ascendancy, multi-select several characters, and look for the **common rare-item patterns** (e.g. most martial-artist boots = Evasion/ES hybrid, runic ward, gain-deflection suffix, no movement speed). This is how you find what's worth crafting to sell.

---

## 8. Advanced / meta crafting

### Fracturing Orb — lock a mod

- Requires a rare with **4+ modifiers**; **locks one random mod permanently**. A fractured mod can **never** be removed — not by Chaos, not by Annulment.
- **It cannot fracture an un-revealed desecrated modifier.** This enables an odds trick: if you have 3 wanted mods + 1 un-revealed desecrated mod (4 total), fracturing can only target the 3 revealed mods → **1-in-3** chance to lock the one you want instead of 1-in-4.
- Pairs with Annulment loops: once your keeper is fractured, you can repeatedly Annul to strip everything else (the fractured mod survives), re-add desecrated mods, and retry indefinitely.

### Example: the "+2 minion belt" loop (combining everything)

1. Fracture the wanted mod (+2 Level of All Minion Skills) so it's permanent.
2. **Orb of Annulment** to strip the item down to just the fractured mod.
3. **Altered Collar Bone + Omen of Dextral Necromancy** → add a desecrated **suffix** (chasing the Breach-exclusive minion melee splash).
4. Reveal at Well of Souls. If it's not the wanted mod, Annul again (removes a non-fractured mod like cold res), then repeat from step 3.
5. **Omen of Light + Annulment** is the alternative for removing a bad *desecrated* mod specifically (more expensive).
6. Once the chase mod lands, finish by slamming for life and using **Omen of Whittling / Sinistral Erasure** with Chaos to reroll only the junk prefixes until life hits.

This is extremely currency-intensive (altered collar bones alone ran ~98 Exalted each in the example) — shown to illustrate the ceiling, not as a recommended budget path.

### Corruption (Vaal Orb)

Pure gamble: corrupts the item with an unpredictable outcome (can brick, can add powerful extra mods / a second corruption implicit). **Item becomes unmodifiable afterward.** Example: a double-corrupted helmet with +1 Level of All Minion Skills *and* increased Evasion%.

### Sanctification (Omen of Sanctification + Divine Orb)

- A "Vaal-like" final step: with the omen active, a Divine Orb **sanctifies** the item — randomly multiplies **every modifier's value by 78%–122%**.
- The item becomes **completely unmodifiable** afterward, so it must be the **last** step.
- This is how high-roll items are pushed past normal caps — e.g. turning a +4 minion-skills scepter into an effective **+5**.

### Hinekora's Lock — foresee the next outcome

- **Foresees the result of the next currency item** used on the item before you commit. Extremely expensive (~110 Divines per use in the example).
- Activate it, hover a currency (e.g. an Exalted Orb) over the item, and it shows the outcome. Don't like it? Don't use that orb — instead apply a Quality/Divine orb to consume the lock, then buy another to peek again. Mirror-tier crafting only.

### Vericium Anvil (mentioned in passing)

Converts a defensive stat into **runic ward** on a piece (e.g. getting ward onto boots). Noted as an observed pattern on high-end build gear.

---

## 9. How the methods interact — the rules that actually matter

This is the part the calculator needs to model. Everything reduces to: **which pool (prefix/suffix) does a mod go in, is that pool full, and what does the action do when it's full vs open?**

**Open slot vs full slot determines add-vs-replace.**
- Desecration / essence / alloy / liquid on an item with an **open slot in the target pool** → just **adds**, removes nothing.
- The same action when the **target pool is full** → must **remove a mod from that pool** to make room. This is predictable, which is what makes "essence to remove a specific-type mod" a real technique.

**Prefix/suffix limits make Exalts steerable.** Fill prefixes (3) and every Exalt is forced into suffixes, and vice-versa. No omen needed — just arithmetic on the pools.

**Omens override the default randomness of one action.** Sinistral/Dextral force the pool; Greater Exaltation adds two; Whittling/Erasure constrain what Chaos touches; Necromancy steers desecration; Light makes Annul target desecrated mods. Stack them to combine constraints.

**Crafted-mod cap.** Only one essence-style crafted (teal) modifier per item at a time. A crafted mod blocks further crafted mods until removed.

**Fractured = immovable anchor.** A fractured mod is immune to Chaos and Annul, so it turns destructive currencies into safe "reroll everything else" tools.

**Minimum-modifier-level is a pool filter, not a guarantee of quality.** Greater/Perfect orbs and Ancient bones shrink the rollable pool to higher tiers — but if the mod you want has no tiers above the threshold, that filter makes it **impossible**, not better. Always check the base's ilvl against the mod's tier table first.

**ilvl + base type define the universe first.** Before any currency math, the base's item level (which tiers exist) and base type (which defensive prefixes exist) bound everything that follows. Weights then set the probabilities within that bounded pool.

**One-way rarity constrains the whole plan.** Because you can't downgrade, the order of operations matters: decide your guaranteed mods (essence/desecration) and any fracture *before* you commit to the rare state and start slamming Exalts.

---

## 10. Quick glossary

- **Base** — a white (normal) item; the starting point.
- **Mod / modifier** — a prefix or suffix granting stats.
- **Tier** — quality band of a mod; higher tiers need higher ilvl.
- **Weight** — relative likelihood of a mod being chosen within its pool.
- **Crafted mod** — teal mod added by an essence; max one per item.
- **Desecrated mod** — mod added via bones, chosen 1-of-3 at the Well of Souls.
- **Fractured mod** — permanently locked mod (via Fracturing Orb).
- **Omen** — consumable that changes how the next currency behaves.
- **Sinistral / Dextral** — prefix / suffix (omen naming).
