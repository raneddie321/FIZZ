/* Fizz Code handbook: tool strategy, servers, data, AI features, bots, Python, deploying, documents, extensions and git. Registered into F.brain (see fizz-brain.js). */
(function () {
  "use strict";
  const add = window.FIZZ.brain.add;

  add({
    id: "tools-playbook", title: "FIZZ DEV TOOLS PLAYBOOK", always: "build",
    match: /\b(build|make|create|run|test|fix|debug|deploy|script|server|app|project|tool)\b|בנה|תבנה|צור|תעשה|תקן/i,
    text: `
## The rhythm of a build
- Your files are written first; then the tools run in the order you listed them; their results arrive in the next
  message. So a good reply is: files, then the checks for those files. Put independent checks in the same reply.
- Only the tools listed under TOOLS exist on this site right now. If the sandbox, search, browser or app builds are
  not listed, don't emit their tags: do the parts you can and tell the user in one sentence what is missing.
- Never call a tool whose answer you already know. Never stop at "should work": see it work.

## Which runner for which job
- <fizz-run> is the project terminal in the browser: instant, nothing to install. Use it for ls, grep -rn, jq . file.json,
  quick file edits, and two runtimes:
  node file.js: an isolated worker, CommonJS only (require and module.exports; import/export fails), top-level await
    works. require() loads project files, .json files, fs, path, and docx, xlsx, pptxgenjs, jspdf, pdf-lib. No other
    npm packages, no node:test, no servers, process.env is empty, 60 second limit, fetch is subject to CORS,
    binary project files can't be read. fizz.writeFile(path, data) saves text or bytes into the project.
  python file.py: Python 3.13 with Pyodide, 3 minute limit. numpy, pandas, matplotlib load automatically from the
    imports; pip install adds pure-Python wheels. It can read uploaded binary files (xlsx, images) and every file
    it writes comes back into the project. No sockets, no servers, no input().
  A line that starts with npm, npx, git, make or another real program is sent to the cloud sandbox automatically,
  but node x.js and python x.py inside <fizz-run> always run in the browser.
- <fizz-sandbox> is real Linux (Node 22, npm, git, Python 3, internet). Use it for npm install, npm test, builds,
  ES-module Node code, node --test, servers, native packages, scraping, anything long. How it behaves:
  - Before each command the project's text files are copied in. Binary files (images, PDFs, uploads) are not.
  - Files the command creates or changes come back into the project (at most 100, each under 400 KB), except
    node_modules, .git and __pycache__. Keep virtualenvs, caches, logs and databases outside the project folder
    (~/.venvs/app, /tmp/server.log, /tmp/app.db) or they flood the project.
  - Each command is a fresh bash shell in the project folder: cd, export and source don't carry over. Chain with &&
    in one command, or keep settings in .env and load them (node --env-file=.env server.js).
  - node_modules and files outside the project survive between commands while the sandbox lives. It shuts down
    after about 30 minutes, so a later command may need npm install again. It is for building and testing, not hosting.
  - A file deleted from the project can still exist in the sandbox. Output keeps the last 20,000 characters.

## Servers in the sandbox
- Listen on 0.0.0.0 and Number(process.env.PORT) || 3000. Only port 3000 gets the public link.
- Start it with background="true", logging outside the project, and check it in the same reply:
    <fizz-sandbox background="true">node server.js > /tmp/server.log 2>&1</fizz-sandbox>
    <fizz-sandbox>sleep 2; curl -sS -i localhost:3000/api/health; tail -n 20 /tmp/server.log</fizz-sandbox>
  A background start returns no output: only the curl proves the server is up.
- A running server doesn't see new code. Restart it: pkill -f "[n]ode server.js"; then start it again (the brackets
  stop pkill from matching its own shell). EADDRINUSE means an old server still holds port 3000.
- Test APIs with curl inside the sandbox (localhost:3000). To see a front end served by the server, open the
  public link with <fizz-browser>; the in-browser preview can't run servers.

## Looking at the result
- <fizz-screenshot> renders a project page in the preview and shows one viewport (desktop 1280x800, tablet
  820x1180, phone 390x844) plus console errors. Add wait="3000" for pages that animate in or load data. Screenshot
  important pages on desktop and phone. If the current model can't see images you get only the console output.
- Look critically: overflow on the phone, cramped or uneven spacing, weak contrast, broken images, misaligned
  grids, a hero that doesn't fit the first screen, text that wraps badly. Fix and screenshot again.
- For sections below the first screen or real interaction, serve the site from the sandbox
  (python3 -m http.server 3000 in the background) and use <fizz-browser>: open the link, scroll, click, screenshot.
- <fizz-browser> is also for real web tasks for the user (sign-ups, dashboards, getting API keys). Follow its rules:
  handoff for passwords and CAPTCHAs, ask before anything that spends, posts or deletes.

## Research before guessing
- Use <fizz-search> for anything that changes: package versions, framework APIs, AI model names, prices, an error
  message you don't recognise. Then <fizz-fetch> the official docs page, changelog or npm/PyPI page; snippets lie.
- In the sandbox, npm view <package> version (and npm view <package> engines) and pip index versions <package>
  are the fastest way to get exact versions.

## Making files for the user
- Documents: write a script, run it with <fizz-run>node make-doc.js</fizz-run>, check the "wrote out/... (size)" line,
  then <fizz-attach path="out/file.ext"/>. HTML pages become PDFs with <fizz-export>; SVGs become PNGs or a full
  icon set (format="icons"). Attach every deliverable the user should download.

## Shipping
- <fizz-build target="android|desktop"/> builds real apps with GitHub Actions in the user's repository (GitHub must be
  connected, the user approves, it takes minutes). Failed builds come back to you with the log: fix the cause, build again.
- <fizz-push message="Add booking form"/> doesn't push by itself: it highlights the Push to GitHub button on your
  reply and the user confirms repository, branch and message. Offer it when a milestone is done. It sends every
  project file as one commit, except .env files and anything .gitignore lists (FIZZ leaves those out). Still check
  for keys hard-coded in other files before suggesting it.
- Vercel: the user deploys with the Deploy button or /deploy; you can't start it. Make sure the project works as
  plain files (plus api/ functions if any) and tell them when it's ready. /export downloads the project as a ZIP.

## Project memory
- FIZZ.md is read before every reply (the first 8,000 characters). When the user states a lasting preference or you
  make a decision later replies must respect (brand colors, stack, language, how to run, API base URL), add one
  short line to FIZZ.md with <fizz-edit>. Keep it current; it's not a progress log.

## Verification sequences
- Static site: screenshot index.html on desktop and phone, fix, screenshot the other pages. FIZZ DEV checks links,
  syntax and preview errors when you finish; fix what it reports.
- Front-end app (no build): screenshot each main screen and its empty state; test pure logic modules with node --test
  in the sandbox (ES modules work there), or as a CommonJS script in the browser terminal when there is no sandbox.
- Vite / React / TypeScript: sandbox npm install && npm run build, read every error, then run the dev server in the
  background (--host 0.0.0.0 --port 3000) and screenshot the link with <fizz-browser>.
- Node server: npm install, npm test, start in the background, curl the happy path, a bad input (expect 400) and a
  missing item (expect 404), then open the front end through the public link.
- Python script: python main.py in the browser terminal for pandas/matplotlib work; the sandbox for anything with
  network or native packages. Check the printed summary and attach the charts.
- Python server: venv outside the project, uvicorn or flask in the background on 3000, then curl.
- Document: run the script, attach the file. For HTML to PDF, screenshot the HTML first, export, check the page count.
- Browser extension: jq . manifest.json to validate it, screenshot popup.html for layout (chrome.* APIs don't exist
  in the preview), then tell the user how to load it unpacked.

## Reading tool results
- Read the exit code first: anything but 0 failed, whatever the output looks like.
- Read the first error, not the last line. Find the root cause, fix it, rerun the same command to prove it.
- "isn't available in the browser runner" or "ES module syntax isn't supported": wrong runner, use the sandbox.
- "command not found" in the browser terminal: the sandbox is off on this site.
- Cannot find module in the sandbox: missing npm install, a wrong relative path, or a missing .js extension in an import.
- If the same fix fails twice, stop repeating it: gather more information (print values, read the docs) or ask.
`,
  });

  add({
    id: "node-server", title: "NODE SERVER TEMPLATE",
    match: /\b(server|backend|back-end|express|api|apis|endpoint|endpoints|rest|node|nodejs|node\.js)\b|שרת|צד שרת/i,
    files: /(^|\/)(server|app)\.m?js$|package\.json$/i,
    text: `
## Layout
app.js builds and exports the app (tests import it), server.js only listens, src/routes/*.js one router per
resource, src/validate.js input checks, public/ the front end, tests/*.test.js, .env.example, README.md.
Check the current major with npm view express version (5.x today). Express 5 sends rejected promises from async
handlers to the error handler; in Express 4 catch inside async handlers. In Express 5 req.body is undefined when
no body was sent: always guard it.

## package.json
  {
    "name": "notes-api", "version": "1.0.0", "private": true, "type": "module",
    "scripts": { "start": "node server.js", "dev": "node --watch server.js", "test": "node --test" },
    "dependencies": { "express": "^5.1.0" }
  }

## app.js
  import express from "express";
  import path from "node:path";
  import { notesRouter } from "./src/routes/notes.js";

  export const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use(express.static(path.join(import.meta.dirname, "public")));
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.use("/api/notes", notesRouter);
  app.use((req, res) => {
    res.status(404).json({ error: { message: "Not found: " + req.method + " " + req.originalUrl } });
  });
  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: { message: "The request body is not valid JSON." } });
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: { message: status >= 500 ? "Something went wrong on the server." : err.message } });
  });

## server.js
  import { app } from "./app.js";
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, "0.0.0.0", () => console.log("API listening on port " + PORT));

## src/routes/notes.js (the Map is the demo store; swap in a database module with the same functions)
  import { Router } from "express";
  import { validateNote } from "../validate.js";

  export const notesRouter = Router();
  const notes = new Map();
  let nextId = 1;
  const notFound = (res) => res.status(404).json({ error: { message: "Note not found." } });

  notesRouter.get("/", (req, res) => res.json({ notes: [...notes.values()] }));
  notesRouter.get("/:id", (req, res) => {
    const note = notes.get(Number(req.params.id));
    if (!note) return notFound(res);
    res.json({ note });
  });
  notesRouter.post("/", (req, res) => {
    const { value, errors } = validateNote(req.body);
    if (errors.length) return res.status(400).json({ error: { message: "Invalid note.", details: errors } });
    const note = { id: nextId++, ...value, createdAt: new Date().toISOString() };
    notes.set(note.id, note);
    res.status(201).json({ note });
  });
  notesRouter.delete("/:id", (req, res) => (notes.delete(Number(req.params.id)) ? res.status(204).end() : notFound(res)));

## src/validate.js: validation without libraries
  export function validateNote(body) {
    const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
    const errors = [];
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title) errors.push({ field: "title", message: "Title is required." });
    else if (title.length > 120) errors.push({ field: "title", message: "Title must be 120 characters or fewer." });
    const text = input.text === undefined ? "" : input.text;
    if (typeof text !== "string") errors.push({ field: "text", message: "Text must be a string." });
    const tags = input.tags === undefined ? [] : input.tags;
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string")) errors.push({ field: "tags", message: "Tags must be a list of strings." });
    return { value: { title, text, tags }, errors };
  }
- Store only the fields you checked (never spread req.body into stored data). Check types, required fields,
  lengths, ranges and enums; Number.isInteger on ids. For big schemas zod is fine (check its version first).

## CORS
- A front end in public/ served by this app is same-origin and needs no CORS. Prefer that.
- A front end on another domain: allow known origins only, never "*" with credentials:
    const ALLOWED = (process.env.CORS_ORIGINS || "").split(",").filter(Boolean);
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && ALLOWED.includes(origin)) {
        res.set({ "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS" });
      }
      if (req.method === "OPTIONS") return res.sendStatus(204);
      next();
    });
  The cors package does the same: app.use(cors({ origin: ALLOWED })).

## Run and try it in the sandbox
  <fizz-sandbox>npm install && npm test</fizz-sandbox>
  <fizz-sandbox background="true">node server.js > /tmp/server.log 2>&1</fizz-sandbox>
  <fizz-sandbox>sleep 2; curl -sS localhost:3000/api/health; curl -sS -i -X POST localhost:3000/api/notes -H "Content-Type: application/json" -d '{"title":"First"}'; curl -sS -i -X POST localhost:3000/api/notes -H "Content-Type: application/json" -d '{}'</fizz-sandbox>
Expect 200, 201 and 400. Read /tmp/server.log if anything fails; restart the server after code changes.

## tests/api.test.js (node:test + fetch)
  import { test, before, after } from "node:test";
  import assert from "node:assert/strict";
  import { app } from "../app.js";

  let server;
  let base;
  before(() => new Promise((done) => {
    server = app.listen(0, () => { base = "http://127.0.0.1:" + server.address().port; done(); });
  }));
  after(() => new Promise((done) => server.close(done)));
  const post = (path, body) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  test("creates a note and reads it back", async () => {
    const res = await post("/api/notes", { title: "  Buy milk  " });
    assert.equal(res.status, 201);
    const { note } = await res.json();
    assert.equal(note.title, "Buy milk");
    assert.equal((await (await fetch(base + "/api/notes/" + note.id)).json()).note.id, note.id);
  });
  test("rejects a note without a title", async () => {
    const res = await post("/api/notes", { text: "no title" });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.details[0].field, "title");
  });
Port 0 picks a free port, so tests never clash with the dev server. node --test finds tests/*.test.js.
Done means: README with install, run, test, every endpoint with an example and every variable; secrets only from
process.env with .env in .gitignore; every route validated, with a 404 path and a test.
`,
  });

  add({
    id: "data-services", title: "DATABASES AND BACKEND SERVICES",
    match: /\b(database|databases|db|supabase|firebase|firestore|sqlite|postgres|postgresql|mysql|mongo|mongodb|prisma|auth|login|signup|sign up|users|accounts)\b|מסד|התחברות|הרשמה|משתמשים/i,
    text: `
## Choosing where data lives
- localStorage: one device, small data, no accounts. IndexedDB for large data, files or offline apps.
- SQLite (better-sqlite3): a server you run yourself, one machine, small to medium data.
- Supabase: hosted Postgres with auth, storage and realtime, used from the browser, protected by row level
  security. The default when users need accounts and shared data without writing a server.
- Firebase (Firestore): hosted document database with auth and realtime listeners, protected by security rules.
- Postgres behind your own server (pg, or Prisma as ORM) for bigger apps with real back-end logic.
- Never build your own password system: use Supabase Auth, Firebase Auth or another proven provider.
- The user owns the Supabase or Firebase project. With <fizz-browser> you can do the setup in their account
  (handoff for login): create the project, run the SQL, copy the project URL and public key into the config.

## Supabase basics
  import { createClient } from "@supabase/supabase-js";
  const supabase = createClient("https://YOUR-PROJECT.supabase.co", "YOUR-PUBLIC-ANON-OR-PUBLISHABLE-KEY");

  const { data: todos, error } = await supabase.from("todos").select("id, title, done").order("created_at", { ascending: false });
  if (error) throw error;
  const { data: created } = await supabase.from("todos").insert({ title: "Call Dana" }).select().single();
  await supabase.from("todos").update({ done: true }).eq("id", created.id);
  await supabase.from("todos").delete().eq("id", created.id);

  await supabase.auth.signUp({ email, password });
  const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
  const { data: { user } } = await supabase.auth.getUser();
  supabase.auth.onAuthStateChange((event, session) => renderApp(session));
  await supabase.auth.signOut();
- Every call returns { data, error }: check error every time and show a helpful message. The bare import works in
  the preview (FIZZ maps it to esm.sh); keep the client in js/supabase.js. Check the docs for unusual calls.

## Row level security is mandatory
The anon / publishable key is public by design: anyone can read it from the page. RLS is what protects the data.
Ship the SQL in supabase/schema.sql for the SQL editor:
  create table public.todos (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    title text not null check (char_length(title) between 1 and 200),
    done boolean not null default false,
    created_at timestamptz not null default now()
  );
  alter table public.todos enable row level security;
  create policy "read own todos" on public.todos for select using ((select auth.uid()) = user_id);
  create policy "insert own todos" on public.todos for insert with check ((select auth.uid()) = user_id);
  create policy "update own todos" on public.todos for update using ((select auth.uid()) = user_id);
  create policy "delete own todos" on public.todos for delete using ((select auth.uid()) = user_id);
- RLS on with no policy returns nothing: the safe default. Test as two different users.
- The service_role / secret key bypasses RLS: only on a server or in a serverless function, never in the browser.

## Firebase (modular SDK)
  import { initializeApp } from "firebase/app";
  import { getFirestore, collection, addDoc, getDocs, query, orderBy, doc, updateDoc, serverTimestamp } from "firebase/firestore";
  import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";

  const app = initializeApp({ apiKey: "...", authDomain: "...", projectId: "...", appId: "..." });
  const db = getFirestore(app);
  const auth = getAuth(app);
  onAuthStateChanged(auth, (user) => renderApp(user));
  await signInWithEmailAndPassword(auth, email, password);
  const notes = collection(db, "users", auth.currentUser.uid, "notes");
  await addDoc(notes, { title: "First note", done: false, createdAt: serverTimestamp() });
  const snap = await getDocs(query(notes, orderBy("createdAt", "desc")));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  await updateDoc(doc(notes, list[0].id), { done: true });
- The web config (apiKey included) is public; security rules protect the data. Ship them in firestore.rules:
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /users/{uid}/{document=**} {
          allow read, write: if request.auth != null && request.auth.uid == uid;
        }
      }
    }
  Never leave test-mode rules ("if true"). firebase-admin and service-account JSON belong on a server only.

## SQLite with better-sqlite3 (sandbox or your server)
  import Database from "better-sqlite3";
  const db = new Database(process.env.DB_PATH || "data/app.db");
  db.pragma("journal_mode = WAL");
  db.exec("CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))");
  const insertNote = db.prepare("INSERT INTO notes (title) VALUES (?)");
  const getNote = db.prepare("SELECT * FROM notes WHERE id = ?");
  const renameNote = db.prepare("UPDATE notes SET title = @title WHERE id = @id");
  export const createNote = (title) => getNote.get(insertNote.run(title).lastInsertRowid);
  export const updateTitle = (id, title) => renameNote.run({ id, title }).changes > 0;
  export const importNotes = db.transaction((titles) => { for (const t of titles) insertNote.run(t); });
- Synchronous API. Prepare statements once, pass values as parameters, never concatenate SQL.
- In the sandbox use DB_PATH=/tmp/app.db so the binary file doesn't come back into the project; add *.db to
  .gitignore. If the native install fails, compare npm view better-sqlite3 engines with node --version.
- Postgres: the pg package, a Pool, parameters as $1, $2: pool.query("SELECT * FROM notes WHERE id = $1", [id]).

## Rules for every backend
- Service-role, secret, admin and database keys never go in front-end code or public/: server environment only.
- Check permissions on the server (or with RLS / rules), never only by hiding buttons. Validate before writing.
- Plan the data shape first (tables or collections, ids, timestamps, owner) and write it in the README.
`,
  });

  add({
    id: "ai-features", title: "ADDING AI FEATURES TO APPS",
    match: /\b(ai|a\.i\.|gpt|chatgpt|llm|llms|chatbot|chat bot|openai|anthropic|claude|gemini|openrouter|assistant|copilot|prompt|embeddings)\b|בינה מלאכותית|צ'אטבוט|צאטבוט|עוזר חכם/i,
    text: `
## Architecture: the key stays on a server
- The browser never calls the AI provider directly and never sees the key. The app calls its own endpoint (an
  Express route, a Vercel or Netlify function) that holds the key in an environment variable, checks the input,
  limits usage and calls the provider. A static site without a server can't have AI features: offer the sandbox
  server or a serverless function. Never ship a key "temporarily" in front-end code.
- Model names change often: never guess. Look up the provider's current models with <fizz-search> and <fizz-fetch>
  and read the model from process.env.AI_MODEL. Use the official SDK (@anthropic-ai/sdk, openai, @google/genai)
  at a version you checked with npm view. OpenRouter and many others speak the OpenAI chat API (openai with baseURL).
- Keys go in .env (listed in .gitignore) and .env.example lists the names. FIZZ's push and deploy leave .env out,
  but a key written into any other file would be uploaded.

## A streaming proxy endpoint (Express, Anthropic SDK)
  import Anthropic from "@anthropic-ai/sdk";
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const SYSTEM = "You are the help assistant of Northwind Bikes. Answer questions about our bikes, repairs and opening hours. Be brief and friendly. If you don't know, say so and suggest calling the shop.";

  function cleanMessages(list) {
    if (!Array.isArray(list)) return null;
    const ok = list.slice(-20).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim());
    return ok.length && ok[0].role === "user" ? ok.map((m) => ({ role: m.role, content: m.content.slice(0, 8000) })) : null;
  }

  app.post("/api/chat", rateLimit, async (req, res) => {
    const messages = cleanMessages(req.body && req.body.messages);
    if (!messages) return res.status(400).json({ error: { message: "Send messages: [{ role, content }]." } });
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.flushHeaders();
    const send = (obj) => res.write("data: " + JSON.stringify(obj) + "\\n\\n");
    const stream = client.messages.stream({ model: process.env.AI_MODEL, max_tokens: 1024, system: SYSTEM, messages });
    res.on("close", () => { if (!res.writableEnded) stream.abort(); });
    stream.on("text", (text) => send({ text }));
    try {
      await stream.finalMessage();
      send({ done: true });
    } catch (err) {
      if (!res.writableEnded) { console.error(err); send({ error: "The assistant is unavailable right now. Please try again." }); }
    }
    res.end();
  });
- With the openai package: const stream = await openai.chat.completions.create({ model, messages, stream: true });
  for await (const chunk of stream) { const t = chunk.choices[0]?.delta?.content; if (t) send({ text: t }); }
  (the system prompt is the first message, role "system").
- A per-IP rate limiter (use Redis or similar when there are several server instances):
    const hits = new Map();
    function rateLimit(req, res, next) {
      const now = Date.now();
      const recent = (hits.get(req.ip) || []).filter((t) => now - t < 60000);
      if (recent.length >= 10) return res.status(429).json({ error: { message: "Too many messages. Wait a minute and try again." } });
      hits.set(req.ip, [...recent, now]);
      next();
    }

## Reading the stream in the browser
  export async function streamChat(messages, onText, signal) {
    const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages }), signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body.error && body.error.message) || "The assistant is unavailable (HTTP " + res.status + ").");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\\n\\n");
      buffer = events.pop();
      for (const evt of events) {
        if (!evt.startsWith("data: ")) continue;
        const data = JSON.parse(evt.slice(6));
        if (data.error) throw new Error(data.error);
        if (data.text) onText(data.text);
      }
    }
  }
- Stop: const controller = new AbortController(); pass controller.signal; controller.abort() on click. Treat the
  AbortError as "stopped", not a failure, and keep the partial answer.

## Chat UI essentials
- A scrolling message list (user and assistant bubbles), an auto-growing textarea, Enter sends, Shift+Enter makes
  a new line, the send button turns into Stop while streaming.
- Stream text into the last bubble; stay pinned to the bottom unless the user scrolled up. A typing indicator before
  the first token, a clear error with Retry, an empty state with 3 example questions to click.
- Markdown only through a sanitizer:
    import { marked } from "marked";
    import DOMPurify from "dompurify";
    bubble.innerHTML = DOMPurify.sanitize(marked.parse(fullText));
  (or plain text while streaming and markdown once at the end).
- Keep the conversation in state, send the last N messages, offer New chat, save chats in localStorage if useful,
  announce new answers in an aria-live="polite" region.

## Designing the prompt for an app feature
- The system prompt states the role, the task, the facts it may use, the limits (what to refuse, length, tone,
  language) and the output format. Keep it in its own server file (src/prompts.js) so it's easy to tune.
- Put user content inside clear delimiters and treat it as data: "Summarise the review between <review> tags".
- For structured results (tags, a score, extracted fields) ask for JSON matching a schema, then JSON.parse and
  validate it on the server; handle output that doesn't parse. One or two short examples of good output help.
- Test with messy, empty, very long and hostile inputs. The model suggests; your code decides permissions and money.

## Cost, limits and failure
- Cap max_tokens, trim history, limit request size, rate-limit per user or IP, and have the user set a budget alert
  in the provider's dashboard. A smaller, cheaper model for simple tasks (classification, short replies).
- Cache answers to identical requests when it makes sense; log token usage from the responses.
- 429 and 5xx happen: the SDKs retry a few times; after that show a friendly message, never a stack trace.
`,
  });

  add({
    id: "bots-automation", title: "BOTS, SCRAPERS AND AUTOMATIONS",
    match: /\b(bot|bots|telegram|discord|whatsapp|slack bot|scrape|scraper|scraping|crawler|crawl|automation|automate|cron|schedule|scheduled)\b|בוט|אוטומציה|סורק|טלגרם|דיסקורד/i,
    text: `
## Ground rules
- Tokens come from environment variables (.env, never in code or the chat); ship .env.example with the names.
- Build and test in the sandbox: node --env-file=.env bot.js. The sandbox stops after about 30 minutes, so for a
  24/7 bot tell the user where to host it (Render, Railway, Fly.io, a small VPS) or use webhooks on a serverless host.
- Log one line per event and catch errors per message, so one bad update doesn't kill the bot.

## Telegram bot with plain fetch
The user creates the bot with @BotFather and puts the token in .env as TELEGRAM_BOT_TOKEN.
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TOKEN) { console.error("Set TELEGRAM_BOT_TOKEN in .env"); process.exit(1); }
  const API = "https://api.telegram.org/bot" + TOKEN + "/";
  async function call(method, params) {
    const res = await fetch(API + method, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params || {}) });
    const data = await res.json();
    if (!data.ok) throw new Error(method + " failed: " + data.description);
    return data.result;
  }
  async function handle(update) {
    const msg = update.message;
    if (!msg || !msg.text) return;
    if (msg.text === "/start") return call("sendMessage", { chat_id: msg.chat.id, text: "Hi! Send me a word and I will count its letters." });
    await call("sendMessage", { chat_id: msg.chat.id, text: msg.text.trim() + " has " + [...msg.text.trim()].length + " letters." });
  }
  let offset = 0;
  while (true) {
    try {
      for (const u of await call("getUpdates", { offset, timeout: 30, allowed_updates: ["message"] })) {
        offset = u.update_id + 1;
        await handle(u).catch((err) => console.error("update " + u.update_id, err.message));
      }
    } catch (err) {
      console.error(err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
- getUpdates long polling is simple but needs a process that keeps running. For serverless hosting use a webhook:
  setWebhook with { url: "https://your-host/telegram", secret_token: SECRET }; Telegram POSTs each update; check
  req.get("X-Telegram-Bot-Api-Secret-Token") === SECRET and answer 200 fast. getUpdates fails while a webhook is set.
- Formatting: parse_mode "HTML" with <b>, <i>, <a href>; escape &, < and > in user text.

## Discord bot with discord.js
  import { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
  const commands = [new SlashCommandBuilder().setName("ping").setDescription("Check that the bot is alive").toJSON()];
  await new REST().setToken(process.env.DISCORD_TOKEN).put(Routes.applicationGuildCommands(process.env.DISCORD_APP_ID, process.env.DISCORD_GUILD_ID), { body: commands });
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.once(Events.ClientReady, (c) => console.log("Logged in as " + c.user.tag));
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === "ping") await interaction.reply("Pong!");
  });
  client.login(process.env.DISCORD_TOKEN);
- Register commands in a separate script in real projects. Prefer slash commands: reading normal messages needs
  GatewayIntentBits.GuildMessages plus MessageContent, a privileged intent the user must enable in the Developer
  Portal (Bot settings) or message text arrives empty. Request only the intents you use.
- Check the current discord.js major with npm view discord.js version before unusual APIs.

## WhatsApp
- The official route is the WhatsApp Business Cloud API from Meta (business account, verified number, webhooks,
  approved templates for business-initiated messages). Libraries that drive WhatsApp Web break the terms and get
  numbers banned: explain this instead of building on them.

## Scraping with fetch and cheerio (sandbox)
  import * as cheerio from "cheerio";
  import fs from "node:fs";
  const UA = "NorthwindResearchBot/1.0 (contact: owner@example.com)";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function get(url, tries = 3) {
    for (let i = 1; ; i++) {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) return res.text();
      if (i >= tries || ![429, 500, 502, 503, 504].includes(res.status)) throw new Error(url + " returned HTTP " + res.status);
      await sleep(1000 * 2 ** i);
    }
  }
  const start = "https://example.com/blog";
  const $ = cheerio.load(await get(start));
  const posts = $("article").map((i, el) => ({
    title: $(el).find("h2").text().trim(),
    url: new URL($(el).find("a").attr("href"), start).href,
    date: $(el).find("time").attr("datetime") || null,
  })).get();
  fs.mkdirSync("out", { recursive: true });
  fs.writeFileSync("out/posts.json", JSON.stringify(posts, null, 2));
  console.log("Saved " + posts.length + " posts");
- Read robots.txt and the terms first; prefer an official API or RSS feed. Go slowly (a second or more between
  requests), identify yourself in the User-Agent, cache fetched pages, never scrape behind a login or collect
  personal data without a clear right to.
- cheerio sees only the server's HTML. For JavaScript-built pages, find the JSON API the page calls or data embedded
  in a script tag first; Playwright in the sandbox is the last resort (may need extra system packages); for
  one-off tasks use <fizz-browser>. Report the number of items found so a broken selector shows up as "0 items".

## Scheduling
- Inside an always-on Node process, node-cron:
    import cron from "node-cron";
    cron.schedule("0 8 * * *", () => sendDailyReport().catch(console.error), { timezone: "Asia/Jerusalem" });
- Without a server: GitHub Actions (on: schedule: - cron: "0 6 * * *", UTC, may start late; add workflow_dispatch for
  manual runs; map repository secrets to env with the secrets expression), Vercel Cron Jobs ("crons": [{ "path":
  "/api/daily", "schedule": "0 6 * * *" }] in vercel.json; check the CRON_SECRET bearer header in the route), or
  Netlify scheduled functions (export const config = { schedule: "@daily" }).
- Every scheduled job is idempotent (safe to run twice), logs its result and alerts someone when it fails.
`,
  });

  add({
    id: "python-scripts", title: "PYTHON PROJECTS IN DEPTH",
    match: /\b(python|py|pandas|numpy|matplotlib|flask|fastapi|uvicorn|django|pytest|script|scripts|automation|csv|jupyter)\b|\.py\b|פייתון|סקריפט/i,
    files: /\.py$|requirements\.txt$/i,
    text: `
## Where Python runs
- Browser terminal (<fizz-run>python main.py</fizz-run>): Pyodide, Python 3.13. numpy, pandas, matplotlib and other
  Pyodide packages load from the imports; pip install adds pure-Python wheels (openpyxl, pypdf). Uploaded binary
  files are readable and written files come back into the project. Limits: 3 minutes, no network sockets (no HTTP
  requests to the internet, no servers), no input(), no native packages outside Pyodide's set.
- Cloud sandbox: real CPython (check python3 --version) for servers, network access, native packages, long jobs.
  Create the virtualenv outside the project folder, because changed files come back into the project:
    <fizz-sandbox>python3 -m venv ~/.venvs/app && ~/.venvs/app/bin/pip install -r requirements.txt</fizz-sandbox>
  Then call ~/.venvs/app/bin/python, ~/.venvs/app/bin/uvicorn directly (activate doesn't carry over).

## Script template (main.py)
  """Summarise a sales CSV: totals per category and a monthly chart."""
  from __future__ import annotations
  import argparse
  import logging
  import sys
  from pathlib import Path

  log = logging.getLogger("sales")

  def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
      p = argparse.ArgumentParser(description=__doc__)
      p.add_argument("input", type=Path, help="CSV file with date, category and amount columns")
      p.add_argument("-o", "--out", type=Path, default=Path("out"), help="folder for the results")
      p.add_argument("-v", "--verbose", action="store_true", help="show debug output")
      return p.parse_args(argv)

  def main(argv: list[str] | None = None) -> int:
      args = parse_args(argv)
      logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(message)s")
      if not args.input.is_file():
          log.error("Input file not found: %s", args.input)
          return 1
      args.out.mkdir(parents=True, exist_ok=True)
      summary = analyse(args.input, args.out)
      log.info("Done: %d rows, results in %s", summary["rows"], args.out)
      return 0

  if __name__ == "__main__":
      sys.exit(main())
- Type hints on public functions, pathlib everywhere, logging for progress, a clear error and a non-zero exit code
  on failure. Ship sample data (data/sample.csv) so it runs out of the box, and a README with the exact command.

## Data analysis with pandas
  import matplotlib
  matplotlib.use("Agg")
  import matplotlib.pyplot as plt
  import pandas as pd

  def analyse(path: Path, out: Path) -> dict:
      df = pd.read_csv(path)
      df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
      df["date"] = pd.to_datetime(df["date"], errors="coerce")
      df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
      before = len(df)
      df = df.dropna(subset=["date", "amount"]).drop_duplicates()
      log.info("Kept %d of %d rows after cleaning", len(df), before)
      by_cat = df.groupby("category")["amount"].agg(["count", "sum", "mean"]).sort_values("sum", ascending=False)
      monthly = df.groupby(df["date"].dt.to_period("M"))["amount"].sum()
      print(by_cat.round(2).to_string())
      fig, ax = plt.subplots(figsize=(8, 4.5))
      ax.bar(monthly.index.astype(str), monthly.values, color="#2563eb")
      ax.set_title("Revenue per month")
      ax.spines[["top", "right"]].set_visible(False)
      fig.autofmt_xdate()
      fig.savefig(out / "monthly.png", dpi=150, bbox_inches="tight")
      plt.close(fig)
      by_cat.to_csv(out / "by_category.csv")
      return {"rows": len(df)}
- Normalise column names, coerce types with errors="coerce", report dropped rows, print a short summary (not the
  whole frame), save results to files, attach the chart. Excel input: pd.read_excel needs openpyxl.

## FastAPI app (sandbox)
  # main.py
  from fastapi import FastAPI, HTTPException
  from pydantic import BaseModel, Field

  app = FastAPI(title="Notes API")

  class NoteIn(BaseModel):
      title: str = Field(min_length=1, max_length=120)
      text: str = ""

  class Note(NoteIn):
      id: int

  notes: dict[int, Note] = {}

  @app.get("/api/health")
  def health() -> dict:
      return {"ok": True}

  @app.post("/api/notes", status_code=201)
  def create_note(body: NoteIn) -> Note:
      note = Note(id=len(notes) + 1, **body.model_dump())
      notes[note.id] = note
      return note

  @app.get("/api/notes/{note_id}")
  def get_note(note_id: int) -> Note:
      if note_id not in notes:
          raise HTTPException(status_code=404, detail="Note not found")
      return notes[note_id]
Run and check (FastAPI answers invalid bodies with 422 and serves interactive docs at /docs):
  <fizz-sandbox background="true">~/.venvs/app/bin/uvicorn main:app --host 0.0.0.0 --port 3000 > /tmp/api.log 2>&1</fizz-sandbox>
  <fizz-sandbox>sleep 3; curl -sS localhost:3000/api/health; curl -sS -i -X POST localhost:3000/api/notes -H "Content-Type: application/json" -d '{"title":""}'; tail -n 20 /tmp/api.log</fizz-sandbox>

## Flask equivalent
  from flask import Flask, jsonify, request

  app = Flask(__name__)
  notes: dict[int, dict] = {}

  @app.post("/api/notes")
  def create_note():
      data = request.get_json(silent=True) or {}
      title = str(data.get("title", "")).strip()
      if not title:
          return jsonify(error={"message": "Title is required."}), 400
      note = {"id": len(notes) + 1, "title": title}
      notes[note["id"]] = note
      return jsonify(note), 201

  @app.errorhandler(404)
  def not_found(_err):
      return jsonify(error={"message": "Not found"}), 404

  if __name__ == "__main__":
      app.run(host="0.0.0.0", port=3000)
In production use a WSGI server: gunicorn -b 0.0.0.0:3000 app:app.

## requirements.txt and tests
- Pin versions you have seen install (fastapi, uvicorn, pytest, httpx for TestClient); get them with
  ~/.venvs/app/bin/pip show fastapi uvicorn or pip index versions <package>; never invent them.
- tests/test_main.py:
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)

    def test_creates_note():
        res = client.post("/api/notes", json={"title": "Hello"})
        assert res.status_code == 201
        assert res.json()["title"] == "Hello"

    def test_rejects_empty_title():
        assert client.post("/api/notes", json={"title": ""}).status_code == 422
- Run ~/.venvs/app/bin/python -m pytest -q -p no:cacheprovider (keeps .pytest_cache out of the project). Keep logic
  in plain functions so most tests need no server.
`,
  });

  add({
    id: "deploy", title: "DEPLOYING AND SHARING",
    match: /\b(deploy|deploying|deployment|publish|host|hosting|domain|vercel|netlify|github pages|pages|online|live|go live|launch)\b|להעלות|לפרסם|העלאה לאוויר|דומיין|אחסון/i,
    text: `
## Picking a host
- Static site or front-end app: GitHub Pages, Vercel or Netlify (free for small sites, HTTPS included).
- Static front end plus a few API routes (contact form, AI proxy, webhooks): Vercel or Netlify functions.
- Long-running servers, websockets, bots: an always-on host (Render, Railway, Fly.io, a VPS).
- From FIZZ DEV the user can deploy to Vercel (Deploy button or /deploy, it uploads the project files), push to
  GitHub (Push to GitHub) and download a ZIP (/export) for Netlify Drop or any other host.

## GitHub Pages
- Push the project, then Settings, Pages, Build and deployment: Deploy from a branch, main, / (root). The site
  appears at https://USER.github.io/REPO/ after a minute or two.
- That URL has a sub-path, so every link and asset must be relative (css/site.css, not /css/site.css): the number
  one reason Pages sites look broken. Add an empty .nojekyll file if names start with an underscore.
- Sites that need a build (Vite): Pages source GitHub Actions and .github/workflows/pages.yml:
    name: Deploy to GitHub Pages
    on:
      push:
        branches: [main]
      workflow_dispatch:
    permissions:
      contents: read
      pages: write
      id-token: write
    concurrency:
      group: pages
      cancel-in-progress: true
    jobs:
      deploy:
        runs-on: ubuntu-latest
        environment:
          name: github-pages
        steps:
          - uses: actions/checkout@v5
          - uses: actions/setup-node@v5
            with:
              node-version: 22
          - run: npm ci && npm run build
          - uses: actions/configure-pages@v5
          - uses: actions/upload-pages-artifact@v4
            with:
              path: dist
          - uses: actions/deploy-pages@v4
  Check the current major versions of these actions with <fizz-search>. With Vite set base: "./" in vite.config.js.
  Pushing workflow files needs GitHub's workflow permission; if FIZZ asks the user to reconnect GitHub, that's why.

## Vercel
- Static projects deploy as they are (index.html at the root). Functions go in api/ (api/contact.js is /api/contact):
    export default async function handler(req, res) {
      if (req.method !== "POST") return res.status(405).json({ error: { message: "Use POST." } });
      const { email } = req.body || {};
      if (typeof email !== "string" || !email.includes("@")) return res.status(400).json({ error: { message: "Enter a valid email." } });
      res.status(200).json({ ok: true });
    }
  Check Vercel's current function docs with <fizz-search> for runtimes and the Web-standard handler form.
- vercel.json only when needed. A single-page app with history routing:
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }; hash routes need nothing.

## Netlify
- Static: drop the folder or ZIP on Netlify Drop, or connect the repo. netlify.toml: [build] with publish = "."
  (for Vite: command = "npm run build", publish = "dist"). SPA routing: a _redirects file with /* /index.html 200
- Functions in netlify/functions/hello.mjs:
    export default async (req) => Response.json({ message: "Hello" });
    export const config = { path: "/api/hello" };

## Environment variables and domains
- Secrets go in the host's dashboard (Vercel: Project Settings, Environment Variables; Netlify: Site configuration,
  Environment variables), never in deployed or pushed files. Redeploy after changing them. Only server code can
  read them; anything the browser gets is public. GitHub Pages is static only and can't keep a secret.
- Custom domain: add it in the host's domain settings, then create exactly the DNS records the host shows (usually a
  CNAME for www and an A or ALIAS record for the bare domain). HTTPS is automatic; DNS can take minutes to hours.
  Redirect one version (www or bare) to the other.

## Before publishing: the checklist
- Each page: unique <title>, meta description, Open Graph tags (og:image as an absolute https URL), lang and dir,
  a favicon (<fizz-export from="logo.svg" format="icons"/>).
- A 404.html in the site's style (Pages, Netlify and Vercel serve it automatically).
- All paths relative, every external asset on https (mixed content is blocked), no localhost URLs left.
- No secrets: grep -rnE "sk-|secret|password|api_key" and make sure .env is not part of what gets deployed or pushed.
- Forms post to a real endpoint or service, or clearly say they are a demo.
- Open the live URL with <fizz-browser>, click through, check the console, and check it on a phone.
`,
  });

  add({
    id: "documents-deep", title: "DOCUMENT RECIPES",
    match: /\b(pdf|pdfs|docx|word|xlsx|excel|spreadsheet|pptx|powerpoint|presentation|slides|deck|pitch deck|invoice|invoices|cv|resume|report|certificate|brochure|letter)\b|מצגת|קורות חיים|חשבונית|מסמך|דוח|אקסל|תעודה/i,
    text: `
## How document scripts run in FIZZ
- Write the script as a project file (scripts/make-report.js) and run <fizz-run>node scripts/make-report.js</fizz-run>.
  It runs in the browser worker: CommonJS with top-level await; require("docx"), require("xlsx"), require("pptxgenjs"),
  require("jspdf"), require("pdf-lib") load on first use, plus fs, path and project files (require("../data/sales.json")).
- Save with fizz.writeFile("out/report.docx", data), data a string, Uint8Array, ArrayBuffer or Blob (fs.writeFileSync
  does the same). The terminal prints "wrote out/report.docx (size)". Then <fizz-attach path="out/report.docx"/>.
- This runner can't read binary project files. To read an uploaded spreadsheet or PDF use Python in the browser
  terminal (pandas with openpyxl, pypdf). Images in generated files: draw them (shapes, charts) or embed a base64
  data URI written into the script.
- Keep the content in data/*.json and the layout in the script, so updates are easy.

## Word report (docx)
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, ShadingType, Footer, PageNumber } = require("docx");
  const ACCENT = "1F4E79";
  const rows = [["Region", "Q1", "Q2", "Change"], ["North", "120,000", "138,000", "+15%"], ["South", "96,000", "101,000", "+5%"]];
  const cell = (text, header) => new TableCell({
    shading: header ? { type: ShadingType.CLEAR, color: "auto", fill: ACCENT } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text: text, bold: header, color: header ? "FFFFFF" : "111827" })] })],
  });
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((r, i) => new TableRow({ tableHeader: i === 0, children: r.map((t) => cell(t, i === 0)) })),
  });
  const doc = new Document({
    creator: "Northwind", title: "Quarterly Sales Report",
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{
      properties: { page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 18, color: "6B7280" })] })] }) },
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun("Quarterly Sales Report")] }),
        new Paragraph({ children: [new TextRun({ text: "Prepared for the board, April 2026", italics: true, color: "6B7280" })] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Summary")] }),
        new Paragraph({ spacing: { after: 120 }, children: [new TextRun("Revenue grew in every region. The North led with a 15% increase.")] }),
        new Paragraph({ text: "New distributor in the North from February", bullet: { level: 0 } }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Results by region")] }),
        table,
      ],
    }],
  });
  fizz.writeFile("out/report.docx", await Packer.toBlob(doc));
- Font size is in half-points (22 = 11pt), margins in twips (1134 = 2 cm). Real heading levels (Word builds the
  navigation pane and table of contents from them), one font, one accent color, page numbers in the footer.
- Hebrew: new Paragraph({ bidirectional: true, children: [new TextRun({ text: "...", rightToLeft: true })] }).

## Excel workbook (xlsx / SheetJS)
  const XLSX = require("xlsx");
  const items = [["Design", 12, 450], ["Development", 40, 520], ["Testing", 10, 380]];
  const data = [["Item", "Hours", "Rate", "Total"]];
  items.forEach((it, i) => data.push([it[0], it[1], it[2], { t: "n", v: it[1] * it[2], f: "B" + (i + 2) + "*C" + (i + 2), z: "#,##0.00" }]));
  const last = items.length + 1;
  const hours = items.reduce((n, it) => n + it[1], 0);
  const total = items.reduce((n, it) => n + it[1] * it[2], 0);
  data.push(["Total", { t: "n", v: hours, f: "SUM(B2:B" + last + ")" }, "", { t: "n", v: total, f: "SUM(D2:D" + last + ")", z: "#,##0.00" }]);
  const sheet = XLSX.utils.aoa_to_sheet(data);
  sheet["!cols"] = [{ wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 14 }];
  sheet["!autofilter"] = { ref: "A1:D" + last };
  const summary = XLSX.utils.aoa_to_sheet([
    ["Summary", ""],
    ["Total hours", { t: "n", v: hours, f: "Data!B" + (last + 1) }],
    ["Total amount", { t: "n", v: total, f: "Data!D" + (last + 1), z: "#,##0.00" }],
    ["Average rate", { t: "n", v: Math.round((total / hours) * 100) / 100, f: "ROUND(B3/B2,2)" }],
  ]);
  summary["!cols"] = [{ wch: 18 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summary, "Summary");
  XLSX.utils.book_append_sheet(wb, sheet, "Data");
  fizz.writeFile("out/budget.xlsx", XLSX.write(wb, { type: "array", bookType: "xlsx" }));
- Formulas are cells like { t: "n", f: "SUM(D2:D4)" }; also set v (the computed value) so previews that don't
  recalculate show numbers. z is the number format ("#,##0.00", "0%", "yyyy-mm-dd"). Quote sheet names with spaces
  in formulas ('Sales Data'!B2). Raw data on one sheet, the summary on another, one header row, no merged cells.
- This SheetJS build writes values, formulas, number formats, widths and filters, but not cell styles (bold, fills,
  borders). If styling matters, say so or make the report a docx or PDF. Hebrew: wb.Workbook = { Views: [{ RTL: true }] }.

## PowerPoint deck (pptxgenjs)
  const PptxGenJS = require("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inches, 16:9
  pptx.title = "Northwind Pitch";
  const INK = "111827", MUTED = "6B7280", ACCENT = "2563EB", FONT = "Calibri";
  pptx.defineSlideMaster({
    title: "CONTENT", background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: ACCENT } } },
      { text: { text: "Northwind", options: { x: 0.6, y: 7.0, w: 4, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED } } },
    ],
    slideNumber: { x: 12.3, y: 7.0, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED },
  });
  const title = pptx.addSlide();
  title.background = { color: INK };
  title.addText("Northwind", { x: 0.8, y: 2.3, w: 11.7, h: 1.2, fontFace: FONT, fontSize: 48, bold: true, color: "FFFFFF" });
  title.addText("Fresh groceries delivered in 30 minutes", { x: 0.8, y: 3.5, w: 11.7, h: 0.7, fontFace: FONT, fontSize: 24, color: "D1D5DB" });
  const problem = pptx.addSlide({ masterName: "CONTENT" });
  problem.addText("The problem", { x: 0.6, y: 0.5, w: 12, h: 0.8, fontFace: FONT, fontSize: 32, bold: true, color: INK });
  problem.addText([
    { text: "Families spend 3 hours a week shopping", options: { bullet: true } },
    { text: "Same-day delivery costs more than the groceries", options: { bullet: true } },
  ], { x: 0.6, y: 1.6, w: 7.5, h: 4.5, fontFace: FONT, fontSize: 22, color: INK, paraSpaceAfter: 14, valign: "top" });
  problem.addNotes("Open with the 3-hour figure from our survey of 400 families.");
  const traction = pptx.addSlide({ masterName: "CONTENT" });
  traction.addText("Traction", { x: 0.6, y: 0.5, w: 12, h: 0.8, fontFace: FONT, fontSize: 32, bold: true, color: INK });
  traction.addChart(pptx.ChartType.bar, [{ name: "Orders", labels: ["Jan", "Feb", "Mar", "Apr"], values: [1200, 1850, 2600, 3900] }], {
    x: 0.6, y: 1.5, w: 12, h: 5.2, barDir: "col", chartColors: [ACCENT], showValue: true,
    dataLabelFormatCode: "#,##0", valAxisLabelFormatCode: "#,##0", catAxisLabelFontSize: 14, showLegend: false,
  });
  fizz.writeFile("out/pitch.pptx", await pptx.write({ outputType: "uint8array" }));
- Positions are inches on the 13.33 x 7.5 canvas: 0.6 inch margins, the title in the same place on every slide.
  Other charts: pptx.ChartType.line, pie, doughnut, area; several series = several { name, labels, values }.
- Hebrew text: add rtlMode: true and align: "right" to the text options.

## HTML to PDF with <fizz-export> (best for designed documents)
FIZZ renders the page 794px wide and cuts it every 1123px from the top (A4). So build the document from page
elements of exactly that size, stacked with no gaps, margins or body padding:
  <body>
    <section class="page">
      <header><h1>Invoice</h1><p class="muted">No. 2026-014 · 16 April 2026</p></header>
      <table class="lines">
        <thead><tr><th>Description</th><th class="num">Hours</th><th class="num">Amount</th></tr></thead>
        <tbody><tr><td>Website design</td><td class="num">12</td><td class="num">5,400.00</td></tr></tbody>
      </table>
      <p class="total">Total due <strong>26,200.00</strong></p>
      <footer class="foot">Northwind Studio · Payment within 30 days</footer>
    </section>
  </body>
css/print.css:
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body { font: 11pt/1.5 "Inter", system-ui, sans-serif; color: #111827; }
  .page { width: 794px; height: 1123px; padding: 64px 72px; overflow: hidden; display: flex; flex-direction: column; }
  .lines { width: 100%; border-collapse: collapse; margin-top: 32px; }
  .lines th, .lines td { padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: start; }
  .num { text-align: end; font-variant-numeric: tabular-nums; }
  .foot { margin-top: auto; font-size: 9pt; color: #6b7280; }
  @media print { @page { size: A4; margin: 0; } .page { break-after: page; } }
Then <fizz-screenshot path="invoice.html"/> to check page one, <fizz-export from="invoice.html" to="out/invoice.pdf"
format="a4"/> and <fizz-attach path="out/invoice.pdf"/>.
- Content that doesn't fit a page is cut off: split it across .page elements yourself (up to 60 pages).
  Landscape: landscape="true" with 1123x794 pages. Letter: 816x1056. A5: 559x794.
- The PDF's text is an image (not selectable). For selectable text write a jsPDF script:
    const { jsPDF } = require("jspdf");
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(22); pdf.text("Invoice 2026-014", 20, 25);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(11); pdf.text("26,200.00", 190, 60, { align: "right" });
    fizz.writeFile("out/invoice.pdf", pdf.output("arraybuffer"));
  jsPDF's built-in fonts have no Hebrew letters: Hebrew documents go through the HTML export. pdf-lib creates or
  stamps PDFs (PDFDocument.create, addPage, drawText, await doc.save()).

## Design guidance by document
- CV: one page (two for long careers). Name large, title and a contact line, a 2–3 line profile, experience newest
  first (role, company, dates, 2–4 bullets that start with a verb and include a number), education, skills,
  languages. White space, one accent color, no skill bars, real text in the docx version for ATS. Ask for the
  person's real details; never invent employers.
- Invoice: seller and buyer blocks, invoice number, issue and due dates, lines with quantity, unit price and total,
  subtotal, VAT (18% in Israel today: confirm the current rate), total due in bold, payment details and terms.
  Numbers right-aligned with tabular figures, money formatted with Intl.NumberFormat.
- Report: title block, an executive summary first (the answer in 3–5 bullets), numbered sections, charts whose title
  is the takeaway ("North grew 15%"), tables with units, sources at the end, page numbers.
- Pitch deck (10–12 slides): title, problem, solution, product, market, business model, traction, competition,
  team, the ask. One idea per slide stated in the headline, 3–5 bullets at most, big numbers, charts over tables,
  details in the speaker notes.
- Certificate: landscape, centered, a big name, what it's for, date, signature line, a simple SVG border or seal.
`,
  });

  add({
    id: "extensions-deep", title: "BROWSER EXTENSION TEMPLATE",
    match: /\b(extension|extensions|chrome extension|browser extension|manifest|manifest v3|mv3|add-on|addon|add-ons|firefox addon|popup)\b|תוסף|תוספים/i,
    files: /(^|\/)manifest\.json$/i,
    text: `
## The example: highlight a chosen word on every page and count matches on the toolbar badge
Files: manifest.json, popup.html, popup.css, popup.js, background.js, content.js, icons/ (make them with
<fizz-export from="icon.svg" format="icons"/>, which includes 16, 48 and 128).

## manifest.json
  {
    "manifest_version": 3,
    "name": "Word Highlighter",
    "version": "1.0.0",
    "description": "Highlights the word you choose on every page and counts the matches.",
    "icons": { "16": "icons/icon-16.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" },
    "action": { "default_popup": "popup.html", "default_title": "Word Highlighter" },
    "background": { "service_worker": "background.js" },
    "permissions": ["storage"],
    "content_scripts": [{ "matches": ["https://*/*", "http://*/*"], "js": ["content.js"], "run_at": "document_idle" }]
  }

## popup.html and popup.css
  <!doctype html>
  <html lang="en">
  <head><meta charset="utf-8"><link rel="stylesheet" href="popup.css"></head>
  <body>
    <form id="form">
      <label for="word">Word to highlight</label>
      <input id="word" name="word" autocomplete="off" maxlength="60">
      <label for="color">Color</label>
      <input id="color" name="color" type="color" value="#fde047">
      <button type="submit">Save</button>
    </form>
    <p id="status" role="status"></p>
    <script type="module" src="popup.js"></script>
  </body>
  </html>

  body { width: 280px; margin: 0; padding: 16px; font: 14px/1.4 system-ui, sans-serif; color: #111827; }
  form { display: grid; gap: 8px; }
  input { padding: 8px; border: 1px solid #d1d5db; border-radius: 8px; font: inherit; }
  button { padding: 9px; border: 0; border-radius: 8px; background: #2563eb; color: #fff; font: inherit; font-weight: 600; }
  button:focus-visible, input:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
  #status { margin: 12px 0 0; color: #6b7280; }

## popup.js
  const form = document.getElementById("form");
  const status = document.getElementById("status");
  const settings = await chrome.storage.sync.get({ word: "", color: "#fde047" });
  form.word.value = settings.word;
  form.color.value = settings.color;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    const { count } = await chrome.runtime.sendMessage({ type: "getCount", tabId: tab.id });
    status.textContent = settings.word ? count + " matches on this page" : "Choose a word to highlight.";
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await chrome.storage.sync.set({ word: form.word.value.trim(), color: form.color.value });
    status.textContent = "Saved. Open pages update right away.";
  });

## background.js (service worker)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "count" && sender.tab) {
      const tabId = sender.tab.id;
      chrome.storage.session.set({ ["tab" + tabId]: msg.count });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#2563eb" });
      chrome.action.setBadgeText({ tabId, text: msg.count ? String(msg.count) : "" });
      return;
    }
    if (msg.type === "getCount") {
      chrome.storage.session.get("tab" + msg.tabId).then((r) => sendResponse({ count: r["tab" + msg.tabId] || 0 }));
      return true; // keeps the channel open for the async sendResponse
    }
  });
  chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove("tab" + tabId));
- The service worker stops when idle and restarts on the next event: no state in variables, use chrome.storage
  (session for temporary data, sync or local for settings). No DOM, no localStorage. Register listeners at the top level.

## content.js
  const MARK = "word-highlighter-mark";
  function clearMarks() {
    document.querySelectorAll("mark." + MARK).forEach((m) => m.replaceWith(document.createTextNode(m.textContent)));
    document.body.normalize();
  }
  function highlight(word, color) {
    clearMarks();
    if (!word) return 0;
    const needle = word.toLowerCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => n.parentElement && !n.parentElement.closest("script, style, textarea, input, mark") && n.nodeValue.toLowerCase().includes(needle)
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let count = 0;
    for (const node of nodes) {
      let rest = node;
      let at;
      while ((at = rest.nodeValue.toLowerCase().indexOf(needle)) !== -1) {
        const match = rest.splitText(at);
        rest = match.splitText(needle.length);
        const mark = document.createElement("mark");
        mark.className = MARK;
        mark.style.background = color;
        mark.textContent = match.nodeValue;
        match.replaceWith(mark);
        count++;
      }
    }
    return count;
  }
  async function run() {
    const { word, color } = await chrome.storage.sync.get({ word: "", color: "#fde047" });
    chrome.runtime.sendMessage({ type: "count", count: highlight(word, color) });
  }
  chrome.storage.onChanged.addListener((changes, area) => { if (area === "sync" && (changes.word || changes.color)) run(); });
  run();
- Content scripts share the page's DOM, not its JavaScript. They are classic scripts: no import, no top-level await.

## Permissions: as few as possible
- Each permission shows an install warning and must be justified in store review. storage, activeTab and scripting
  are mild; "tabs", "history" and broad host access ("<all_urls>", "https://*/*") are heavy.
- If it only acts when the user clicks, drop content_scripts and host access: "activeTab" plus "scripting" and
  chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }) on click.
- List exact sites in host_permissions when only a few are needed ("https://www.example.com/*").
- No remote code, no eval, no inline scripts or onclick attributes (the extension CSP blocks them).

## Testing
- chrome.* APIs don't exist in FIZZ's preview: check popup.html there for layout only and validate the manifest
  with <fizz-run>jq . manifest.json</fizz-run>.
- Real test: download the project ZIP (/export), unzip, open chrome://extensions, turn on Developer mode, Load
  unpacked, pick the folder. After each change press reload on the extension card and reload the page.
- Debug: right-click the popup, Inspect; the "service worker" link on the card for background logs; content script
  logs in the page's DevTools console; the card's Errors button.

## Publishing
- Chrome Web Store: a developer account (one-time fee), a ZIP with manifest.json at its root, a 128px icon,
  screenshots (1280x800 or 640x400), a clear description, a privacy policy when user data is handled, and a reason
  for every permission. Bump "version" for every upload. Review takes hours to days.
- Edge Add-ons takes the same package. Firefox supports Manifest V3 with differences (background.scripts,
  browser_specific_settings.gecko.id): check MDN with <fizz-search> before porting.
`,
  });

  add({
    id: "git-workflow", title: "GIT AND GITHUB",
    match: /\b(git|github|commit|commits|repo|repository|branch|branches|pull request|pr|push|version control|gitignore|readme)\b|גיט|גיטהאב|מאגר/i,
    text: `
## Pushing from FIZZ
- <fizz-push message="..."/> highlights Push to GitHub on your reply; the user picks (or creates) the repository and
  branch and confirms. It makes one commit with every project file and keeps other files already in the repo.
- It leaves out .env files (except .env.example) and whatever .gitignore lists; everything else is uploaded. Before
  suggesting a push, check other files for keys, tokens, personal data and big generated files. node_modules never enters
  the project (it stays in the sandbox). Workflow files (.github/workflows/) need GitHub's workflow permission;
  FIZZ asks the user to reconnect when needed.
- git in the sandbox (git init, git diff, git log) is fine for checking; pushing goes through FIZZ's connection.

## Commit messages
- Imperative, under about 60 characters, says what changes: "Add booking form with validation", "Fix cart total
  when a coupon is removed". One logical change per commit; a body (after a blank line) explains why.
- Conventional prefixes (feat:, fix:, docs:, refactor:) when the project already uses them. Never "update" or "wip".

## .gitignore
Node:
  node_modules/
  dist/
  .env
  .env.*
  !.env.example
  npm-debug.log*
  coverage/
  .DS_Store
  *.db
Python:
  __pycache__/
  *.py[cod]
  .venv/
  .env
  .pytest_cache/
  dist/
  *.egg-info/
  .ipynb_checkpoints/

## README structure
  # Project name
  One sentence: what it is and who it's for. A screenshot or the live link.
  ## Features            the 4–8 things it does
  ## Getting started     requirements, install, run, test: exact commands that work
  ## Configuration       every variable from .env.example and what it does
  ## Project structure   the main folders and files, one line each
  ## Deployment          where and how it's hosted
  ## License             MIT unless the user says otherwise
Write it for someone who has never seen the project, and keep it true when the code changes.

## Never commit
- Secrets (.env, API keys, tokens, service-account JSON, private keys). If one was pushed, deleting the file is not
  enough: tell the user to revoke and replace the key at the provider right away.
- node_modules, virtualenvs, build output (unless the host needs it), caches, logs, local databases, huge binaries.

## Branches and pull requests
- main always works. For risky work push to a new branch (the push dialog lets the user name it) and open a pull
  request: what changed, why, how to test, screenshots for UI changes. Tag releases (v1.0.0) for apps people install.
`,
  });
})();
