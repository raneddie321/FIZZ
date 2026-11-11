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

console.log("Agent core tests passed");
