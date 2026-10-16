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
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub | github.com → Settings → Developer settings → **OAuth Apps** |
| `VERCEL_CLIENT_ID`, `VERCEL_CLIENT_SECRET` | Vercel | vercel.com → Team settings → **Sign in with Vercel / Apps** |
| `GOOGLE_CLIENT_ID` | Google Workspace | console.cloud.google.com → APIs & Services → **Credentials → OAuth client (Web)** |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | RanEddie ID sign-in (optional for users) | Same value as the RanEddie ID project (Clerk → API keys). Public by design. |
| `CLERK_SECRET_KEY` | Saving FIZZ settings to the RanEddie ID | Same value as the RanEddie ID project. Secret. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Cloud sync, reliable daily limits, saved browser logins | Vercel → **Storage → Upstash Redis** → connect to the project (sets both). |
| `BROWSERBASE_API_KEY` | optional: Browserbase as the cloud browser (instead of FIZZ's own) and full web search | browserbase.com → Settings → API keys. Secret. Browser time is billed by Browserbase. |
| `BROWSERBASE_PROJECT_ID` | optional | Only if your Browserbase account has several projects. |
| `FIZZ_SANDBOX` | **Turns on the cloud features — Vercel only**: Fizz Code's Linux sandbox (npm, git, Python, servers), real bash in the terminal for npm/git/any program, and FIZZ's own **cloud browser** (Chromium in the user's sandbox: any site, live screen, Fizz Code clicks/types/signs up with you) | Set to `on`. Uses Vercel Sandbox (billed by Vercel); no key needed on Vercel. The browser installs itself the first time (about a minute). `FIZZ_BROWSER=off` turns only the browser off. |
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
    (.AppImage) (Electron). A live card in the chat shows progress and the downloads; if a build fails,
    **Ask Fizz Code to fix it** sends the log.
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
