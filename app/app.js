/* PoE2 Craft Planner — target builder + legality checker
 * Pure browser JS, no deps. Data comes from window.POE2 (poe2_data.js).
 * The legality engine here is also the substrate the path planner will use.
 */
(function () {
  "use strict";
  const DB = window.POE2;
  const RARITY_CAP = { Magic: { p: 1, s: 1 }, Rare: { p: 3, s: 3 } };

  // ---- shared helpers (exported for tests via module.exports at bottom) ----

  // Normalize a mod's text into a "family" template by blanking numbers/ranges.
  function familyText(text) {
    return text
      .replace(/\(\s*-?\d+(?:\.\d+)?\s*-\s*-?\d+(?:\.\d+)?\s*\)/g, "#") // (10-14)
      .replace(/-?\d+(?:\.\d+)?/g, "#");                                 // bare nums
  }

  // Is a mod eligible to roll on a given base? tag overlap + ilvl gate.
  function modEligible(mod, baseTags, itemLevel) {
    if (mod.ilvl > itemLevel) return false;
    for (const t of mod.tags) if (baseTags.includes(t)) return true;
    return false;
  }

  // Group an eligible mod list into families (side + group + template),
  // each family carrying its tier ladder (sorted high ilvl first).
  function buildFamilies(mods, baseTags, itemLevel) {
    const base = baseTags[0]; // our bases carry tags:[their own name]
    const fams = [];
    for (const m of mods) {
      if (!modEligible(m, baseTags, itemLevel)) continue;
      const ladder = (m.bw && m.bw[base]) || [];
      // One pickable option PER TIER rollable at this ilvl, with that tier's real text
      // + ilvl (tiers/values differ per base, so this is read from bw[base]).
      const tiers = ladder
        .filter(t => t[0] <= itemLevel)
        .map(t => Object.assign({}, m, { text: t[2] || m.text, ilvl: t[0] }))
        .sort((a, b) => b.ilvl - a.ilvl);
      if (!tiers.length) tiers.push(m);
      fams.push({ key: m.id, side: m.side, group: m.group,
        label: familyText(m.text).replace(/#/g, "X"), tiers });
    }
    return fams.sort((a, b) => a.label.localeCompare(b.label));
  }

  // Effective caps + crafted slots + unlocked pools given the target's equipped socketables.
  // target.socketables = array of socketable names or ids (resolved against window.POE2.socketables).
  // A socketable applies only if its scope covers this item class (or "all"). Phase C of the T2 plan:
  //   cap_crafted -> +crafted-mod slots (consumed by the PLANNER, no legality count exists here),
  //   cap_suffix / cap_prefix -> raise the affix cap (Serle's Triumph: Rare 3 suffixes -> 4),
  //   pool_unlock -> records the unlocked mod family (NOTE: the off-pool mods themselves are not in
  //   our dataset yet, so this lists the family but does not add specific mods — a known data gap).
  function socketableLoadout(target) {
    const rc = RARITY_CAP[target.rarity] || RARITY_CAP.Rare;
    const out = { prefixCap: rc.p, suffixCap: rc.s, craftedSlots: 1, unlocked: [] };
    const list = (DB && DB.socketables) || [];
    for (const ref of (target.socketables || [])) {
      const sk = list.find(x => x.id === ref || x.name === ref);
      if (!sk) continue;
      const inScope = (sk.scope || []).includes("all") || (sk.scope || []).includes(target.itemClass);
      if (!inScope) continue;
      if (sk.effect === "cap_prefix") out.prefixCap += (sk.value || 1);
      else if (sk.effect === "cap_suffix") out.suffixCap += (sk.value || 1);
      else if (sk.effect === "cap_crafted") out.craftedSlots += (sk.value || 1);
      else if (sk.effect === "pool_unlock" && sk.unlocks) out.unlocked.push(sk.unlocks);
    }
    return out;
  }

  // Mods unlocked by an equipped pool_unlock rune (Kolr's Hunt, etc.), shaped like normal mods so the
  // builder + legality engine handle them uniformly. Only runes in target.socketables whose scope
  // covers this item class contribute, and each mod is tagged to the CURRENT base so modEligible and
  // the weight ladder work. Data: window.POE2.runePools (poe2db; weights approximate). Phase C.
  function runePoolMods(target) {
    const equipped = target.socketables || [];
    if (!equipped.length) return [];
    const pools = (DB && DB.runePools) || {};
    const socks = (DB && DB.socketables) || [];
    const base = target.baseName;
    const out = [];
    for (const name of equipped) {
      const sk = socks.find(x => x.name === name);
      if (!sk || sk.effect !== "pool_unlock") continue;
      if (!((sk.scope || []).includes("all") || (sk.scope || []).includes(target.itemClass))) continue;
      const p = pools[name]; if (!p) continue;
      let i = 0;
      for (const rm of (p.prefixes || []).concat(p.suffixes || [])) {
        out.push({
          id: "rune_" + sk.id + "_" + (i++), name: rm.text, text: rm.text, side: rm.side,
          group: [], tags: base ? [base] : [], mtags: [], ilvl: rm.ilvl || 1,
          bw: base ? { [base]: [[rm.ilvl || 1, rm.weight || 1, rm.text]] } : {},
          essence_only: false, src: "rune", rune: name,
        });
      }
    }
    return out;
  }

  // Core legality check on a proposed target.
  // target = { itemClass, baseName, baseTags, itemLevel, rarity, mods:[modObj...] }
  function checkLegality(target) {
    const out = [];
    const baseCap = RARITY_CAP[target.rarity] || RARITY_CAP.Rare;
    const load = socketableLoadout(target);
    const cap = { p: load.prefixCap, s: load.suffixCap };
    const pre = target.mods.filter(m => m.side === "prefix");
    const suf = target.mods.filter(m => m.side === "suffix");

    const pTag = cap.p > baseCap.p ? " (raised by a socketable)" : "";
    const sTag = cap.s > baseCap.s ? " (raised by a socketable)" : "";
    if (pre.length > cap.p) out.push({ kind: "bad", text: `${pre.length} prefixes selected, but a ${target.rarity} item allows only ${cap.p}${pTag}.` });
    if (suf.length > cap.s) out.push({ kind: "bad", text: `${suf.length} suffixes selected, but a ${target.rarity} item allows only ${cap.s}${sTag}.` });
    if (cap.p > baseCap.p || cap.s > baseCap.s || load.craftedSlots > 1 || load.unlocked.length)
      out.push({ kind: "ok", text: `Socketables in effect: ${load.craftedSlots} crafted slot(s), cap ${cap.p} prefix / ${cap.s} suffix${load.unlocked.length ? ", unlocks " + load.unlocked.join("/") + " mods" : ""}.` });

    // group exclusivity (one mod per group)
    const seen = new Map();
    for (const m of target.mods) {
      for (const g of (m.group || [])) {
        if (seen.has(g)) out.push({ kind: "bad", text: `“${m.name || m.text}” conflicts with “${seen.get(g)}” — both use the modifier group ${g}; an item can only have one.` });
        else seen.set(g, m.name || m.text);
      }
    }

    // base eligibility + ilvl gating
    for (const m of target.mods) {
      const tagOk = m.tags.some(t => target.baseTags.includes(t));
      if (!tagOk) out.push({ kind: "bad", text: `“${m.text}” cannot roll on a ${target.baseName} (wrong base type).` });
      else if (m.ilvl > target.itemLevel) out.push({ kind: "warn", text: `“${m.text}” needs item level ${m.ilvl}; your item is ${target.itemLevel}.` });
      if (m.essence_only) out.push({ kind: "warn", text: `“${m.text}” is essence-only — it can't be hit by a random slam, only forced by its Essence.` });
      if (m.src === "rune" && !(target.socketables || []).includes(m.rune)) out.push({ kind: "bad", text: `“${m.text}” needs the ${m.rune} rune socketed to roll on a ${target.baseName}.` });
    }

    const ok = out.every(m => m.kind !== "bad");
    if (ok && target.mods.length) {
      out.unshift({ kind: "ok", text: `Legal target: ${pre.length} prefix / ${suf.length} suffix on ${target.baseName}. This item can exist.` });
    }
    return { ok, messages: out, prefixCount: pre.length, suffixCount: suf.length,
             craftedSlots: load.craftedSlots, prefixCap: cap.p, suffixCap: cap.s, unlocked: load.unlocked };
  }

  // Parse a PoE2 clipboard item into a partial target (best effort).
  function parseItem(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim());
    const res = { rarity: null, baseName: null, itemClass: null, itemLevel: null, modLines: [] };

    for (const l of lines) {
      let m;
      if ((m = l.match(/^Rarity:\s*(.+)$/i))) res.rarity = m[1].trim();
      else if ((m = l.match(/^Item Level:\s*(\d+)/i))) res.itemLevel = parseInt(m[1], 10);
      else if ((m = l.match(/^Item Class:\s*(.+)$/i))) res.itemClass = m[1].trim();
    }

    // Identify base + class by matching any line to a known base name.
    outer:
    for (const l of lines) {
      for (const ic in DB.classes) {
        for (const b of DB.classes[ic].bases) {
          if (l === b.name || l.endsWith(" " + b.name)) {
            res.baseName = b.name; res.itemClass = ic; res.baseTags = b.tags; break outer;
          }
        }
      }
    }

    // Candidate explicit mod lines = lines with a number, after the last divider,
    // excluding requirement/known meta lines.
    const skip = /^(Item Class|Rarity|Requirements|Level|Str|Dex|Int|Sockets|Item Level|Quality|Spirit|Stack Size|Corrupted|--+|Physical Damage|Elemental Damage|Critical|Attacks per)/i;
    for (const l of lines) {
      if (!l || skip.test(l)) continue;
      if (/\d/.test(l) || /increased|reduced|to all|resistance/i.test(l)) res.modLines.push(l);
    }

    // Try to match mod lines to our DB for the identified class.
    res.matched = []; res.unmatched = [];
    if (res.itemClass && DB.classes[res.itemClass]) {
      const pool = DB.classes[res.itemClass].prefixes.concat(DB.classes[res.itemClass].suffixes);
      for (const line of res.modLines) {
        const fam = familyText(line);
        const hit = pool.find(p => familyText(p.text) === fam);
        if (hit) res.matched.push(hit); else res.unmatched.push(line);
      }
    }
    return res;
  }

  // ---- expose for node tests; stop here if not in a browser ----
  const api = { familyText, modEligible, buildFamilies, checkLegality, parseItem, socketableLoadout, runePoolMods };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof document === "undefined") return;

  // ============================ UI WIRING ============================
  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  const state = { itemClass: null, baseName: null, baseTags: [], itemLevel: 82, rarity: "Rare", mods: [], socketables: [] };

  $("#patch").textContent = DB.patch || "?";

  // class + base selects
  const classSel = $("#classSel"), baseSel = $("#baseSel");
  Object.keys(DB.classes).sort().forEach(ic => classSel.append(new Option(ic, ic)));

  function loadBases() {
    state.itemClass = classSel.value;
    baseSel.innerHTML = "";
    DB.classes[state.itemClass].bases.forEach(b => baseSel.append(new Option(`${b.name} (lvl ${b.drop_level})`, b.name)));
    loadBase();
  }
  function loadBase() {
    state.baseName = baseSel.value;
    const b = DB.classes[state.itemClass].bases.find(x => x.name === state.baseName);
    state.baseTags = b ? b.tags : [];
    state.mods = []; // reset on base change to avoid illegal carryover
    renderSockets(); renderPicker(); render();
  }
  classSel.onchange = loadBases;
  baseSel.onchange = loadBase;

  $("#ilvl").oninput = e => { state.itemLevel = parseInt(e.target.value, 10) || 1; renderPicker(); render(); };
  $("#raritySel").onchange = e => { state.rarity = e.target.value; render(); };
  $("#modSearch").oninput = renderPicker;

  function renderPicker() {
    const list = $("#famlist"); list.innerHTML = "";
    if (!state.itemClass) return;
    const cls = DB.classes[state.itemClass];
    const pool = cls.prefixes.concat(cls.suffixes).concat(cls.desecrated || []).concat(runePoolMods(state));
    let fams = buildFamilies(pool, state.baseTags, state.itemLevel);
    const q = $("#modSearch").value.trim().toLowerCase();
    if (q) fams = fams.filter(f => f.label.toLowerCase().includes(q));
    $("#pickHint").textContent = `· ${fams.length} eligible on this base @ ilvl ${state.itemLevel}`;
    fams.slice(0, 250).forEach(f => {
      const row = el("div", "fam");
      row.append(el("span", "side " + (f.side === "prefix" ? "tag pre" : "tag suf"), f.side === "prefix" ? "PRE" : "SUF"));
      if (f.tiers[0] && f.tiers[0].src === "desecrated") row.append(el("span", "tag ess", "DESEC"));
      if (f.tiers[0] && f.tiers[0].src === "rune") row.append(el("span", "tag rune", "RUNE"));
      row.append(el("span", "ft", f.label));
      const sel = el("select");
      f.tiers.forEach((t, i) => sel.append(new Option(`${t.text}  · ilvl ${t.ilvl}`, i)));
      row.append(sel);
      const add = el("button", "btn sm", "Add");
      add.onclick = () => { addMod(f.tiers[+sel.value]); };
      row.append(add);
      list.append(row);
    });
  }

  // Equipped-socketable picker (Phase C). Lists the cap/pool runes that apply to the current item
  // class (Astrid's Creativity, Serle's Triumph, the class's "Can roll X" rune); toggling one updates
  // state.socketables, which checkLegality + the planner read. Off-class socketables are dropped.
  function renderSockets() {
    const list = $("#socklist"); if (!list) return; list.innerHTML = "";
    const hint = $("#sockHint");
    if (!state.itemClass) { if (hint) hint.textContent = ""; return; }
    const apply = (DB.socketables || []).filter(s =>
      ["cap_crafted", "cap_suffix", "cap_prefix", "pool_unlock"].includes(s.effect) &&
      ((s.scope || []).includes("all") || (s.scope || []).includes(state.itemClass)));
    state.socketables = (state.socketables || []).filter(n => apply.some(s => s.name === n));
    if (hint) hint.textContent = apply.length ? `· ${apply.length} apply to ${state.itemClass}` : "· none for this class";
    apply.forEach(s => {
      const row = el("div", "sock");
      const cb = el("input"); cb.type = "checkbox"; cb.id = "sk_" + s.id;
      cb.checked = state.socketables.includes(s.name);
      cb.onchange = () => {
        if (cb.checked) { if (!state.socketables.includes(s.name)) state.socketables.push(s.name); }
        else state.socketables = state.socketables.filter(n => n !== s.name);
        renderPicker(); render();
      };
      const eff = s.effect === "cap_crafted" ? "+1 crafted-mod slot"
        : s.effect === "cap_suffix" ? "+1 suffix slot (7th mod)"
        : s.effect === "cap_prefix" ? "+1 prefix slot"
        : "unlocks " + s.unlocks + " mods";
      const lab = el("label", "sock-lab"); lab.htmlFor = cb.id;
      lab.innerHTML = `<b>${s.name}</b> <span class="hint">${s.stype} · ${eff}</span>`;
      row.append(cb); row.append(lab); list.append(row);
    });
  }

  function addMod(mod) {
    if (state.mods.some(m => m.id === mod.id)) return;
    if (mod.src === "desecrated" && state.mods.some(m => m.src === "desecrated")) return; // one desecrated slot per item
    state.mods.push(mod); render();
  }
  function removeMod(id) { state.mods = state.mods.filter(m => m.id !== id); render(); }

  function render() {
    const b = DB.classes[state.itemClass] && DB.classes[state.itemClass].bases.find(x => x.name === state.baseName);
    $("#goalName").textContent = state.mods.length ? "Crafted " + state.baseName : (state.baseName || "No base selected");
    $("#goalBase").textContent = state.itemClass ? `${state.baseName} · ${state.itemClass}` : "";
    $("#goalRarity").textContent = state.rarity;
    $("#goalIlvl").textContent = "ilvl " + state.itemLevel;
    const pc = state.mods.filter(m => m.side === "prefix").length, sc = state.mods.filter(m => m.side === "suffix").length;
    $("#goalSlots").textContent = `${pc}P / ${sc}S`;

    const mc = $("#goalMods"); mc.innerHTML = "";
    if (!state.mods.length) mc.append(el("div", "hint", "Add modifiers from the left to define your goal."));
    const order = { prefix: 0, suffix: 1 };
    state.mods.slice().sort((a, b) => order[a.side] - order[b.side]).forEach(m => {
      const row = el("div", "modline");
      const left = el("div", "");
      left.append(el("span", "tag " + (m.side === "prefix" ? "pre" : (m.side === "suffix" ? "suf" : "ess")), m.side.slice(0, 3).toUpperCase()));
      left.append(el("span", "t", " " + m.text));
      if (m.essence_only) left.append(el("span", "tag ess", " essence-only"));
      if (m.src === "desecrated") left.append(el("span", "tag ess", " desecrate-only"));
      const star = el("span", "must" + (m.mustHave ? " on" : ""), m.mustHave ? "★ must" : "☆ wish");
      star.title = "Toggle must-have. ★ = the planner guarantees it with premium tools; ☆ = best-effort fill.";
      star.style.cursor = "pointer"; star.style.marginRight = "8px"; star.style.fontSize = "11px";
      star.style.color = m.mustHave ? "#e8b84b" : "#7a8a99";
      star.onclick = () => { m.mustHave = !m.mustHave; render(); };
      const x = el("span", "x", "✕"); x.title = "remove"; x.onclick = () => removeMod(m.id);
      row.append(left); row.append(star); row.append(x); mc.append(row);
    });

    // legality
    const r = checkLegality(state);
    const box = $("#legal"); box.innerHTML = "";
    r.messages.forEach(msg => box.append(el("div", "msg " + (msg.kind === "ok" ? "ok" : msg.kind === "bad" ? "bad" : "warn"), msg.text)));

    renderPlan(r.ok);
  }

  // ---- Stage 3: render the crafting path(s) from planner.js ----
  function renderPlan(legal) {
    const out = $("#planOut");
    if (!out) return;
    out.innerHTML = "";
    if (!state.mods.length) {
      out.append(el("div", "plan-empty", "Add the modifiers you want — the path planner will lay out how to craft it."));
      return;
    }
    if (!legal) {
      out.append(el("div", "plan-empty", "Fix the legality problems above first — there's no path to an item that can't exist."));
      return;
    }
    const planner = window.POE2Planner;
    if (!planner) { out.append(el("div", "plan-empty", "planner.js not loaded.")); return; }

    const plan = planner.planRoutes(state, DB);
    out.append(el("div", "hint", `Base needs item level ${plan.reqIlvl}+ to access every tier in this goal. ${plan.routes.length} route(s):`));

    plan.routes.forEach((route, ri) => {
      const det = el("details", "route"); if (ri === 0) det.open = true;
      const sum = el("summary");
      const badge = route.recommended ? `<span style="background:#2e9b6b;color:#06140d;font-weight:800;padding:1px 7px;border-radius:8px;font-size:10px;letter-spacing:.4px;margin-right:7px;vertical-align:middle">★ BEST PATH</span>` : "";
      sum.append(el("div", "rname", `${badge}${route.name}<span class="chev">▾</span>`));
      sum.append(el("div", "rtag", route.tagline));
      sum.append(el("div", "rbest", "Best for: " + route.best));
      if (route.effortLabel) sum.append(el("div", "rtag", `<span style="opacity:.8">Effort: ${route.effortLabel}</span>`));
      if (route.warning) sum.append(el("div", "rtag", `<span style="color:#e7a14b;font-weight:600">⚠ ${route.warning}</span>`));
      det.append(sum);

      const steps = el("div", "steps");
      route.steps.forEach((s, i) => {
        const row = el("div", "step");
        row.append(el("div", "num", String(i + 1)));
        const body = el("div", "");
        const act = el("div", "act");
        act.append(el("span", "actname", s.action));
        act.append(el("span", "det " + s.determinism, s.determinism));
        body.append(act);
        if (s.variants && s.variants.length)
          body.append(el("div", "variants", "options: " + s.variants.map(v => `<b>${v}</b>`).join(" · ")));
        body.append(el("div", "detail", s.detail));
        body.append(miniState(s.state));
        row.append(body);
        steps.append(row);
      });
      det.append(steps);
      out.append(det);
    });

    if (plan.notes && plan.notes.length) {
      const nb = el("div", "notes");
      nb.append(el("h3", "", "Advanced alternatives & caveats"));
      const ul = el("ul"); ul.style.margin = "0"; ul.style.paddingLeft = "16px";
      plan.notes.forEach(n => ul.append(el("li", "", n)));
      nb.append(ul);
      out.append(nb);
    }
  }

  // a compact "resulting item" chip-row for a step's state
  function miniState(st) {
    const wrap = el("div", "ministate");
    wrap.append(el("span", "ms-rar", st.rarity));
    if (!st.mods.length) { wrap.append(el("span", "ms-mod incidental", "(blank)")); return wrap; }
    st.mods.forEach((m, i) => {
      if (i) wrap.append(el("span", "ms-arrow", "·"));
      const side = m.side === "prefix" ? "P" : m.side === "suffix" ? "S" : "?";
      wrap.append(el("span", "ms-mod " + (m.kind || "fixed"), `${side} ${m.text}`));
    });
    return wrap;
  }

  // tabs
  document.querySelectorAll(".tab").forEach(t => t.onclick = () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    $("#tab-build").style.display = t.dataset.tab === "build" ? "" : "none";
    $("#tab-paste").style.display = t.dataset.tab === "paste" ? "" : "none";
  });

  // paste parsing
  $("#parseClear").onclick = () => { $("#pasteBox").value = ""; $("#parseReport").innerHTML = ""; };
  $("#parseBtn").onclick = () => {
    const rep = $("#parseReport"); rep.innerHTML = "";
    const res = parseItem($("#pasteBox").value);
    if (!res.baseName) { rep.append(el("div", "msg bad", "Couldn't identify the base type. Make sure you copied the whole item.")); return; }
    // apply to state
    classSel.value = res.itemClass; loadBases();
    baseSel.value = res.baseName; loadBase();
    if (res.itemLevel) { state.itemLevel = res.itemLevel; $("#ilvl").value = res.itemLevel; }
    if (res.rarity && RARITY_CAP[res.rarity]) { state.rarity = res.rarity; $("#raritySel").value = res.rarity; }
    state.mods = res.matched.slice();
    renderPicker(); render();
    rep.append(el("div", "msg ok", `Loaded ${res.baseName} (ilvl ${res.itemLevel || "?"}). Matched ${res.matched.length} mod(s).`));
    if (res.unmatched.length) rep.append(el("div", "msg warn", "Unmatched lines (review manually): " + res.unmatched.map(u => "“" + u + "”").join(", ")));
    document.querySelector('.tab[data-tab="build"]').click();
  };

  // boot
  loadBases();
})();
