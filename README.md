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

Never put secrets in code or in chat. Set them only in Netlify.

| Variable | Required for | Where to get it |
|---|---|---|
| `FIZZ_SECRET` | All connections | Any random string of 32+ characters (e.g. `openssl rand -base64 48`). Encrypts the connection cookies. |
| `OPENROUTER_API_KEY` | Included FIZZ AI | openrouter.ai → Keys |
| `FIZZ_DEFAULT_MODEL` | optional | OpenRouter model ID, default `z-ai/glm-4.6` (check openrouter.ai/models) |
| `FIZZ_DAILY_LIMIT` | optional | Free messages per visitor per day, default `50` |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub | github.com → Settings → Developer settings → **OAuth Apps** |
| `VERCEL_CLIENT_ID`, `VERCEL_CLIENT_SECRET` | Vercel | vercel.com → Team settings → **Sign in with Vercel / Apps** |
| `GOOGLE_CLIENT_ID` | Google Workspace | console.cloud.google.com → APIs & Services → **Credentials → OAuth client (Web)** |

### Provider settings (replace `YOUR-SITE` with your Netlify or Vercel domain, e.g. `fizzbrowser.vercel.app`)

- **GitHub OAuth App** — Homepage URL `https://YOUR-SITE`, Authorization callback URL
  `https://YOUR-SITE/api/oauth/github/callback`. Scopes requested: `repo read:user`.
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
- The included FIZZ AI enforces a per-visitor daily quota (Netlify Blobs) to protect your OpenRouter budget.

## One app, instant switching

FIZZ and FIZZ DEV are a single page (`scripts/app-shell.html`, written out as `chat.html` and `dev.html`).
The FIZZ / FIZZ DEV switch in the sidebar — or **Ctrl+.** — swaps between them instantly in the same tab,
with no reload: chats keep streaming, the editor and terminal keep their state, and Back/Forward work.
Any FIZZ answer that contains code has **Build in FIZZ DEV**, which hands the answer over as an attachment.

## FIZZ DEV features

- Agent chat with Build / Ask modes, step timeline (`Created index.html +24 −0`), expandable diffs,
  "Revert changes from this message", slash commands (`/new /files /preview /terminal /export /deploy /push /clear`).
- Side panel: **Code** (CodeMirror, tabs, autosave, diff, history, revert), **Terminal** (shell over project
  files; `node file.js` runs in an isolated Web Worker; `npm`/`git` explain that a full sandbox is needed),
  **Browser** (live preview, console, links between pages, desktop/tablet/phone sizes).
- Connections: GitHub import/push/create repo, Vercel deploy with live status, Google Docs import/export and Drive attachments.
- Responsive: three panels on desktop, drawers on tablet, bottom tab bar on phone. Light and dark themes.
- Keyboard: Enter, Shift+Enter, Esc, Ctrl+K, Ctrl+P, Ctrl+`.

## Development

```bash
python3 scripts/build-static-pages.py     # regenerate public pages after editing content
node tests/netlify/functions.test.mjs     # server function tests (fake credentials)
cd static-site && python3 -m http.server  # preview the static site locally
```

The full Next.js platform: `npm install`, create `.env` (`DATABASE_URL`, `SESSION_SECRET`,
`ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`), `npx prisma migrate deploy && npm run db:seed`, `npm run dev`.
