import "server-only";
import type { ProjectType } from "@prisma/client";
import { staticSite } from "./static-site";
import { reactEsm } from "./react-esm";
import { canvasGame } from "./canvas-game";
import { dashboard } from "./dashboard";
import { nextjsApp } from "./nextjs";
import { viteReact } from "./vite-react";
import { nodeApi } from "./node-api";

export type TemplateDef = {
  id: string;
  name: string;
  description: string;
  stack: string;
  /** Can be previewed instantly in the browser, without a sandbox. */
  instantPreview: boolean;
  recommendedFor: ProjectType[];
  files: Record<string, string>;
  previewEntry?: string;
};

export const TEMPLATES: TemplateDef[] = [
  { id: "static-site", name: "Website", description: "Responsive landing page with HTML, CSS and JavaScript.", stack: "HTML · CSS · JavaScript", instantPreview: true, recommendedFor: ["WEBSITE", "PORTFOLIO", "BUSINESS", "ECOMMERCE"], files: staticSite, previewEntry: "index.html" },
  { id: "react-esm", name: "React app (no build)", description: "React with ES modules and an import map — runs instantly in preview.", stack: "React · ES modules", instantPreview: true, recommendedFor: ["WEB_APP", "SAAS", "MOBILE_APP"], files: reactEsm, previewEntry: "index.html" },
  { id: "canvas-game", name: "Canvas game", description: "Playable HTML5 canvas game with a game loop and scoring.", stack: "HTML5 Canvas · JavaScript", instantPreview: true, recommendedFor: ["GAME"], files: canvasGame, previewEntry: "index.html" },
  { id: "dashboard", name: "Admin dashboard", description: "Dashboard layout with stats, chart and table (sample data).", stack: "HTML · CSS · JavaScript", instantPreview: true, recommendedFor: ["DASHBOARD", "BUSINESS", "SAAS"], files: dashboard, previewEntry: "index.html" },
  { id: "nextjs", name: "Next.js app", description: "Full-stack React with the App Router and an API route.", stack: "Next.js · React · TypeScript", instantPreview: false, recommendedFor: ["SAAS", "WEB_APP", "ECOMMERCE"], files: nextjsApp },
  { id: "vite-react", name: "Vite + React + TypeScript", description: "Single-page app with Vite, TypeScript and Vitest.", stack: "Vite · React · TypeScript", instantPreview: false, recommendedFor: ["WEB_APP", "DESKTOP_APP"], files: viteReact },
  { id: "node-api", name: "Node.js API", description: "Dependency-free HTTP API with tests (node:test).", stack: "Node.js", instantPreview: false, recommendedFor: ["API", "AUTOMATION"], files: nodeApi },
  { id: "blank", name: "Blank project", description: "Start from an empty project and let FIZZ DEV set it up.", stack: "Any", instantPreview: false, recommendedFor: ["OTHER", "AUTOMATION", "DESKTOP_APP", "MOBILE_APP"], files: { "README.md": "# {{name}}\n\n{{description}}\n" } },
];

export function getTemplate(id: string) {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

function clean(value: string) {
  return value.replace(/[<>&"'`$\\{}]/g, "").trim();
}

export function renderTemplate(t: TemplateDef, vars: { name: string; description: string }) {
  const name = clean(vars.name) || "My project";
  const description = clean(vars.description) || "Built with FIZZ DEV.";
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";
  return Object.entries(t.files).map(([path, content]) => ({
    path,
    content: content.replaceAll("{{name}}", name).replaceAll("{{description}}", description).replaceAll("{{slug}}", slug),
  }));
}

export function publicTemplates() {
  return TEMPLATES.map(({ files: _files, ...rest }) => rest);
}
