# FIZZ Local Browser Companion

## What is included in this first scaffold

- A separate Electron desktop application under `local-browser/`.
- Chromium-powered local tabs, independent of Vercel Sandbox and Browserbase.
- A loopback-only HTTP server bound to `127.0.0.1`, with short-lived pairing code and a per-launch random token.
- A narrow command surface for navigation, tab management, read-only page summaries, back/forward/reload/scroll, and a small set of low-risk clicks.
- Password, card, payment and sensitive fields are redacted before text is returned to the local app UI.

## Explicit limitations

This scaffold is not yet connected to the FIZZ DEV web app. It must not be advertised as a working local-browser mode until pairing/authentication, native messaging or an equally strong cross-origin local bridge is completed and security-tested. A hosted HTTPS page cannot be assumed to access a user's localhost service; browser mixed-content/private-network access restrictions and CORS differ by browser and must be handled explicitly.

The scaffold intentionally rejects typing, secret autofill, page scripts and payment actions. It does not store payment credentials and does not submit orders.

## Next engineering steps

1. Complete authenticated pairing between the desktop companion and FIZZ DEV with one-time nonce, short-lived session, origin checks, CSRF protection, replay prevention and revocation. Prefer a native messaging bridge or browser extension where available rather than broad localhost CORS.
2. Add an explicit user-controlled Local / Cloud / Ask mode in FIZZ DEV. Local mode must fail closed if the companion is offline; it must never silently fall back to cloud for a task containing login or payment credentials.
3. Move browser tools to a strict allowlist. Do not expose page scripting, hidden DOM inspection, password/card field values, clipboard contents, cookies or local files to the remote model.
4. Add a local-only vault UI protected by OS user-presence authentication / secure storage. FIZZ cloud and the AI receive only labels and opaque references.
5. Integrate an approved payment-method vault provider using hosted card collection / tokenization. Keep raw PAN and CVC out of the FIZZ server, Electron renderer, content scripts, agent messages, logs, screenshots and telemetry. Provider vault storage must be the actual card store.
6. Require user confirmation for the exact merchant, URL origin, amount and currency for every checkout. Never let the agent click the final payment submission, and hand off for 3-D Secure, CAPTCHAs, or issuer challenges.
7. Run Electron security review (sandboxed renderer, context isolation, no Node integration, restrictive CSP, signed updates, dependency review), tests for secret redaction, IPC and origin rejection, then package/sign Windows, macOS and Linux installers.

## Safety model

The remote model may ask the local companion to navigate and read non-sensitive visible page information. It cannot access secret values or invoke payment. Local autofill, if built later, must be a separate user-initiated capability that never returns values to the agent. The user alone reviews and submits the final payment on the merchant site.

This companion is an early scaffold, not a certified password manager or PCI DSS payment application.
