export const nextjsApp: Record<string, string> = {
  "package.json": `{
  "name": "{{slug}}",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -H 0.0.0.0 -p 3000",
    "build": "next build",
    "start": "next start -H 0.0.0.0 -p 3000"
  },
  "dependencies": {
    "next": "15.5.4",
    "react": "19.1.1",
    "react-dom": "19.1.1"
  },
  "devDependencies": {
    "@types/node": "22.18.6",
    "@types/react": "19.1.13",
    "typescript": "5.9.2"
  }
}
`,
  "tsconfig.json": `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
`,
  "app/layout.tsx": `import "./globals.css";

export const metadata = { title: "{{name}}", description: "{{description}}" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
  "app/page.tsx": `export default function Home() {
  return (
    <main className="container">
      <h1>{{name}}</h1>
      <p>{{description}}</p>
      <p className="muted">Edit app/page.tsx — or ask FIZZ DEV to build the rest of the app.</p>
    </main>
  );
}
`,
  "app/api/health/route.ts": `export function GET() {
  return Response.json({ ok: true, time: new Date().toISOString() });
}
`,
  "app/globals.css": `body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; }
.container { max-width: 720px; margin: 80px auto; padding: 0 24px; }
.muted { color: #64748b; }
`,
  ".gitignore": `node_modules
.next
out
`,
  "README.md": `# {{name}}

{{description}}

A Next.js (App Router) project. Running it requires the FIZZ DEV sandbox:

\`\`\`bash
npm install
npm run dev
\`\`\`
`,
};
