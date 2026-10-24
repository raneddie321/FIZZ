import { error, env, json, readJson, sameOrigin, secretConfigured } from "../lib/util.mjs";
import { requireUser } from "../lib/auth.mjs";
import { quotaCounter, today } from "../lib/kv.mjs";
import { callTool, listTools, loadServers, MAX_MCP_SERVERS, MCP_LIMITS, publicServer, redact, slug, storeServers, validateServer } from "../lib/mcp.mjs";

/** Connect, list, refresh and call the MCP (Model Context Protocol) servers the user added. */
export default async (req, context) => {
  const action = context.params.action;
  if (!sameOrigin(req)) return error(403, "Not allowed.");
  if (!secretConfigured()) return error(503, "FIZZ_SECRET isn't set on this server.", "not_configured");
  if (!(action in MCP_LIMITS)) return error(404, "Unknown action.");
  const who = await requireUser(req);
  if (who.response) return who.response;
  // Web search and reading are quota'd the same way; a runaway agent can't spend all day on MCP calls.
  const limit = action === "call" ? Number(env("FIZZ_MCP_LIMIT") || MCP_LIMITS.call) : MCP_LIMITS[action];
  const bump = quotaCounter();
  if (!(await bump(`${today()}/mcp-${action}/${who.userId}`, limit))) {
    return error(429, `You've reached today's limit for MCP ${action === "call" ? "tool calls" : action === "add" ? "connections" : "requests"}. Try again tomorrow.`, "quota");
  }
  const headers = new Headers();
  // The header values (e.g. Authorization) must never come back to the browser, even inside an error.
  let active = null;
  try {
    if (action === "list") {
      const servers = await loadServers(req, who.userId);
      return json({ servers: servers.map(publicServer) });
    }
    const body = await readJson(req, 200_000);

    if (action === "add") {
      const cfg = await validateServer(body);
      active = cfg;
      // The handshake doubles as the check: a wrong URL or dead server fails here, before saving.
      const found = await listTools(cfg);
      const servers = await loadServers(req, who.userId);
      const existing = servers.find((s) => s.url === cfg.url);
      if (!existing && servers.length >= MAX_MCP_SERVERS) {
        return error(413, `You can connect up to ${MAX_MCP_SERVERS} MCP servers at a time. Remove one first.`, "too_many");
      }
      // A name the user typed wins; otherwise the server's own name, then the host.
      const name = String(body.name || "").trim().slice(0, 40) || found.name || existing?.name || humanHost(cfg.url);
      const server = {
        id: existing?.id || uniqueId(servers, slug(name)),
        name,
        url: cfg.url,
        headers: cfg.headers,
        tools: found.tools,
        added: existing?.added || Date.now(),
      };
      const list = existing ? servers.map((s) => (s.id === existing.id ? server : s)) : [...servers, server];
      await storeServers(headers, who.userId, list);
      return json({ ok: true, server: publicServer(server) }, { headers });
    }

    const servers = await loadServers(req, who.userId);
    const pick = (id) => servers.find((s) => s.id === String(id || ""));

    if (action === "remove") {
      const s = pick(body.id);
      if (!s) return error(404, "That MCP server isn't connected.", "not_found");
      await storeServers(headers, who.userId, servers.filter((x) => x.id !== s.id));
      return json({ ok: true }, { headers });
    }

    if (action === "tools") {
      const s = pick(body.id);
      if (!s) return error(404, "That MCP server isn't connected.", "not_found");
      const found = await listTools(s);
      const updated = { ...s, tools: found.tools };
      await storeServers(headers, who.userId, servers.map((x) => (x.id === s.id ? updated : x)));
      return json({ ok: true, server: publicServer(updated) }, { headers });
    }

    if (action === "call") {
      const s = pick(body.id);
      if (!s) return error(404, "That MCP server isn't connected.", "not_found");
      const name = String(body.tool || "").trim();
      if (!name || name.length > 120) return error(400, "Which tool should FIZZ call?", "bad_tool");
      let args = body.arguments;
      if (args !== undefined && args !== null && typeof args !== "object") return error(400, "The arguments must be JSON.", "bad_arguments");
      try {
        const out = await callTool(s, name, args || {});
        return json({ ok: out.ok, isError: !out.ok, text: redact(out.text, s), images: out.images || [], truncated: Boolean(out.truncated) });
      } catch (e) {
        const message = redact(e.message || String(e), s);
        if (!e.status) console.error("[mcp]", e);
        return error(e.status || 502, message, e.code || "error");
      }
    }
    return error(404, "Unknown action.");
  } catch (e) {
    if (!e.status) console.error("[mcp]", e);
    return error(e.status || 502, redact(e.message || "The MCP server didn't answer.", active));
  }
};

const humanHost = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "MCP server";
  }
};

const uniqueId = (servers, base) => {
  let id = base;
  for (let i = 2; servers.some((s) => s.id === id); i++) id = `${base}-${i}`;
  return id;
};

export const config = { path: "/api/mcp/:action" };
