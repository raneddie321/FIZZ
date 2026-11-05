import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../../static-site/assets/agent-context.js", import.meta.url), "utf8");
const sandbox = { window: { FIZZ: {} } };
runInNewContext(source, sandbox, { filename: "agent-context.js" });
const context = sandbox.window.FIZZ.agentContext;
assert.ok(context?.buildProjectContext, "context retrieval helper is installed");

const files = {
  "README.md": "# Sample app\nGeneral project notes.",
  "FIZZ.md": "# Project rules\nPreserve the existing UI and follow the current architecture.",
  "package.json": JSON.stringify({ scripts: { test: "vitest run" }, dependencies: { react: "19" } }),
  "index.html": '<html><head><meta name="viewport" content="width=device-width"></head><body><script type="module" src="./src/main.tsx"></script></body></html>',
  "src/main.tsx": 'import App from "./App.tsx";\nimport { getSession } from "./auth/session.ts";\nexport default function Main(){ return App(); }',
  "src/App.tsx": 'import { LoginPanel } from "./components/LoginPanel.tsx";\nexport default function App(){ return LoginPanel(); }',
  "src/components/LoginPanel.tsx": "export function LoginPanel(){ return null; }",
  "src/auth/session.ts": "export function getSession(){ return null; }\n// authentication login session flow",
  "src/aaa/unrelated.ts": "export const unrelated = true;",
  "node_modules/react/index.js": "must never be sent",
  ".git/config": "must never be sent",
  "public/logo.png": "\\u0000blob:public/logo.png",
};

const result = context.buildProjectContext(files, {
  query: "authentication login session flow",
  mentions: ["src/aaa/unrelated.ts"],
  budgetChars: 12_000,
});

assert.ok(result.files.includes("src/aaa/unrelated.ts"), "explicit @mentions are prioritized");
assert.ok(result.files.includes("FIZZ.md"), "project instructions are included");
assert.ok(result.files.includes("package.json"), "dependency/configuration manifests are included");
assert.ok(result.files.includes("index.html"), "web entry points are included");
assert.ok(result.files.includes("src/main.tsx"), "entry-point imports are followed");
assert.ok(result.files.includes("src/App.tsx"), "transitive local imports are followed");
assert.ok(result.files.includes("src/auth/session.ts"), "task-relevant files are retrieved");
assert.ok(!result.files.some((path) => path.includes("node_modules") || path.startsWith(".git/")), "generated and VCS folders are excluded");
assert.ok(result.usedChars <= result.budgetChars, "retrieved context stays within the requested character budget");
assert.ok(result.text.includes("authentication login session flow"), "relevant implementation lines are included");
assert.ok(!result.text.includes("must never be sent"), "ignored files never leak into context");

const longFile = ["// header", ...Array.from({ length: 600 }, (_, i) => "const line" + i + " = \"unrelated\";"), "// AUTHENTICATION CHECKPOINT UNIQUE_MARKER", "export function verifyLogin(){ return true; }"].join("\\n");
const excerpt = context.excerpt(longFile, ["authentication", "checkpoint", "verifyLogin"], 1_800);
assert.ok(excerpt.includes("UNIQUE_MARKER"), "long files include matching sections beyond the beginning");
assert.ok(excerpt.length <= 1_850, "long-file excerpts respect their bounded size with a small marker allowance");

console.log("All agent context tests passed");
