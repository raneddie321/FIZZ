/* Fizz Code and WhatsApp: a message the user sends from their own WhatsApp.
     <fizz-whatsapp to="+972501234567" name="Barber Shop">Hi, …</fizz-whatsapp>
   WhatsApp has no way for a website to send from someone's personal account, so FIZZ prepares the message and shows a
   "Send in WhatsApp" button (wa.me): it opens the chat with the text filled in, and the user presses Send. Nothing is
   sent by FIZZ itself. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const esc = F.esc;

  /** A phone number as wa.me wants it: digits with the country code. Israeli local numbers (05x…) get 972. */
  function waNumber(raw) {
    let d = String(raw || "").replace(/[^\d+]/g, "");
    if (d.startsWith("+")) d = d.slice(1);
    else if (d.startsWith("00")) d = d.slice(2);
    else if (/^0[2-9]\d{7,8}$/.test(d)) d = "972" + d.slice(1);
    d = d.replace(/\D/g, "");
    return /^\d{8,15}$/.test(d) ? d : "";
  }
  const link = (num, text) => `https://wa.me/${num}?text=${encodeURIComponent(text)}`;

  F.agentTools.register("whatsapp", {
    icon: "send", feedback: true,
    label: (t) => `WhatsApp message for ${t.attrs.name || t.attrs.to || "…"}`,
    summary: (k) => `prepared ${k} WhatsApp message${k === 1 ? "" : "s"}`,
    prompt: [
      '<fizz-whatsapp to="+972501234567" name="who it is">the message</fizz-whatsapp> prepares a WhatsApp message from the user\'s own WhatsApp:',
      'FIZZ shows a "Send in WhatsApp" button that opens the chat with your text filled in, and the user presses Send. You cannot send it yourself.',
      "One tag per recipient. Use the number with its country code. Write in the recipient's language, as the user, short and polite.",
      "Finding businesses to contact (e.g. barbershops in a city): search with <fizz-search>, read their pages or listings with <fizz-fetch>, and use only phone numbers and emails you actually found — never guess one.",
      "Show the user the list (name, phone or email, where you found it) and the message, and prepare messages only for the people they asked for: no mass messaging to people who didn't ask to hear from them.",
    ].join("\n"),
    async run(t) {
      const num = waNumber(t.attrs.to);
      const text = String(t.body || t.attrs.text || "").trim();
      if (!num) return { ok: false, text: `“${t.attrs.to || ""}” isn't a phone number WhatsApp can open. Give it with the country code, e.g. +972501234567.` };
      if (!text) return { ok: false, text: "The message is empty." };
      return { ok: true, text: `Ready: a "Send in WhatsApp" button for ${t.attrs.name || "+" + num}. The user presses it and then Send in WhatsApp.`, wa: { num, text, name: String(t.attrs.name || "").slice(0, 80) } };
    },
    card(t) {
      const w = t.result?.wa;
      if (!w) return "";
      return `<div class="wa-card"><div class="wa-head"><b>${esc(w.name || "+" + w.num)}</b><small>+${esc(w.num)}</small></div><p class="wa-text">${esc(w.text)}</p><a class="btn wa-send" href="${esc(link(w.num, w.text))}" target="_blank" rel="noopener">Send in WhatsApp</a></div>`;
    },
  });

  F.whatsapp = { waNumber, link };
})();
