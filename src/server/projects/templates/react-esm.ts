export const reactEsm: Record<string, string> = {
  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{name}}</title>
    <link rel="stylesheet" href="styles.css" />
    <script type="importmap">
      {
        "imports": {
          "react": "https://esm.sh/react@18.3.1",
          "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
          "htm": "https://esm.sh/htm@3.1.1"
        }
      }
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="app.js"></script>
  </body>
</html>
`,
  "app.js": `import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import htm from "htm";

// htm gives JSX-like syntax without a build step.
const html = htm.bind(React.createElement);

function useStoredTasks() {
  const [tasks, setTasks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("tasks") ?? "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("tasks", JSON.stringify(tasks));
    } catch {}
  }, [tasks]);
  return [tasks, setTasks];
}

function App() {
  const [tasks, setTasks] = useStoredTasks();
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("all");

  const visible = tasks.filter((t) => (filter === "all" ? true : filter === "done" ? t.done : !t.done));

  function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setTasks([...tasks, { id: crypto.randomUUID(), title: text.trim(), done: false }]);
    setText("");
  }

  return html\`
    <main class="app">
      <h1>{{name}}</h1>
      <p class="muted">{{description}}</p>
      <form onSubmit=\${add} class="row">
        <input value=\${text} onInput=\${(e) => setText(e.target.value)} placeholder="Add a task…" aria-label="New task" />
        <button type="submit">Add</button>
      </form>
      <div class="filters" role="tablist">
        \${["all", "open", "done"].map(
          (f) => html\`<button key=\${f} role="tab" aria-selected=\${filter === f} class=\${filter === f ? "active" : ""} onClick=\${() => setFilter(f)}>\${f}</button>\`,
        )}
      </div>
      <ul class="list">
        \${visible.map(
          (t) => html\`
            <li key=\${t.id} class=\${t.done ? "done" : ""}>
              <label>
                <input type="checkbox" checked=\${t.done} onChange=\${() => setTasks(tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))} />
                \${t.title}
              </label>
              <button class="ghost" aria-label="Delete" onClick=\${() => setTasks(tasks.filter((x) => x.id !== t.id))}>×</button>
            </li>
          \`,
        )}
      </ul>
      \${visible.length === 0 && html\`<p class="muted">Nothing here yet.</p>\`}
    </main>
  \`;
}

createRoot(document.getElementById("root")).render(html\`<\${App} />\`);
`,
  "styles.css": `:root { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; }
body { margin: 0; background: #f8fafc; }
.app { max-width: 560px; margin: 48px auto; padding: 24px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; }
h1 { margin: 0 0 4px; }
.muted { color: #64748b; }
.row { display: flex; gap: 8px; margin: 20px 0 12px; }
input[type="text"], input:not([type]) { flex: 1; font: inherit; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; }
button { font: inherit; padding: 8px 14px; border-radius: 10px; border: 1px solid #2563eb; background: #2563eb; color: white; cursor: pointer; }
.filters { display: flex; gap: 6px; margin-bottom: 12px; }
.filters button { background: transparent; color: #334155; border-color: #e2e8f0; text-transform: capitalize; }
.filters button.active { background: #eff6ff; border-color: #2563eb; color: #1d4ed8; }
.list { list-style: none; padding: 0; margin: 0; }
.list li { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
.list li.done label { color: #94a3b8; text-decoration: line-through; }
.ghost { background: transparent; color: #94a3b8; border: none; font-size: 20px; padding: 0 8px; }
`,
  "README.md": `# {{name}}

{{description}}

A React app that runs directly in the browser with ES modules and an import map — no build step required, so the FIZZ DEV live preview works immediately. Dependencies load from esm.sh.
`,
};
