// FIZZ DEV: turns this web project into a desktop app (Electron) in .fizz-build/.
// GitHub Actions builds it on Windows (.exe installer), macOS (.dmg) and Linux (.AppImage).
import { cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config, copyWebFiles, findIcon, sh } from "./web-files.mjs";

const cfg = config();
const out = ".fizz-build";
copyWebFiles(join(out, "app"));
const icon = findIcon();
if (icon) cpSync(icon, join(out, "icon.png"));

const pkgName = cfg.appId.split(".").pop().toLowerCase().replace(/[^a-z0-9-]/g, "-") || "fizz-app";
writeFileSync(join(out, "package.json"), JSON.stringify({
  name: pkgName, desktopName: `${pkgName}.desktop`,
  productName: cfg.name, version: cfg.version, description: cfg.name, author: cfg.author || "FIZZ DEV", main: "main.js", private: true,
  devDependencies: { electron: "44.5.0", "electron-builder": "26.17.0" },
  build: {
    appId: cfg.appId, productName: cfg.name, directories: { output: "dist" }, files: ["main.js", "app/**/*"],
    publish: [], // no auto-update server (electron-builder fails without this)
    ...(icon ? { icon: "icon.png" } : {}),
    win: { target: "nsis" }, nsis: { oneClick: false, allowToChangeInstallationDirectory: true },
    mac: { target: [{ target: "dmg", arch: ["universal"] }], identity: null, category: "public.app-category.productivity" },
    linux: { target: "AppImage", category: "Utility", syncDesktopName: true },
  },
}, null, 2));

// The app's pages are served from app://local/ (not file://), so modules, fetch() and relative links work.
writeFileSync(join(out, "main.js"), `const { app, BrowserWindow, net, protocol, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const ROOT = path.join(__dirname, "app");
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
function createWindow() {
  const win = new BrowserWindow({ width: 1200, height: 800, title: ${JSON.stringify(cfg.name)}, autoHideMenuBar: true, backgroundColor: ${JSON.stringify(cfg.background || "#ffffff")}, webPreferences: { contextIsolation: true, sandbox: true } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.loadURL("app://local/index.html");
}
app.whenReady().then(() => {
  protocol.handle("app", (req) => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
`);
sh("npm install --no-audit --no-fund", out);
console.log(`Desktop project ready: ${cfg.name} ${cfg.version}`);
