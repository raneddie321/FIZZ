/* Fizz Code and the user's Shopify store (signed in with OAuth in Settings → Connections), through the Admin GraphQL API:
     <fizz-shopify>{ products(first: 10) { nodes { id title status totalInventory } } }</fizz-shopify>
     <fizz-shopify variables='{"id":"gid://shopify/Product/1"}'>query($id: ID!) { product(id: $id) { title } }</fizz-shopify>
   Reading runs right away; a mutation changes the live store, so it always asks first. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const store = () => F.serverStatusCached?.()?.connections?.shopify;
  const isMutation = (q) => /^\s*mutation\b/i.test(String(q || "").replace(/^\s*#.*$/gm, ""));
  F.agentTools.register("shopify", {
    icon: "box", feedback: true,
    label: (t) => (isMutation(t.body) ? "Changed the Shopify store" : "Read from the Shopify store"),
    summary: (k) => `${k} Shopify request${k === 1 ? "" : "s"}`,
    prompt: () => `The user's Shopify store ${store()?.account || ""} is connected. <fizz-shopify>GraphQL</fizz-shopify> runs a query or mutation on its Admin GraphQL API (variables='{"…":…}' as JSON when needed) — products, variants, inventory, orders, customers, collections, pages, files. Ask for only the fields you need and use first: N. Mutations change the live store, so the user is asked first; say exactly what will change. Read userErrors in every mutation's result.`,
    available: () => Boolean(store()?.connected),
    unavailable: "No Shopify store is connected. If the user wants Fizz to work on their store, ask them to connect it (Settings → Connections → Shopify store).",
    perm: (t) => ({ kind: "mcp", target: `shopify:${isMutation(t.body) ? "mutation" : "query"}`, readOnly: !isMutation(t.body), outbound: isMutation(t.body) }),
    async run(t) {
      const query = String(t.body || "").trim();
      if (!query) return { ok: false, text: "The GraphQL query was empty." };
      let variables = {};
      if (t.attrs.variables) { try { variables = JSON.parse(t.attrs.variables); } catch { return { ok: false, text: "variables must be JSON." }; } }
      try {
        const r = await F.conn.shopify.graphql(query, variables);
        const text = JSON.stringify(r.ok ? r.data : { errors: r.errors }, null, 1);
        return { ok: r.ok, text: `${r.ok ? "" : "Shopify returned errors:\n"}${text.length > 12000 ? `${text.slice(0, 12000)}\n… (cut: ask for fewer fields or items)` : text}` };
      } catch (e) { return { ok: false, text: `Shopify: ${e.message}` }; }
    },
  });
})();
