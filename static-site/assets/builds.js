/* FIZZ DEV app builds: Android (APK + AAB) and desktop (Windows / macOS / Linux) apps, built by GitHub Actions
   in the user's own repository. Fizz Code adds the build files to the project (.github/workflows and .fizz/),
   pushes with [fizz-android] or [fizz-desktop] in the commit message, and this module follows the run and
   offers the downloads. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const esc = F.esc;
  const TARGETS = {
    android: { label: "Android app", workflow: "fizz-android.yml", tag: "[fizz-android]", scripts: ["web-files.mjs", "android.mjs", "android-signing.sh"], minutes: "6–10" },
    desktop: { label: "desktop app", workflow: "fizz-desktop.yml", tag: "[fizz-desktop]", scripts: ["web-files.mjs", "desktop.mjs"], minutes: "8–15" },
  };
  let host = null; // { data, save, rerender }
  const builds = () => (host ? (host.data.builds ||= []) : []);
  const find = (id) => builds().find((b) => b.id === id);

  const cache = {};
  async function template(name) {
    if (!cache[name]) {
      const res = await fetch(`assets/app-builds/${name}`, { cache: "no-cache" });
      if (!res.ok) throw new Error(`Couldn't load the build template ${name}.`);
      cache[name] = await res.text();
    }
    return cache[name];
  }

  const slug = (s) => String(s || "app").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "").replace(/^\d+/, "").slice(0, 30) || "app";
  /** The app settings in .fizz/app.json, filled in from the tool's attributes and the project. */
  function appConfig(project, attrs) {
    let cfg = {};
    try { cfg = JSON.parse(project.files[".fizz/app.json"] || "{}"); } catch {}
    const name = attrs.name || cfg.name || project.name || "My App";
    let appId = attrs.id || cfg.appId || `com.fizzdev.${slug(name)}`;
    if (!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(appId)) appId = `com.fizzdev.${slug(name)}`;
    const version = /^\d+(\.\d+){0,2}$/.test(attrs.version || "") ? attrs.version : cfg.version || "1.0.0";
    return { ...cfg, name, appId, version, background: attrs.background || cfg.background || "#ffffff" };
  }

  /** Adds the build files, pushes, and starts following the run. */
  async function start(target, attrs, ctx) {
    const T = TARGETS[target];
    if (!T) return { ok: false, text: `Unknown build target "${target}". Use target="android" or target="desktop".` };
    const p = ctx.project();
    const st = await F.conn.status();
    if (!st.connections?.github?.configured) return { ok: false, text: "GitHub isn't set up on this FIZZ site, so apps can't be built yet. Tell the user the site owner needs to add GitHub (see the README)." };
    if (!st.connections.github.connected) {
      await ctx.needConnection("github", "GitHub");
      return { ok: false, text: "The user needs to connect GitHub first (FIZZ asked them). Builds run on GitHub Actions in their repository. Ask them to tell you when it's connected." };
    }
    const hasIndex = Object.keys(p.files).some((f) => /(^|\/)index\.html$/.test(f)) || /"build"\s*:/.test(p.files["package.json"] || "");
    if (!hasIndex) return { ok: false, text: "The project needs an index.html (or a package.json with a build script) before it can become an app." };
    const cfg = appConfig(p, attrs);
    ctx.writeFile(".fizz/app.json", JSON.stringify(cfg, null, 2) + "\n", { source: "agent" });
    ctx.writeFile(`.github/workflows/${T.workflow}`, await template(T.workflow), { source: "agent" });
    for (const s of T.scripts) ctx.writeFile(`.fizz/build/${s}`, await template(s), { source: "agent" });
    let pushed;
    try { pushed = await ctx.githubPush(`Build ${cfg.name} ${cfg.version} (${T.label}) ${T.tag}`); } catch (e) { return { ok: false, text: `Couldn't push to GitHub: ${e.message}` }; }
    if (!pushed) return { ok: false, text: "The push to GitHub was cancelled, so the build didn't start." };
    const b = { id: F.uid(), target, name: cfg.name, version: cfg.version, owner: pushed.owner, repo: pushed.repo, branch: pushed.branch, sha: pushed.sha, workflow: T.workflow, projectId: p.id, status: "queued", startedAt: Date.now() };
    builds().unshift(b);
    builds().splice(30);
    host.save();
    follow(b);
    return {
      ok: true,
      data: { buildId: b.id },
      text: `The ${T.label} build started on GitHub Actions in ${b.owner}/${b.repo} (commit ${b.sha.slice(0, 7)}). It usually takes ${T.minutes} minutes. The user can follow it and download the files from the build card in this chat${target === "android" ? " (APK to install on a phone, AAB for Google Play)" : " (Windows .exe, macOS .dmg, Linux .AppImage)"}. You don't need to wait for it.`,
    };
  }

  const timers = {};
  /** Polls GitHub until the run finishes (up to 90 minutes). */
  function follow(b) {
    clearTimeout(timers[b.id]);
    const tick = async () => {
      if (b.status === "completed" || Date.now() - b.startedAt > 90 * 60_000) return;
      try {
        if (!b.runId) {
          const { runs } = await F.conn.github.runs(b.owner, b.repo, b.workflow);
          const run = runs.find((r) => r.sha === b.sha);
          if (run) Object.assign(b, { runId: run.id, url: run.url });
          else if (Date.now() - b.startedAt > 4 * 60_000) { b.status = "completed"; b.conclusion = "not_started"; }
        }
        if (b.runId) {
          const { runs } = await F.conn.github.runs(b.owner, b.repo, b.workflow);
          const run = runs.find((r) => r.id === b.runId);
          if (run) Object.assign(b, { status: run.status, conclusion: run.conclusion, url: run.url });
          if (b.status !== "completed") {
            const { jobs } = await F.conn.github.jobs(b.owner, b.repo, b.runId);
            b.jobs = jobs.map((j) => ({ id: j.id, name: j.name, status: j.status, conclusion: j.conclusion, step: (j.steps || []).find((s) => s.status === "in_progress")?.name || "" }));
          } else await finished(b);
        }
        b.error = "";
      } catch (e) { b.error = e.message; }
      host?.save();
      host?.rerender();
      if (b.status !== "completed") timers[b.id] = setTimeout(tick, document.hidden ? 30_000 : 12_000);
      else notify(b);
    };
    timers[b.id] = setTimeout(tick, b.runId ? 1000 : 8000);
  }

  async function finished(b) {
    const { jobs } = await F.conn.github.jobs(b.owner, b.repo, b.runId);
    b.jobs = jobs.map((j) => ({ id: j.id, name: j.name, status: j.status, conclusion: j.conclusion, failedStep: (j.steps || []).find((s) => s.conclusion === "failure")?.name || "" }));
    if (b.conclusion === "success") b.artifacts = (await F.conn.github.artifacts(b.owner, b.repo, b.runId)).artifacts;
  }

  function notify(b) {
    const ok = b.conclusion === "success";
    F.toast(ok ? `${b.name}: the ${TARGETS[b.target].label} is ready to download` : `${b.name}: the ${TARGETS[b.target].label} build ${b.conclusion === "not_started" ? "didn't start" : "failed"}`);
    try {
      if (document.hidden && "Notification" in window && Notification.permission === "granted") new Notification(ok ? "Your app is ready" : "The app build failed", { body: `${b.name} ${b.version}`, icon: "assets/mark-fizz-dev.png", tag: `fizz-build-${b.id}` });
    } catch {}
  }

  const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`; };
  const ARTIFACT_LABEL = { "android-app": "APK + AAB", "android-signing-key": "Signing key (keep it safe)", "desktop-Windows": "Windows (.exe)", "desktop-macOS": "macOS (.dmg)", "desktop-Linux": "Linux (.AppImage)" };

  /** The live build card shown under the build step in the chat. */
  function card(buildId) {
    const b = find(buildId);
    if (!b) return "";
    const T = TARGETS[b.target];
    const ok = b.conclusion === "success";
    const failed = b.status === "completed" && !ok;
    const state = b.status !== "completed" ? (b.runId ? "Building" : "Waiting for GitHub") : ok ? "Ready" : b.conclusion === "not_started" ? "Didn't start" : b.conclusion === "cancelled" ? "Cancelled" : "Failed";
    const running = (b.jobs || []).filter((j) => j.status !== "completed");
    const detail = b.status !== "completed"
      ? `${running.map((j) => `${esc(j.name)}${j.step ? ` · ${esc(j.step)}` : ""}`).join(" — ") || "Starting…"} · ${ago(b.startedAt)}`
      : failed
        ? b.conclusion === "not_started" ? "GitHub didn't start the workflow. Check that Actions are enabled for the repository." : (b.jobs || []).filter((j) => j.conclusion === "failure").map((j) => `${esc(j.name)} failed${j.failedStep ? ` at “${esc(j.failedStep)}”` : ""}`).join(" · ") || "The build failed."
        : `${b.name} ${b.version}`;
    const arts = ok ? (b.artifacts || []).filter((a) => !a.expired).map((a) => `<button type="button" class="btn btn-sm" data-build-dl="${esc(b.id)}:${a.id}">${F.icon("download")}${esc(ARTIFACT_LABEL[a.name] || a.name)} <small>${F.blobs.human(a.size)}</small></button>`).join("") : "";
    return `<div class="build-card ${ok ? "ok" : failed ? "fail" : "run"}">
      <div class="build-top"><span class="build-ic">${F.icon(b.target === "android" ? "phone" : "monitor")}</span><div class="build-txt"><b>${esc(T.label[0].toUpperCase() + T.label.slice(1))} — ${state}</b><span>${detail}</span></div>${b.status !== "completed" ? '<span class="st run"></span>' : ""}</div>
      ${b.error ? `<p class="muted-sm" style="color:var(--danger)">${esc(b.error)}</p>` : ""}
      <div class="build-actions">${arts}${failed && b.conclusion !== "not_started" ? `<button type="button" class="btn btn-sm" data-build-fix="${esc(b.id)}">Ask Fizz Code to fix it</button>` : ""}${b.url ? `<a class="btn btn-outline btn-sm" href="${esc(b.url)}" target="_blank" rel="noopener">View on GitHub</a>` : ""}</div>
      ${ok && b.target === "android" ? '<p class="muted-sm">The download is a ZIP. Install <b>app-debug.apk</b> on an Android phone; upload the <b>.aab</b> to Google Play.</p>' : ""}
    </div>`;
  }

  document.addEventListener("click", async (e) => {
    const dl = e.target.closest("[data-build-dl]");
    if (dl) {
      const [id, artifactId] = dl.dataset.buildDl.split(":");
      const b = find(id);
      if (!b) return;
      dl.disabled = true;
      try { const { url } = await F.conn.github.artifactUrl(b.owner, b.repo, artifactId); location.href = url; } catch (err) { F.toast(err.message); }
      dl.disabled = false;
      return;
    }
    const fix = e.target.closest("[data-build-fix]");
    if (fix && host?.send) {
      const b = find(fix.dataset.buildFix);
      const job = (b?.jobs || []).find((j) => j.conclusion === "failure");
      if (!b || !job) return;
      fix.disabled = true;
      let log = "";
      try { log = (await F.conn.github.log(b.owner, b.repo, job.id)).text; } catch (err) { log = `(Couldn't read the log: ${err.message})`; }
      host.send(`The ${TARGETS[b.target].label} build failed in "${job.name}"${job.failedStep ? ` at the step "${job.failedStep}"` : ""}. Here's the end of the log:\n\n\`\`\`\n${log.slice(-6000)}\n\`\`\`\n\nFix the project so the build passes, then build it again with <fizz-build target="${b.target}"/>.`);
    }
  });

  F.agentTools.register("build", {
    icon: "box", feedback: true,
    label: (t) => `Build ${t.attrs.target === "desktop" ? "a desktop app (Windows, macOS, Linux)" : "an Android app (APK + AAB)"}${t.attrs.name ? ` — ${t.attrs.name}` : ""}`,
    summary: (k) => `started ${k} app build${k === 1 ? "" : "s"}`,
    prompt: '<fizz-build target="android|desktop" name="App name" id="com.company.app" version="1.0.0"/> turns the project into a real app, built by GitHub Actions in the user\'s repository: Android → an APK (installs on phones) and an AAB (for Google Play), desktop → Windows .exe, macOS .dmg and Linux .AppImage. The project must have index.html (or package.json with a build script). Make it mobile-friendly first (viewport meta, touch-sized buttons), and make app icons if there are none (icons/icon-512.png). The user approves before it pushes; the build takes several minutes and the user downloads the files from the card in the chat.',
    needsApproval: () => true,
    available: () => Boolean(F.serverStatusCached?.()?.connections?.github?.configured),
    run: (t, ctx) => start(t.attrs.target === "desktop" ? "desktop" : "android", t.attrs, ctx),
    card: (t) => (t.result?.data?.buildId ? card(t.result.data.buildId) : ""),
  });

  F.builds = {
    TARGETS, start, card, appConfig,
    /** dev.js hands over its data on start; unfinished builds are followed again after a reload. */
    attach(h) { host = h; for (const b of builds()) if (b.status !== "completed" && Date.now() - b.startedAt < 90 * 60_000) follow(b); if (builds().length) h.rerender(); },
    list: () => builds(),
  };
})();
