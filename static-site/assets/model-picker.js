/* The model picker above the composer (FIZZ and FIZZ DEV): a list of the models the chosen AI service offers,
   with search. Which service and which keys are used stays in Settings → AI. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const esc = F.esc;
  const cache = {};
  const COMPAT = { groq: "https://api.groq.com/openai/v1", zai: "https://api.z.ai/api/paas/v4", requesty: "https://router.requesty.ai/v1", deepseek: "https://api.deepseek.com/v1", cerebras: "https://api.cerebras.ai/v1", together: "https://api.together.xyz/v1" };
  const NAMES = { openrouter: "OpenRouter", gemini: "Google AI Studio", anthropic: "Anthropic", groq: "Groq", zai: "Z.ai", requesty: "Requesty", deepseek: "DeepSeek", cerebras: "Cerebras", together: "Together AI", "custom-openai": "Custom provider" };
  const FIELD = { openrouter: "openrouterModel", gemini: "geminiModel", anthropic: "model", "custom-openai": "customOpenAIModel" };
  const field = (p) => FIELD[p] || `${p}Model`;
  const kind = (id) => (F.isMediaModel?.(id) ? (/video|veo|sora|kling|wan-?2|hailuo/i.test(id) ? "Video" : "Image") : "");

  async function load(s, product) {
    const p = s.provider;
    if (p === "anthropic") return F.MODELS.map((m) => ({ id: m.id, name: m[product] || m.id, note: m.note }));
    if (cache[p]) return cache[p];
    let list = [];
    if (p === "openrouter") {
      const r = await fetch("https://openrouter.ai/api/v1/models").then((x) => x.json());
      list = (r.data || []).map((m) => ({ id: m.id, name: m.name || m.id, note: [m.context_length ? `${Math.round(m.context_length / 1000)}K context` : "", Number(m.pricing?.prompt) === 0 ? "free" : "", (m.architecture?.output_modalities || []).includes("image") ? "makes images" : ""].filter(Boolean).join(" · ") }));
    } else if (p === "gemini") {
      if (!s.geminiKey) throw new Error("Add your Google AI Studio key in Settings → AI.");
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(s.geminiKey)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || `Google returned ${r.status}`);
      list = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).some((x) => x === "generateContent" || x === "predict")).map((m) => ({ id: m.name.replace(/^models\//, ""), name: m.displayName || m.name, note: m.inputTokenLimit ? `${Math.round(m.inputTokenLimit / 1000)}K context` : "" }));
    } else if (COMPAT[p] || p === "custom-openai") {
      const key = p === "custom-openai" ? s.customOpenAIKey : s[`${p}Key`];
      let base = p === "custom-openai" ? s.customOpenAIBaseUrl : p === "zai" ? s.zaiBaseUrl || COMPAT.zai : COMPAT[p];
      base = String(base || "").replace(/\/chat\/completions\/?$/, "").replace(/\/$/, "");
      if (!key || !base) throw new Error("Add the key in Settings → AI.");
      const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error?.message || `The service returned ${r.status}`);
      list = (j.data || j.models || []).map((m) => ({ id: m.id || m.name, name: m.name || m.id, note: "" })).filter((m) => m.id);
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return (cache[p] = list);
  }

  let open = null;
  function close() { if (open) { open.el.remove(); document.removeEventListener("pointerdown", open.outside, true); document.removeEventListener("keydown", open.key, true); open = null; } }

  /** Opens the picker above `anchor`. ctx: { data, save, product: "chat"|"dev", openSettings, onChange } */
  async function show(anchor, ctx) {
    if (open) return close();
    const s = ctx.data.settings;
    const p = s.provider;
    const el = document.createElement("div");
    el.className = "model-pop";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Select model");
    el.innerHTML = `<div class="mp-head"><b>Select model</b><small>${esc(NAMES[p] || "FIZZ AI")}</small><button type="button" class="icon-btn mp-x" aria-label="Close"><svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <input class="input mp-search" type="search" placeholder="Search models" autocomplete="off" spellcheck="false" />
      <div class="mp-list" role="listbox"><p class="muted-sm mp-msg">Loading models…</p></div>
      <button type="button" class="mp-settings">AI settings — service and keys</button>`;
    // Above the composer, as wide as it (like the + menu).
    const box = (anchor.closest(".composer") || anchor).getBoundingClientRect();
    el.style.left = `${Math.max(8, box.left)}px`;
    el.style.width = `${Math.min(box.width, window.innerWidth - 16)}px`;
    el.style.bottom = `${Math.max(8, window.innerHeight - box.top + 8)}px`;
    document.body.appendChild(el);
    open = { el, outside: (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); }, key: (e) => { if (e.key === "Escape") close(); } };
    document.addEventListener("pointerdown", open.outside, true);
    document.addEventListener("keydown", open.key, true);
    el.querySelector(".mp-x").onclick = close;
    el.querySelector(".mp-settings").onclick = () => { close(); ctx.openSettings("ai"); };
    const search = el.querySelector(".mp-search"), listEl = el.querySelector(".mp-list");
    if (!p || !NAMES[p]) {
      search.hidden = true;
      listEl.innerHTML = `<div class="mp-item on"><span class="mp-name">${esc(F.providerLabel(s, ctx.product))}</span><small>Included with FIZZ. To pick from more models, connect an AI service in AI settings.</small></div>`;
      return;
    }
    let models = [];
    const cur = s[field(p)] || "";
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const hits = models.filter((m) => !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
      const extra = q && !models.some((m) => m.id.toLowerCase() === q) && p !== "anthropic" ? `<button type="button" class="mp-item" data-model="${esc(search.value.trim())}"><span class="mp-name">Use “${esc(search.value.trim())}”</span><small>A model ID that isn't in the list</small></button>` : "";
      listEl.innerHTML = hits.slice(0, 300).map((m) => `<button type="button" class="mp-item${m.id === cur ? " on" : ""}" data-model="${esc(m.id)}" role="option" aria-selected="${m.id === cur}"><span class="mp-check" aria-hidden="true">${m.id === cur ? "✓" : ""}</span><span class="mp-body"><span class="mp-name">${esc(m.name)}${kind(m.id) ? ` <em class="mp-tag">${kind(m.id)}</em>` : ""}</span><small>${esc(m.note || (m.name !== m.id ? m.id : ""))}</small></span></button>`).join("") + extra || `<p class="muted-sm mp-msg">No models match “${esc(search.value)}”.</p>`;
    };
    listEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-model]");
      if (!b) return;
      s[field(p)] = b.dataset.model;
      ctx.save();
      ctx.onChange?.();
      F.toast(`Model: ${b.dataset.model}`);
      close();
    });
    search.addEventListener("input", draw);
    try { models = await load(s, ctx.product); if (cur && !models.some((m) => m.id === cur)) models.unshift({ id: cur, name: cur, note: "Current model" }); draw(); listEl.querySelector(".on")?.scrollIntoView({ block: "center" }); if (window.innerWidth > 700) search.focus(); }
    catch (err) { listEl.innerHTML = `<p class="muted-sm mp-msg">Couldn't load the models: ${esc(err.message)}</p>`; }
  }
  F.modelPicker = { show, close };
})();
