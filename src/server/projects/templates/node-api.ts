export const nodeApi: Record<string, string> = {
  "package.json": `{
  "name": "{{slug}}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test"
  },
  "engines": { "node": ">=20" }
}
`,
  "src/server.js": `import { createServer } from "node:http";
import { router } from "./router.js";

const port = Number(process.env.PORT ?? 8080);

createServer(async (req, res) => {
  try {
    await router(req, res);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "internal_error" }));
  }
}).listen(port, () => console.log(\`API listening on http://localhost:\${port}\`));
`,
  "src/router.js": `import { items } from "./store.js";

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error("Body too large");
  }
  return raw ? JSON.parse(raw) : {};
}

export async function router(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });
  if (req.method === "GET" && url.pathname === "/items") return send(res, 200, { items: items.list() });
  if (req.method === "POST" && url.pathname === "/items") {
    const body = await readJson(req);
    if (typeof body.name !== "string" || !body.name.trim()) return send(res, 422, { error: "name is required" });
    return send(res, 201, { item: items.create(body.name.trim()) });
  }
  return send(res, 404, { error: "not_found" });
}
`,
  "src/store.js": `let nextId = 1;
const data = new Map();

export const items = {
  list: () => [...data.values()],
  create(name) {
    const item = { id: nextId++, name, createdAt: new Date().toISOString() };
    data.set(item.id, item);
    return item;
  },
};
`,
  "test/store.test.js": `import { test } from "node:test";
import assert from "node:assert/strict";
import { items } from "../src/store.js";

test("creates and lists items", () => {
  const item = items.create("First");
  assert.equal(item.name, "First");
  assert.ok(items.list().some((i) => i.id === item.id));
});
`,
  "README.md": `# {{name}}

{{description}}

A dependency-free Node.js HTTP API. In the FIZZ DEV sandbox:

\`\`\`bash
npm test
npm start
\`\`\`

Endpoints: \`GET /health\`, \`GET /items\`, \`POST /items {"name": "..."}\`.
`,
};
