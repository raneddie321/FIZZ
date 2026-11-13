# FIZZ DEV roadmap: Claude-Code-class capabilities

Eight phases, each shippable on its own (branch → Preview → tests → main, with the owner's approval for main).

| Phase | What | Status |
| --- | --- | --- |
| 0 | Foundations: permission gate, storage without the 5 MB limit, shared agent core | built — see [phase-0.md](phase-0.md) for what is and isn't in it |
| 1 | Long conversations: compact at ~70% of the context, retry on "context too long", `/compact`, `/clear` | built — see [phase-1.md](phase-1.md) |
| 2 | Big projects: tree/grep/read tools, an index in the prompt, big repositories that live in the cloud sandbox | built (opening a local folder was removed at the owner's request) |
| 3 | Hooks: `.fizz/hooks.json` (afterEdit, afterTurn, beforePush, …) | built (`static-site/assets/hooks.js`); `beforeEdit` left out: edits are applied synchronously, and the permission rules cover blocking edits |
| 4 | Full Git & GitHub: branches, commits, PRs, review replies, CI fix loop (inside `api/github/[action].mjs`) | built (`static-site/assets/git-tools.js`) |
| 5 | FIZZ Bridge: the user's own computer (files, commands, screen, mouse, keyboard), paired by code | not started |
| 6 | Every device: browser extension, Android companion, what iOS allows | not started |
| 7 | Automation: headless agent API with personal tokens, scheduled tasks, `@fizz` GitHub Action, webhooks | started: tasks run in the cloud (below); the rest not started |

## Rules that hold for every phase

- Vercel Hobby: 12 functions in `api/` is the cap. New server features are new `action`s in existing functions.
- `static-site/chat.html` and `dev.html` are generated from `scripts/app-shell.html` by
  `python3 scripts/build-static-pages.py`. Bump the `?v=` of every changed asset.
- `static-site/assets/agent-core.js` is generated from `netlify/lib/agent-core.mjs` by
  `node scripts/build-agent-core.mjs`. Edit the `.mjs`.
- Secrets live only in Vercel env vars or sealed with `FIZZ_SECRET`; never in files, logs or chat.
- Agent and device actions: confirm before sending, posting, paying or deleting; never type passwords or card
  details; no CAPTCHA bypass; block private addresses server-side.
- Existing user data is migrated forward automatically, never dropped.

## What the owner has to set up (once)

| What | Needed for |
| --- | --- |
| `CLERK_SECRET_KEY` in Vercel (Production and Preview) | anything "on every device": phases 5–7, server-side project sync |
| Neon connected to the project (`DATABASE_URL`) | server-side projects, scheduled tasks, tokens |
| Upstash connected to the project (`KV_REST_API_URL`/`TOKEN`) | Bridge and device queues, reliable limits |
| `FIZZ_SECRET` also for Preview | testing MCP and connections on Preview |
| GitHub OAuth scopes `repo`, `workflow` | phase 4 |

## Keep working when I leave (cloud runs)

A new FIZZ DEV task, and a FIZZ chat answer, runs in the user's cloud sandbox when it can, so it keeps going when the
page is closed or the phone locks. No database is needed: the run's state lives in the sandbox.

- `netlify/lib/runner/agent-runner.mjs` is Fizz Code's loop for Node (files, edits, `run`/`sandbox` commands, web search
  and reading, tree/grep/read/symbols). `node scripts/build-agent-core.mjs` bundles it with the shared core into
  `netlify/lib/runner/bundle.mjs`, which `api/sandbox` (actions `agent-start`, `agent-poll`, `agent-stop`) writes into the
  sandbox and starts detached. State: `/vercel/sandbox/fizz-run/<runId>/state.json`.
- The runner never gets the user's keys or identity: it calls `/api/ai/chat` and `/api/web/{search,read}` with a sealed
  run token (2 hours, only those calls). A key the user brought in Settings → AI is sealed inside that token.
- Anything it can't do there (connected apps, the cloud browser, push/deploy, a question, anything the permission rules
  want to ask about) stops the run as a handoff; the page continues from exactly that point with its normal loop,
  permission gate and checks when it's open again. Tasks only go to the cloud in Auto permission mode without
  "Review file changes first", and not for repositories that live in the sandbox.
- Limits: the sandbox lives about 30 minutes past the start of a run; very long tasks finish on the page.
  "+" → Permissions → "Keep working when I leave" turns it off.
