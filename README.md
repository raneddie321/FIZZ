# FIZZ & FIZZ DEV — by RANEDDIE

This repository contains two builds.

## 1. `static-site/` — ready for Netlify Drop

A complete static website: home, product pages, pricing, FAQ, contact, terms, privacy,
RANEDDIE ID sign-up / sign-in, **FIZZ chat** (`chat.html`) and **FIZZ DEV** (`dev.html`).

- Deploy: drag `deploy/fizz-netlify-drop.zip` onto https://app.netlify.com/drop
- Accounts, chats and projects are stored in each visitor's browser (passwords hashed with PBKDF2).
- AI answers need an Anthropic API key, entered in **Settings → AI**. It is stored only in the browser.
- The contact form uses Netlify Forms (enable form detection in the Netlify site settings).
- After editing page content, regenerate the public pages: `python3 scripts/build-static-pages.py`

## 2. Full platform (Next.js) — `src/`, `prisma/`

Server-based version with PostgreSQL, server-side sessions, email verification, 2FA,
server-held AI keys and the FIZZ DEV backend. Needs a Node host + PostgreSQL (e.g. Vercel + Neon).

```bash
npm install
# create .env with DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY, ANTHROPIC_API_KEY
npx prisma migrate deploy && npm run db:seed
npm run dev
```
