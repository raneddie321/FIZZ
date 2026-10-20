# FIZZ & FIZZ DEV — by RANEDDIE

This repository contains:

| Folder | What it is |
|---|---|
| `static-site/` | The website: public pages, RANEDDIE ID sign-up/sign-in, **FIZZ** chat (`chat.html`) and **FIZZ DEV** (`dev.html`) |
| `netlify/` | Server functions: OAuth for GitHub & Vercel, GitHub/Vercel APIs, and the FIZZ AI proxy |
| `src/`, `prisma/` | The full Next.js + PostgreSQL platform (alternative, server-rendered version) |

## Two ways to deploy

**1. Netlify Drop (no server).** Drag `deploy/fizz-netlify-drop.zip` onto https://app.netlify.com/drop.
Everything in the browser works — accounts, chats, projects, editor, terminal, preview, ZIP export,
and AI with each user's own OpenRouter or Anthropic key. GitHub, Vercel, Google and the included
FIZZ AI show **"Not available yet"**, because Drop can't run server functions.

**2. Netlify from GitHub (recommended — enables everything).**
1. app.netlify.com → **Add new site → Import an existing project → GitHub** → pick this repo/branch.
   `netlify.toml` already sets the publish folder, functions and edge functions.
2. Add the environment variables below (**Site configuration → Environment variables**), then redeploy.

**3. Vercel (also enables everything).** Import the repo in Vercel. `vercel.json` already sets the
output folder (`static-site`), skips the Next.js build and runs the same server code from `api/`.
Add the environment variables below under **Settings → Environment Variables** and redeploy. For a
reliable FIZZ AI daily quota, add **Storage → Upstash Redis** to the project (it sets
`KV_REST_API_URL`/`KV_REST_API_TOKEN`); without it the quota is kept per server instance.

## FIZZ DEV setup — environment variables

Never put secrets in code or in chat. Set them only in Netlify or Vercel (Vercel: choose **Sensitive** for every secret).

| Variable | Required for | Where to get it |
|---|---|---|
| `FIZZ_SECRET` | All connections | Any random string of 32+ characters (e.g. `openssl rand -base64 48`). Encrypts the connection cookies. |
| `OPENROUTER_API_KEY` | Included FIZZ AI | openrouter.ai → Keys |
| `GEMINI_API_KEY` | Included FIZZ AI (alternative) | aistudio.google.com → Get API key. Used when `OPENROUTER_API_KEY` isn't set; default model `gemini-3.8-flash` |
| `FIZZ_DEFAULT_MODEL` | optional | OpenRouter model ID, default `z-ai/glm-4.6` (check openrouter.ai/models) |
| `FIZZ_FALLBACK_MODELS` | optional | Comma-separated backup models tried when the main one is busy |
| `FIZZ_DAILY_LIMIT` | optional | Free messages per visitor per day, default `50` |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub sign-in button (optional) | github.com → Settings → Developer settings → **OAuth Apps**. Without them users connect with a personal token (scopes `repo` + `workflow`) in Settings → Connections. |
| `VERCEL_CLIENT_ID`, `VERCEL_CLIENT_SECRET` | Vercel sign-in button (optional) | vercel.com → Team settings → **Sign in with Vercel / Apps**. Users can always connect with a Vercel token (vercel.com/account/settings/tokens) instead — the most reliable way to deploy. |
| `GOOGLE_CLIENT_ID` | Google Workspace (Gmail, Calendar, Docs, Sheets, Slides, Drive, Tasks, Contacts) | console.cloud.google.com: turn on the Gmail, Calendar, Docs, Sheets, Slides, Drive, Tasks and People APIs; Google Auth Platform → External, add test users; Clients → **Web application** with your site as an Authorized JavaScript origin. No client secret needed. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | RanEddie ID sign-in (optional for users) | Same value as the RanEddie ID project (Clerk → API keys). Public by design. |
| `CLERK_SECRET_KEY` | Saving FIZZ settings to the RanEddie ID | Same value as the RanEddie ID project. Secret. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Cloud sync, reliable daily limits, saved browser logins | Vercel → **Storage → Upstash Redis** → connect to the project (sets both). |
| `BROWSERBASE_API_KEY` | optional: Browserbase as the cloud browser (instead of FIZZ's own) and full web search | browserbase.com → Settings → API keys. Secret. Browser time is billed by Browserbase. |
| `BROWSERBASE_PROJECT_ID` | optional | Only if your Browserbase account has several projects. |
| `FIZZ_SANDBOX` | **On by default on Vercel** (`off` turns it off). The cloud features: Fizz Code's Linux sandbox (npm, git, Python, servers), real bash in the terminal for npm/git/any program, and FIZZ's own **cloud browser** (Chromium in the user's sandbox: any site, live screen, Fizz Code clicks/types/signs up with you) | Nothing to set on Vercel. Uses Vercel Sandbox (billed by Vercel); no key needed on Vercel. The browser installs itself the first time (about a minute). `FIZZ_BROWSER=off` turns only the browser off. |
| `BRAVE_SEARCH_API_KEY` or `TAVILY_API_KEY` | optional web search without Browserbase | api.search.brave.com or tavily.com. Without any search key, search uses Wikipedia. |
| `FIZZ_SEARCH_LIMIT`, `FIZZ_READ_LIMIT`, `FIZZ_BROWSER_LIMIT`, `FIZZ_SANDBOX_LIMIT` | optional | Daily limits per user (defaults 200, 400, 600, 60). |
| `FIZZ_BROWSER_MINUTES` | optional | How long a cloud browser session can stay open, default `30`. |

### Provider settings (replace `YOUR-SITE` with your Netlify or Vercel domain, e.g. `fizzbrowser.vercel.app`)

- **GitHub OAuth App** — Homepage URL `https://YOUR-SITE`, Authorization callback URL
  `https://YOUR-SITE/api/oauth/github/callback`. Scopes requested: `repo workflow read:user`
  (`workflow` lets FIZZ add the app-build workflows; people who connected earlier reconnect once).
- **Vercel app** — Redirect URL `https://YOUR-SITE/api/oauth/vercel/callback`. In the app's
  **Permissions**, allow creating/reading **Deployments**. Scopes: `openid email profile offline_access`.
- **Google OAuth client (Web application)** — Authorized JavaScript origin `https://YOUR-SITE`.
  Enable the **Google Drive API** in the project. Configure the OAuth consent screen and add
  yourself as a test user (scope `drive.readonly` requires Google verification before public launch).
  FIZZ uses Google Identity Services in the browser, so **no Google client secret is needed**; the
  access token lasts about an hour and stays in the browser tab.

### Security notes

- GitHub and Vercel tokens are kept in AES-256-GCM encrypted, HttpOnly cookies scoped to `/api` —
  page JavaScript can never read them. All POST endpoints reject cross-site requests.
- If any credential was ever shared in chat or email, **rotate it** in the provider's dashboard.
- The included FIZZ AI enforces a per-visitor daily quota (Upstash or Netlify Blobs) to protect your OpenRouter budget.
- Web reading refuses private and internal addresses (also through redirects). Search, the cloud browser and the
  sandbox need a signed-in RanEddie ID user and have daily limits per user.
- Cloud browser sessions live in an encrypted cookie; Fizz Code is told to treat page text as information, not
  instructions, and can't type into password or card fields.

## RanEddie ID (required sign-in)

FIZZ uses the same Clerk instance as RanEddie ID, so it's the same account as every RanEddie product.
`signin.html` has the RanEddie ID forms (sign in with a new-device email code, sign up with email
verification and a minimum age of 13, forgot password), built on clerk-js pinned in
`assets/raneddie-id.js`. FIZZ and FIZZ DEV require a RanEddie ID: visitors are sent to sign in and
back (only a deployment without the Clerk keys lets guests in). Only a few
small settings (≤ 500 bytes) are saved under `privateMetadata.fizz` through `/api/account`, which
verifies the Clerk session token and merges only that key — other products' metadata (e.g. Snake
Brawl) is never touched. Chats and projects are linked to the account on first sign-in; with Upstash
connected, **cloud sync** (`/api/sync`) keeps them per Clerk user id in Upstash (never in metadata), so
they appear on every device. Images and PDFs stay in the browser that made them.

## One app, instant switching

FIZZ and FIZZ DEV are a single page (`scripts/app-shell.html`, written out as `chat.html` and `dev.html`).
The FIZZ / FIZZ DEV switch in the sidebar — or **Ctrl+.** — swaps between them instantly in the same tab,
with no reload: chats keep streaming, the editor and terminal keep their state, and Back/Forward work.
Any FIZZ answer that contains code has **Build in FIZZ DEV**, which hands the answer over as an attachment.

## FIZZ DEV features

- **Agent chat**: a live task list, one activity line per reply (click to see each diff, command and result),
  Build / Plan / Ask modes, questions with answer buttons, review-before-apply, restore to any reply,
  `@file` mentions, project memory (`FIZZ.md`), slash commands and **Skills** (`assets/skills.js`).
- **Do mode — a personal agent**: next to Build / Plan / Ask, *Do* has Fizz get things done for you instead of
  writing code — sign-ups and API keys in the cloud browser, Gmail, Calendar, Docs, Drive, YouTube uploads, and the
  apps you connected — with its own handbook (`assets/brain-assistant.js`). Sending, posting, publishing, deleting
  and buying always wait for your OK. Each chat shows whether it's working, waiting for you or stopped.
- **Memory**: `<fizz-remember>` saves lasting facts and preferences (never passwords or keys); Settings → General
  lists and edits them, and every mode sees them.
- **Apps connected with a token** (Settings → Connections → Apps): Notion, Trello, Linear, Airtable, Figma, Netlify,
  Cloudflare, Discord, Telegram, Slack and Supabase. The token is checked once and sealed in an HttpOnly cookie;
  `<fizz-api>` calls go through `/api/connector`, which only talks to that app's API and never returns the token.
- **Telegram updates** (Settings → Tools): a message when Fizz finishes or needs you.
- **Fizz Code's handbook** (`assets/fizz-brain.js` + `brain-design.js`, `brain-code.js`, `brain-platforms.js`):
  a long engineering guide — how to plan, structure a project into many focused files, write complete code,
  verify, debug and report — plus deep sections on design, components, JavaScript, games, data, servers,
  Python, mobile, documents, extensions, deployment and more. Every request gets the core and the craft
  sections, plus the topics that fit the task and the project (a game gets the game sections, and so on).
  Each section is plain text you can edit.
- **Real multi-file projects in the preview**: ES modules across files (`import { x } from "./state.js"`, folders
  and circular imports included), `fetch("data/items.json")` of project files, bare npm imports via esm.sh.
- **It checks its own work**: when Fizz Code says it's done, FIZZ DEV checks the files it wrote — JavaScript
  syntax (acorn), imports of missing files or of names a module doesn't export, broken links and missing
  assets in HTML, invalid JSON, unbalanced CSS, placeholder code, and errors while the page runs — and sends
  what it finds back to Fizz Code to fix (up to 2 rounds; Settings → Tools). Replies cut off at the output
  limit continue automatically, with the unfinished file rewritten. Up to 20 steps per task by default.
- **AI providers** (Settings → AI): FIZZ AI (the site's own), your OpenRouter account, your **Google AI Studio**
  (Gemini) key, or your Anthropic key. Personal keys stay in the browser and go only to that provider.
- **Fizz Code's tools** — it decides when to use them and gets the results back (agent loop):
  - `<fizz-run>`: the browser terminal — `node`, `python` (Pyodide), file commands; scripts can write
    Word, Excel, PowerPoint and PDF files.
  - `<fizz-sandbox>`: its own Linux machine in the cloud (Vercel Sandbox) for `npm install`, tests, builds,
    `git` and servers with a public link. Runs without asking (unless *Ask before running* is on).
  - `<fizz-search>` / `<fizz-fetch>`: web search and reading pages.
  - `<fizz-browser>`: a real Chrome in the cloud — FIZZ's own (Chromium in the user's Vercel Sandbox,
    `netlify/lib/browser-agent.js`) or Browserbase — that the user watches and uses live in the Browser tab.
    Asked to do something on a website, it does it instead of explaining. It opens sites, clicks, types, scrolls and manages tabs. For logins it asks whether you
    have an account and hands over (**Your turn**) so *you* type passwords in the browser; password and
    card fields are never typed by the AI, CAPTCHAs are handed over, and clicks that buy, send, post or
    delete need your OK. Logins are remembered per user.
  - `<fizz-build target="android|desktop">`: real apps built by GitHub Actions in your repository —
    Android APK + AAB (Capacitor 8; signed with your key from repository secrets, or a new key it makes
    for you in private repositories) and desktop apps for Windows (.exe), macOS (.dmg) and Linux
    (.AppImage) (Electron). A live card in the chat shows progress and the downloads. If a build fails,
    FIZZ reads the failed job's log on GitHub and Fizz Code fixes the project (its code or the build files)
    and builds again by itself, up to 6 attempts (Settings → Tools → *Fix failed app builds automatically*).
  - `<fizz-google>` also does YouTube: list your videos, upload a project or Drive video (private by default; needs
    the YouTube Data API v3 turned on), and edit titles, descriptions, tags and privacy.
  - `<fizz-google>`: the user's Google Workspace — search and read Gmail, write drafts and send (send waits for
    the user's OK), Calendar events (invites wait for OK), create/read/edit Docs (from Markdown), Sheets (CSV),
    Slides, search/read/upload Drive files, Tasks and Contacts. Runs in the browser with the user's own Google sign-in.
  - `<fizz-collect>`: for anything the user gets from a website (an API key, a token, a code), on any site and
    with or without the cloud browser — a card opens the right page, shows the steps, and saves what the user pastes
    straight into the project (`.env`, a config `.js` or `.json`). Values in `.env` are never shown to the AI and
    never pushed to GitHub or deployed.
  - `<fizz-screenshot>`, `<fizz-export>` (PDF from HTML), `<fizz-attach>` (file cards), `<fizz-ask>`, `<fizz-plan>`.
- **Terminal**: the prompt is `fizzdev/<user>/<project>`; a bash-like shell (pipes, `&&`, `||`, `;`, redirects, `$VARS`,
  globs) with ~60 built-in commands on the project files (grep, sed, awk, find, jq, curl, zip…), Node and Python
  in the browser, and real Linux bash in the cloud sandbox for npm, git and every other program (`cloud` switches all
  commands there).
- **Side panel**: Code (CodeMirror, history, diff, binary viewer), Terminal, **Browser** — the project preview
  plus web tabs: search, YouTube videos, any site that allows frames, a reader view for the rest, and the cloud
  browser — and Activity.
- **Templates** on the welcome screen (website, game, dashboard, Android app, desktop app, CV as PDF,
  presentation, Excel, Python, research page, Chrome extension…).
- **Command palette** (Ctrl+K): every action, project and template, plus “search the web” and “ask Fizz Code”.
- Settings → **Tools** shows which tools this site has turned on.
- Connections: GitHub import/push/create repo, Vercel deploy, Google Docs import/export and Drive attachments.
- Responsive: three panels on desktop, drawers on tablet, bottom tab bar on phone. Light and dark themes.
- Keyboard: Enter, Shift+Enter, Esc, Ctrl+K (palette), Ctrl+P (open file), Ctrl+` (terminal), Ctrl+. (switch app).

## Development

```bash
python3 scripts/build-static-pages.py     # regenerate public pages after editing content
node tests/netlify/functions.test.mjs     # server function tests (fake credentials)
node tests/netlify/tools.test.mjs         # web, sync, sandbox and GitHub Actions functions
CDP_URL=ws://… node tests/netlify/browser.test.mjs   # cloud browser actions, against a local Chrome
node scripts/build-browser-agent.mjs      # after editing netlify/lib/browser-agent.js
cd static-site && python3 -m http.server  # preview the static site locally
```

The full Next.js platform: `npm install`, create `.env` (`DATABASE_URL`, `SESSION_SECRET`,
`ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`), `npx prisma migrate deploy && npm run db:seed`, `npm run dev`.
