# Phase 1 — Long conversations (design note)

**What was already there:** a context meter, `/compact`, `/clear`, and a compaction at 85% that kept the last two messages
and wrote a free-form summary. The context size was a fixed 128k.

**Files:** `netlify/lib/agent-core.mjs` (pure logic), `static-site/assets/dev.js` (`contextUse`, `compactChat`, `shrinkChat`,
`generate`, `sessionNote`), `settings.js` (Context size field).

## What changed

- **Context size follows the model** (`contextSize`): the user's setting, else a size in the model's name (`-32768`,
  `-128k`), else what is known about the family, else 128k. Guessing low compacts earlier; guessing high is caught below.
- **Compaction at 70%** (`compactPlan`): the last six messages stay, and the kept part starts at a reply so roles still
  alternate after the summary and a reply stays with its tool results. The loop skips it when there is little to gain
  (under ~1,500 tokens of older messages), so a huge system prompt doesn't cause a summary on every step.
- **Structured summary** (`SUMMARY_SYSTEM`): GOAL, DECISIONS, FILES, OPEN, NEXT. The summariser is given the list of files
  changed in the summarised messages, and an earlier summary is carried forward. The transcript is cut to what the model
  can read, keeping the start (the goal) and the end (where things stand).
- **"Too long" from the provider** (`isContextOverflow`): the failed reply is removed, the chat is compacted — or, when
  it can't be, long messages are shortened and then the oldest dropped (`shrinkMessages`) — and the step runs once more.
  If it still doesn't fit, the error says so and what to do. One retry per step; no loops.
- **The project remembers** (`project.session`): the latest summary is kept on the project, and a chat that doesn't carry
  its own summary is told "WHERE THIS PROJECT STANDS" in the system prompt.

## A deliberate change from the plan

The plan said to store the summary in `FIZZ.md` under "## Session summary". It is stored on the project object instead:
`FIZZ.md` is a project file that gets pushed to GitHub and deployed, and a summary rewritten every few turns would show
up as a file change each time (history, review, commits). The purpose — a new chat knows where things stand — is met.

## Tests

- `tests/netlify/agent-core.test.mjs`: context sizes, overflow detection, what is kept and summarised, the transcript, the last resort.
- `tests/e2e/smoke.mjs`: 15 long turns never exceed the model's context; the summary leads and six messages stay; a
  provider "too long" error is followed by a summary and a second try; a chat that can't shrink shows a clear error
  once; a new chat is told where the project stands.

## Not in this step

- FIZZ (the chat app) keeps its own behaviour; this is FIZZ DEV.
- Token counts are estimates (characters ÷ 3.6); there is no tokenizer in the browser.
