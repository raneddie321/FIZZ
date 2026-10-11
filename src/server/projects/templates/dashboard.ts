export const dashboard: Record<string, string> = {
  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{name}}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <aside class="sidebar">
      <div class="brand">{{name}}</div>
      <nav>
        <a class="active" href="#">Overview</a>
        <a href="#">Customers</a>
        <a href="#">Orders</a>
        <a href="#">Settings</a>
      </nav>
    </aside>
    <main class="content">
      <header class="topbar">
        <h1>Overview</h1>
        <p class="note">Sample data — connect a real data source to replace it.</p>
      </header>
      <section class="stats" id="stats"></section>
      <section class="panel">
        <h2>Weekly revenue</h2>
        <div class="chart" id="chart" role="img" aria-label="Weekly revenue bar chart"></div>
      </section>
      <section class="panel">
        <h2>Recent orders</h2>
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th class="num">Total</th></tr></thead>
          <tbody id="orders"></tbody>
        </table>
      </section>
    </main>
    <script src="data.js"></script>
    <script src="app.js"></script>
  </body>
</html>
`,
  "data.js": `// Sample data for the dashboard layout. Replace with real API calls.
window.DASHBOARD_DATA = {
  stats: [
    { label: "Revenue", value: 48250, format: "currency", change: 0.12 },
    { label: "Orders", value: 1284, format: "number", change: 0.04 },
    { label: "Customers", value: 892, format: "number", change: -0.02 },
    { label: "Conversion", value: 0.034, format: "percent", change: 0.01 },
  ],
  weekly: [
    { label: "Mon", value: 5200 }, { label: "Tue", value: 6100 }, { label: "Wed", value: 7400 },
    { label: "Thu", value: 6900 }, { label: "Fri", value: 8800 }, { label: "Sat", value: 7600 }, { label: "Sun", value: 6250 },
  ],
  orders: [
    { id: "#1042", customer: "Avery Lee", status: "Paid", total: 129.0 },
    { id: "#1041", customer: "Jordan Kim", status: "Pending", total: 64.5 },
    { id: "#1040", customer: "Sam Patel", status: "Paid", total: 312.2 },
    { id: "#1039", customer: "Riley Chen", status: "Refunded", total: 42.0 },
  ],
};
`,
  "app.js": `const data = window.DASHBOARD_DATA;
const fmt = {
  currency: (v) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v),
  number: (v) => new Intl.NumberFormat().format(v),
  percent: (v) => (v * 100).toFixed(1) + "%",
};

document.getElementById("stats").innerHTML = data.stats
  .map(
    (s) => \`<div class="stat"><p class="label">\${s.label}</p><p class="value">\${fmt[s.format](s.value)}</p>
      <p class="change \${s.change >= 0 ? "up" : "down"}">\${s.change >= 0 ? "▲" : "▼"} \${Math.abs(s.change * 100).toFixed(0)}%</p></div>\`,
  )
  .join("");

const max = Math.max(...data.weekly.map((d) => d.value));
document.getElementById("chart").innerHTML = data.weekly
  .map((d) => \`<div class="bar-wrap"><div class="bar" style="height:\${(d.value / max) * 100}%" title="\${d.label}: \${fmt.currency(d.value)}"></div><span>\${d.label}</span></div>\`)
  .join("");

document.getElementById("orders").innerHTML = data.orders
  .map((o) => \`<tr><td>\${o.id}</td><td>\${o.customer}</td><td><span class="pill \${o.status.toLowerCase()}">\${o.status}</span></td><td class="num">\${fmt.currency(o.total)}</td></tr>\`)
  .join("");
`,
  "styles.css": `* { box-sizing: border-box; }
body { margin: 0; display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; background: #f8fafc; }
.sidebar { background: #0f172a; color: #cbd5e1; padding: 20px 14px; }
.brand { color: #fff; font-weight: 700; margin: 0 8px 20px; }
.sidebar nav { display: grid; gap: 2px; }
.sidebar a { color: inherit; text-decoration: none; padding: 8px 10px; border-radius: 8px; }
.sidebar a.active, .sidebar a:hover { background: #1e293b; color: #fff; }
.content { padding: 28px; display: grid; gap: 20px; align-content: start; }
.topbar h1 { margin: 0; }
.note { margin: 4px 0 0; color: #64748b; font-size: 14px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
.stat, .panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 18px; }
.stat .label { margin: 0; color: #64748b; font-size: 13px; }
.stat .value { margin: 6px 0 2px; font-size: 26px; font-weight: 650; }
.change { margin: 0; font-size: 13px; }
.change.up { color: #15803d; } .change.down { color: #b91c1c; }
.panel h2 { margin: 0 0 14px; font-size: 16px; }
.chart { display: flex; align-items: flex-end; gap: 12px; height: 200px; }
.bar-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; justify-content: flex-end; font-size: 12px; color: #64748b; }
.bar { width: 100%; background: #2563eb; border-radius: 6px 6px 0 0; min-height: 4px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #f1f5f9; }
th { color: #64748b; font-weight: 500; }
.num { text-align: right; }
.pill { padding: 2px 8px; border-radius: 999px; font-size: 12px; background: #f1f5f9; }
.pill.paid { background: #dcfce7; color: #166534; } .pill.pending { background: #fef9c3; color: #854d0e; } .pill.refunded { background: #fee2e2; color: #991b1b; }
@media (max-width: 760px) { body { grid-template-columns: 1fr; } .sidebar { display: none; } }
`,
  "README.md": `# {{name}}

{{description}}

An admin dashboard layout in plain HTML/CSS/JS with **sample data** in \`data.js\`. Ask FIZZ DEV to connect it to a real API or database.
`,
};
