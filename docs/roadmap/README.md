# FIZZ DEV roadmap: Claude-Code-class capabilities

Eight phases, each shippable on its own (branch → Preview → tests → main, with the owner's approval for main).

| Phase | What | Status |
| --- | --- | --- |
| 0 | Foundations: permission gate, storage without the 5 MB limit, shared agent core | built — see [phase-0.md](phase-0.md) for what is and isn't in it |
| 1 | Long conversations: compact at ~70% of the context, retry on "context too long", `/compact`, `/clear` | built — see [phase-1.md](phase-1.md) |
| 2 | Big projects and local folders: File System Access API, clone in the sandbox, tree/grep/read tools | part 1 built (index + tools, local folders) — see [phase-2.md](phase-2.md); part 2 (projects that live in the sandbox) not started |
| 3 | Hooks: `.fizz/hooks.json` (afterEdit, afterTurn, beforePush, …) | built (`static-site/assets/hooks.js`); `beforeEdit` left out: edits are applied synchronously, and the permission rules cover blocking edits |
| 4 | Full Git & GitHub: branches, commits, PRs, review replies, CI fix loop (inside `api/github/[action].mjs`) | built (`static-site/assets/git-tools.js`) |
| 5 | FIZZ Bridge: the user's own computer (files, commands, screen, mouse, keyboard), paired by code | not started |
| 6 | Every device: browser extension, Android companion, what iOS allows | not started |
| 7 | Automation: headless agent API with personal tokens, scheduled tasks, `@fizz` GitHub Action, webhooks | not started |

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
