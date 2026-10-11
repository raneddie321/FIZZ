#!/usr/bin/env python3
"""Generates the public pages of the static (Netlify Drop) build into static-site/."""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "static-site"

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>{title}</title>
<meta name="description" content="{desc}" />
<link rel="icon" href="icon.svg" />
<link rel="stylesheet" href="assets/site.css" />
<script>try{{var t=localStorage.getItem("fizz.theme");t=t?JSON.parse(t):"system";if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}}catch(e){{}}</script>
<script src="assets/core.js" defer></script>
<script src="assets/site.js" defer></script>
</head>
<body>
"""

def page(name, title, desc, body, chrome=True):
    html = HEAD.format(title=title, desc=desc)
    if chrome:
        html += '<header data-site></header>\n<main id="main">\n' + body + '\n</main>\n<footer data-site></footer>\n'
    else:
        html += body
    html += "</body>\n</html>\n"
    (OUT / name).write_text(html)

def features(items):
    return '<div class="feature-grid">' + "".join(
        f'<div class="feature"><span data-icon="{i}"></span><h3>{t}{f" <span class=badge>{tag}</span>" if tag else ""}</h3><p>{d}</p></div>'
        for i, t, d, tag in items) + "</div>"

# ---------------- home ----------------
page("index.html", "FIZZ — AI by RANEDDIE", "FIZZ is RANEDDIE's AI assistant. FIZZ DEV is the AI workspace for building software, websites and games.", f"""
<section class="section center" style="padding-bottom:30px">
  <span class="pill-note"><span data-icon="spark" style="color:var(--primary)"></span> From RANEDDIE</span>
  <h1 class="h1">Think it through with FIZZ.<br />Build it with FIZZ DEV.</h1>
  <p class="lead">A friendly AI assistant for everyday questions and writing, and a development workspace that plans, codes, designs and previews software with you. One RANEDDIE ID for both.</p>
  <div class="cta-row"><a class="btn btn-lg" href="signin.html#signup">Get started free <span data-icon="arrow"></span></a><a class="btn btn-lg btn-outline" href="product.html">See how it works</a></div>
  <div class="preview" aria-hidden="true"><div class="bar"><i></i><i></i><i></i></div><div class="body">
    <div class="col"><div class="sk" style="width:70%"></div><div class="sk" style="width:55%;margin-left:12px"></div><div class="sk" style="width:80%;margin-left:12px"></div><div class="sk" style="width:60%"></div><div class="sk" style="width:45%;margin-left:12px"></div></div>
    <div class="col"><div class="sk p" style="height:34px;width:75%;margin-left:auto;border-radius:12px;opacity:.6"></div><div class="sk" style="width:92%"></div><div class="sk" style="width:80%"></div><div class="sk" style="width:66%"></div><div class="sk-box"><div class="sk d" style="width:35%"></div><div class="sk" style="width:75%"></div></div></div>
    <div class="col" style="font-family:var(--mono)"><div class="sk" style="width:40%"></div><div class="sk p" style="width:65%;margin-left:10px"></div><div class="sk" style="width:55%;margin-left:20px"></div><div class="sk" style="width:80%"></div><div class="sk p" style="width:35%;margin-left:10px"></div><div class="sk" style="width:60%"></div><div class="sk" style="width:72%;margin-left:20px"></div></div>
  </div></div>
</section>
<section class="section" style="padding-top:40px">
  <div class="grid-2">
    <a class="product-card" href="fizz.html"><div style="display:flex;gap:12px;align-items:center"><span data-mark></span><div><b>FIZZ</b><div style="color:var(--muted);font-size:14px">The everyday AI assistant</div></div></div>
      <p style="margin:0;color:var(--muted)">Ask questions, write and edit, analyze documents and images, and brainstorm ideas in a fast, focused chat.</p>
      <ul><li>Streaming answers with Markdown and code</li><li>File and image understanding</li><li>Organized, searchable history</li></ul><span class="more">Learn more →</span></a>
    <a class="product-card dev" href="fizz-dev.html"><div style="display:flex;gap:12px;align-items:center"><span data-mark="dev"></span><div><b>FIZZ DEV</b><div style="color:var(--muted);font-size:14px">The AI development workspace</div></div></div>
      <p style="margin:0;color:var(--muted)">Describe what you want to build. FIZZ DEV writes the files, shows a live preview and lets you edit the code.</p>
      <ul><li>Projects with files and chats</li><li>Code editor and live preview on any device size</li><li>Download your project as a ZIP</li></ul><span class="more">Learn more →</span></a>
  </div>
</section>
<section class="section">
  <p class="eyebrow">Capabilities</p><h2 class="h2">Everything in one place, controlled from a single conversation</h2>
  <p class="lead">FIZZ keeps the tools you need close at hand, and never pretends to do something it didn't.</p>
  {features([
    ("chat", "Natural conversation", "Clear answers that stream as they're written, with the ability to stop, regenerate or edit your message.", ""),
    ("file", "Documents & images", "Attach text, code and images. FIZZ reads them and answers with the context you provide.", ""),
    ("pen", "Writing & editing", "Draft, rewrite, summarize and translate — with formatting that holds up when you paste it elsewhere.", ""),
    ("code", "Multi-file coding", "FIZZ DEV writes complete files into your project and you can edit every one of them.", ""),
    ("eye", "Live preview", "See websites and games run instantly at desktop, tablet and phone sizes.", ""),
    ("folder", "Projects that persist", "Websites, apps, games and dashboards are saved with their chats and files.", ""),
  ])}
</section>
<section class="section"><div class="grid-2" style="align-items:start">
  <div><p class="eyebrow">Trust & control</p><h2 class="h2">Powerful tools, with you in charge</h2><p class="lead">Your projects stay yours. Content from files and websites is treated as data — it can never change what FIZZ is allowed to do.</p></div>
  <ul class="trust" style="margin:0;padding:0">
    <li><span data-icon="shield" style="color:var(--primary)"></span><div><b>Honest by design</b><p>No invented answers, results or actions. When something isn't connected, FIZZ tells you.</p></div></li>
    <li><span data-icon="lock" style="color:var(--primary)"></span><div><b>Secure accounts</b><p>Passwords are never stored — only a salted PBKDF2 hash.</p></div></li>
    <li><span data-icon="devices" style="color:var(--primary)"></span><div><b>Works everywhere</b><p>Designed for phones, tablets and desktops, in light and dark themes.</p></div></li>
  </ul></div>
</section>
<section class="section" style="padding-bottom:40px"><div class="cta-box"><span data-mark></span><h2 class="h2" style="margin:0">Start with a question. Finish with a product.</h2><p style="color:var(--muted);margin:0">Create a free RANEDDIE ID to use FIZZ and FIZZ DEV.</p><a class="btn btn-lg" href="signin.html#signup">Create your RANEDDIE ID</a></div></section>
""")

# ---------------- product overview ----------------
rows = [("Best for", "Questions, writing, research, analysis", "Building websites, apps, games and dashboards"),
        ("Main surface", "Conversational chat", "Projects with chat, code editor and live preview"),
        ("Files", "Attach documents and images to a message", "A full project file list you can edit"),
        ("Control", "Stop, regenerate, edit messages", "Review, edit and download every file")]
page("product.html", "Product overview · FIZZ", "FIZZ and FIZZ DEV compared.", f"""
<section class="section"><p class="eyebrow">Product overview</p><h1 class="h2">Two experiences, one RANEDDIE ID</h1>
<p class="lead">FIZZ is a fast, friendly assistant for everyday work. FIZZ DEV is an AI development workspace. Switch between them any time without signing in again.</p>
<div class="table-wrap"><table class="compare"><thead><tr><th></th><th>FIZZ</th><th>FIZZ DEV</th></tr></thead><tbody>
{"".join(f"<tr><td style='color:var(--muted);font-weight:500'>{a}</td><td>{b}</td><td>{c}</td></tr>" for a,b,c in rows)}
</tbody></table></div>
<div class="cta-row"><a class="btn" href="fizz.html">Explore FIZZ</a><a class="btn btn-outline" href="fizz-dev.html">Explore FIZZ DEV</a></div></section>
""")

# ---------------- FIZZ ----------------
page("fizz.html", "FIZZ — AI assistant", "FIZZ, the everyday AI assistant by RANEDDIE.", f"""
<section class="section"><p class="eyebrow">FIZZ</p><h1 class="h2">An AI assistant that's simple, fast and genuinely helpful</h1>
<p class="lead">Ask anything, write better, understand documents and images, and keep every conversation organized.</p>
<div class="cta-row"><a class="btn btn-lg" href="signin.html?next=chat.html#signup">Try FIZZ</a><a class="btn btn-lg btn-outline" href="pricing.html">View plans</a></div>
{features([
  ("chat", "Natural conversations", "Responses stream in real time. Stop, regenerate, copy, or edit an earlier message and continue from there.", ""),
  ("pen", "Writing and editing", "Drafts, rewrites, tone changes, summaries and translations with clean formatting.", ""),
  ("brain", "Multi-step reasoning", "Works through complex questions step by step when a problem calls for it.", ""),
  ("code", "Programming help", "Explains code, finds bugs and writes snippets in clear code blocks.", ""),
  ("clip", "Attachments", "Drag and drop text files, code and images into the conversation.", ""),
  ("image", "Image understanding", "Describe, compare and extract information from the images you share.", ""),
  ("history", "Organized history", "Search, rename, archive and delete conversations. Titles are set automatically.", ""),
  ("bulb", "Custom instructions", "Tell FIZZ how you like answers — concise, detailed, or in your own style.", ""),
  ("keyboard", "Keyboard friendly", "Enter to send, Shift+Enter for a new line, Esc to stop — and a responsive mobile layout.", ""),
])}</section>
""")

# ---------------- FIZZ DEV ----------------
steps = ["Understands your request", "Writes the project files — HTML, CSS, JavaScript and more", "Saves them to your project automatically", "Shows a live preview at desktop, tablet and phone sizes", "Lets you edit any file in the code editor", "Packages the project as a ZIP, ready to deploy"]
page("fizz-dev.html", "FIZZ DEV — AI development workspace", "Describe it. FIZZ DEV builds it.", f"""
<section class="section" style="--primary:var(--dev)"><p class="eyebrow">FIZZ DEV</p><h1 class="h2">Describe it. FIZZ DEV builds it — with you in control.</h1>
<p class="lead">An AI-powered workspace that combines a coding assistant, a code editor and a live preview, organized into projects.</p>
<div class="cta-row"><a class="btn btn-lg" href="signin.html?next=dev.html#signup">Start a project</a><a class="btn btn-lg btn-outline" href="dev.html">Open FIZZ DEV</a></div>
<div class="panel-box grid-2" style="margin-top:48px"><div><h3 style="margin-top:0">From idea to working project</h3><p style="color:var(--muted)">Ask for something like “a landing page for my bakery with a menu and contact form” or “a bubble-popping game”. Fizz Code writes complete files you can see, run and change.</p></div>
<ol class="steps">{"".join(f"<li><span>{i+1}</span>{s}</li>" for i,s in enumerate(steps))}</ol></div>
{features([
  ("bot", "Fizz Code", "An AI coding assistant that writes complete, working files into your project.", ""),
  ("folder", "Projects", "Keep each website, app or game in its own colored project with its chats and files.", ""),
  ("code", "Code editor", "Edit any file with line numbers and autosave.", ""),
  ("eye", "Live preview", "Run your project instantly at desktop, tablet and phone sizes, or open it in a new tab.", ""),
  ("devices", "Built for every screen", "The workspace adapts to phones, tablets and large monitors.", ""),
  ("terminal", "Download & deploy", "Export any project as a ZIP and publish it anywhere — including Netlify Drop.", ""),
])}</section>
""")

# ---------------- pricing ----------------
plans = [("Free", "Try FIZZ and FIZZ DEV.", "Free", False, ["FIZZ chat", "FIZZ DEV projects", "Live preview & ZIP export"]),
         ("Plus", "More usage for everyday work.", None, False, ["Everything in Free", "Higher usage limits", "Faster models"]),
         ("Pro", "For builders who ship every day.", None, True, ["Everything in Plus", "Most capable models", "Priority access to new features"]),
         ("Team", "Shared workspace for teams.", None, False, ["Everything in Pro", "Team seats", "Centralized billing"])]
def plan_html(n, d, price, featured, items):
    price_html = '<div class="price">Free</div>' if price else '<div class="price soon">Pricing to be announced</div>'
    btn = '<a class="btn btn-block" href="signin.html#signup">Get started</a>' if price else '<a class="btn btn-outline btn-block" href="contact.html">Join the waitlist</a>'
    return f'<div class="plan{" featured" if featured else ""}"><h3>{n}{" <span class=\"badge badge-primary\">Popular</span>" if featured else ""}</h3><p class="desc">{d}</p>{price_html}{btn}<ul>{"".join(f"<li>{i}</li>" for i in items)}</ul></div>'
page("pricing.html", "Pricing · FIZZ", "FIZZ plans.", f"""
<section class="section center" style="padding-bottom:0"><p class="eyebrow">Pricing</p><h1 class="h2">Plans for every stage</h1><p class="lead">Start free. Paid plans with higher limits and team features are coming soon.</p></section>
<section class="section" style="padding-top:0"><div class="plans">{"".join(plan_html(*p) for p in plans)}</div>
<p class="fine">Plan names and features are provisional and may change before general availability.</p></section>
""")

# ---------------- FAQ ----------------
faq = [("What is the difference between FIZZ and FIZZ DEV?", "FIZZ is a general AI assistant for conversation, writing, analysis and research. FIZZ DEV is a workspace where Fizz Code writes, edits and previews software projects with you."),
       ("What is a RANEDDIE ID?", "RANEDDIE ID is the account you use across RANEDDIE products. Sign in once and move between FIZZ and FIZZ DEV without signing in again."),
       ("Where are my account and projects stored?", "In this version, your account, chats and projects are stored securely in your browser on this device. Use Settings → Export my data to keep a copy."),
       ("Why do I need to add an API key?", "FIZZ connects to an AI model provider (Anthropic). Add your API key in Settings to start chatting. It's stored only in your browser and sent only to the provider."),
       ("Can I use FIZZ on my phone or tablet?", "Yes. FIZZ and FIZZ DEV are designed for phones, tablets and desktops."),
       ("Can files or websites trick FIZZ?", "Content from files and websites is treated as untrusted data. It can't change FIZZ's rules or make it take actions on its own."),
       ("Can I export or delete my data?", "Yes. Settings lets you download an export of your data or permanently delete your account.")]
page("faq.html", "FAQ · FIZZ", "Frequently asked questions.", f"""
<section class="section" style="max-width:860px"><p class="eyebrow">FAQ</p><h1 class="h2">Frequently asked questions</h1>
<div class="faq">{"".join(f"<details><summary>{q}</summary><p>{a}</p></details>" for q,a in faq)}</div></section>
""")

# ---------------- contact ----------------
page("contact.html", "Contact support · FIZZ", "Contact the RANEDDIE support team.", """
<section class="section"><div class="grid-2" style="align-items:start">
<div><p class="eyebrow">Support</p><h1 class="h2">How can we help?</h1><p class="lead">Send us a message and the RANEDDIE support team will get back to you by email.</p></div>
<div><div id="contact-status" class="hidden"></div>
<form id="contact-form" name="contact" method="POST" data-netlify="true" netlify-honeypot="company" class="form panel-box">
  <input type="hidden" name="form-name" value="contact" />
  <p class="hidden"><label>Leave empty <input name="company" /></label></p>
  <div class="grid-2" style="gap:16px">
    <label class="field"><span>Name</span><input class="input" name="name" required maxlength="80" autocomplete="name" /></label>
    <label class="field"><span>Email</span><input class="input" name="email" type="email" required maxlength="254" autocomplete="email" /></label>
  </div>
  <label class="field"><span>Topic</span><select class="select" name="topic"><option>General question</option><option>Account & RANEDDIE ID</option><option>Billing</option><option>Technical problem</option><option>Report abuse</option></select></label>
  <label class="field"><span>Subject</span><input class="input" name="subject" required maxlength="140" /></label>
  <label class="field"><span>Message</span><textarea class="textarea" name="message" required minlength="10" maxlength="5000" rows="6"></textarea></label>
  <div><button class="btn" type="submit">Send message</button></div>
</form></div></div></section>
""")

# ---------------- legal ----------------
def legal(name, title, sections):
    page(name, f"{title} · FIZZ", title, f"""
<article class="legal"><h1 class="h2">{title}</h1><p>Last updated: to be determined</p>
<div class="alert alert-warning"><div><strong>Placeholder document</strong><p>This page has not been reviewed by legal counsel. RANEDDIE will replace it with final terms before public launch.</p></div></div>
{"".join(f"<h2>{h}</h2><p>{t}</p>" for h,t in sections)}</article>""")
legal("terms.html", "Terms of Service", [
  ("1. Agreement", "These terms govern your use of FIZZ, FIZZ DEV and related services provided by RANEDDIE."),
  ("2. Accounts", "You need a RANEDDIE ID. You are responsible for activity on your account and for keeping your password and API keys secure."),
  ("3. Acceptable use", "Don't use FIZZ to break the law, harm others, or abuse AI systems or third-party services."),
  ("4. AI output", "AI-generated content can be inaccurate. Review it before relying on it."),
  ("5. Your content", "You keep ownership of the projects and content you create with FIZZ DEV."),
  ("6. Changes", "RANEDDIE may update these terms. Placeholder for termination, liability and governing law.")])
legal("privacy.html", "Privacy Policy", [
  ("1. Information stored", "In this version, your account, chats, projects and settings are stored in your browser's local storage on your device."),
  ("2. AI requests", "When you send a message, its content and any attachments are sent directly from your browser to the AI provider (Anthropic) using your API key."),
  ("3. Support messages", "Messages sent through the contact form are delivered to RANEDDIE's support team."),
  ("4. Your rights", "You can export your data or delete your account at any time from Settings."),
  ("5. Contact", "Placeholder for RANEDDIE's privacy contact details.")])

# ---------------- auth ----------------
pw = lambda name, ac, extra="": f'<div class="pw-wrap"><input class="input" name="{name}" type="password" autocomplete="{ac}" required {extra} /><button type="button" class="pw-toggle" aria-label="Show password">Show</button></div>'
page("signin.html", "Sign in · FIZZ", "Sign in with your RANEDDIE ID.", f"""
<div class="auth-page"><main class="auth-main" id="auth-root"><div class="auth-card">
<a class="auth-brand" href="index.html"><span data-mark></span><b>RANEDDIE ID</b></a>
<div id="v-signin">
  <h1>Sign in</h1><p class="sub">Use your RANEDDIE ID to continue to FIZZ</p>
  <form class="form" novalidate>
    <p class="err" data-err="form" role="alert" style="color:var(--danger);margin:0;font-size:14px"></p>
    <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required /></label>
    <label class="field"><span>Password</span>{pw("password", "current-password")}</label>
    <div style="display:flex;justify-content:space-between;align-items:center"><label class="check"><input type="checkbox" name="remember" checked /> Keep me signed in</label><a class="link" href="#reset">Forgot password?</a></div>
    <button class="btn btn-lg btn-block" type="submit">Sign in</button>
  </form>
  <p class="auth-foot">New to RANEDDIE? <a href="#signup">Create an account</a></p>
</div>
<div id="v-signup" class="hidden">
  <h1>Create your RANEDDIE ID</h1><p class="sub">One account for FIZZ, FIZZ DEV and other RANEDDIE products</p>
  <form class="form" novalidate>
    <label class="field"><span>Name</span><input class="input" name="name" autocomplete="name" required maxlength="80" /><span class="err" data-err="name"></span></label>
    <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required /><span class="err" data-err="email"></span></label>
    <label class="field"><span>Password</span>{pw("password", "new-password", 'minlength="8"')}<small>At least 8 characters, with letters and numbers.</small><span class="err" data-err="password"></span></label>
    <label class="field"><span>Confirm password</span>{pw("confirm", "new-password")}<span class="err" data-err="confirm"></span></label>
    <label class="check"><input type="checkbox" name="terms" /> <span>I agree to the <a href="terms.html" target="_blank">Terms of Service</a> and <a href="privacy.html" target="_blank">Privacy Policy</a>.</span></label>
    <span class="err" data-err="terms"></span>
    <button class="btn btn-lg btn-block" type="submit">Create account</button>
  </form>
  <p class="auth-foot">Already have an account? <a href="#signin">Sign in</a></p>
</div>
<div id="v-reset" class="hidden">
  <h1>Reset your account</h1><p class="sub">Accounts are stored securely in this browser, so passwords can't be recovered by email. You can remove the account on this device and create it again.</p>
  <form class="form" novalidate>
    <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required /><span class="err" data-err="email"></span></label>
    <label class="check"><input type="checkbox" name="confirm" /> I understand this deletes the account's chats and projects on this device.</label>
    <span class="err" data-err="form"></span>
    <button class="btn btn-lg btn-block btn-danger" type="submit">Remove account</button>
  </form>
  <p class="auth-foot"><a href="#signin">Back to sign in</a></p>
</div>
<p style="margin:24px 0 0;font-size:12.5px;color:var(--muted);text-align:center">Your account is saved securely in this browser.</p>
</div></main>
<div class="auth-links"><span class="raneddie">RANEDDIE</span><a href="terms.html">Terms</a><a href="privacy.html">Privacy</a><a href="contact.html">Help</a></div></div>
""", chrome=False)

page("404.html", "Page not found · FIZZ", "Page not found.", """
<section class="section center"><p class="eyebrow">404</p><h1 class="h2">This page doesn't exist</h1><p class="lead">The link may be broken or the page may have moved.</p><div class="cta-row"><a class="btn" href="index.html">Go home</a></div></section>
""")
print("pages written")
