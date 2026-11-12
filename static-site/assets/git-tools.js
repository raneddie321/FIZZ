/* Fizz Code's Git workflow on GitHub, like a developer's:
     <fizz-git action="status"/>                                   the linked repository, branch and its open pull request
     <fizz-git action="branch" name="fizz/fix-login" from="main"/>  work on a new branch (made on the first commit)
     <fizz-git action="commit" message="Fix the login redirect"/>   commit the project's files to that branch (deleted files too)
     <fizz-git action="pr" title="…" base="main">description</fizz-git>   open a pull request from the branch
     <fizz-git action="pr-status" number="12"/>                    checks (with the end of each failing log), reviews, comments
     <fizz-git action="reply" number="12" comment="345">text</fizz-git>   answer a review comment (or the PR, without comment)
     <fizz-git action="rerun" run="987"/>                          re-run a workflow's failed jobs
     <fizz-git action="merge" number="12" method="squash"/>        merge (always asks)
   Committing and opening PRs go through the permission gate as git-push; replies and merges always ask. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const esc = F.esc;
  const gh = () => F.conn.github;
  const validBranch = (s) => /^[A-Za-z0-9._/-]{1,200}$/.test(s || "") && !String(s).includes("..") && !/^[/.]|[/.]$/.test(s);
  const linked = (ctx) => ctx.project().git;
  const need = (ctx) => (linked(ctx) ? null : { ok: false, text: "This project isn't linked to a GitHub repository yet. Ask the user to push it once (GitHub → Push to a repository), or to import one; then you can branch, commit and open pull requests." });

  function fmtPr(d) {
    const pr = d.pr;
    const lines = [`PR #${pr.number} “${pr.title}” — ${pr.state}${pr.draft ? " (draft)" : ""}, ${pr.head} → ${pr.base}, ${pr.url}`];
    if (d.mergeableState) lines.push(`Mergeable: ${d.mergeable === false ? "no (conflicts)" : d.mergeableState}`);
    const by = (k) => d.checks.filter((c) => (k === "pending" ? c.status !== "completed" : c.conclusion === k));
    lines.push(`Checks: ${d.checks.length ? `${by("success").length} passed, ${d.checks.filter((c) => ["failure", "timed_out", "cancelled", "action_required"].includes(c.conclusion)).length} failed, ${by("pending").length} running` : "none"}`);
    for (const c of d.checks.filter((x) => x.conclusion && x.conclusion !== "success" && x.conclusion !== "skipped" && x.conclusion !== "neutral")) {
      lines.push(`\n✗ ${c.name} — ${c.conclusion}${c.summary ? `\n  ${c.summary.replace(/\n/g, "\n  ")}` : ""}${c.log ? `\n  End of the log:\n${c.log.split("\n").slice(-60).map((l) => `    ${l}`).join("\n")}` : ""}`);
    }
    for (const r of d.reviews) if (r.body || r.state !== "COMMENTED") lines.push(`\nReview by ${r.user}: ${r.state}${r.body ? `\n  ${r.body.replace(/\n/g, "\n  ")}` : ""}`);
    for (const c of d.comments) lines.push(`\nReview comment ${c.id}${c.replyTo ? ` (reply to ${c.replyTo})` : ""} by ${c.user} on ${c.path}${c.line ? `:${c.line}` : ""}:\n  ${c.body.replace(/\n/g, "\n  ")}`);
    for (const c of d.discussion.slice(-10)) lines.push(`\nComment by ${c.user}:\n  ${c.body.replace(/\n/g, "\n  ")}`);
    return lines.join("\n");
  }

  F.agentTools.register("git", {
    icon: "branch", feedback: true,
    label: (t) => ({ status: "Checked the repository", branch: `Branch ${t.attrs.name || ""}`, commit: `Committed: ${t.attrs.message || ""}`, pr: `Opened a pull request: ${t.attrs.title || ""}`, "pr-status": `Checked PR #${t.attrs.number || ""}`, reply: `Replied on PR #${t.attrs.number || ""}`, rerun: "Re-ran failed jobs", merge: `Merge PR #${t.attrs.number || ""}` })[t.attrs.action] || "GitHub",
    summary: (k) => `${k} GitHub step${k === 1 ? "" : "s"}`,
    prompt: [
      '<fizz-git action="…"/> works with the project\'s GitHub repository the way a developer does. Actions:',
      '  status — the linked repository, current branch and its open pull request;',
      '  branch name="fizz/short-topic" from="main" — work on a new branch (do this before committing a feature or fix; never commit straight to main unless the user asked);',
      '  commit message="Why this change" — commit the project\'s current files (and deletions) to the branch;',
      '  pr title="…" base="main" with the description as the tag\'s body (what, why, how it was tested);',
      '  pr-status number="12" — the checks with the end of each failing log, reviews and review comments. When a check fails: find the cause in the log, fix it, commit, and check again (at most 3 rounds; never disable or skip a test to get green);',
      '  reply number="12" comment="345" with the text as the body — answer a review comment (without comment="…", a comment on the PR);',
      '  rerun run="987" — re-run failed jobs once, only for a failure that isn\'t caused by the code;',
      '  merge number="12" — only when the user asked for it.',
    ].join("\n"),
    available: () => Boolean(F.serverStatusCached?.()?.connections?.github?.connected),
    unavailable: "GitHub isn't connected, so <fizz-git> isn't available. If the user wants branches, commits or pull requests, ask them to connect GitHub (Settings → Connections).",
    perm: (t, ctx) => {
      const a = t.attrs.action, g = ctx.project().git;
      if (a === "status" || a === "pr-status") return { kind: "network", target: `github ${a}`, readOnly: true };
      if (a === "reply" || a === "merge" || a === "rerun") return { kind: "git-push", target: `${a} #${t.attrs.number || t.attrs.run || ""}`, outbound: true };
      if (a === "pr") return { kind: "git-push", target: `pr ${g?.branch || ""} → ${t.attrs.base || g?.base || "main"}` };
      return { kind: "git-push", target: a === "branch" ? t.attrs.name || "" : g?.branch || "" };
    },
    async run(t, ctx) {
      const a = t.attrs.action;
      const p = ctx.project();
      try {
        if (a === "status") {
          if (!p.git) return { ok: true, text: "No GitHub repository is linked to this project." };
          const prs = await gh().prs(p.git.owner, p.git.repo, { head: p.git.branch }).catch(() => ({ prs: [] }));
          return { ok: true, text: `Repository ${p.git.owner}/${p.git.repo}, branch ${p.git.branch}${p.git.base ? ` (from ${p.git.base}, not committed yet)` : ""}${p.git.lastSha ? `, last commit ${p.git.lastSha.slice(0, 7)}` : ""}.\n${prs.prs.length ? prs.prs.map((x) => `Open PR #${x.number} “${x.title}” → ${x.base}: ${x.url}`).join("\n") : "No open pull request for this branch."}` };
        }
        const missing = need(ctx);
        if (missing) return missing;
        if (a === "branch") {
          const name = String(t.attrs.name || "").trim();
          if (!validBranch(name)) return { ok: false, text: `“${name}” isn't a valid branch name. Use letters, numbers, - _ . and /, e.g. fizz/fix-login.` };
          const from = validBranch(t.attrs.from) ? t.attrs.from : p.git.base && !p.git.lastSha ? p.git.base : p.git.branch;
          p.git = { ...p.git, branch: name, base: from, lastSha: null, pushed: p.git.pushed || [] };
          ctx.save();
          return { ok: true, text: `Now on branch ${name} (from ${from}). It's created on GitHub with the first commit.` };
        }
        if (a === "commit") {
          const message = String(t.attrs.message || t.body || "").trim().slice(0, 500);
          if (!message) return { ok: false, text: "A commit needs a message: message=\"what and why\"." };
          const h = await ctx.hooks?.("beforePush");
          if (h?.blocked) return { ok: false, text: `A beforePush hook failed, so nothing was committed:\n${F.hooks.format("beforePush", h)}` };
          const files = await ctx.filesForUpload();
          const deleted = (p.git.pushed || []).filter((f) => files[f] === undefined);
          const r = await gh().pushTo({ owner: p.git.owner, repo: p.git.repo, branch: p.git.branch, from: p.git.base || undefined, message, files, deleted });
          p.git = { ...p.git, lastSha: r.sha, at: Date.now(), pushed: Object.keys(files), base: p.git.base };
          ctx.save();
          return { ok: true, text: `Committed ${r.files} file${r.files === 1 ? "" : "s"}${deleted.length ? ` and ${deleted.length} deletion${deleted.length === 1 ? "" : "s"}` : ""} to ${p.git.owner}/${p.git.repo}@${p.git.branch}: ${r.url}`, html: `<div class="web-read"><a href="${esc(r.url)}" target="_blank" rel="noopener">Commit ${esc(r.sha.slice(0, 7))} on ${esc(p.git.branch)}</a></div>` };
        }
        if (a === "pr") {
          const base = validBranch(t.attrs.base) ? t.attrs.base : p.git.base || "main";
          if (!p.git.lastSha) return { ok: false, text: "Commit to the branch first, then open the pull request." };
          const existing = (await gh().prs(p.git.owner, p.git.repo, { head: p.git.branch }).catch(() => ({ prs: [] }))).prs[0];
          if (existing) return { ok: true, text: `There's already an open PR for ${p.git.branch}: #${existing.number} ${existing.url}. New commits on the branch update it.` };
          const r = await gh().prCreate({ owner: p.git.owner, repo: p.git.repo, head: p.git.branch, base, title: t.attrs.title || "Changes from FIZZ DEV", body: `${t.body || ""}\n\n— Opened by Fizz Code in FIZZ DEV`, draft: t.attrs.draft === "true" });
          p.git = { ...p.git, pr: r.pr.number };
          ctx.save();
          return { ok: true, text: `Opened PR #${r.pr.number}: ${r.pr.url}. Check it with <fizz-git action="pr-status" number="${r.pr.number}"/> once CI has had a minute.`, html: `<div class="web-read"><a href="${esc(r.pr.url)}" target="_blank" rel="noopener">Pull request #${r.pr.number}: ${esc(r.pr.title)}</a></div>` };
        }
        if (a === "pr-status") {
          const n = t.attrs.number || p.git.pr;
          if (!n) return { ok: false, text: "Which pull request? number=\"…\"" };
          return { ok: true, text: fmtPr(await gh().pr(p.git.owner, p.git.repo, n)) };
        }
        if (a === "reply") {
          const n = t.attrs.number || p.git.pr;
          const r = await gh().prReply({ owner: p.git.owner, repo: p.git.repo, number: n, commentId: t.attrs.comment || undefined, body: `${t.body}\n\n— Fizz Code (FIZZ DEV)` });
          return { ok: true, text: `Replied: ${r.url}` };
        }
        if (a === "rerun") { await gh().rerun(p.git.owner, p.git.repo, t.attrs.run); return { ok: true, text: "Re-running the failed jobs. Check again in a minute or two." }; }
        if (a === "merge") {
          const r = await gh().merge(p.git.owner, p.git.repo, t.attrs.number || p.git.pr, t.attrs.method);
          return { ok: Boolean(r.merged), text: r.merged ? `Merged (${r.sha?.slice(0, 7)}).` : `Not merged: ${r.message}` };
        }
        return { ok: false, text: `Unknown action “${a}”. Use status, branch, commit, pr, pr-status, reply, rerun or merge.` };
      } catch (e) {
        const scope = /workflow|scope|permission|Resource not accessible/i.test(e.message || "") ? " The GitHub connection may be missing a permission: ask the user to connect GitHub again (it needs repo and workflow)." : "";
        return { ok: false, text: `GitHub: ${e.message}${scope}` };
      }
    },
  });
})();
