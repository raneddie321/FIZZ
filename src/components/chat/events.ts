"use client";

export const CONVERSATIONS_CHANGED = "fizz:conversations-changed";

export function notifyConversationsChanged(detail?: { id?: string; title?: string }) {
  window.dispatchEvent(new CustomEvent(CONVERSATIONS_CHANGED, { detail }));
}
