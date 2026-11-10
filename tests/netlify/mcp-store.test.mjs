// MCP connector storage (netlify/lib/mcp-store.mjs): Neon, the browser vault, moving old cookies, isolation.
import assert from "node:assert/strict";
process.env.FIZZ_SECRET ||= "test-secret-for-mcp-store-0123456789abcdef";
const { seal, unseal } = await import("../../netlify/lib/util.mjs");
const store = await import("../../netlify/lib/mcp-store.mjs");

const server = (i, tools = 3) => ({
  id: `srv-${i}`, name: `Server ${i}`, url: `https://mcp${i}.example.com/mcp`, added: i,
  headers: { Authorization: `Bearer secret-token-${i}` },
  oauth: i % 2 ? { clientId: "c", refresh: `refresh-${i}`, exp: 0 } : undefined,
  tools: Array.from({ length: tools }, (_, t) => ({ name: `tool_${t}`, description: "x".repeat(120), input: "query: string, limit: number" })),
});
const req = (cookie = "") => new Request("https://fizz.test/api/mcp/list", { method: "POST", headers: cookie ? { cookie } : {} });

// ---------- vault (no database): no size limit, bound to the user ----------
delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL;
assert.equal(store.storageKind(), "vault");
let s = await store.openStore(req(), "user-a", {});
assert.equal(s.list.length, 0);
const many = Array.from({ length: 60 }, (_, i) => server(i, 200));
await s.save(many);
const vault = s.out().vault;
assert.ok(vault.length > 500_000, "60 servers × 200 tools: far beyond what cookies could hold");
assert.ok(!vault.includes("secret-token-1"), "the vault is encrypted");
s = await store.openStore(req(), "user-a", { vault });
assert.equal(s.list.length, 60, "every server comes back");
assert.equal(s.list[59].tools.length, 200);
s = await store.openStore(req(), "user-b", { vault });
assert.equal(s.list.length, 0, "another user can't open it");

// ---------- old cookies move into the store, then are cleared ----------
const oldList = seal({ list: [server(1), server(2)], exp: Date.now() + 86400_000 });
const parts = [oldList.slice(0, 3500), oldList.slice(3500)].filter(Boolean);
const cookie = parts.map((p, i) => `${i ? `fizz_mcp_${i}` : "fizz_mcp"}=${encodeURIComponent(p)}`).join("; ");
const headers = new Headers();
s = await store.openStore(req(cookie), "user-a", {}, headers);
assert.equal(s.list.length, 2, "Composio & co. from the old cookies are kept");
assert.ok(s.out().vault, "…and saved into the vault right away");
assert.ok(headers.getSetCookie().some((c) => c.startsWith("fizz_mcp=;")), "the old cookie is cleared");

// ---------- OAuth hand-over in vault mode ----------
const h2 = new Headers();
await store.handOver(req(), "user-a", server(7, 50), h2);
const handCookie = h2.getSetCookie().filter((c) => !/=;/.test(c)).map((c) => c.split(";")[0]).join("; ");
assert.ok(handCookie.includes("fizz_mcp_new="));
s = await store.openStore(req(handCookie), "user-a", { vault });
assert.equal(s.list.length, 60, "the signed-in server is merged by URL, not duplicated");
assert.equal(s.list.find((x) => x.url === server(7).url).tools.length, 200, "same URL: updated in place, tools kept");
s = await store.openStore(req(handCookie), "user-b", {});
assert.equal(s.list.length, 0, "a hand-over is only for its own user");

// ---------- Neon: one sealed row per server, isolated per user ----------
const rows = new Map(); // `${user}|${id}` → row
let creates = 0;
const fakeNeon = () => ({
  async query(text, params = []) {
    if (/^CREATE TABLE/.test(text)) { creates++; return []; }
    if (/^SELECT/.test(text)) return [...rows.values()].filter((r) => r.user_id === params[0]).sort((a, b) => a.pos - b.pos);
    if (/^INSERT/.test(text)) { const [user_id, id, sealed, tools, pos] = params; rows.set(`${user_id}|${id}`, { user_id, id, sealed, tools, pos }); return []; }
    if (/^DELETE/.test(text)) { for (const id of params[1]) rows.delete(`${params[0]}|${id}`); return []; }
    throw new Error(`unexpected SQL: ${text}`);
  },
});
store.setSqlFactory(fakeNeon);
process.env.DATABASE_URL = "postgres://fake";
assert.equal(store.storageKind(), "neon");
s = await store.openStore(req(), "user-a", {});
await s.save([server(1), server(2), server(3)]);
assert.equal(rows.size, 3);
for (const r of rows.values()) assert.ok(!r.sealed.includes("secret-token") && unseal(r.sealed).uid === "user-a", "each row is sealed and tagged with its user");
assert.deepEqual(s.out(), {}, "no vault when there's a database");
s = await store.openStore(req(), "user-a", {});
assert.equal(s.list.length, 3, "same list on any device the user signs in on");
assert.equal(s.list[0].headers.Authorization, "Bearer secret-token-1");
// Only changed rows are written; removed ones are deleted.
const before = rows.get("user-a|srv-1").sealed;
await s.save([s.list[0], { ...s.list[2], name: "Renamed" }]);
assert.equal(rows.get("user-a|srv-1").sealed, before, "unchanged server not rewritten");
assert.ok(!rows.has("user-a|srv-2"), "removed server deleted");
assert.equal(unseal(rows.get("user-a|srv-3").sealed).name, "Renamed");
// Another user's rows never mix in, even if a row were copied under their id.
rows.set("user-b|stolen", { ...rows.get("user-a|srv-1"), user_id: "user-b", id: "stolen" });
s = await store.openStore(req(), "user-b", {});
assert.equal(s.list.length, 0, "a row sealed for another user is ignored");
// Old cookies move into Neon too.
s = await store.openStore(req(cookie), "user-c", {}, new Headers());
assert.equal(s.list.length, 2);
assert.ok(rows.has("user-c|srv-1") && rows.has("user-c|srv-2"));
assert.equal(creates, 1, "the table is created once per instance");
delete process.env.DATABASE_URL;
console.log("MCP storage tests passed");
