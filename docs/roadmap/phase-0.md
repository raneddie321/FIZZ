# Phase 0 — Foundations (design note)

## A. Permission gate

**Files:** `netlify/lib/agent-core.mjs` (the decision logic, shared with the server), `static-site/assets/permissions.js`
(state, UI, log), `dev.js` (`runTools`, `applyReply`, the "+" sheet), `settings.js` (Permissions pane),
`cloud-tools.js`, `mcp-tools.js`.

**One question for every agent action:** `F.perm.forTool(tool, def, ctx)` → `{ decision: "allow" | "ask" | "deny", reason }`.

- **Kinds:** `read`, `edit`, `run`, `network`, `browser`, `git-push`, `deploy`, `mcp`, `outbound`, `device`.
- **Modes** (`settings.permMode`):
  - `auto` — commands and edits run; anything that sends, posts, pays or deletes still asks.
  - `ask` — commands, connected apps and browser clicks ask; file changes are staged for review.
  - `plan` — nothing changes until the user approves the plan (the agent is pinned to Plan; an approved plan builds).
  - `read-only` — only reading: files, search, pages. Read-only shell commands (`ls`, `cat`, `grep`, `git status`…) run.
- **Rules** (`settings.permRules` and the project's `.fizz/settings.json` → `permissions`):
  `{ "allow": ["run:npm test", "run:npm run *"], "ask": ["edit:package.json"], "deny": ["run:rm -rf *", "edit:.env"] }`.
  A rule is `kind:pattern`; `*` matches anything. Order of precedence: deny → mode → outbound → ask → allow → the mode's default.
  For commands every part of a compound command (`a && b; c | d`) is checked: one denied part denies the command,
  and a command is allowed by rules only when every part is.
- **Floors that rules can't lower:** `outbound` always asks; `device` can't be allowed with a bare wildcard.
  A project's `allow` rules only count after the user trusts them (a cloned repo must not grant itself permissions);
  its `deny` and `ask` rules always count.
- **Log:** every decision (time, kind, target, decision, why) is kept for the session and shown in the Activity tab.
- **Migration:** `askBeforeRun: true` → `permMode: "ask"`. `reviewChanges` stays as it is (it stages edits in any mode).
  `autoVerify` is not a permission and stays where it is.

## B. Storage without the 5 MB limit

**Files:** `static-site/assets/idb.js` (new), `core.js` (`loadData`/`saveData` hooks), `scripts/app-shell.html` (the two
apps start after storage is ready).

- Projects and conversations move to IndexedDB (`fizz` database, `records` store): one record per project (without its
  files), one per conversation, and one per project file (`f\0<project>\0<path>`), so changing one file writes one small
  record however big the project is. `localStorage["fizz.data.<user>"]` keeps the small part: settings and the ordered id lists
  (`v: 2`). Settings stay readable synchronously and survive even if IndexedDB is lost.
- The API stays synchronous: `F.loadData(user)` returns the same in-memory object as before; saving writes the small part
  to localStorage right away and the changed records to IndexedDB a moment later (flushed when the page is hidden).
  A record that could not be flushed before the page closed is kept in a small localStorage journal and applied on the next load.
- **Migration:** an old blob (with `projects`/`conversations` inside) is loaded as is; after the first successful IndexedDB
  write the blob is replaced by the small part. Nothing is deleted before the write is confirmed.
- **Fallback:** no IndexedDB (or it fails) → everything keeps working in localStorage exactly as before.
- Other tabs: ids another tab added are kept in the list instead of being overwritten.
- Server-side sync of projects per user (Neon) is not part of this step: it needs `CLERK_SECRET_KEY` and Neon connected.

## C. Shared agent core

**Files:** `netlify/lib/agent-core.mjs` (source, no DOM), `scripts/build-agent-core.mjs` → `static-site/assets/agent-core.js`.

Moved into the core, with `dev.js` and `agent-tools.js` now calling it (same behaviour):
tool-tag parsing, mode detection, token estimate, the permission decision, and the "what happens after the tools ran"
decision (`nextStep`: finish, ask again, continue, check, limit).

Not in this step: `generate()` and the UI orchestration stay in `dev.js`; the Node runner that uses the core
(sandbox + stored projects) is phase 7.

## Tests

- `tests/netlify/agent-core.test.mjs`: parsing, mode detection, rule matching, compound commands, modes, floors, `nextStep`.
- `tests/e2e/smoke.mjs`: a denied command is not run and the agent is told; Ask mode waits; read-only blocks edits;
  rules editor; projects survive a reload from IndexedDB; an old localStorage blob migrates; a project over 5 MB saves.

## Status

Built and covered by tests: A (gate, modes, rules, project rules with trust, log, Settings and "+" menu), B (IndexedDB with
migration, journal, fallback) and the parts of C listed above.

Left for later phases, on purpose:
- The gate covers what the agent can do today (commands, files, browser, search, connected apps, MCP, app builds).
  `git-push`, `deploy` and `device` are decided by the same engine and will be wired where those actions become the
  agent's own (phases 4–6). GitHub Push and Deploy are still buttons the user presses.
- Project rules are read from `.fizz/settings.json`; there is no visual editor for that file yet (it's a file in the project).
- Server-side project sync (Neon) and the Node runner for the core need `CLERK_SECRET_KEY`, Neon and phase 7.
- "Keep going" after an approved plan in Plan-first mode starts with a plan again.
