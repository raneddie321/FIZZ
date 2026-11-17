# FIZZ Payment Vault — security design

## Product intent

Provide a user-managed payment-method area and a browser-assisted checkout flow. A saved payment credential must never enter FIZZ prompts, agent tool arguments/results, cloud browser snapshots, logs, project files, or the FIZZ server.

## Hard security boundary

A normal web application cannot safely promise universal autofill on every website. Cross-origin iframe isolation, CSP, browser permission models, anti-bot controls, 3-D Secure, issuer challenges, and site-specific checkout behavior can block automation. Do not bypass those controls.

For broad website support, the product must be a separately distributed, locally running browser extension with a privileged autofill component. It should have access only to explicitly selected payment fields in the active top-level tab, after a user gesture, and must not expose card values through extension messaging, content-script DOM events, page scripts, telemetry, or browser-agent APIs.

## Recommended architecture

1. Use a payment vault provider with a PCI-compliant hosted setup flow and tokenization (for example, a provider-supported wallet/card vault). The provider, not FIZZ, stores PAN/CVC. FIZZ stores only provider customer/payment-method references and display metadata such as brand, last four digits, and expiry month/year.
2. The FIZZ cloud server may create a hosted setup session and persist non-sensitive provider references, but must never receive raw card data or CVC.
3. The browser extension may request a single-use autofill capability from the user-facing local vault UI. Unlock with OS/browser secure storage and user presence. No API that returns PAN/CVC to the FIZZ website, chat, remote browser, or AI agent.
4. User picks a saved card and explicitly confirms merchant, total, currency, and top-level HTTPS origin. A second confirmation is required for each checkout submission. No unattended/recurring purchases.
5. The local extension fills only recognized payment fields in the active tab. It must avoid sending field values or card-shaped input events back to FIZZ, block DOM snapshots of sensitive controls, and stop on cross-origin/payment iframe ambiguity or 3-D Secure / issuer challenge. User completes those steps directly.
6. Never auto-click the final "Pay", "Place order", or equivalent control. The user manually reviews and submits directly on the merchant page.
7. Allow users to remove stored payment methods and revoke local vault access. Provide audit metadata without card data.

## Current implementation status

This document is a design boundary only. The repository currently has no browser extension, no provider-backed card setup/customer flow, and no end-to-end local vault. The existing `pay` browser handoff is a manual secure-checkout handoff and must remain available as the safe fallback.

## Explicit non-goals

- No storing raw card number, CVC, PIN, passwords, or banking credentials in the FIZZ database, localStorage, IndexedDB synced to cloud, chat, tool calls, or logs.
- No remote/cloud-browser payment autofill.
- No bypassing CAPTCHAs, issuer verification, 3-D Secure, or merchant anti-automation systems.
- No claim that every website is supported.
- No automated final payment submission or agent-initiated payment.
