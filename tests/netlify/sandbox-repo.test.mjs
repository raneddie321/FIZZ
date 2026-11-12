// Big repositories in the sandbox (netlify/lib/sandbox.mjs clone/look) with a fake Vercel Sandbox.
import assert from "node:assert/strict";
const lib = await import("../../netlify/lib/sandbox.mjs");
const cmds = [], written = [];
let cloned = false;
const files = { "/vercel/sandbox/app/src/a.js": "const x = 1;\n", "/vercel/sandbox/app/big.bin": "\u0000\u0001binary" };
const sbx = {
  async writeFiles(list) { for (const f of list) written.push({ path: f.path, content: String(f.content) }); },
  async runCommand(p) {
    const script = p.args?.[1] || "";
    cmds.push(script);
    let out = "", code = 0;
    if (/git .*clone/.test(script)) { cloned = !/nope/.test(script); code = cloned ? 0 : 128; out = cloned ? "" : "fatal: repository 'https://x-access-token:SECRET@github.com/me/nope' not found"; }
    else if (/test -d .*\.git/.test(script)) out = cloned ? "yes\n" : "";
    else if (/rev-parse/.test(script)) out = "main\nabc123\n";
    else if (/find \. -type f/.test(script)) out = "13\tsrc/a.js\n200\tREADME.md\n";
    else if (/git grep/.test(script)) out = "src/a.js:1:const x = 1;\n";
    const done = { exitCode: code, stdout: async () => out, stderr: async () => "", output: async () => out };
    return { cmdId: "c", wait: async () => done, output: async () => out };
  },
  async readFileToBuffer({ path }) { return files[path] !== undefined ? Buffer.from(files[path]) : null; },
};
lib.setSandboxModule({ Sandbox: { getOrCreate: async () => sbx } });
const A = { userId: "u1", projectId: "p1" };

let r = await lib.clone({ ...A, url: "https://github.com/me/app", branch: "main", token: "SECRET-TOKEN" });
assert.deepEqual(r.tree, [{ size: 13, path: "src/a.js" }, { size: 200, path: "README.md" }]);
assert.equal(r.branch, "main");
assert.ok(!cmds.some((c) => c.includes("SECRET-TOKEN")), "the token never appears on a command line");
assert.ok(written.some((w) => w.path === "/tmp/fizz-git-cred" && w.content === "SECRET-TOKEN"), "it goes in a file");
assert.ok(cmds.find((c) => /clone/.test(c)).includes("rm -f /tmp/fizz-git-cred"), "and the file is deleted after the clone");
await assert.rejects(lib.clone({ ...A, url: "https://evil.example/x" }), /Only https:\/\/github.com/);
await assert.rejects(lib.clone({ ...A, url: "https://github.com/me/app", branch: "a;rm -rf /" }), /Invalid branch/);
await assert.rejects(lib.clone({ ...A, url: "https://github.com/me/nope", token: "SECRET" }), (e) => /git clone failed/.test(e.message) && !e.message.includes("SECRET"), "the token is scrubbed from errors");
cloned = true;
r = await lib.look({ ...A, kind: "grep", pattern: "const x';rm -rf /;'", glob: "*.js" });
const g = cmds.at(-1);
assert.ok(g.includes(`-e 'const x'\\'';rm -rf /;'\\'''`) && g.includes("':(glob)**/*.js'"), "the pattern and glob are quoted, never run");
assert.deepEqual(r.matches, [{ path: "src/a.js", line: 1, text: "const x = 1;" }]);
r = await lib.look({ ...A, kind: "read", paths: ["src/a.js", "big.bin", "../etc/passwd", "missing.txt"] });
assert.equal(r.files["src/a.js"], "const x = 1;\n");
assert.deepEqual(r.files["big.bin"], { binary: Buffer.byteLength(files["/vercel/sandbox/app/big.bin"]) });
assert.ok(!("../etc/passwd" in r.files), "paths outside the repository are ignored");
assert.equal(r.files["missing.txt"], null);
cloned = false;
await assert.rejects(lib.look({ ...A, kind: "tree" }), (e) => e.code === "gone", "a reset sandbox says so");
console.log("Sandbox repository tests passed");
