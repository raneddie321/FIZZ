// FIZZ DEV app builds: collects the project's web files (its build output when it has an
// `npm run build` script, otherwise the project itself) into a folder for Capacitor or Electron.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

export const sh = (cmd, cwd = ".") => execSync(cmd, { cwd, stdio: "inherit", env: process.env });
export const config = () => JSON.parse(readFileSync(".fizz/app.json", "utf8"));

const SKIP = new Set([".git", ".github", ".fizz", ".fizz-build", ".fizz-out", "node_modules", "package.json", "package-lock.json", "README.md", "FIZZ.md"]);

export function copyWebFiles(dest) {
  let web = ".";
  const pkg = existsSync("package.json") ? JSON.parse(readFileSync("package.json", "utf8")) : null;
  if (pkg?.scripts?.build) {
    sh(existsSync("package-lock.json") ? "npm ci" : "npm install --no-audit --no-fund");
    sh("npm run build");
    web = ["dist", "build", "out", "www", "public"].find((d) => existsSync(join(d, "index.html")));
    if (!web) throw new Error("`npm run build` didn't make an index.html in dist/, build/, out/, www/ or public/.");
  }
  if (!existsSync(join(web, "index.html"))) throw new Error("The app needs an index.html (the first screen).");
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(web)) {
    if (web === "." && SKIP.has(entry)) continue;
    if (entry === "node_modules") continue;
    cpSync(join(web, entry), join(dest, entry), { recursive: true });
  }
  console.log(`Web files from ${web === "." ? "the project" : web + "/"} → ${dest}`);
}

/** The project's app icon, if it has one (FIZZ DEV's "Make app icons" writes icons/icon-512.png). */
export const findIcon = () => ["icons/icon-512.png", "icon.png", "logo.png", "assets/icon.png", "icons/icon-192.png"].find((f) => existsSync(f)) || null;
