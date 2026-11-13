/* Interactive blocks inside chat replies, for FIZZ and FIZZ DEV.
   <fizz-quiz>{ "title": "...", "questions": [{ "q": "...", "options": ["a","b"], "answer": 0, "explain": "..." }] }</fizz-quiz>
     → a quiz card: one question at a time, instant feedback, a score at the end and "Try again".
   <fizz-widget title="...">  full HTML (with <style>/<script>)  </fizz-widget>
     → a small interactive app (flashcards, calculator, game, chart…) in a sandboxed frame: it can't reach the page,
       cookies, storage or the network (only scripts/styles from two CDNs). */
(function () {
  "use strict";
  const F = window.FIZZ;
  const esc = F.esc;
  const BLOCK_RE = /<fizz-(quiz|widget)((?:\s+[a-z-]+="[^"]*")*)\s*>([\s\S]*?)(<\/fizz-\1>|$)/g;
  const quizzes = new Map(); // id → { data, i, picked, score, done }
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
  const attr = (attrs, name) => (new RegExp(`${name}="([^"]*)"`).exec(attrs || "") || [])[1] || "";

  const PROMPT = [
    "INTERACTIVE BLOCKS: when something is better used than read (a quiz, practice, flashcards, a calculator, a converter, a small game, a chart, a checklist), put it right in your reply:",
    '- Quiz: <fizz-quiz>{"title":"…","questions":[{"q":"…","options":["…","…","…","…"],"answer":0,"explain":"…"}]}</fizz-quiz> — valid JSON, "answer" is the index of the right option, 3–10 questions, in the user\'s language.',
    '- Anything else interactive: <fizz-widget title="…"><!doctype html>…full HTML with inline <style> and <script>…</fizz-widget>. It runs in a sandboxed frame without network access (scripts may load only from cdn.jsdelivr.net or cdnjs.cloudflare.com), so put all data inside. Keep it compact, readable on a phone and in dark and light themes; use dir="rtl" for Hebrew.',
    "Write a short sentence before the block. Never put these blocks inside code fences.",
  ].join("\n");

  /** Replaces complete blocks with placeholders; returns { text, blocks }. */
  function extract(text) {
    const blocks = [];
    const out = String(text || "").replace(BLOCK_RE, (_m, kind, attrs, body, close) => {
      blocks.push({ kind, attrs, body, closed: Boolean(close) });
      return `\n\nFIZZBLOCK${blocks.length - 1}END\n\n`;
    });
    return { text: out, blocks };
  }
  function blockHtml(b) {
    if (!b.closed) return `<div class="ix-card ix-wait"><span class="dots"><i></i><i></i><i></i></span><span>Building ${b.kind === "quiz" ? "the quiz" : esc(attr(b.attrs, "title") || "something interactive")}…</span></div>`;
    return b.kind === "quiz" ? quizBlock(b.body) : widgetBlock(b.body, attr(b.attrs, "title"));
  }
  /** Markdown with interactive blocks (called by F.markdown). */
  function render(text, md) {
    const { text: t, blocks } = extract(text);
    if (!blocks.length) return null;
    let html = md(t);
    blocks.forEach((b, i) => { html = html.replace(new RegExp(`(<p>)?FIZZBLOCK${i}END(</p>)?`), blockHtml(b)); });
    return html;
  }

  // ---------- quiz ----------
  function parseQuiz(body) {
    try {
      const j = JSON.parse(body.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
      const questions = (Array.isArray(j.questions) ? j.questions : []).map((q) => ({ q: String(q.q || q.question || ""), options: (q.options || []).map(String).slice(0, 8), answer: Number(q.answer) || 0, explain: String(q.explain || q.explanation || "") })).filter((q) => q.q && q.options.length > 1);
      return questions.length ? { title: String(j.title || "Quiz"), questions } : null;
    } catch { return null; }
  }
  function quizBlock(body) {
    const id = "q" + hash(body);
    if (!quizzes.has(id)) { const data = parseQuiz(body); if (!data) return `<div class="ix-card"><b>Quiz</b><p class="muted-sm">This quiz couldn't be read.</p></div>`; quizzes.set(id, { data, i: 0, picked: null, score: 0, done: false }); }
    return `<div class="ix-card ix-quiz" data-quiz="${id}" dir="auto">${quizInner(id)}</div>`;
  }
  const L = {
    en: { perfect: "Perfect! 🎉", great: "Great job! 💪", ok: "Not bad — try again to improve.", low: "Keep practicing — you'll get it.", retry: "Try again", correct: "Correct!", answer: (k) => `The answer is ${k}.`, next: "Next", result: "See result" },
    he: { perfect: "מושלם! 🎉", great: "כל הכבוד! 💪", ok: "לא רע — נסה שוב כדי להשתפר.", low: "תמשיך להתאמן — זה יגיע.", retry: "נסה שוב", correct: "נכון!", answer: (k) => `התשובה הנכונה היא ${k}.`, next: "השאלה הבאה", result: "לתוצאה" },
  };
  function quizInner(id) {
    const s = quizzes.get(id), qs = s.data.questions, n = qs.length;
    const t = /[\u0590-\u05FF]/.test(s.data.title + qs[0].q) ? L.he : L.en;
    const bar = `<div class="ix-bar">${qs.map((_, k) => `<i class="${k < s.i || s.done ? "on" : k === s.i ? "cur" : ""}"></i>`).join("")}</div>`;
    const head = `<div class="ix-head"><b>${esc(s.data.title)}</b><span class="ix-count">${s.done ? n : s.i + 1} / ${n}</span></div>${bar}`;
    if (s.done) {
      const pct = Math.round((s.score / n) * 100);
      return `${head}<div class="ix-result"><div class="ix-score">${s.score}/${n}</div><p>${pct === 100 ? t.perfect : pct >= 70 ? t.great : pct >= 40 ? t.ok : t.low}</p><button type="button" class="btn ix-wide" data-quiz-act="retry">${t.retry}</button></div>`;
    }
    const q = qs[s.i];
    const opts = q.options.map((o, k) => {
      const cls = s.picked === null ? "" : k === q.answer ? "right" : k === s.picked ? "wrong" : "dim";
      return `<button type="button" class="ix-opt ${cls}" data-quiz-pick="${k}" ${s.picked !== null ? "disabled" : ""}><span class="ix-key">${String.fromCharCode(65 + k)}</span><span>${esc(o)}</span></button>`;
    }).join("");
    const fb = s.picked === null ? "" : `<div class="ix-fb ${s.picked === q.answer ? "right" : "wrong"}"><b>${s.picked === q.answer ? t.correct : t.answer(String.fromCharCode(65 + q.answer))}</b>${q.explain ? ` ${esc(q.explain)}` : ""}</div><button type="button" class="btn ix-wide" data-quiz-act="next">${s.i + 1 < n ? t.next : t.result}</button>`;
    return `${head}<div class="ix-q">${esc(q.q)}</div><div class="ix-opts">${opts}</div>${fb}`;
  }
  document.addEventListener("click", (e) => {
    const card = e.target.closest?.("[data-quiz]");
    if (!card) return;
    const id = card.dataset.quiz, s = quizzes.get(id);
    if (!s) return;
    const pick = e.target.closest("[data-quiz-pick]"), act = e.target.closest("[data-quiz-act]")?.dataset.quizAct;
    if (pick && s.picked === null) { s.picked = Number(pick.dataset.quizPick); if (s.picked === s.data.questions[s.i].answer) s.score++; }
    else if (act === "next") { s.picked = null; if (s.i + 1 < s.data.questions.length) s.i++; else s.done = true; }
    else if (act === "retry") Object.assign(s, { i: 0, picked: null, score: 0, done: false });
    else return;
    // The thread may re-render: update every copy of this quiz.
    document.querySelectorAll(`[data-quiz="${id}"]`).forEach((el) => { el.innerHTML = quizInner(id); });
  });

  // ---------- widget ----------
  const CSP = "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'";
  const heights = new Map();
  function widgetBlock(body, title) {
    const id = "w" + hash(body);
    const dark = document.documentElement.classList.contains("dark") || matchMedia("(prefers-color-scheme: dark)").matches;
    const sizer = `<script>(function(){function s(){parent.postMessage({fizzWidget:${JSON.stringify(id)},h:Math.ceil(document.documentElement.scrollHeight)},"*")}new ResizeObserver(s).observe(document.documentElement);addEventListener("load",s);s()})()<\/script>`;
    const base = `<meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${dark ? "dark" : "light"}"><style>html{color-scheme:${dark ? "dark" : "light"}}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}</style>`;
    let html = body.trim().replace(/^```(?:html)?\s*|\s*```$/g, "");
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + base) : base + html;
    html += sizer;
    const h = heights.get(id) || 320;
    return `<div class="ix-card ix-widget">${title ? `<div class="ix-head"><b>${esc(title)}</b></div>` : ""}<iframe class="ix-frame" data-widget="${id}" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" style="height:${h}px" srcdoc="${esc(html)}" title="${esc(title || "Interactive")}"></iframe></div>`;
  }
  addEventListener("message", (e) => {
    const d = e.data;
    if (!d || typeof d.fizzWidget !== "string" || typeof d.h !== "number") return;
    const h = Math.max(80, Math.min(1400, d.h));
    document.querySelectorAll(`iframe[data-widget="${CSS.escape(d.fizzWidget)}"]`).forEach((f) => { if (f.contentWindow === e.source) { f.style.height = h + "px"; heights.set(d.fizzWidget, h); } });
  });

  F.interactive = { PROMPT, render, extract, parseQuiz };
})();
