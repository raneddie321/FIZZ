// FIZZ DEV: turns this web project into an Android project (Capacitor) in .fizz-build/.
// GitHub Actions then builds it with Gradle into an APK and an AAB.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config, copyWebFiles, findIcon, sh } from "./web-files.mjs";

const CAPACITOR = "8.5.2";
const cfg = config();
const out = ".fizz-build";
copyWebFiles(join(out, "www"));

writeFileSync(join(out, "package.json"), JSON.stringify({
  name: "fizz-android-app", private: true, version: cfg.version,
  dependencies: { "@capacitor/core": CAPACITOR, "@capacitor/android": CAPACITOR },
  devDependencies: { "@capacitor/cli": CAPACITOR },
}, null, 2));
writeFileSync(join(out, "capacitor.config.json"), JSON.stringify({ appId: cfg.appId, appName: cfg.name, webDir: "www" }, null, 2));
sh("npm install --no-audit --no-fund", out);
sh("npx cap add android", out);

// Version: versionName from the app settings, versionCode goes up by one with every build.
const versionCode = Number(cfg.versionCode) || Number(process.env.GITHUB_RUN_NUMBER) || 1;
for (const f of ["android/app/build.gradle", "android/app/build.gradle.kts"]) {
  const path = join(out, f);
  if (!existsSync(path)) continue;
  const g = readFileSync(path, "utf8")
    .replace(/versionCode(\s*=?\s*)\d+/, `versionCode$1${versionCode}`)
    .replace(/versionName(\s*=?\s*)"[^"]*"/, `versionName$1"${cfg.version}"`);
  writeFileSync(path, g);
}

const icon = findIcon();
if (icon) {
  mkdirSync(join(out, "assets"), { recursive: true });
  cpSync(icon, join(out, "assets", "icon.png"));
  try {
    sh(`npx --yes @capacitor/assets@3.0.5 generate --android --iconBackgroundColor "${cfg.background || "#ffffff"}" --splashBackgroundColor "${cfg.background || "#ffffff"}"`, out);
  } catch {
    console.log("Couldn't make the Android icons from " + icon + "; the app keeps the default icon.");
  }
}
sh("npx cap sync android", out);
console.log(`Android project ready: ${cfg.name} (${cfg.appId}) ${cfg.version} (${versionCode})`);
