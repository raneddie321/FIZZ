// Copies the Monaco editor runtime into public/ so the editor is served from
// our own origin instead of a third-party CDN.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "monaco-editor", "min", "vs");
const target = join(root, "public", "monaco", "vs");

if (!existsSync(source)) {
  console.warn("[copy-monaco] monaco-editor is not installed yet; skipping.");
  process.exit(0);
}
mkdirSync(dirname(target), { recursive: true });
cpSync(source, target, { recursive: true });
console.log("[copy-monaco] Monaco runtime copied to public/monaco/vs");
