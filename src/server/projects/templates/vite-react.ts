export const viteReact: Record<string, string> = {
  "package.json": `{
  "name": "{{slug}}",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host 0.0.0.0 --port 5173",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "19.1.1",
    "react-dom": "19.1.1"
  },
  "devDependencies": {
    "@types/react": "19.1.13",
    "@types/react-dom": "19.1.9",
    "@vitejs/plugin-react": "5.0.3",
    "typescript": "5.9.2",
    "vite": "7.1.7",
    "vitest": "3.2.4"
  }
}
`,
  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{name}}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
`,
  "tsconfig.json": `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
`,
  "src/main.tsx": `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
  "src/App.tsx": `import { useState } from "react";

export function App() {
  const [count, setCount] = useState(0);
  return (
    <main className="app">
      <h1>{{name}}</h1>
      <p>{{description}}</p>
      <button onClick={() => setCount((c) => c + 1)}>Clicked {count} times</button>
    </main>
  );
}
`,
  "src/index.css": `body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
.app { max-width: 640px; margin: 80px auto; padding: 0 24px; }
button { font: inherit; padding: 10px 16px; border-radius: 10px; border: 1px solid #2563eb; background: #2563eb; color: #fff; cursor: pointer; }
`,
  "src/App.test.ts": `import { describe, expect, it } from "vitest";

describe("sanity", () => {
  it("adds numbers", () => {
    expect(1 + 1).toBe(2);
  });
});
`,
  ".gitignore": `node_modules
dist
`,
  "README.md": `# {{name}}

{{description}}

React + TypeScript + Vite. Requires the FIZZ DEV sandbox to install and run:

\`\`\`bash
npm install
npm run dev
npm test
\`\`\`
`,
};
