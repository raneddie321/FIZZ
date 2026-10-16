/* Fizz Code handbook: visual design craft, style presets, component recipes, motion, icons and theming. Registered into F.brain (see fizz-brain.js). */
(function () {
  "use strict";
  const add = window.FIZZ.brain.add;

  add({ id: "design-craft", title: "DESIGN CRAFT — MAKING IT LOOK PROFESSIONAL", always: "build", text: `
## The principle
Professional design is mostly restraint and consistency: few sizes, few colors, one spacing scale, everything aligned.
Decide the system first (tokens in css/base.css), then build only from it. Never invent a one-off value in a component.

## Visual hierarchy
- Every screen has ONE most important thing. Make it the biggest, boldest or most colorful element; everything else steps down.
- Use size, weight and color for hierarchy, in that order. Muted color (not smaller size) is the best way to demote text.
- One primary button per view region. Secondary actions are outline or ghost buttons; tertiary actions are links.
- Group related things and separate groups: space inside a group is smaller than space between groups (proximity).
- Labels and metadata are small and muted; values and titles are larger and dark. Don't bold everything.
- Scan path: headline, supporting line, action. Put the call to action where the eye lands after reading.

## Spacing rhythm
- 4px base scale, and nothing else: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- Buttons: height 40–48px, padding 0 20px, gap 8px between icon and label. Inputs: height 44px, padding 0 14px.
- Cards: padding 24px (20px on phones), gap 16px between items inside, 24px gap between cards in a grid.
- Sections: padding-block clamp(64px, 10vw, 128px). Heading to its paragraph: 12–16px. Paragraph to button: 24–32px.
- When something looks off, it is usually too little space. Add more whitespace before adding more decoration.
- Same-level elements get the same spacing everywhere. If two cards have different padding, one of them is wrong.

## Alignment
- Pick one left edge per column and align everything to it: headings, text, buttons, images, card contents.
- Use a container: width: min(100% - 32px, 1120px); margin-inline: auto. Text-heavy pages: max 720px.
- Center only short things: hero headlines, a section intro (max 2 lines), empty states, single buttons.
  Long paragraphs, forms, lists and tables are always start-aligned.
- Icons align to the first line of text (align-items: center for one line, flex-start + small margin for multi-line).
- Numbers in tables and stats: font-variant-numeric: tabular-nums; right-align numeric columns.

## Layout patterns that look designed
- Vary section layouts down a page: split (text + visual, alternating sides), 3-column grid, a full-bleed band in --surface
  or the accent, a big centered quote, a stats row, a logo strip. Never five identical card grids in a row.
- Bento grid for features: grid-template-columns: repeat(4, 1fr) with some cards spanning 2 columns or 2 rows (one column on phones).
- Alternate section backgrounds (--bg, --surface) to create rhythm without drawing lines.
- Cards in one row have equal heights (grid does this) and their buttons align at the bottom (flex column + margin-top: auto).
- A little overlap adds depth: a visual crossing a section edge (negative margin), a badge sitting on a card border.

## Responsive design
- Mobile first. Breakpoints 640, 768, 1024, 1280px. Prefer fluid values (clamp(), auto-fit grids) over many breakpoints.
- Phones: one column, 16px side padding, sections 48–64px apart, stacked buttons full width, h1 32–40px.
- Full-height screens use 100dvh, not 100vh (mobile browser bars). Media: aspect-ratio plus object-fit: cover.
- Components that live in sidebars and grids adapt with container queries:
  .card-list { container-type: inline-size; }  @container (min-width: 480px) { .card { display: flex; gap: 16px; } }

## Type
- One family is enough; two maximum (a display face for headings + a text face). Load from Google Fonts with display=swap:
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
- Type scale (px): 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72. Body 16–18. Small/meta 14. Captions/labels 12–13.
- Headings: h1 clamp(2.25rem, 4vw + 1rem, 4rem); h2 clamp(1.75rem, 2.5vw + 1rem, 2.75rem); h3 1.25–1.5rem.
- Line height: body 1.6, UI text 1.4–1.5, headings 1.1–1.25, huge display text 1.0–1.05.
- Letter-spacing: -0.02em to -0.03em on headings 36px and up; +0.06em to +0.12em on small uppercase labels; 0 on body.
- Weights: 400 body, 500 UI labels, 600 buttons and subheads, 700 headings. Avoid 300 for body text on screens.
- Line length 45–75 characters (max-width: 65ch). text-wrap: balance on headings, text-wrap: pretty on paragraphs.
- Use real typographic characters: curly quotes, en dash for ranges (9–5), ellipsis, non-breaking space before units.

## Color
- 60/30/10: 60% background neutral, 30% surfaces and text neutrals, 10% accent. The accent is for actions and focus.
- Neutrals are slightly tinted (slate, zinc, warm stone), never pure gray. Text is near-black (#0f172a, #111827), not #000.
  Dark backgrounds are near-black (#0b0d12, #111318), not #000.
- ONE accent color plus its hover shade (about 8–10% darker). A second accent only if the brand demands it.
- Semantic colors, used only for meaning:
  success #16a34a (text #15803d, bg #f0fdf4)   warning #d97706 (text #b45309, bg #fffbeb)
  danger  #dc2626 (text #b91c1c, bg #fef2f2)   info    #2563eb (text #1d4ed8, bg #eff6ff)
- Contrast: body text at least 4.5:1, large text (24px+, or 19px bold) and UI borders of inputs at least 3:1.
  Muted text on white: #64748b is about 4.7:1 — the lightest gray to use for readable text. Placeholder text is not a label.
- White text on a bright accent often fails (yellow, light orange, cyan, light green): use dark text on those.
- Tints of the accent for subtle backgrounds: color-mix(in srgb, var(--accent) 10%, transparent).

## Radius and shadow systems
- Pick a radius set and keep it: --radius-sm 6px (inputs, chips), --radius 12px (cards, buttons), --radius-lg 20px (dialogs, hero media).
  Sharp (0–4px) reads serious or editorial; 8–12px reads modern; 16px+ and pills read friendly.
- Nested corners: inner radius = outer radius minus the padding between them, or the corners look wrong.
- Shadows are soft, layered and tinted with the text hue, never harsh black:
  --shadow-sm: 0 1px 2px rgba(15, 23, 42, .06);
  --shadow:    0 1px 3px rgba(15, 23, 42, .06), 0 6px 16px rgba(15, 23, 42, .06);
  --shadow-lg: 0 2px 6px rgba(15, 23, 42, .06), 0 24px 48px rgba(15, 23, 42, .12);
- Use either a 1px border or a shadow to separate a card, rarely both at full strength. Borders: 1px solid var(--border).
- Elevation means meaning: flat for content, shadow for things that float (menus, dialogs, sticky bars, hovered cards).

## Imagery without stock photos
- Mesh gradient backgrounds: several radial-gradients layered:
  background: radial-gradient(60% 50% at 20% 10%, rgba(99, 102, 241, .25), transparent 60%),
              radial-gradient(50% 50% at 80% 0%, rgba(236, 72, 153, .18), transparent 60%), var(--bg);
- Dot grid: background-image: radial-gradient(var(--border) 1px, transparent 1px); background-size: 24px 24px;
- Line grid: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px); size 40px 40px;
  fade it out with mask-image: radial-gradient(ellipse at center, black 40%, transparent 75%).
- Product visuals: build a mock app window in HTML/CSS (title bar with three dots, sidebar, a few cards, a small chart).
  It looks better than a fake screenshot and always matches the palette.
- Shapes: blurred blobs (border-radius: 42% 58% 70% 30% / 45% 45% 55% 55%; filter: blur(40px)), SVG waves, rings, arcs.
- Feature icons inside 40–48px rounded squares tinted with the accent. People: initials avatars in tinted circles.
- Big typographic elements (oversized numbers, a single bold word) can carry a section with no image at all.
- Real photos only when they matter (food, venues, products) and only from URLs you know exist; otherwise designed placeholders.

## Interaction states every element needs
- Hover (subtle: darker bg, lift 1px, stronger border), active (pressed: scale .98 or darker), disabled (opacity .5, cursor not-allowed).
- Focus: :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; } — never remove outlines without a replacement.
- Cursor pointer on clickable things; transitions 150–200ms on color, background, border, shadow, transform.

## What makes UIs look amateur (and the fix)
1. Default blue underlined links and purple visited links — style links with the accent, underline offset 3px or underline on hover.
2. Times New Roman or a default serif from a missing font — always declare a font stack ending in system-ui, sans-serif.
3. Cramped padding inside buttons, cards and sections — use the spacing scale; when in doubt double it.
4. Centered long paragraphs — center only 1–2 lines; start-align everything longer.
5. Too many colors — neutrals plus one accent plus semantic colors. No rainbow cards.
6. Inconsistent radii (a 4px card next to a 16px button) — use the radius tokens only.
7. Emoji as icons — use inline SVG icons from one consistent set (same stroke width, same size).
8. Text running edge to edge on wide screens — max-width 65ch for text, a container for layout.
9. Pure black text on pure white, or pure black backgrounds — use tinted near-black and near-white.
10. Low-contrast gray text (#999 on white) — use at least #64748b for readable muted text.
11. Heavy, dark drop shadows — soft layered shadows at 6–12% opacity.
12. Everything bold, everything big — one focal point per section; demote the rest with muted color.
13. Random spacing (13px here, 22px there) — only scale values.
14. Mixed alignments in one column — one start edge per column.
15. Default browser form controls next to styled ones — style inputs, selects, checkboxes (accent-color: var(--accent)) consistently.
16. Placeholder text instead of labels — always a visible label above the input.
17. Generic copy ("Welcome to our website", "Lorem ipsum") — specific, benefit-led copy for this user.
18. Gradient text, glow, glass and animation everywhere at once — choose one signature effect and use it sparingly.
19. Walls of identical cards with no rhythm — vary section layouts (split, grid, full-bleed, quote) down the page.
20. Icons, images and text not vertically aligned in rows — align-items: center, consistent icon sizes (20 or 24px).
21. Tiny tap targets on phones — at least 44x44px for anything tappable.
22. Layout shift as fonts and images load — width/height on media, font-display swap, reserved space for async content.
23. A hero that fills the screen with nothing useful — headline, subline and action visible above the fold on a phone.
24. No hover, focus or active states — every interactive element gets all of them.
25. Horizontal scroll on phones — test at 360px; fix overflowing images (max-width: 100%) and long words (overflow-wrap: anywhere).

## Base CSS every project starts with
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; font-family: var(--font-body); font-size: 1rem; line-height: 1.6; color: var(--text);
         background: var(--bg); -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
  img, svg, video { display: block; max-width: 100%; height: auto; }
  h1, h2, h3, h4 { font-family: var(--font-head); line-height: 1.15; margin: 0 0 .5em; text-wrap: balance; }
  p { margin: 0 0 1em; text-wrap: pretty; }
  a { color: var(--accent); text-underline-offset: 3px; }
  button, input, select, textarea { font: inherit; color: inherit; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  ::selection { background: color-mix(in srgb, var(--accent) 25%, transparent); }

## Pre-ship visual checklist
- Screenshot at 360px and 1440px. Squint: is the most important thing obvious? Is anything misaligned?
- Every value comes from a token: colors, spacing, radius, shadow, font sizes.
- One accent, used for actions. Contrast passes for text, buttons and form borders.
- All text start-aligned except short centered intros. Line lengths under 75 characters.
- Buttons, links, inputs, cards: hover, focus-visible, active and disabled states all designed.
- Empty, loading and error states are designed, not blank.
- Icons all from one set, same size and stroke; no emoji in the UI.
- No horizontal scroll on phones; tap targets 44px; header collapses to a menu.
- Real copy, real favicon, real page title. Nothing says lorem ipsum, TODO or "Your text here".
- Dark mode (if present) checked: no unreadable text, no glaring white boxes, shadows replaced by borders where needed.
` });

  add({ id: "style-presets", title: "STYLE PRESETS",
    match: /\b(style|styles|styling|theme|look|looks|modern|minimal|minimalist|elegant|luxury|luxurious|premium|playful|fun|friendly|dark|neon|glass|glassmorphism|aurora|brutal|brutalist|brutalism|retro|vintage|synthwave|corporate|professional|clean|editorial|magazine|aesthetic|vibe)\b|עיצוב|מודרני|יוקרתי|מינימליסטי|מינימלי|צבעוני/i,
    text: `
Pick ONE preset that fits the brand and the request, copy its tokens into css/base.css, and build every component from them.
All presets share the same token names, so components never change: --bg, --surface, --surface-2, --text, --muted,
--border, --accent, --accent-hover, --accent-contrast, --font-head, --font-body, --radius-sm, --radius, --radius-lg,
--shadow, --shadow-lg. Load the named families from Google Fonts (family=Name:wght@400;600;700&display=swap).
Adjust the accent to the brand color if one is given; keep the rest. If unsure: Minimal SaaS.

## 1. Minimal SaaS — products, tools, startups, dashboards
  :root { --bg: #ffffff; --surface: #f8fafc; --surface-2: #f1f5f9; --text: #0f172a; --muted: #64748b; --border: #e2e8f0;
          --accent: #4f46e5; --accent-hover: #4338ca; --accent-contrast: #ffffff;
          --font-head: "Inter", system-ui, sans-serif; --font-body: "Inter", system-ui, sans-serif;
          --radius-sm: 6px; --radius: 10px; --radius-lg: 16px;
          --shadow: 0 1px 2px rgba(15,23,42,.06), 0 4px 12px rgba(15,23,42,.06);
          --shadow-lg: 0 2px 6px rgba(15,23,42,.06), 0 24px 48px rgba(15,23,42,.10); }
- Feel: airy, precise, lots of white space, 8px-grid spacing, headings 600–700 with -0.025em tracking.
- Buttons: solid accent, 40px high, radius var(--radius), weight 600; secondary is white with 1px border and shadow-sm.
- Cards: white on --surface sections, 1px border, shadow appears on hover. Mesh gradient or dot grid behind the hero.

## 2. Editorial / Magazine — blogs, publications, writers, cultural sites, long reads
  :root { --bg: #fbf9f5; --surface: #f3efe7; --surface-2: #ebe5d9; --text: #1a1a1a; --muted: #5c5c5c; --border: #e0d9cc;
          --accent: #b3261e; --accent-hover: #93201a; --accent-contrast: #ffffff;
          --font-head: "Playfair Display", Georgia, serif; --font-body: "Source Serif 4", Georgia, serif;
          --font-ui: "Inter", system-ui, sans-serif;
          --radius-sm: 0; --radius: 2px; --radius-lg: 4px; --shadow: none; --shadow-lg: 0 20px 40px rgba(26,26,26,.08); }
- Feel: print-like. Big serif headlines (up to 72–96px, line-height 1.0), body 19–20px serif at line-height 1.7, max 680px.
- Hairline rules (1px solid var(--text) or var(--border)) instead of cards. Small uppercase sans labels for categories.
- Asymmetric grids (8/4 columns), pull quotes, a drop cap on the first paragraph (::first-letter, 3.5em, float).
- Buttons: sans (--font-ui), uppercase 13px with 0.1em tracking, square, solid --text or underlined links.

## 3. Luxury dark — premium brands, jewelry, hotels, fine dining, fashion, real estate
  :root { --bg: #0c0b0a; --surface: #15130f; --surface-2: #1d1a15; --text: #f2ede4; --muted: #a39b8b; --border: #2c2820;
          --accent: #c9a96e; --accent-hover: #d8bc87; --accent-contrast: #0c0b0a;
          --font-head: "Cormorant Garamond", Georgia, serif; --font-body: "Manrope", system-ui, sans-serif;
          --radius-sm: 0; --radius: 2px; --radius-lg: 4px; --shadow: none; --shadow-lg: 0 30px 60px rgba(0,0,0,.5); }
  html { color-scheme: dark; }
- Feel: slow, quiet, expensive. Huge whitespace, light-weight serif display (500) at large sizes, few words.
- Small labels: 12px uppercase, letter-spacing 0.2em, in --accent. Thin 1px borders in --border. No bright colors.
- Buttons: outline 1px var(--accent), transparent fill, uppercase 12–13px tracked 0.18em, padding 16px 32px;
  hover fills with --accent and text turns --accent-contrast. Transitions slower (300–400ms).
- Imagery: dark gradients, gold hairline frames, large type over a subtle radial glow of the accent at 8% opacity.

## 4. Playful / Friendly — kids, education, consumer apps, community, food trucks, games
  :root { --bg: #fffaf3; --surface: #ffffff; --surface-2: #fff1dc; --text: #1f1b2e; --muted: #6b6480; --border: #efe4d2;
          --accent: #6c4cff; --accent-hover: #5a3be6; --accent-contrast: #ffffff;
          --pop-1: #ff6b6b; --pop-2: #ffd23f; --pop-3: #3ec1d3;
          --font-head: "Fredoka", system-ui, sans-serif; --font-body: "Nunito", system-ui, sans-serif;
          --radius-sm: 10px; --radius: 18px; --radius-lg: 28px;
          --shadow: 0 4px 0 rgba(31,27,46,.08); --shadow-lg: 0 10px 0 rgba(31,27,46,.08), 0 20px 40px rgba(31,27,46,.08); }
- Feel: round, bouncy, warm. Headings 600–700, big and short. Pop colors only for illustrations, stickers and highlights.
- Buttons: pill (999px), 48px high, chunky offset shadow: box-shadow: 0 4px 0 #4a2fd6; active: translateY(3px), shadow 0 1px 0.
- Cards: white, radius 18–28px, a 2px border in a pop color or a tinted background, slight rotation (-1deg/1deg) on a few.
- Motion: springy (cubic-bezier(.34, 1.56, .64, 1)) on hover, wiggles on success. Blobs and squiggle SVGs as decoration.

## 5. Glass / Aurora — AI products, crypto, music, creative tech, launch pages
  :root { --bg: #0b1020; --surface: rgba(255,255,255,.06); --surface-2: rgba(255,255,255,.10); --text: #eef2ff;
          --muted: #a5b4cc; --border: rgba(255,255,255,.12);
          --accent: #7c3aed; --accent-hover: #6d28d9; --accent-contrast: #ffffff;
          --font-head: "Space Grotesk", system-ui, sans-serif; --font-body: "Inter", system-ui, sans-serif;
          --radius-sm: 10px; --radius: 16px; --radius-lg: 24px;
          --shadow: 0 8px 32px rgba(0,0,0,.35); --shadow-lg: 0 24px 64px rgba(0,0,0,.45); }
  html { color-scheme: dark; }
  body { background: radial-gradient(40% 40% at 15% 10%, rgba(124,58,237,.45), transparent 70%),
                     radial-gradient(35% 35% at 85% 20%, rgba(6,182,212,.35), transparent 70%),
                     radial-gradient(45% 40% at 50% 100%, rgba(236,72,153,.30), transparent 70%), #0b1020;
         background-attachment: fixed; }
  .glass { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
           -webkit-backdrop-filter: blur(16px) saturate(140%); backdrop-filter: blur(16px) saturate(140%); }
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { .glass { background: #151b30; } }
- Feel: luminous, layered. Glass only on 2–3 kinds of elements (nav, cards, dialogs); text always on enough blur to read.
- Buttons: gradient fill linear-gradient(135deg, #7c3aed, #db2777) with white text, or glass with a 1px light border.
- A top highlight on glass edges: box-shadow: inset 0 1px 0 rgba(255,255,255,.12). Gradient text only on one headline word.

## 6. Brutalist — portfolios, studios, indie products, zines, bold campaigns
  :root { --bg: #f4f1ea; --surface: #ffffff; --surface-2: #ffde00; --text: #000000; --muted: #3d3d3d; --border: #000000;
          --accent: #ffde00; --accent-hover: #ffd000; --accent-contrast: #000000; --pop: #ff4d00;
          --font-head: "Archivo Black", system-ui, sans-serif; --font-body: "Space Grotesk", system-ui, sans-serif;
          --font-mono: "Space Mono", ui-monospace, monospace;
          --radius-sm: 0; --radius: 0; --radius-lg: 0; --shadow: 4px 4px 0 #000; --shadow-lg: 8px 8px 0 #000; }
- Feel: raw, loud, honest. 2–3px solid black borders on everything, hard offset shadows, no blur, no gradients.
- Huge uppercase headlines (clamp to 120px), tight line-height 0.95, mono for labels and metadata.
- Buttons: yellow fill, 3px black border, shadow 4px 4px 0 #000; hover translate(-2px,-2px) with 6px shadow;
  active translate(2px,2px) with shadow 0. Cards the same treatment on white.
- Black is the one exception to "no pure black" here — it is the point of the style. Keep the grid strict.

## 7. Corporate trust — finance, law, healthcare, insurance, B2B, government, consulting
  :root { --bg: #ffffff; --surface: #f5f7fa; --surface-2: #eaeff5; --text: #1b2733; --muted: #5a6b7b; --border: #dde3ea;
          --accent: #0b5cad; --accent-hover: #094a8c; --accent-contrast: #ffffff; --success: #1e7f4f;
          --font-head: "IBM Plex Sans", system-ui, sans-serif; --font-body: "Source Sans 3", system-ui, sans-serif;
          --radius-sm: 4px; --radius: 6px; --radius-lg: 10px;
          --shadow: 0 1px 3px rgba(16,24,40,.10), 0 1px 2px rgba(16,24,40,.06);
          --shadow-lg: 0 12px 24px rgba(16,24,40,.10); }
- Feel: calm, structured, credible. Conservative sizes (h1 44–52px), strong grid, clear sections on alternating --surface.
- Trust signals up front: numbers (years, clients, ratings), certifications, client logos as monochrome SVG wordmarks.
- Buttons: solid blue, radius 6px, 44px high; secondary outline blue. Cards: white, border, shadow-sm, icon + title + text.
- Navy footer (#0f2236) with light text. No playful motion; subtle fades only.

## 8. Retro / Neon — gaming, events, nightlife, music, arcades, synthwave
  :root { --bg: #0d0221; --surface: #1a0b3b; --surface-2: #261052; --text: #f8f0ff; --muted: #b9a6d9; --border: #3b1f6e;
          --accent: #ff2a6d; --accent-hover: #ff4f86; --accent-contrast: #0d0221; --neon-2: #05d9e8; --neon-3: #f9c80e;
          --font-head: "Orbitron", system-ui, sans-serif; --font-body: "Inter", system-ui, sans-serif;
          --radius-sm: 4px; --radius: 8px; --radius-lg: 12px;
          --shadow: 0 0 0 1px rgba(255,42,109,.4), 0 0 24px rgba(255,42,109,.25);
          --shadow-lg: 0 0 0 1px rgba(5,217,232,.4), 0 0 48px rgba(5,217,232,.3); }
  html { color-scheme: dark; }
  .neon { color: #fff; text-shadow: 0 0 6px var(--accent), 0 0 18px var(--accent), 0 0 36px rgba(255,42,109,.6); }
  .grid-floor { background: linear-gradient(transparent 0 calc(100% - 1px), rgba(5,217,232,.5) 0) 0 0 / 100% 40px,
                linear-gradient(90deg, transparent 0 calc(100% - 1px), rgba(5,217,232,.5) 0) 0 0 / 40px 100%;
                transform: perspective(400px) rotateX(60deg); transform-origin: bottom; }
- Feel: glowing, nocturnal, high energy. Glow only on headings and the main button; body text stays plain and readable.
- Buttons: pink fill with dark text, glow shadow; hover intensifies glow. Secondary: cyan 1px border, cyan text.
- Decoration: sunset gradient sun (linear-gradient(#f9c80e, #ff2a6d) clipped to a circle with horizontal stripe cut-outs),
  perspective grid floor, scanlines (repeating-linear-gradient at 4px, 4% opacity). Pixel font "Press Start 2P" only for tiny labels.

## Mixing rules
- Never combine presets. Borrow one detail at most (for example a mono label font) and keep the rest pure.
- Dark presets (3, 5, 8) set color-scheme: dark; light presets get a dark theme only if the request needs one.
- Whatever the preset: contrast rules, 44px targets, focus rings and the spacing scale still apply.
` });

  add({ id: "components", title: "COMPONENT RECIPES",
    match: /\b(components?|navbar|nav|navigation|menu|modal|dialog|popup|tabs?|accordion|carousel|slider|toast|notification|dropdown|cards?|pricing|forms?|table|sidebar|footer|header|hero|testimonials?|faq|gallery|lightbox|stepper|wizard|pagination|tooltip|badges?|chips?|avatars?|skeleton|empty state)\b|תפריט|טופס|כרטיס|גלריה|קרוסלה|טבלה/i,
    text: `
Recipes use the tokens from the design system (--bg, --surface, --text, --muted, --border, --accent, --radius, --shadow).
Copy the structure and the accessibility attributes exactly; restyle freely. Icons: see ICONS AND SVG.
Helper used below: .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

## Buttons (the base for everything)
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; padding: 0 20px;
         border-radius: var(--radius); border: 1px solid transparent; font-weight: 600; font-size: 15px; cursor: pointer;
         text-decoration: none; transition: background .15s, border-color .15s, transform .15s, box-shadow .15s; }
  .btn-primary { background: var(--accent); color: var(--accent-contrast); }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-secondary { background: var(--surface); color: var(--text); border-color: var(--border); }
  .btn-ghost { background: transparent; color: var(--text); } .btn-ghost:hover { background: var(--surface-2); }
  .btn:active { transform: scale(.98); } .btn:disabled { opacity: .5; cursor: not-allowed; }
  .btn-icon { width: 44px; padding: 0; }  (icon-only buttons always get aria-label)

## Responsive navbar with mobile menu
  <header class="nav">
    <a class="brand" href="index.html">Northwind</a>
    <button class="nav-toggle btn-icon" aria-expanded="false" aria-controls="nav-menu" aria-label="Open menu">(menu icon)</button>
    <nav id="nav-menu" class="nav-menu" aria-label="Main">
      <a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a>
      <a class="btn btn-primary" href="#start">Get started</a>
    </nav>
  </header>
  .nav { position: sticky; top: 0; z-index: 40; display: flex; align-items: center; justify-content: space-between;
         height: 64px; padding-inline: 16px; background: color-mix(in srgb, var(--bg) 85%, transparent);
         backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
  .nav-menu { display: flex; align-items: center; gap: 24px; }
  .nav-toggle { display: none; }
  @media (max-width: 768px) {
    .nav-toggle { display: inline-flex; }
    .nav-menu { position: fixed; inset: 64px 0 auto 0; flex-direction: column; align-items: stretch; gap: 4px;
                padding: 16px; background: var(--bg); border-bottom: 1px solid var(--border); display: none; }
    .nav-menu.open { display: flex; }
    .nav-menu a { padding: 12px; }
  }
  const toggle = document.querySelector(".nav-toggle"), menu = document.getElementById("nav-menu");
  function setOpen(open) {
    menu.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }
  toggle.addEventListener("click", () => setOpen(!menu.classList.contains("open")));
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.classList.contains("open")) { setOpen(false); toggle.focus(); } });
- Mark the current page link with aria-current="page" and style it. Add html { scroll-padding-top: 80px; } for anchors.

## Hero
  <section class="hero container">
    <div><p class="eyebrow">New: team workspaces</p><h1>Ship client work twice as fast</h1>
      <p class="lead">One sentence on the concrete benefit.</p>
      <div class="actions"><a class="btn btn-primary" href="#start">Start free</a><a class="btn btn-secondary" href="#demo">See a demo</a></div></div>
    <div class="hero-visual" aria-hidden="true">(mock app window built in HTML/CSS)</div>
  </section>
  .hero { display: grid; gap: 48px; align-items: center; padding-block: clamp(64px, 10vw, 128px); }
  @media (min-width: 900px) { .hero { grid-template-columns: 1.1fr .9fr; } }
  .hero h1 { font-size: clamp(2.25rem, 4vw + 1rem, 4.25rem); line-height: 1.05; letter-spacing: -0.03em; }
  .lead { font-size: clamp(1.05rem, .6vw + .9rem, 1.25rem); color: var(--muted); max-width: 52ch; }
  .eyebrow { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 600;
             color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 32px; }

## Feature grid
  <ul class="features"><li><span class="feature-icon">(svg)</span><h3>Instant sync</h3><p>One-sentence benefit.</p></li>...</ul>
  .features { list-style: none; padding: 0; display: grid; gap: 24px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
  .feature-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; margin-bottom: 16px;
                  color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .features p { color: var(--muted); margin: 0; }

## Pricing table with highlighted plan
  <div class="plans">
    <article class="plan"><h3>Starter</h3><p class="price"><span>$0</span>/month</p><ul>...</ul><a class="btn btn-secondary">Start free</a></article>
    <article class="plan featured" aria-label="Pro, most popular"><span class="plan-badge">Most popular</span>...<a class="btn btn-primary">Start trial</a></article>
    <article class="plan">...</article>
  </div>
  .plans { display: grid; gap: 24px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); align-items: start; }
  .plan { position: relative; display: flex; flex-direction: column; gap: 16px; padding: 32px; border: 1px solid var(--border);
          border-radius: var(--radius-lg); background: var(--surface); }
  .plan.featured { border: 2px solid var(--accent); box-shadow: var(--shadow-lg); }
  .plan-badge { position: absolute; top: -12px; inset-inline-start: 24px; padding: 2px 10px; border-radius: 999px;
                font-size: 12px; font-weight: 700; background: var(--accent); color: var(--accent-contrast); }
  .price span { font-size: 44px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .plan ul { list-style: none; padding: 0; display: grid; gap: 10px; } (each li: check icon + text)
  .plan .btn { margin-top: auto; }
- Monthly/yearly switch: store both prices in data-monthly and data-yearly on each price and swap textContent; show "Save 20%".

## Testimonial
  <figure class="quote"><blockquote><p>"Specific result in the customer's words."</p></blockquote>
    <figcaption><span class="avatar">DL</span><span><strong>Dana Levi</strong><br><span class="muted">Head of Ops, Arbor</span></span></figcaption></figure>
  .quote blockquote { margin: 0 0 20px; font-size: 1.25rem; line-height: 1.5; }
  .quote figcaption { display: flex; align-items: center; gap: 12px; font-size: 14px; }

## FAQ accordion (no JS)
  <div class="faq"><details><summary>Can I cancel anytime?</summary><p>Yes — ...</p></details>...</div>
  .faq details { border-bottom: 1px solid var(--border); }
  .faq summary { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 20px 0;
                 font-weight: 600; cursor: pointer; list-style: none; }
  .faq summary::-webkit-details-marker { display: none; }
  .faq summary::after { content: "+"; font-size: 22px; color: var(--muted); transition: transform .2s; }
  .faq details[open] summary::after { transform: rotate(45deg); }
  .faq details p { margin: 0 0 20px; color: var(--muted); max-width: 65ch; }
- One-open-at-a-time: give every details the same name attribute (name="faq"); older browsers simply allow several open.

## Modal with dialog
  <button class="btn btn-primary" data-open="invite">Invite</button>
  <dialog id="invite" class="modal" aria-labelledby="invite-title">
    <form method="dialog" class="modal-body">
      <h2 id="invite-title">Invite a teammate</h2> ...fields...
      <div class="modal-actions"><button class="btn btn-secondary" value="cancel">Cancel</button><button class="btn btn-primary" value="ok">Send</button></div>
    </form>
  </dialog>
  .modal { padding: 0; border: 0; border-radius: var(--radius-lg); width: min(100% - 32px, 480px); box-shadow: var(--shadow-lg);
           background: var(--bg); color: var(--text); }
  .modal::backdrop { background: rgba(15, 23, 42, .5); backdrop-filter: blur(2px); }
  .modal-body { padding: 24px; } .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
  document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => document.getElementById(b.dataset.open).showModal()));
  document.querySelectorAll("dialog.modal").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));
  dialog.addEventListener("close", () => { if (dialog.returnValue === "ok") save(); });
- showModal() traps focus, closes on Escape and returns focus to the opener. Padding sits on the inner element so a click
  on the dialog itself means a click on the backdrop. Put autofocus on the first field.

## Tabs (roles + arrow keys)
  <div class="tabs">
    <div role="tablist" aria-label="Plan details">
      <button role="tab" id="tab-1" aria-controls="panel-1" aria-selected="true">Overview</button>
      <button role="tab" id="tab-2" aria-controls="panel-2" aria-selected="false" tabindex="-1">Specs</button>
    </div>
    <div role="tabpanel" id="panel-1" aria-labelledby="tab-1" tabindex="0">...</div>
    <div role="tabpanel" id="panel-2" aria-labelledby="tab-2" tabindex="0" hidden>...</div>
  </div>
  [role=tab] { padding: 10px 16px; border: 0; background: none; border-bottom: 2px solid transparent; color: var(--muted); }
  [role=tab][aria-selected=true] { color: var(--text); border-bottom-color: var(--accent); }
  const list = document.querySelector("[role=tablist]"), tabs = [...list.querySelectorAll("[role=tab]")];
  function select(tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
  }
  list.addEventListener("click", (e) => { const t = e.target.closest("[role=tab]"); if (t) select(t); });
  list.addEventListener("keydown", (e) => {
    const i = tabs.indexOf(document.activeElement);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = tabs[(to + tabs.length) % tabs.length]; select(next); next.focus();
  });
- In RTL pages swap ArrowRight and ArrowLeft.

## Toast notifications
  <div class="toasts" aria-live="polite"></div>
  .toasts { position: fixed; inset-block-end: 16px; inset-inline-end: 16px; z-index: 100; display: grid; gap: 8px; }
  .toast { min-width: 240px; max-width: 360px; padding: 12px 16px; border-radius: var(--radius); background: var(--text);
           color: var(--bg); box-shadow: var(--shadow-lg); animation: toast-in .2s ease-out; transition: opacity .2s, transform .2s; }
  .toast.error { background: #b91c1c; color: #fff; } .toast.leaving { opacity: 0; transform: translateY(8px); }
  @keyframes toast-in { from { opacity: 0; transform: translateY(8px); } }
  export function toast(message, type = "info", ms = 4000) {
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = message;
    document.querySelector(".toasts").append(el);
    setTimeout(() => { el.classList.add("leaving"); setTimeout(() => el.remove(), 250); }, ms);
  }
- Toasts confirm; they never carry the only copy of an error the user must act on. Offer "Undo" as a button inside when useful.

## Dropdown menu (disclosure pattern)
  <div class="dropdown">
    <button class="btn btn-secondary" aria-expanded="false" aria-controls="acct-menu">Account (chevron-down icon)</button>
    <div class="dropdown-menu" id="acct-menu" hidden><a href="profile.html">Profile</a><a href="settings.html">Settings</a><hr><button>Sign out</button></div>
  </div>
  .dropdown { position: relative; }
  .dropdown-menu { position: absolute; top: calc(100% + 6px); inset-inline-end: 0; min-width: 200px; padding: 6px; z-index: 50;
                   background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-lg); }
  .dropdown-menu a, .dropdown-menu button { display: block; width: 100%; padding: 8px 12px; border: 0; border-radius: 6px;
                   background: none; text-align: start; color: var(--text); text-decoration: none; }
  .dropdown-menu :is(a, button):hover { background: var(--surface-2); }
  document.querySelectorAll(".dropdown").forEach((dd) => {
    const btn = dd.querySelector("[aria-expanded]"), menu = dd.querySelector(".dropdown-menu");
    const set = (open) => { menu.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };
    btn.addEventListener("click", () => set(menu.hidden));
    document.addEventListener("click", (e) => { if (!dd.contains(e.target)) set(false); });
    dd.addEventListener("keydown", (e) => { if (e.key === "Escape") { set(false); btn.focus(); } });
  });
- Alternative with no JS: the Popover API (button popovertarget="m" + div id="m" popover) gives light-dismiss and Escape;
  it opens in the top layer, so position it yourself from btn.getBoundingClientRect() in its "beforetoggle" event.

## Tooltip
  <span class="tip-wrap"><button class="btn-icon" aria-labelledby="tip-copy">(copy icon)</button>
    <span role="tooltip" id="tip-copy" class="tip">Copy link</span></span>
  .tip-wrap { position: relative; display: inline-flex; }
  .tip { position: absolute; bottom: calc(100% + 8px); left: 50%; translate: -50% 4px; padding: 6px 10px; border-radius: 6px;
         font-size: 13px; white-space: nowrap; background: var(--text); color: var(--bg); opacity: 0; pointer-events: none;
         transition: opacity .15s, translate .15s; }
  .tip-wrap:hover .tip, .tip-wrap:focus-within .tip { opacity: 1; translate: -50% 0; }
- Tooltips hold short labels only, never essential content (touch screens have no hover).

## Form with validation messages
  <form class="form" novalidate>
    <div class="field"><label for="email">Work email</label>
      <input id="email" name="email" type="email" required autocomplete="email" aria-describedby="email-err">
      <p class="field-error" id="email-err" hidden></p></div>
    <button class="btn btn-primary" type="submit">Request access</button>
    <p class="form-status" role="status"></p>
  </form>
  .field { display: grid; gap: 6px; margin-bottom: 16px; } label { font-weight: 500; font-size: 14px; }
  input, select, textarea { height: 44px; padding: 0 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); }
  textarea { height: auto; min-height: 120px; padding: 12px 14px; }
  input:focus-visible { outline: 2px solid var(--accent); outline-offset: 0; border-color: var(--accent); }
  [aria-invalid=true] { border-color: #dc2626; } .field-error { margin: 0; color: #b91c1c; font-size: 13px; }
  const messages = { valueMissing: "This field is required.", typeMismatch: "Enter a valid email address.",
                     tooShort: "That is too short.", patternMismatch: "Check the format." };
  function check(input) {
    const key = Object.keys(messages).find((k) => input.validity[k]);
    const msg = input.validity.valid ? "" : (messages[key] || input.validationMessage);
    const err = document.getElementById(input.getAttribute("aria-describedby"));
    input.setAttribute("aria-invalid", String(Boolean(msg))); err.textContent = msg; err.hidden = !msg;
    return !msg;
  }
  form.addEventListener("focusout", (e) => { if (e.target.matches("[aria-describedby]")) check(e.target); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fields = [...form.querySelectorAll("[aria-describedby]")];
    if (!fields.map(check).every(Boolean)) { form.querySelector("[aria-invalid=true]").focus(); return; }
    const btn = form.querySelector("[type=submit]"); btn.disabled = true; btn.textContent = "Sending…";
    // send, then: form.reset(); status.textContent = "Thanks — we will reply within one day."; btn.disabled = false;
  });

## Data table
  <div class="table-wrap"><table class="table"><thead><tr>
    <th scope="col" aria-sort="none"><button data-sort="name">Name</button></th>
    <th scope="col" class="num" aria-sort="none"><button data-sort="amount">Amount</button></th></tr></thead><tbody>...</tbody></table></div>
  .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); }
  .table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .table th, .table td { padding: 12px 16px; text-align: start; border-bottom: 1px solid var(--border); white-space: nowrap; }
  .table thead th { position: sticky; top: 0; background: var(--surface); font-weight: 600; color: var(--muted); }
  .table th button { padding: 0; border: 0; background: none; font: inherit; color: inherit; cursor: pointer; } .table .num { text-align: end; font-variant-numeric: tabular-nums; }
  .table tbody tr:hover { background: var(--surface); }
  thead.addEventListener("click", (e) => {
    const b = e.target.closest("[data-sort]"); if (!b) return;
    const th = b.closest("th"), dir = th.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
    thead.querySelectorAll("th").forEach((h) => h.setAttribute("aria-sort", "none")); th.setAttribute("aria-sort", dir);
    rows.sort((a, z) => String(a[b.dataset.sort]).localeCompare(String(z[b.dataset.sort]), undefined, { numeric: true }) * (dir === "ascending" ? 1 : -1));
    renderRows(rows);
  });
- Show a sort arrow from aria-sort with CSS. Empty table: one full-width row with a message and an action.

## Pagination
  <nav class="pager" aria-label="Pagination"><a href="?page=1" aria-label="Previous page">(chevron-left)</a>
    <a href="?page=1">1</a><a href="?page=2" aria-current="page">2</a><a href="?page=3">3</a><a href="?page=3" aria-label="Next page">(chevron-right)</a></nav>
  .pager { display: flex; gap: 4px; } .pager a { min-width: 40px; height: 40px; display: grid; place-items: center; border-radius: 8px; }
  .pager [aria-current=page] { background: var(--accent); color: var(--accent-contrast); }

## Sidebar layout (app shell)
  <div class="shell"><aside class="sidebar" id="sidebar">...nav with aria-current="page"...</aside><main class="main">...</main></div>
  .shell { display: grid; grid-template-columns: 260px 1fr; min-height: 100dvh; }
  .sidebar { position: sticky; top: 0; height: 100dvh; overflow-y: auto; padding: 16px; border-inline-end: 1px solid var(--border); background: var(--surface); }
  .main { padding: clamp(16px, 3vw, 32px); min-width: 0; }   (min-width: 0 stops wide tables from breaking the grid)
  @media (max-width: 900px) {
    .shell { grid-template-columns: 1fr; }
    .sidebar { position: fixed; inset-block: 0; inset-inline-start: 0; width: 280px; z-index: 60; transform: translateX(-100%);
               transition: transform .25s ease; box-shadow: var(--shadow-lg); }
    [dir=rtl] .sidebar { transform: translateX(100%); }
    .sidebar.open { transform: none; }
  }
- A menu button (aria-expanded, aria-controls="sidebar") opens it; a semi-transparent overlay and Escape close it.

## Footer
  <footer class="footer"><div class="container footer-grid"><div><a class="brand">Northwind</a><p class="muted">One-line mission.</p></div>
    <nav aria-label="Product"><h4>Product</h4><a>Features</a>...</nav>...</div>
    <div class="container footer-bottom"><p>© <span data-year></span> Northwind Ltd.</p><nav aria-label="Legal">...</nav></div></footer>
  .footer { margin-top: 96px; padding-block: 64px 32px; border-top: 1px solid var(--border); background: var(--surface); font-size: 14px; }
  .footer-grid { display: grid; gap: 32px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
  .footer nav { display: grid; gap: 10px; align-content: start; } .footer a { color: var(--muted); text-decoration: none; }
  .footer-bottom { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px; margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); }
  document.querySelectorAll("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });

## Carousel (scroll-snap)
  <section class="carousel" aria-label="Customer stories">
    <div class="track" tabindex="0">(cards)</div>
    <button class="btn-icon prev" aria-label="Previous">(chevron-left)</button><button class="btn-icon next" aria-label="Next">(chevron-right)</button>
  </section>
  .track { display: grid; grid-auto-flow: column; grid-auto-columns: min(85%, 340px); gap: 16px; overflow-x: auto;
           scroll-snap-type: x mandatory; scroll-padding-inline: 16px; overscroll-behavior-x: contain; scrollbar-width: none; }
  .track::-webkit-scrollbar { display: none; }  .track > * { scroll-snap-align: start; }
  const track = carousel.querySelector(".track"), step = () => track.clientWidth * 0.9;
  carousel.querySelector(".next").addEventListener("click", () => track.scrollBy({ left: step(), behavior: "smooth" }));
  carousel.querySelector(".prev").addEventListener("click", () => track.scrollBy({ left: -step(), behavior: "smooth" }));
- Swipe works for free. In RTL flip the sign. No autoplay; if you must, pause on hover and focus and offer a pause button.

## Lightbox gallery
  <ul class="gallery"><li><button data-full="img/1.jpg"><img src="img/1-thumb.jpg" alt="Terrace at sunset" width="400" height="300" loading="lazy"></button></li>...</ul>
  <dialog class="lightbox" aria-label="Image viewer"><img alt=""><button class="btn-icon lb-prev" aria-label="Previous image">..</button>
    <button class="btn-icon lb-next" aria-label="Next image">..</button><button class="btn-icon lb-close" aria-label="Close">..</button></dialog>
  .gallery { list-style: none; padding: 0; display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
  .gallery button { padding: 0; border: 0; background: none; cursor: zoom-in; display: block; width: 100%; border-radius: var(--radius); overflow: hidden; }
  .gallery img { aspect-ratio: 4 / 3; object-fit: cover; width: 100%; transition: transform .3s; } .gallery button:hover img { transform: scale(1.04); }
  .lightbox { padding: 0; border: 0; background: transparent; max-width: 92vw; } .lightbox::backdrop { background: rgba(0,0,0,.85); }
  .lightbox img { max-height: 86vh; width: auto; border-radius: 8px; }
  const items = [...document.querySelectorAll(".gallery button")], lb = document.querySelector(".lightbox"), big = lb.querySelector("img");
  let index = 0;
  function show(n) { index = (n + items.length) % items.length; big.src = items[index].dataset.full; big.alt = items[index].querySelector("img").alt; }
  items.forEach((b, n) => b.addEventListener("click", () => { show(n); lb.showModal(); }));
  lb.querySelector(".lb-next").onclick = () => show(index + 1); lb.querySelector(".lb-prev").onclick = () => show(index - 1);
  lb.querySelector(".lb-close").onclick = () => lb.close();
  lb.addEventListener("click", (e) => { if (e.target === lb) lb.close(); });
  lb.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") show(index + 1); if (e.key === "ArrowLeft") show(index - 1); });

## Stepper (multi-step form or checkout)
  <ol class="stepper"><li class="done">Cart</li><li aria-current="step">Shipping</li><li>Payment</li></ol>
  .stepper { display: flex; gap: 8px; padding: 0; list-style: none; counter-reset: step; }
  .stepper li { flex: 1; display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--muted); counter-increment: step; }
  .stepper li::before { content: counter(step); display: grid; place-items: center; width: 28px; height: 28px; flex: none;
                        border-radius: 50%; border: 2px solid var(--border); font-weight: 600; }
  .stepper li:not(:last-child)::after { content: ""; flex: 1; height: 2px; background: var(--border); }
  .stepper .done::before, .stepper [aria-current=step]::before { border-color: var(--accent); }
  .stepper .done::before { background: var(--accent); color: var(--accent-contrast); }
  .stepper [aria-current=step] { color: var(--text); font-weight: 600; }
- One step visible at a time; Back keeps entered data; validate a step before Next; on phones show "Step 2 of 3" text.

## Skeleton loading
  <div class="card" aria-busy="true"><span class="sr-only">Loading…</span><div class="skeleton" style="height: 20px; width: 60%"></div>
    <div class="skeleton" style="height: 14px; margin-top: 12px"></div></div>
  .skeleton { border-radius: 6px; background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface) 50%, var(--surface-2) 75%);
              background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
  @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
- Shape skeletons like the real content; show them only after about 200ms so fast loads do not flicker.

## Empty state
  <div class="empty"><svg (simple 64px illustration in accent tints)></svg><h3>No projects yet</h3>
    <p>Projects you create will show up here.</p><button class="btn btn-primary">Create your first project</button></div>
  .empty { display: grid; justify-items: center; gap: 8px; padding: 48px 24px; text-align: center; border: 1px dashed var(--border); border-radius: var(--radius-lg); }
  .empty p { color: var(--muted); max-width: 40ch; margin: 0 0 16px; }
- Different copy for "nothing yet" (invite the first action) and "no results" (show the query, offer to clear filters).

## Badge and chip
  .badge { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 999px;
           font-size: 12px; font-weight: 600; background: var(--surface-2); color: var(--text); }
  .badge.success { background: #dcfce7; color: #166534; } .badge.warning { background: #fef3c7; color: #92400e; }
  .badge.danger { background: #fee2e2; color: #991b1b; }  .badge.info { background: #dbeafe; color: #1e40af; }
  .badge .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  Removable chip: <span class="badge">Red <button class="chip-x" aria-label="Remove filter: Red">(x icon 14px)</button></span>
  Toggle chip: <button class="badge" aria-pressed="false">In stock</button> styled on [aria-pressed=true].

## Avatar group
  <ul class="avatars" aria-label="Team: Dana, Omer, Maya and 4 more"><li><img src="img/dana.jpg" alt=""></li><li>OK</li><li class="more">+4</li></ul>
  .avatars { display: flex; list-style: none; padding: 0; }
  .avatars li { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 50%; overflow: hidden;
                border: 2px solid var(--bg); margin-inline-start: -10px; font: 600 13px/1 var(--font-body); background: var(--surface-2); }
  .avatars li:first-child { margin-inline-start: 0; } .avatars img { width: 100%; height: 100%; object-fit: cover; }
  const initials = (name) => name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const hue = (name) => [...name].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
  el.style.background = "hsl(" + hue(name) + " 55% 45%)"; el.style.color = "#fff";
` });

  add({ id: "motion", title: "ANIMATION AND MOTION",
    match: /\b(animations?|animate|animated|animating|motion|transitions?|parallax|scroll|scrolling|hover|smooth|effects?|micro-?interactions?|reveal|fade|stagger|bounce)\b|אנימציה|אנימציות|תנועה/i,
    text: `
## Purpose
Motion explains change: where something came from, what was pressed, what is loading. If it explains nothing, remove it.
Subtle and fast beats big and slow. One signature effect per site; everything else is quiet.

## Durations and easings (exact values)
  --dur-1: 120ms;  hover color, button press, checkbox, toggles
  --dur-2: 200ms;  dropdowns, tooltips, small fades, focus rings
  --dur-3: 300ms;  modals, drawers, cards moving, tab content
  --dur-4: 500ms;  page-level reveals, hero entrances (never more than about 700ms for UI)
  --ease-out:    cubic-bezier(.16, 1, .3, 1);     things entering (fast start, gentle stop) — the default
  --ease-in:     cubic-bezier(.7, 0, .84, 0);     things leaving (use shorter durations than entering)
  --ease-in-out: cubic-bezier(.65, 0, .35, 1);    things moving from A to B on screen
  --ease-spring: cubic-bezier(.34, 1.56, .64, 1); playful overshoot (toggles, badges, likes) — sparingly
- Exits are about 20–30% faster than entrances. Larger distances get slightly longer durations.
- Never use linear except for spinners and continuous progress.

## What to animate
- Only transform (translate, scale, rotate) and opacity: they run on the compositor and stay smooth.
- Avoid animating width, height, top, left, margin, padding: they trigger layout every frame. To expand height smoothly,
  animate grid-template-rows from 0fr to 1fr on a grid wrapper (child has overflow: hidden; min-height: 0).
- Box-shadow animation is costly on many elements: put the bigger shadow on a ::after and animate its opacity instead.
- Filters (blur) and backdrop-filter are expensive: keep them on few, small elements; never animate blur on scroll.
- will-change: transform only on elements about to animate, and remove it afterwards. Never on everything.

## Micro-interactions
  .btn { transition: background-color var(--dur-1), transform var(--dur-1) var(--ease-out), box-shadow var(--dur-2); }
  .btn:hover { transform: translateY(-1px); } .btn:active { transform: translateY(0) scale(.98); }
  .card { transition: transform var(--dur-3) var(--ease-out), box-shadow var(--dur-3); }
  .card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
  .link { background: linear-gradient(currentColor, currentColor) 0 100% / 0 1px no-repeat; transition: background-size var(--dur-2) var(--ease-out); text-decoration: none; }
  .link:hover { background-size: 100% 1px; }
  .icon-arrow { transition: transform var(--dur-2) var(--ease-out); } .btn:hover .icon-arrow { transform: translateX(3px); }
- Toggles slide their knob (translateX) with --ease-spring; checkboxes draw their check; like buttons scale 1 → 1.2 → 1.
- Hover effects must not be the only way to discover something: touch devices never hover.
  Wrap hover-only flourishes in @media (hover: hover) { ... }.

## Reveal on scroll (IntersectionObserver)
  .js .reveal { opacity: 0; transform: translateY(16px); transition: opacity .6s var(--ease-out), transform .6s var(--ease-out);
                transition-delay: calc(var(--i, 0) * 70ms); }
  .js .reveal.in { opacity: 1; transform: none; }
  @media (prefers-reduced-motion: reduce) { .js .reveal { opacity: 1; transform: none; transition: none; } }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.1 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
- Staggered lists: set the index once, the CSS delay does the rest:
  document.querySelectorAll(".stagger").forEach((list) => [...list.children].forEach((el, i) => { el.classList.add("reveal"); el.style.setProperty("--i", i); }));
  Cap the stagger (Math.min(i, 8)) so long lists don't wait seconds. Animate once; never re-hide on scroll up.
- Content stays visible without JS because the hidden state needs the "js" class: add it first thing in main.js
  (document.documentElement.classList.add("js")) or in a tiny inline script in head.

## Scroll-driven CSS animations (progressive enhancement)
  @supports (animation-timeline: view()) {
    @media (prefers-reduced-motion: no-preference) {
      .scroll-fade { animation: fade-up linear both; animation-timeline: view(); animation-range: entry 0% cover 30%; }
    }
  }
  @keyframes fade-up { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
- Not supported in every browser yet, so it must be purely decorative; the IntersectionObserver version is the reliable default.
- Reading progress bar: a fixed 3px bar with transform: scaleX(var(--p)) updated from scroll in a requestAnimationFrame.

## Parallax and scroll effects
- Keep it to one or two decorative layers, moved by at most 10–20% of scroll, with transform only:
  let ticking = false;
  addEventListener("scroll", () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => { layer.style.transform = "translate3d(0, " + (scrollY * 0.15) + "px, 0)"; ticking = false; });
  }, { passive: true });
- Never hijack scrolling (no custom scroll speed, no scroll-jacking sections). Disable parallax for reduced motion.
- Smooth anchor scrolling only when motion is welcome:
  @media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
  html { scroll-padding-top: 80px; }  (keeps anchored headings below a sticky header)

## Page and view transitions
- Same-document (SPA routes, filtering, list reorders), with a feature check:
  function transition(update) {
    if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) { update(); return; }
    document.startViewTransition(update);
  }
  transition(() => render(route));
  ::view-transition-old(root), ::view-transition-new(root) { animation-duration: 250ms; }
  Shared element: give the thumbnail and the detail image the same view-transition-name (unique per page, e.g. "hero-42").
- Multi-page sites (cross-document), in the CSS of both pages; unsupported browsers just navigate normally:
  @view-transition { navigation: auto; }
- Without the API: fade the main element out (opacity .15s), swap content, fade in. Keep it under 300ms total.

## Loading and feedback
- Spinner: a 20px circle with a 2px border, one side colored, rotating with animation: spin .8s linear infinite.
- Prefer skeletons for content, spinners inside buttons for actions ("Saving…"), progress bars for known durations.
- Count-up numbers for stats: animate with requestAnimationFrame over about 1s with ease-out, starting when visible;
  format every frame with Intl.NumberFormat; show the final value immediately for reduced motion.

## prefers-reduced-motion (required)
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important;
                             transition-duration: .01ms !important; scroll-behavior: auto !important; }
  }
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
- Reduced motion means: no parallax, no auto-playing carousels, no large movement; fades and color changes are fine.

## Performance rules
- Scroll and resize listeners: passive, throttled with requestAnimationFrame; better, use IntersectionObserver.
- Read layout (getBoundingClientRect, offsetHeight) before writing styles; never alternate reads and writes in a loop.
- Pause animations that are off-screen or in hidden tabs (IntersectionObserver, visibilitychange).
- Canvas or particle backgrounds: cap the count, cap devicePixelRatio at 2, stop when not visible.
- Test on a phone-sized viewport: if it stutters there, simplify.
` });

  add({ id: "icons-svg", title: "ICONS AND SVG",
    match: /\b(icons?|svg|svgs|logo|logos|illustrations?|favicon|wordmark|pattern|blob)\b|אייקון|אייקונים|לוגו|איור/i,
    files: /\.svg$/i,
    text: `
## Inline SVG icon rules
- One style for the whole project: 24x24 viewBox, fill none, stroke currentColor, stroke-width 2, round caps and joins.
- Size with CSS (width/height 20px or 24px; 16px in dense UI), color with CSS color — the icon follows currentColor.
- Decorative icons get aria-hidden="true". Icon-only buttons get an aria-label on the button, not on the svg.
- Directional icons (arrows, chevrons) flip in RTL: [dir=rtl] .icon-dir { transform: scaleX(-1); }
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
  .icon { width: 20px; height: 20px; flex: none; }

## Icon helper (js/icons.js)
  const ICONS = {
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    // ...the entries below
  };
  export function icon(name, size = 20, cls = "") {
    return '<svg class="icon ' + cls + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
  }
  // usage: button.innerHTML = icon("plus") + "<span>Add task</span>";   (static strings only, never user text)
- For static HTML, paste the inner elements directly. Define the set once; never mix in icons with other stroke widths.

## Ready icon geometry (inner elements for the 24x24 template above)
  menu            <path d="M3 6h18M3 12h18M3 18h18"/>
  x / close       <path d="M18 6L6 18M6 6l12 12"/>
  check           <path d="M20 6L9 17l-5-5"/>
  chevron-right   <path d="M9 18l6-6-6-6"/>
  chevron-left    <path d="M15 18l-6-6 6-6"/>
  chevron-down    <path d="M6 9l6 6 6-6"/>
  chevron-up      <path d="M18 15l-6-6-6 6"/>
  arrow-right     <path d="M5 12h14M12 5l7 7-7 7"/>
  arrow-left      <path d="M19 12H5M12 19l-7-7 7-7"/>
  search          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
  plus            <path d="M12 5v14M5 12h14"/>
  minus           <path d="M5 12h14"/>
  trash           <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  edit / pencil   <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
  heart           <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  star            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  user            <circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
  users           <circle cx="9" cy="7" r="4"/><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M16 3.13a4 4 0 0 1 0 7.75M23 21v-2a4 4 0 0 0-3-3.87"/>
  home            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>
  settings (gear) <circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/>
  sliders         <path d="M3 6h12M19 6h2M3 12h4M11 12h10M3 18h10M17 18h4"/><circle cx="17" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="18" r="2"/>
  mail            <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>
  phone (mobile)  <rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>
  calendar        <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
  clock           <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
  cart            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
  download        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
  upload          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
  external-link   <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
  sun             <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  moon            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  play            <path d="M5 3l14 9-14 9V3z"/>
  pause           <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
  info            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
  alert           <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>
  lock            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  eye             <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  copy            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  globe           <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  map-pin         <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
- Filled variants (active heart or star): same path with fill="currentColor" on that element.
- Need an icon not listed: build it from lines, circles and rects on the same 24 grid, 2px stroke, 2px inner padding.
  Brand logos (GitHub, Instagram...) are trademarks with exact shapes: use a text link or a neutral icon (globe, link)
  unless you have the official SVG.

## A simple logo / wordmark
- A mark (geometric shape with one letter or a simple symbol) + the name in a strong font. Two colors maximum.
  <a class="brand" href="index.html" aria-label="Northwind home">
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" style="fill: var(--accent)"/>
      <path d="M10 22V10l12 12V10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span>Northwind</span>
  </a>
  .brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 700; font-size: 18px; letter-spacing: -0.02em; color: var(--text); text-decoration: none; }
- Wordmark-only logo as SVG text (fonts must be loaded on the page; for a portable file convert text to paths in a design tool):
  <svg viewBox="0 0 200 40" role="img" aria-label="Lumen"><text x="0" y="30" font-family="Space Grotesk, sans-serif" font-size="32" font-weight="700" letter-spacing="-1" fill="currentColor">lumen<tspan fill="#7c3aed">.</tspan></text></svg>
- Other easy marks: two overlapping circles with mix-blend-mode: multiply, a rounded square cut by a diagonal line,
  a letter inside a ring, three stacked bars of different lengths. Keep it legible at 16px.

## SVG backgrounds, patterns and blobs
- Blob (decorative, behind a hero):
  <svg class="blob" viewBox="0 0 200 200" aria-hidden="true"><path style="fill: var(--accent)" opacity=".15" d="M152 46c22 22 32 58 18 86s-52 50-88 44S16 140 18 104 40 34 72 24s58 0 80 22z"/></svg>
  .blob { position: absolute; width: 520px; inset-inline-end: -120px; top: -80px; z-index: -1; filter: blur(8px); }
- Wave section divider:
  <svg viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden="true" style="display:block; width:100%; height:80px">
    <path style="fill: var(--surface)" d="M0 40C240 80 480 80 720 40S1200 0 1440 40V80H0z"/></svg>
- Pattern element (dots, grids, diagonals) inside an SVG:
  <svg width="100%" height="100%" aria-hidden="true"><defs><pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
    <circle cx="2" cy="2" r="1.5" fill="currentColor" opacity=".25"/></pattern></defs><rect width="100%" height="100%" fill="url(#dots)"/></svg>
- As a CSS background via a data URL: single quotes inside the SVG, # written as %23, < and > as %3C and %3E:
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cpath d='M0 24L24 0' stroke='%23e2e8f0'/%3E%3C/svg%3E");
- Gradients inside SVG: linearGradient with two stops of the palette; give ids that are unique per page.

## Favicon via SVG data URL
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%234f46e5'/%3E%3Ctext x='16' y='22' font-size='18' font-family='system-ui, sans-serif' font-weight='700' text-anchor='middle' fill='white'%3EN%3C/text%3E%3C/svg%3E">
- Or a file: <link rel="icon" href="favicon.svg" type="image/svg+xml">, plus an apple-touch-icon PNG (180x180) for iOS.
- Inside favicon.svg a media query can switch colors for dark browser UI: style element with @media (prefers-color-scheme: dark).
` });

  add({ id: "dark-mode", title: "LIGHT AND DARK THEMES",
    match: /\b(dark|light mode|light theme|themes?|theming|night|night mode|dark mode|color scheme)\b|כהה|מצב לילה|מצב כהה|ערכת נושא/i,
    text: `
## Token-based theming
- Components only ever use tokens (var(--bg), var(--text)...). A theme is just a different set of token values.
  If a component hard-codes a color, dark mode will break there.
- Light tokens on :root, dark tokens in two places: the system preference (when the user didn't choose) and the explicit choice.
  :root { color-scheme: light; --bg: #ffffff; --surface: #f8fafc; --surface-2: #f1f5f9; --text: #0f172a; --muted: #64748b;
          --border: #e2e8f0; --accent: #4f46e5; --accent-hover: #4338ca; --accent-contrast: #ffffff;
          --shadow: 0 1px 3px rgba(15,23,42,.08), 0 6px 16px rgba(15,23,42,.06); }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { color-scheme: dark; --bg: #0b0d12; --surface: #12151c; --surface-2: #1a1e27;
          --text: #e6e8ee; --muted: #9aa3b2; --border: #262b36; --accent: #818cf8; --accent-hover: #a5b4fc;
          --accent-contrast: #0b0d12; --shadow: 0 1px 2px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04); }
  }
  :root[data-theme="dark"] { (exactly the same dark values) }
- CSS cannot share one rule between a media query and a plain selector, so the two dark blocks must hold identical values.
  Keep them next to each other and edit both together — or use light-dark() below, which needs no copy.
- Modern alternative, one declaration per token: :root { color-scheme: light dark; --bg: light-dark(#ffffff, #0b0d12); }
  with :root[data-theme="light"] { color-scheme: light; } and :root[data-theme="dark"] { color-scheme: dark; }.
  light-dark() follows color-scheme, so the toggle and the system preference both work. Supported in current browsers.

## Designing the dark palette
- Not black: background #0b0d12 to #121418. Elevation is lighter, not darker: bg < surface < surface-2 < popovers.
- Text not pure white: #e6e8ee for body, #9aa3b2 for muted. Check 4.5:1 again — dark themes fail on muted text and borders.
- Accent gets lighter and slightly less saturated (indigo #4f46e5 becomes #818cf8); text on it usually becomes dark.
- Semantic colors: use the 400 shades (success #4ade80, danger #f87171, warning #fbbf24) on dark tinted backgrounds
  (color-mix(in srgb, #4ade80 12%, transparent)).
- Shadows barely show on dark: separate with 1px borders (rgba(255,255,255,.06–.1)) and lighter surfaces instead.
- Big saturated color blocks and gradients get toned down (lower opacity or darker stops) so they don't glare.
- color-scheme: dark makes native controls, scrollbars and form fields dark too. Set accent-color: var(--accent) for checkboxes.

## Images, SVG and media in dark mode
- Icons and logos drawn with currentColor adapt automatically. Prefer that for every SVG.
- Photos: slightly reduce brightness: [data-theme=dark] img:not(.no-dim) { filter: brightness(.9); }
- Screenshots and diagrams with white backgrounds: put them on a --surface card with padding and a border, or provide a dark version.
- Theme-specific images with a toggle: render both and hide one with CSS ([data-theme=dark] .only-light { display: none; }).
  <picture><source media="(prefers-color-scheme: dark)"> only follows the system, not your toggle.
- Charts: take colors from CSS variables (getComputedStyle(document.documentElement).getPropertyValue("--text")) and
  re-render when the theme changes.

## The toggle (persists in localStorage, data-theme on html)
- Avoid the flash of the wrong theme: this inline script goes in <head>, before the stylesheets, not in a module:
  <script>
    (function () {
      try {
        var saved = localStorage.getItem("theme");
        if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
      } catch (e) {}
    })();
  </script>
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0b0d12" media="(prefers-color-scheme: dark)">
- No saved choice means no data-theme, so the CSS media query follows the system and keeps following it live.
- The button (js/theme.js, with icon() from js/icons.js):
  <button class="btn-icon theme-toggle" type="button" aria-label="Switch to dark theme">(moon icon)</button>
  import { icon } from "./icons.js";
  const root = document.documentElement, btn = document.querySelector(".theme-toggle");
  const systemDark = matchMedia("(prefers-color-scheme: dark)");
  const current = () => root.dataset.theme || (systemDark.matches ? "dark" : "light");
  function apply(theme) {
    root.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch (e) {}
    sync();
  }
  function sync() {
    const dark = current() === "dark";
    btn.innerHTML = dark ? icon("sun") : icon("moon");
    btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    btn.setAttribute("aria-pressed", String(dark));
  }
  btn.addEventListener("click", () => apply(current() === "dark" ? "light" : "dark"));
  systemDark.addEventListener("change", sync);
  sync();
- Three-way choice (System / Light / Dark) for apps with settings: "system" removes the attribute
  (delete root.dataset.theme; localStorage.removeItem("theme")). Show it as a segmented control or a select.
- Smooth switch without animating every element: briefly add a class that transitions background-color and color on body
  only, or wrap the change in document.startViewTransition when supported. Never put transition: all on *.

## Theme checklist
- Toggle both ways and reload in each: no flash, choice remembered, system change followed when no choice saved.
- Every surface, border, input, dropdown, dialog, toast, code block and chart checked in dark.
- No hard-coded #fff or #000 in components (search the CSS for them).
- Focus rings visible in both themes; accent contrast checked in both.
` });
})();
