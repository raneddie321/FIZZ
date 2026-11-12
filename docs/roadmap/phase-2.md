# Phase 2 — Big projects and local folders (design note)

**The problem today:** the system prompt carries every file's content up to 160k characters and an (empty) entry for
every file beyond that, so a large project either doesn't fit or is mostly invisible to the agent. Projects can only come
from the browser, a ZIP or a GitHub import.

Phase 2 is built in two parts.

## Part 1 (this step)

**A. Looking around instead of carrying everything** — `netlify/lib/agent-core.mjs` (pure), `static-site/assets/code-tools.js`
(the tools), `dev.js` (`systemPrompt`).

- Four read-only tools: `<fizz-tree path depth>`, `<fizz-grep pattern path glob>`, `<fizz-read path lines="120-260">`,
  `<fizz-symbols path>`. They work on the project's files, never show `.env` values, and count as `read` for permissions
  (allowed in read-only and plan mode).
- A project is **big** above 80 files or 120k characters of text. For a big project the prompt carries an index — the
  tree (folded where deep), then in full only what matters now: `FIZZ.md`, files the user @mentioned, files changed in
  this chat, and the usual entry points — and tells the agent to read before it edits. Small projects are unchanged.

**B. A folder on this computer** — `static-site/assets/local-folder.js`, `dev.js` (menu, banner).

- "Open a folder" uses the File System Access API (Chrome and Edge on a computer). The folder becomes a project: text
  files are read in (ignoring `.git`, `node_modules`, build output, `.gitignore` entries, files over 2 MB and binaries
  over 3 MB), images come in as the project's usual binary files.
- Every change FIZZ makes is written to the real file; deleted files are deleted. When the tab comes back to the front,
  the folder is scanned (modified time and size) and outside changes are brought in.
- The folder handle is kept in IndexedDB; after a reload the browser wants a click before it gives access again, so the
  project shows "Reconnect folder".
- Other browsers get a clear message (and, later, the Bridge).

## Part 2 (next)

Projects that live in the cloud sandbox: `git clone` there, files fetched on demand, so nothing has to be loaded into the
browser at once. It needs the project's files to stop being one in-memory object across `dev.js` (editor, preview, checks),
and it has to be verified in a real Vercel Sandbox. The targets "5,000 files open in under 10 s" and "grep under 2 s"
are measured for part 1 on in-memory projects; the sandbox-backed numbers come with part 2.

## Tests

- `tests/netlify/agent-core.test.mjs`: tree, read, grep, symbols, the big-project threshold, `.gitignore` matching.
- `tests/e2e/smoke.mjs`: the tools answer the agent; a big project's prompt carries the index and not every file;
  a folder is opened (the browser's private file system stands in for the picker), an edit by the agent reaches the
  disk, a change on disk reaches the project, a deleted file is deleted.

## Status of part 1

Built and covered by tests. Measured in headless Chromium on a 5,000-file project (about 6 MB of text): grep ~10 ms,
tree ~5 ms, reopening the project from IndexedDB ~250 ms.

Known limits:
- The folder tests use the browser's private file system in place of the picker. Keeping a *picked* folder's handle in
  IndexedDB across a reload is standard in Chrome and Edge but could not be exercised here (headless Chromium crashes
  reading a private-file-system handle back, so the tests keep it by name through `window.__FIZZ_HANDLE_STORE`).
- A folder project is read into memory when it is opened: up to 6,000 files, text up to 2 MB each, images and other
  known binaries up to 3 MB each. Larger repositories are what part 2 is for.
- Outside changes are picked up when the tab comes back to the front, not continuously.
- A project linked to a folder is not uploaded by cloud sync.

**Update:** opening a folder from the computer was removed at the owner's request (Bridge in phase 5 covers the computer).
