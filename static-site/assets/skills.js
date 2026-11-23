/* Fizz DEV skills: reusable instruction packs for Fizz Code. A skill is used when you turn it on in the
   composer, or automatically when your message matches what it's for. Built-in skills ship with Fizz DEV;
   your own skills are saved with your data in this browser. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const { esc } = F;

  const BUILTIN = [
    { id: "web-design", icon: "layout", name: "Polished web design", description: "Modern, responsive pages with clear typography, spacing and color.", match: "landing|website|web ?site|homepage|portfolio|דף נחיתה|אתר",
      instructions: "Design like a senior product designer. Use a clear type scale (one display face, one text face, system fonts are fine), an 8px spacing grid, generous whitespace and at most two accent colors. Make every layout responsive from 360px to wide desktop with CSS grid/flex and no horizontal scroll. Use CSS custom properties for colors and support prefers-color-scheme dark. Give buttons and links visible hover and focus states. Avoid stock-template clichés (purple gradients, emoji bullets, lorem ipsum); write real, specific copy." },
    { id: "game", icon: "gamepad", name: "Browser games", description: "Smooth canvas games with keyboard and touch controls.", match: "game|snake|pong|tetris|platformer|shooter|puzzle|arcade|משחק",
      instructions: "Build games on a <canvas> with a requestAnimationFrame loop that uses delta time, so speed is the same on every screen. Scale the canvas for devicePixelRatio and resize with the window. Support keyboard (arrows + WASD) and touch (swipe or on-screen buttons). Include a start screen, pause (P / Esc), game over with restart, score and a high score saved in localStorage. Keep state in one object and separate update() from draw(). Add small juice: easing, particles or screen shake, but keep 60fps." },
    { id: "dashboard", icon: "chart", name: "Dashboards & data", description: "Stat cards, charts and tables that read well.", match: "dashboard|admin|analytics|chart|graph|table|report|kpi|דשבורד",
      instructions: "Lay dashboards out as a KPI row, then charts, then a table. Draw charts with inline SVG (no libraries unless asked): labelled axes, readable ticks, one highlight color, tooltips on hover. Format numbers with Intl.NumberFormat. Tables get sticky headers, sorting and an empty state. Use realistic sample data in a separate data.js so it is easy to replace." },
    { id: "rtl", icon: "globe", name: "Hebrew & RTL", description: "Right-to-left layouts and Hebrew typography.", match: "hebrew|rtl|עברית|[\\u0590-\\u05FF]",
      instructions: "For Hebrew content set <html lang=\"he\" dir=\"rtl\">. Use CSS logical properties (margin-inline-start, padding-inline, inset-inline-end, text-align: start) instead of left/right. Mirror directional icons (arrows, chevrons). Use a Hebrew-friendly font stack such as \"Heebo\", \"Rubik\", \"Assistant\", Arial, sans-serif. Keep numbers, code and URLs left-to-right with dir=\"ltr\" or <bdi>. Write the UI copy in natural Hebrew." },
    { id: "a11y", icon: "eye", name: "Accessibility", description: "Semantic HTML, keyboard use, labels and contrast.", match: "accessib|a11y|screen ?reader|keyboard|נגישות",
      instructions: "Use semantic elements (header, nav, main, button, label). Every input has a visible label, every image meaningful alt text (or alt=\"\" if decorative). Everything works with the keyboard in a logical order with a visible :focus-visible ring. Text contrast at least 4.5:1. Respect prefers-reduced-motion. Use aria-live for status messages and never rely on color alone." },
    { id: "debug", icon: "wrench", name: "Debugging", description: "Find the root cause and make the smallest fix.", match: "bug|error|fix|broken|crash|doesn'?t work|not working|exception|באג|שגיאה|לא עובד",
      instructions: "Debug methodically: restate the symptom, find the root cause in the current files before writing code, then make the smallest change that fixes it. Do not rewrite unrelated code. Explain the cause in one or two sentences. When the bug is in plain JavaScript logic, add a small check script and run it with <fizz-run>node check.js</fizz-run>." },
    { id: "tests", icon: "test", name: "Tests", description: "Small Node test scripts you can run in the terminal.", match: "\\btests?\\b|unit test|assert|בדיקות",
      instructions: "Write tests as plain Node scripts (tests/*.test.js) using only node:assert, no frameworks. Keep the logic under test in its own module so it can be imported without the DOM. Cover the happy path, edge cases and one failure case. Run each test file with <fizz-run>node tests/name.test.js</fizz-run> and print a clear pass summary." },
    { id: "refactor", icon: "layers", name: "Clean refactor", description: "Tidy code without changing what it does.", match: "refactor|clean ?up|reorgani[sz]e|simplify|tidy|ארגון|לסדר את הקוד",
      instructions: "Refactor without changing behavior. Split large files by responsibility, remove dead code and duplication, give things clear names, and keep the public structure (file names, ids used by HTML) stable unless asked. List what moved where in your summary." },
    { id: "seo", icon: "search", name: "SEO & sharing", description: "Titles, meta tags and link previews.", match: "\\bseo\\b|meta tags?|open ?graph|google|share preview|search engine",
      instructions: "Give each page a unique <title> (under 60 chars) and meta description (under 155), one <h1>, logical heading order, Open Graph and Twitter card tags, a canonical link, descriptive link text and lazy-loaded images with width/height. Add a robots.txt and a sitemap.xml listing the pages." },
    { id: "pwa", icon: "download", name: "Installable app (PWA)", description: "Manifest, icons and offline support.", match: "\\bpwa\\b|offline|installable|install the app|home screen|service worker",
      instructions: "Make the site installable: add manifest.webmanifest (name, short_name, start_url, display standalone, theme and background colors, icons as SVG or data URLs) linked from index.html, and a service-worker.js that caches the app shell (cache-first for static files, network-first for HTML) with a versioned cache name. Register it only when 'serviceWorker' in navigator. Note that service workers need the deployed HTTPS site; the preview won't register them." },
  ];
  /** A skill's icon as SVG (older custom skills stored a symbol; they get the default). */
  const glyph = (s) => F.icon(/^[a-z]+$/.test(s?.icon || "") ? s.icon : "spark", "i");


  const lib = (data) => (data.skillLib ||= { custom: [], disabled: [] });
  function all(data, app = "dev") {
    const l = lib(data);
    return [...(app === "dev" ? BUILTIN.map((s) => ({ ...s, builtin: true })) : []), ...l.custom.filter((s) => !s.apps || s.apps.includes(app)).map((s) => ({ ...s, builtin: false }))].map((s) => ({ ...s, enabled: !l.disabled.includes(s.id) }));
  }

  // ---------- SKILL.md ----------
  const slug = (t) => String(t || "").toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `skill-${F.uid().slice(0, 6)}`;
  /** Reads a SKILL.md (front matter "name:" and "description:", then the instructions). */
  function parseSkillMd(text, fileName = "") {
    const src = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    let meta = {}, body = src;
    const fm = /^---\n([\s\S]*?)\n---\n?/.exec(src);
    if (fm) {
      body = src.slice(fm[0].length);
      for (const line of fm[1].split("\n")) { const m = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line); if (m) meta[m[1].toLowerCase()] = m[2].trim().replace(/^["']|["']$/g, ""); }
    }
    const heading = /^#\s+(.+)$/m.exec(body)?.[1];
    const name = meta.name || heading || fileName.replace(/(\/|^)SKILL\.md$/i, "").replace(/\.md$/i, "").split("/").pop() || "Skill";
    const description = meta.description || body.replace(/^#.*$/m, "").trim().split("\n").find((l) => l.trim())?.trim().slice(0, 300) || "";
    if (!body.trim()) throw new Error("This SKILL.md has no instructions.");
    return { name: name.slice(0, 60), description: description.slice(0, 400), instructions: body.trim().slice(0, 30000) };
  }
  /** Adds (or replaces, by name) a skill from SKILL.md text. */
  function addSkillMd(data, text, fileName) {
    const p = parseSkillMd(text, fileName);
    const l = lib(data);
    const id = `md-${slug(p.name)}`;
    const rec = { id, icon: "spark", source: "md", name: p.name, description: p.description, instructions: p.instructions, match: "", keywordsText: "", apps: ["chat", "dev"], at: Date.now() };
    const i = l.custom.findIndex((x) => x.id === id);
    if (i >= 0) l.custom[i] = rec; else l.custom.push(rec);
    return rec;
  }
  const STOP = new Set("this that with from your what when where which about into have will them they their then than there these those make made just like more most some such only also very each other skill skills using used uses user users code file files want need help write create build".split(" "));
  const words = (t) => new Set((String(t).toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []).filter((w) => !STOP.has(w)));
  /** Automatic choice: the skill's name (or "/name") is in the message, or enough of its description's words are. */
  function relevant(skill, text) {
    const t = String(text || "").toLowerCase();
    const nm = String(skill.name || "").toLowerCase();
    if (nm && (t.includes(`/${slug(nm)}`) || (nm.length >= 4 && t.includes(nm)))) return true;
    const want = words(`${skill.name} ${skill.description}`);
    let hit = 0;
    for (const w of words(t)) if (want.has(w) || [...want].some((x) => x.length >= 5 && (x.startsWith(w) || w.startsWith(x)))) hit++;
    return hit >= 2;
  }
  const byId = (data, id) => all(data).find((s) => s.id === id);

  function matches(skill, text) {
    if (skill.source === "md") return relevant(skill, text);
    if (!skill.match) return false;
    try { return new RegExp(skill.match, "i").test(text); } catch { return false; }
  }
  /** Skills for one message: the ones turned on, plus enabled ones whose "when to use" matches (max 3 automatic). */
  function forMessage(data, pinnedIds, text, app = "dev") {
    const list = all(data, app).filter((s) => s.enabled);
    const pinned = list.filter((s) => pinnedIds.includes(s.id)).map((s) => ({ ...s, auto: false }));
    const auto = list.filter((s) => !pinnedIds.includes(s.id) && matches(s, text)).slice(0, 3).map((s) => ({ ...s, auto: true }));
    return [...pinned, ...auto];
  }
  /** The system prompt section that carries the skills' instructions (bounded). */
  function promptSection(skills) {
    if (!skills.length) return "";
    let budget = 24000;
    const parts = [];
    for (const s of skills) {
      const text = `## Skill: ${s.name}\n${s.instructions}`.slice(0, Math.max(0, budget));
      if (!text) break;
      budget -= text.length;
      parts.push(text);
    }
    return `SKILLS IN USE (chosen automatically from the user's message, or turned on by the user). Follow these instructions for this request (they come from the user's skill library):\n\n${parts.join("\n\n")}`;
  }

  // ---------- manager dialog ----------
  function manage({ data, save, onChange }) {
    let d = document.getElementById("skills-dlg");
    if (!d) {
      d = document.createElement("dialog");
      d.id = "skills-dlg";
      d.className = "dlg skills-dlg";
      document.body.appendChild(d);
    }
    let editing = null;
    const draw = () => {
      if (editing) {
        const s = editing;
        d.innerHTML = `<form method="dialog" class="dlg-body form" data-form>
          <h2>${s.id ? "Edit skill" : "New skill"}</h2>
          <label class="field"><span>Name</span><input class="input" name="name" maxlength="40" required value="${esc(s.name || "")}" placeholder="Brand voice" /></label>
          <label class="field"><span>What it's for</span><input class="input" name="description" maxlength="120" value="${esc(s.description || "")}" placeholder="Writes copy in our brand's tone" /></label>
          <label class="field"><span>Use automatically when the message mentions</span><input class="input" name="keywords" maxlength="200" value="${esc(s.keywordsText || "")}" placeholder="copy, slogan, about page" /><small>Comma-separated words. Leave empty to use it only when you turn it on.</small></label>
          <label class="field"><span>Instructions for Fizz Code</span><textarea class="textarea mono" name="instructions" rows="9" maxlength="4000" required placeholder="Write in a warm, direct voice. Short sentences…">${esc(s.instructions || "")}</textarea><small>Up to 4,000 characters.</small></label>
          <div class="dlg-actions"><button type="button" class="btn btn-outline" data-cancel>Back</button><button class="btn" value="save">Save skill</button></div></form>`;
        d.querySelector("[data-cancel]").onclick = () => { editing = null; draw(); };
        d.querySelector("[data-form]").onsubmit = (e) => {
          e.preventDefault();
          const f = e.target;
          const name = f.name.value.trim();
          const instructions = f.instructions.value.trim();
          if (!name || !instructions) return;
          const words = f.keywords.value.split(",").map((w) => w.trim()).filter(Boolean);
          const match = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
          const l = lib(data);
          const rec = { id: s.id || `custom-${F.uid().slice(0, 8)}`, icon: "spark", name, description: f.description.value.trim(), instructions, match, keywordsText: words.join(", ") };
          const i = l.custom.findIndex((x) => x.id === rec.id);
          if (i >= 0) l.custom[i] = rec; else l.custom.push(rec);
          save(); onChange?.(); editing = null; draw();
          F.toast(`Skill "${name}" saved`);
        };
        return;
      }
      const list = all(data);
      d.innerHTML = `<div class="dlg-body"><h2>Skills</h2>
        <p class="desc">Skills teach Fizz Code how you like things done. Turn one on in the composer, or let it apply automatically when your message matches.</p>
        <div class="skill-list">${list.map((s) => `<div class="skill-row ${s.enabled ? "" : "off"}"><span class="skill-ic">${glyph(s)}</span>
          <div class="skill-body"><b>${esc(s.name)}</b><small>${esc(s.description || "")}</small><small class="muted-sm">${s.builtin ? "Built-in" : "Your skill"}${s.match ? " · automatic" : ""}</small></div>
          ${s.builtin ? "" : `<button type="button" class="btn btn-ghost btn-sm" data-edit="${s.id}">Edit</button><button type="button" class="btn btn-ghost btn-sm" data-del="${s.id}">Delete</button>`}
          <label class="switch" title="${s.enabled ? "Enabled" : "Disabled"}"><input type="checkbox" data-toggle="${s.id}" ${s.enabled ? "checked" : ""} /><span></span></label></div>`).join("")}</div>
        <div class="dlg-actions"><button type="button" class="btn btn-outline" data-new>+ New skill</button><button type="button" class="btn" data-close>Done</button></div></div>`;
    };
    d.onclick = (e) => {
      const t = e.target;
      if (t.closest("[data-close]")) d.close();
      if (t.closest("[data-new]")) { editing = {}; draw(); }
      const ed = t.closest("[data-edit]");
      if (ed) { editing = { ...lib(data).custom.find((x) => x.id === ed.dataset.edit) }; draw(); }
      const del = t.closest("[data-del]");
      if (del && confirm("Delete this skill?")) { const l = lib(data); l.custom = l.custom.filter((x) => x.id !== del.dataset.del); save(); onChange?.(); draw(); }
    };
    d.onchange = (e) => {
      const id = e.target.dataset.toggle;
      if (!id) return;
      const l = lib(data);
      l.disabled = e.target.checked ? l.disabled.filter((x) => x !== id) : [...new Set([...l.disabled, id])];
      save(); onChange?.(); draw();
    };
    editing = null;
    draw();
    if (!d.open) d.showModal();
  }

  // ---------- Settings → Skills ----------
  function mountSettings(box, { data, save }) {
    if (!box) return;
    const draw = () => {
      const l = lib(data);
      const mine = l.custom;
      box.innerHTML = `<p class="muted-sm">Add skills as <b>SKILL.md</b> files (the same format Claude uses: a <code>name</code> and <code>description</code> at the top, then the instructions). Fizz and Fizz DEV pick a skill by themselves when your message is about what it describes, or when you write its name — e.g. <code>/brand-voice</code>.</p>
        <div class="skill-up">
          <label class="btn btn-sm"><input type="file" accept=".md,text/markdown,text/plain" multiple hidden data-skill-file />Upload SKILL.md</label>
          <button type="button" class="btn btn-outline btn-sm" data-skill-paste>Paste SKILL.md</button>
          <button type="button" class="btn btn-ghost btn-sm" data-skill-manage>All skills (incl. built-in)…</button>
        </div>
        <div class="skill-pastebox" hidden><textarea class="textarea mono" rows="10" placeholder="---&#10;name: brand-voice&#10;description: Writes copy in our brand's tone. Use for slogans, posts and about pages.&#10;---&#10;&#10;# Brand voice&#10;Write in a warm, direct voice…" data-skill-text></textarea><div class="dlg-actions"><button type="button" class="btn btn-outline btn-sm" data-skill-cancel>Cancel</button><button type="button" class="btn btn-sm" data-skill-save>Add skill</button></div></div>
        <div class="skill-list">${mine.map((k) => `<div class="skill-row ${l.disabled.includes(k.id) ? "off" : ""}"><span class="skill-ic">${glyph(k)}</span>
          <div class="skill-body"><b>${esc(k.name)}</b><small>${esc(k.description || "")}</small><small class="muted-sm"><code>/${esc(slug(k.name))}</code> · ${k.source === "md" ? "SKILL.md" : "Custom"} · Fizz & Fizz DEV · ${Math.round((k.instructions || "").length / 100) / 10}k chars</small></div>
          <button type="button" class="btn btn-ghost btn-sm" data-skill-dl="${esc(k.id)}" title="Download SKILL.md">Download</button>
          <button type="button" class="btn btn-ghost btn-sm" data-skill-del="${esc(k.id)}">Remove</button>
          <label class="switch" title="On"><input type="checkbox" data-skill-on="${esc(k.id)}" ${l.disabled.includes(k.id) ? "" : "checked"} /><span></span></label></div>`).join("") || '<p class="muted-sm">No skills yet. Upload a SKILL.md to add one.</p>'}</div>`;
    };
    const addText = (text, name) => { try { const k = addSkillMd(data, text, name); save(); F.toast(`Added the skill "${k.name}"`); return true; } catch (e) { F.toast(`${name || "SKILL.md"}: ${e.message}`); return false; } };
    box.onclick = async (e) => {
      const t = e.target;
      if (t.closest("[data-skill-paste]")) { box.querySelector(".skill-pastebox").hidden = false; box.querySelector("[data-skill-text]").focus(); }
      if (t.closest("[data-skill-cancel]")) box.querySelector(".skill-pastebox").hidden = true;
      if (t.closest("[data-skill-save]")) { if (addText(box.querySelector("[data-skill-text]").value)) draw(); }
      if (t.closest("[data-skill-manage]")) manage({ data, save, onChange: draw });
      const del = t.closest("[data-skill-del]");
      if (del && confirm("Remove this skill?")) { const l = lib(data); l.custom = l.custom.filter((x) => x.id !== del.dataset.skillDel); save(); draw(); }
      const dl = t.closest("[data-skill-dl]");
      if (dl) { const k = lib(data).custom.find((x) => x.id === dl.dataset.skillDl); if (k) F.download(`${slug(k.name)}-SKILL.md`, `---\nname: ${slug(k.name)}\ndescription: ${String(k.description || "").replace(/\n/g, " ")}\n---\n\n${k.instructions}\n`, "text/markdown"); }
    };
    box.onchange = async (e) => {
      if (e.target.matches("[data-skill-file]")) {
        for (const f of e.target.files) { if (f.size > 200_000) { F.toast(`${f.name} is too big (max 200 KB).`); continue; } addText(await f.text(), f.name); }
        draw();
      }
      const id = e.target.dataset.skillOn;
      if (id) { const l = lib(data); l.disabled = e.target.checked ? l.disabled.filter((x) => x !== id) : [...new Set([...l.disabled, id])]; save(); draw(); }
    };
    draw();
  }

  F.skills = { glyph, BUILTIN, all, byId, forMessage, promptSection, manage, matches, parseSkillMd, addSkillMd, relevant, mountSettings, slug };
})();
