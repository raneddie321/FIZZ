export const staticSite: Record<string, string> = {
  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{name}}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="logo" href="#">{{name}}</a>
      <nav>
        <a href="#features">Features</a>
        <a href="#about">About</a>
        <a class="button button-small" href="#contact">Contact</a>
      </nav>
    </header>

    <main>
      <section class="hero">
        <h1>Build something people love</h1>
        <p class="lead">{{description}}</p>
        <div class="actions">
          <a class="button" href="#contact">Get started</a>
          <a class="button button-outline" href="#features">Learn more</a>
        </div>
      </section>

      <section id="features" class="features">
        <article class="card">
          <h2>Fast</h2>
          <p>Lightweight HTML and CSS that loads instantly on any device.</p>
        </article>
        <article class="card">
          <h2>Responsive</h2>
          <p>Layouts adapt gracefully from large screens to phones.</p>
        </article>
        <article class="card">
          <h2>Accessible</h2>
          <p>Semantic markup, good contrast and keyboard-friendly controls.</p>
        </article>
      </section>

      <section id="about" class="about">
        <h2>About</h2>
        <p>Tell your story here. Ask FIZZ DEV to rewrite this section, change the colors, or add new pages.</p>
      </section>

      <section id="contact" class="contact">
        <h2>Contact us</h2>
        <form id="contact-form">
          <label>Name <input name="name" required /></label>
          <label>Email <input name="email" type="email" required /></label>
          <label>Message <textarea name="message" rows="4" required></textarea></label>
          <button class="button" type="submit">Send message</button>
          <p class="form-status" role="status" aria-live="polite"></p>
        </form>
      </section>
    </main>

    <footer class="site-footer">© <span id="year"></span> {{name}}</footer>
    <script src="script.js"></script>
  </body>
</html>
`,
  "styles.css": `:root {
  --bg: #ffffff;
  --text: #0f172a;
  --muted: #64748b;
  --primary: #2563eb;
  --border: #e2e8f0;
  --radius: 12px;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); line-height: 1.6; }

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
}
.site-header nav { display: flex; align-items: center; gap: 20px; }
.site-header a { color: var(--text); text-decoration: none; }
.logo { font-weight: 700; font-size: 18px; }

.hero { max-width: 760px; margin: 0 auto; padding: 96px 24px 64px; text-align: center; }
.hero h1 { font-size: clamp(2rem, 5vw, 3.25rem); line-height: 1.1; margin: 0 0 16px; }
.lead { font-size: 1.15rem; color: var(--muted); margin: 0 0 32px; }
.actions { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }

.button {
  display: inline-block;
  padding: 12px 20px;
  border-radius: 10px;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
  text-decoration: none;
  border: 1px solid var(--primary);
  cursor: pointer;
  font: inherit;
}
.button-small { padding: 8px 14px; }
.button-outline { background: transparent; color: var(--primary); }

.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  max-width: 1040px;
  margin: 0 auto;
  padding: 32px 24px;
}
.card { border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }
.card h2 { margin: 0 0 8px; font-size: 1.15rem; }
.card p { margin: 0; color: var(--muted); }

.about, .contact { max-width: 720px; margin: 0 auto; padding: 48px 24px; }
.contact form { display: grid; gap: 14px; }
.contact label { display: grid; gap: 6px; font-weight: 500; }
.contact input, .contact textarea {
  font: inherit;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.form-status { color: var(--muted); min-height: 1.5em; }

.site-footer { padding: 32px 24px; text-align: center; color: var(--muted); border-top: 1px solid var(--border); }

@media (max-width: 640px) {
  .site-header nav a:not(.button) { display: none; }
  .hero { padding-top: 64px; }
}
`,
  "script.js": `document.getElementById("year").textContent = new Date().getFullYear();

const form = document.getElementById("contact-form");
const status = form.querySelector(".form-status");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  // This demo form isn't connected to a backend yet.
  status.textContent = "Thanks! (This form isn't connected to a server yet — ask FIZZ DEV to add one.)";
  form.reset();
});
`,
  "README.md": `# {{name}}

{{description}}

A static website built with plain HTML, CSS and JavaScript. Open the live preview in FIZZ DEV, or serve the folder with any static file server.
`,
};
