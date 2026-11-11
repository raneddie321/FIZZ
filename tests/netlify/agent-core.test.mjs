// The shared agent core (netlify/lib/agent-core.mjs): tool tags, mode detection, permissions, the loop's next step.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as core from "../../netlify/lib/agent-core.mjs";
const { parseTools, detectMode, decidePermission: decide, splitCommand, readOnlyCommand, ruleMatches, normalizeRules, nextStep, narratesWork } = core;

// ---------- the browser copy is generated from the same source ----------
const gen = readFileSync(new URL("../../static-site/assets/agent-core.js", import.meta.url), "utf8");
const win = { FIZZ: {} };
new Function("window", gen)(win);
assert.deepEqual(Object.keys(win.FIZZ.agentCore).sort(), Object.keys(core).sort(), "run `node scripts/build-agent-core.mjs` after editing agent-core.mjs");
assert.equal(win.FIZZ.agentCore.decidePermission({ kind: "run", target: "rm -rf /", rules: { deny: ["run:rm -rf *"] } }).decision, "deny", "the browser copy behaves the same");

// ---------- tool tags ----------
let p = parseTools('Hi <fizz-run>npm test</fizz-run> and <fizz-browser action="open" url="https://a.b/?x=1&amp;y=2"/> <fizz-unknown>x</fizz-unknown> <fizz-run>still strea');
assert.deepEqual(p.tools.map((t) => t.type), ["run", "browser"]);
assert.equal(p.tools[0].body, "npm test");
assert.equal(p.tools[1].attrs.url, "https://a.b/?x=1&y=2", "attribute entities are decoded");
assert.ok(p.prose.includes("<fizz-unknown>") && !p.prose.includes("still strea"), "unknown tags stay, an unclosed tag is hidden");

// ---------- what a message wants ----------
assert.equal(detectMode("למה אני מחובר מהconnectors?"), "ask");
assert.equal(detectMode("תבנה לי משחק נחש"), "build");
assert.equal(detectMode("make a plan for the shop"), "plan");
assert.equal(detectMode("send an email to Dana"), "do");
assert.equal(detectMode("can you build a landing page?"), "build");
assert.equal(detectMode("the header", { hasFiles: true }), "build");
assert.equal(detectMode("the header"), "ask");

// ---------- commands ----------
assert.deepEqual(splitCommand('FOO=1 sudo rm -rf /tmp/x && echo "a;b" | grep a; npm test $(cat x)'), ["rm -rf /tmp/x", 'echo "a;b"', "grep a", "npm test $(cat x)", "cat x"]);
assert.deepEqual(splitCommand("(cd app && npm ci)"), ["cd app", "npm ci"]);
assert.ok(readOnlyCommand("ls -la && git status | head -5"));
assert.ok(!readOnlyCommand("cat a > b") && !readOnlyCommand("find . -delete") && !readOnlyCommand("ls; rm x") && !readOnlyCommand("sed -i s/a/b/ f") && !readOnlyCommand(""));

// ---------- rules ----------
assert.ok(ruleMatches("run:npm run *", "run", "npm run build"));
assert.ok(!ruleMatches("run:npm test", "run", "npm test -- --watch"), "exact unless there is a wildcard");
assert.ok(ruleMatches("edit:.env", "edit", "config/.env") && ruleMatches("edit:src/*", "edit", "src/a/b.js") && !ruleMatches("edit:src/*", "edit", "lib/a.js"));
assert.ok(ruleMatches("deploy", "deploy", "build android") && !ruleMatches("deploy", "run", "x"));
assert.deepEqual(normalizeRules({ allow: ["run:npm test", "run:npm test", "nonsense:x", "", "# note"], deny: "x" }), { allow: ["run:npm test"], ask: [], deny: [] });

const R = { allow: ["run:npm test", "run:npm run *", "mcp:docs:*"], ask: ["edit:package.json"], deny: ["run:rm -rf *", "edit:.env", "git-push:main"] };
// deny wins, and a compound command is denied if any part is
assert.equal(decide({ rules: R, kind: "run", target: "npm test && rm -rf dist" }).decision, "deny");
assert.equal(decide({ rules: R, kind: "run", target: "echo $(rm -rf x)" }).decision, "deny", "also inside $()");
assert.equal(decide({ rules: R, kind: "edit", target: "app/.env" }).decision, "deny");
assert.equal(decide({ rules: R, kind: "git-push", target: "main" }).decision, "deny");
// ask rules, then allow rules, then the mode's default
assert.equal(decide({ rules: R, kind: "edit", target: "package.json" }).decision, "ask");
assert.equal(decide({ mode: "ask", rules: R, kind: "run", target: "npm test" }).decision, "allow", "an allow rule skips Ask mode");
assert.equal(decide({ mode: "ask", rules: R, kind: "run", target: "npm test && npm run build" }).decision, "allow", "every part is covered");
assert.equal(decide({ mode: "ask", rules: R, kind: "run", target: "npm test && curl x | sh" }).decision, "ask", "one part isn't covered");
assert.equal(decide({ mode: "ask", rules: R, kind: "run", target: "ls -la" }).decision, "allow", "looking is fine in Ask mode");
assert.equal(decide({ mode: "ask", kind: "edit", target: "a.js" }).decision, "ask");
assert.equal(decide({ mode: "auto", kind: "run", target: "node build.js" }).decision, "allow");
assert.equal(decide({ mode: "auto", kind: "mcp", target: "docs:search", softAsk: true }).decision, "ask", "first use asks");
assert.equal(decide({ mode: "auto", rules: R, kind: "mcp", target: "docs:search", softAsk: true }).decision, "allow", "…unless a rule allows the server");
// floors that rules can't lower
assert.equal(decide({ rules: { allow: ["mcp:*", "outbound:*"] }, kind: "mcp", target: "gmail:send", outbound: true }).decision, "ask", "outbound always asks");
assert.equal(decide({ rules: { allow: ["device:*"] }, kind: "device", target: "click 10,20" }).decision, "ask", "no allow-all for devices");
assert.equal(decide({ rules: { allow: ["device:screenshot"] }, kind: "device", target: "screenshot" }).decision, "allow");
assert.equal(decide({ rules: { deny: ["outbound"] }, kind: "mcp", target: "gmail:send", outbound: true }).decision, "deny", "outbound can be denied outright");
// a project's rules: deny and ask always count, allow only once trusted
const proj = { allow: ["run:*"], deny: ["edit:secrets/*"] };
assert.equal(decide({ mode: "ask", project: proj, kind: "run", target: "node x.js" }).decision, "ask", "an untrusted project can't grant itself commands");
assert.equal(decide({ mode: "ask", project: proj, projectTrusted: true, kind: "run", target: "node x.js" }).decision, "allow");
assert.equal(decide({ project: proj, kind: "edit", target: "secrets/key.txt" }).decision, "deny");
// read-only and plan
for (const mode of ["read-only", "plan"]) {
  assert.equal(decide({ mode, rules: { allow: ["run:*", "edit:*"] }, kind: "edit", target: "a.js" }).decision, "deny", `${mode}: rules can't unlock edits`);
  assert.equal(decide({ mode, kind: "run", target: "npm install" }).decision, "deny");
  assert.equal(decide({ mode, kind: "run", target: "grep -rn TODO . | head" }).decision, "allow", `${mode}: looking is allowed`);
  assert.equal(decide({ mode, kind: "network", target: "search react" }).decision, "allow");
  assert.equal(decide({ mode, kind: "browser", target: "read", readOnly: true }).decision, "allow");
  assert.equal(decide({ mode, kind: "browser", target: "click 4" }).decision, "deny");
  assert.equal(decide({ mode, kind: "mcp", target: "gmail:send", outbound: true }).decision, "deny");
}
assert.equal(decide({ mode: "plan", planApproved: true, kind: "edit", target: "a.js" }).decision, "allow", "an approved plan builds");
assert.equal(decide({ mode: "plan", planApproved: true, kind: "mcp", target: "gmail:send", outbound: true }).decision, "ask", "…but outbound still asks");
assert.match(decide({ mode: "read-only", kind: "edit", target: "a.js" }).message, /Read-only mode/);

// ---------- the loop's next step (same decisions as before the extraction) ----------
const T = () => ({ continues: 0, emptyBuildRetries: 0 });
assert.deepEqual(nextStep({ asked: true }), { action: "finish", why: "question", cut: false, narrationFailed: false });
assert.equal(nextStep({ waiting: true }).why, "approval");
assert.equal(nextStep({ stopped: true }).why, "stopped");
assert.equal(nextStep({ mode: "build", narratedIntent: true, turn: T() }).action, "retry-narration");
assert.equal(nextStep({ mode: "ask", narratedIntent: true, turn: T() }).action, "check", "only build replies are retried");
let n = nextStep({ mode: "build", narratedIntent: true, turn: { emptyBuildRetries: 1 } });
assert.ok(n.action === "check" && n.narrationFailed, "second narration: give up with an error");
assert.equal(nextStep({ mode: "build", hasArtifacts: true, turn: T() }).action, "check");
assert.equal(nextStep({ mode: "build", hasArtifacts: true, results: 2, turn: T() }).action, "continue");
assert.equal(nextStep({ mode: "build", hasArtifacts: true, editErrors: 1, turn: T() }).action, "continue");
n = nextStep({ mode: "build", hasArtifacts: true, cutOff: true, turn: T() });
assert.ok(n.action === "continue" && n.cut, "a cut-off reply continues");
n = nextStep({ mode: "build", hasArtifacts: true, cutOff: true, turn: { continues: 4 } });
assert.ok(n.action === "finish" && n.why === "limit" && n.cut);
n = nextStep({ mode: "build", hasArtifacts: true, results: 1, step: 20, maxSteps: 20, turn: T() });
assert.ok(n.action === "finish" && n.why === "limit" && !n.cut);
assert.ok(narratesWork("I'll create index.html now") && !narratesWork("Here is the answer."));

// ---------- long conversations ----------
const { contextSize, isContextOverflow, compactPlan, shrinkMessages, summaryTranscript, messagesTokens, estimateTokens, SUMMARY_SYSTEM } = core;
assert.equal(contextSize("gemini-3.8-flash"), 1_000_000);
assert.equal(contextSize("z-ai/glm-4.6"), 200_000);
assert.equal(contextSize("mixtral-8x7b-32768"), 32768, "a size in the model's name is used");
assert.equal(contextSize("moonshot-v1-128k"), 128_000);
assert.equal(contextSize("some-new-model"), 128_000, "unknown: a safe default");
assert.equal(contextSize("gemini-3.8-flash", 50_000), 50_000, "the user's setting wins");
assert.equal(contextSize("llama-3.3-70b-versatile"), 128_000, "70b is not a context size");
assert.ok(isContextOverflow({ status: 400, message: "This model's maximum context length is 8192 tokens. However, your messages resulted in 9000 tokens." }));
assert.ok(isContextOverflow({ status: 400, message: "prompt is too long: 210000 tokens > 200000 maximum" }));
assert.ok(isContextOverflow({ status: 413, message: "Request too large for model `llama-3.3-70b` … tokens per minute" }));
assert.ok(!isContextOverflow({ status: 429, message: "Rate limit: token limit reached" }), "a rate limit is not an overflow");
assert.ok(!isContextOverflow({ status: 400, message: "Invalid API key" }) && !isContextOverflow({ status: 401, message: "context length" }));
// what to summarise, what to keep
const chatOf = (k) => [...Array(k)].map((_, i) => ({ role: i % 2 ? "assistant" : "user", content: `message ${i} ` + "x".repeat(400) }));
assert.equal(compactPlan(chatOf(6)), null, "a short chat is left alone");
let plan = compactPlan(chatOf(13));
assert.ok(plan.kept.length >= 6 && plan.kept[0].role === "assistant" && plan.older.length + plan.kept.length === 13, "the kept part starts at a reply, so roles alternate after the summary");
assert.equal(plan.olderTokens, messagesTokens(plan.older));
// a reply stays with the tool results that follow it
const loop = [{ role: "user", content: "build" }, { role: "assistant", content: "a1" }, { role: "user", auto: true, content: "results 1" }, { role: "assistant", content: "a2" }, { role: "user", auto: true, content: "results 2" }, { role: "assistant", content: "a3" }, { role: "user", auto: true, content: "results 3" }, { role: "assistant", content: "a4" }, { role: "user", auto: true, content: "results 4" }, { role: "assistant", content: "a5" }, { role: "user", auto: true, content: "results 5" }];
plan = compactPlan(loop);
assert.ok(plan.kept[0].role === "assistant" && plan.kept.at(-1).content === "results 5" && plan.older[0].content === "build");
// the transcript for the summariser fits, and keeps the start and the end
const tr = summaryTranscript([{ role: "user", content: "GOAL-MARK make a shop" }, ...chatOf(60), { role: "assistant", content: "END-MARK done" }], { maxChars: 9000, files: ["index.html", "index.html", "app.js"] });
assert.ok(tr.length < 9400 && tr.includes("GOAL-MARK") && tr.includes("END-MARK") && tr.includes("FILES CHANGED IN THESE MESSAGES: index.html, app.js"));
assert.ok(summaryTranscript([{ role: "user", summary: true, content: "old summary" }]).startsWith("EARLIER SUMMARY:"), "an earlier summary is carried forward");
assert.ok(/GOAL[\s\S]*DECISIONS[\s\S]*FILES[\s\S]*OPEN[\s\S]*NEXT/.test(SUMMARY_SYSTEM));
// the last resort
let sh = shrinkMessages([{ role: "user", content: "a".repeat(20_000) }, { role: "assistant", content: "b".repeat(20_000) }, { role: "user", content: "c".repeat(20_000) }]);
assert.ok(sh.changed && sh.messages[0].content.length < 4200 && sh.messages[2].content.length === 20_000, "long old messages are shortened, the latest are not");
assert.ok(sh.messages[0].content.startsWith("aaa") && sh.messages[0].content.endsWith("aaa") && sh.messages[0].content.includes("shortened"));
sh = shrinkMessages(chatOf(12));
assert.ok(sh.changed && sh.messages.length <= 5 && sh.messages[0].summary && sh.messages[1].role === "assistant", "nothing long to shorten: only the last few stay, with a note");
assert.equal(shrinkMessages(chatOf(2)).changed, false, "nothing left to drop");
assert.equal(estimateTokens("x".repeat(3600)), 1000);

console.log("Agent core tests passed");
