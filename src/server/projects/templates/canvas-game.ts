export const canvasGame: Record<string, string> = {
  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{name}}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <div class="hud">
      <span>Score: <strong id="score">0</strong></span>
      <span>Time: <strong id="time">30</strong>s</span>
      <span>Best: <strong id="best">0</strong></span>
    </div>
    <canvas id="game" width="800" height="500" aria-label="Game area"></canvas>
    <div id="overlay" class="overlay">
      <h1>{{name}}</h1>
      <p>Pop as many bubbles as you can in 30 seconds. Small bubbles are worth more!</p>
      <button id="start">Play</button>
    </div>
    <script src="game.js"></script>
  </body>
</html>
`,
  "game.js": `const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const timeEl = document.getElementById("time");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("start");

const GAME_SECONDS = 30;
let bubbles = [];
let particles = [];
let score = 0;
let timeLeft = GAME_SECONDS;
let running = false;
let lastSpawn = 0;
let lastTick = 0;
let best = 0;
try { best = Number(localStorage.getItem("best") || 0); } catch {}
bestEl.textContent = best;

function resize() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function spawn() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const r = 14 + Math.random() * 34;
  bubbles.push({ x: r + Math.random() * (w - 2 * r), y: h + r, r, vy: 40 + Math.random() * 90, hue: 190 + Math.random() * 40, wobble: Math.random() * Math.PI * 2 });
}

function pop(b) {
  score += Math.max(1, Math.round(60 / b.r));
  scoreEl.textContent = score;
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12;
    particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 0.5, hue: b.hue });
  }
}

canvas.addEventListener("pointerdown", (e) => {
  if (!running) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    if ((x - b.x) ** 2 + (y - b.y) ** 2 <= b.r ** 2) {
      pop(b);
      bubbles.splice(i, 1);
      break;
    }
  }
});

function update(dt, now) {
  if (now - lastSpawn > 350) {
    spawn();
    lastSpawn = now;
  }
  for (const b of bubbles) {
    b.y -= b.vy * dt;
    b.wobble += dt * 3;
    b.x += Math.sin(b.wobble) * 0.6;
  }
  bubbles = bubbles.filter((b) => b.y + b.r > 0);
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
}

function draw() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0b2a4a");
  grad.addColorStop(1, "#06121f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  for (const b of bubbles) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = \`hsla(\${b.hue}, 90%, 60%, 0.25)\`;
    ctx.strokeStyle = \`hsla(\${b.hue}, 90%, 75%, 0.9)\`;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fill();
  }
  for (const p of particles) {
    ctx.fillStyle = \`hsla(\${p.hue}, 90%, 70%, \${p.life * 2})\`;
    ctx.fillRect(p.x, p.y, 3, 3);
  }
}

function loop(now) {
  const dt = Math.min(0.05, (now - lastTick) / 1000);
  lastTick = now;
  if (running) {
    timeLeft -= dt;
    timeEl.textContent = Math.max(0, Math.ceil(timeLeft));
    if (timeLeft <= 0) end();
  }
  update(dt, now);
  draw();
  requestAnimationFrame(loop);
}

function start() {
  bubbles = [];
  particles = [];
  score = 0;
  timeLeft = GAME_SECONDS;
  scoreEl.textContent = "0";
  running = true;
  overlay.hidden = true;
}

function end() {
  running = false;
  if (score > best) {
    best = score;
    bestEl.textContent = best;
    try { localStorage.setItem("best", String(best)); } catch {}
  }
  overlay.querySelector("p").textContent = \`Time's up! You scored \${score}. Play again?\`;
  startBtn.textContent = "Play again";
  overlay.hidden = false;
}

startBtn.addEventListener("click", start);
requestAnimationFrame((t) => {
  lastTick = t;
  loop(t);
});
`,
  "styles.css": `* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #06121f; color: #e2f3ff; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
body { display: flex; flex-direction: column; }
.hud { display: flex; justify-content: center; gap: 28px; padding: 10px; font-size: 15px; background: rgba(255,255,255,0.04); }
canvas { flex: 1; width: 100%; display: block; touch-action: none; cursor: crosshair; }
.overlay { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: rgba(3, 10, 20, 0.75); text-align: center; padding: 24px; }
.overlay[hidden] { display: none; }
.overlay h1 { margin: 0; font-size: 2.4rem; }
.overlay p { max-width: 420px; color: #9fc3e0; }
.overlay button { font: inherit; font-weight: 600; padding: 12px 28px; border-radius: 999px; border: none; background: #22c3dc; color: #031418; cursor: pointer; }
`,
  "README.md": `# {{name}}

{{description}}

An HTML5 canvas game with no dependencies. Open the live preview in FIZZ DEV to play. Ask FIZZ DEV to add levels, sound, power-ups or a leaderboard.
`,
};
