import { extname, basename } from "./paths";

const MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json", jsonc: "json", html: "html", htm: "html", css: "css", scss: "scss", less: "less",
  md: "markdown", markdown: "markdown", py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
  kt: "kotlin", swift: "swift", c: "c", h: "c", cpp: "cpp", hpp: "cpp", cs: "csharp", php: "php",
  sh: "shell", bash: "shell", zsh: "shell", yml: "yaml", yaml: "yaml", toml: "ini", ini: "ini", env: "ini",
  sql: "sql", xml: "xml", svg: "xml", graphql: "graphql", gql: "graphql", vue: "html", svelte: "html",
  dockerfile: "dockerfile", lua: "lua", r: "r", dart: "dart",
};

export function languageForPath(path: string): string {
  const name = basename(path).toLowerCase();
  if (name === "dockerfile") return "dockerfile";
  if (name === "makefile") return "makefile";
  return MAP[extname(path)] ?? "plaintext";
}

export const PREVIEWABLE = new Set(["html", "htm"]);
export const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "avif"]);

export function mimeForPath(path: string): string {
  const ext = extname(path);
  const types: Record<string, string> = {
    html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css; charset=utf-8",
    js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", jsx: "text/javascript; charset=utf-8",
    json: "application/json; charset=utf-8", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", ico: "image/x-icon", avif: "image/avif", txt: "text/plain; charset=utf-8",
    md: "text/plain; charset=utf-8", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm", wasm: "application/wasm",
    xml: "application/xml; charset=utf-8", map: "application/json; charset=utf-8",
  };
  return types[ext] ?? "text/plain; charset=utf-8";
}
