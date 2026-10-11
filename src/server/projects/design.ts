import "server-only";
import { parse, type DefaultTreeAdapterMap } from "parse5";

type Element = DefaultTreeAdapterMap["element"];
type Node = DefaultTreeAdapterMap["node"];

export type DesignChange = {
  style?: Record<string, string | null>;
  attributes?: Record<string, string | null>;
  text?: string;
};

export class DesignEditError extends Error {}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

function isElement(n: Node): n is Element {
  return "tagName" in n && typeof (n as Element).tagName === "string";
}

function elementChildren(el: { childNodes: Node[] }): Element[] {
  return el.childNodes.filter(isElement);
}

/** Finds the element at `path` (element-child indices starting below <html>). */
export function locateElement(html: string, path: number[]): Element {
  const doc = parse(html, { sourceCodeLocationInfo: true });
  const root = elementChildren(doc).find((e) => e.tagName === "html");
  if (!root) throw new DesignEditError("The document has no <html> element.");
  let el: Element = root;
  for (const idx of path) {
    // <template> content lives in a separate fragment.
    const container = el.tagName === "template" && "content" in el ? (el as unknown as { content: { childNodes: Node[] } }).content : el;
    const next = elementChildren(container)[idx];
    if (!next) throw new DesignEditError("That element no longer exists in the source file. It may have been created by a script.");
    el = next;
  }
  return el;
}

export function camelToKebab(prop: string) {
  if (prop.startsWith("--")) return prop;
  return prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

export function parseStyle(style: string): Map<string, string> {
  const map = new Map<string, string>();
  // Split on semicolons that aren't inside parentheses or quotes (e.g. url(data:...;base64)).
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  const flush = () => {
    const i = current.indexOf(":");
    if (i > 0) {
      const key = current.slice(0, i).trim().toLowerCase();
      const value = current.slice(i + 1).trim();
      if (key && value) map.set(key, value);
    }
    current = "";
  };
  for (const ch of style) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      flush();
      continue;
    }
    current += ch;
  }
  flush();
  return map;
}

export function serializeStyle(map: Map<string, string>) {
  return [...map.entries()].map(([k, v]) => `${k}: ${v}`).join("; ");
}

function escapeAttr(v: string) {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeText(v: string) {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const SAFE_VALUE = /^[^<>{}]*$/;

/**
 * Applies a visual edit to the source HTML and returns the new document text.
 * Only the element's start tag (and, for text edits, its inner text) are rewritten;
 * the rest of the file is preserved byte-for-byte.
 */
export function applyDesignChange(html: string, path: number[], expectedTag: string, change: DesignChange): string {
  const el = locateElement(html, path);
  if (el.tagName !== expectedTag.toLowerCase()) {
    throw new DesignEditError(`The selected <${expectedTag}> doesn't match the source (found <${el.tagName}>). Reload the preview and try again.`);
  }
  const loc = el.sourceCodeLocation;
  if (!loc?.startTag) throw new DesignEditError(`This <${el.tagName}> is generated implicitly by the browser and can't be edited directly. Edit its parent instead.`);

  let out = html;

  if (change.text !== undefined) {
    if (elementChildren(el).length > 0) throw new DesignEditError("Text can only be edited on elements that contain text only.");
    if (VOID.has(el.tagName)) throw new DesignEditError(`<${el.tagName}> can't contain text.`);
    if (!loc.endTag) throw new DesignEditError("This element has no closing tag in the source, so its text can't be edited safely.");
    out = out.slice(0, loc.startTag.endOffset) + escapeText(change.text) + out.slice(loc.endTag.startOffset);
  }

  if (change.style || change.attributes) {
    const attrs = el.attrs.map((a) => ({ name: a.name, value: a.value }));
    const set = (name: string, value: string | null) => {
      const i = attrs.findIndex((a) => a.name === name);
      if (value === null) {
        if (i !== -1) attrs.splice(i, 1);
      } else if (i === -1) attrs.push({ name, value });
      else attrs[i]!.value = value;
    };
    for (const [name, value] of Object.entries(change.attributes ?? {})) {
      const n = name.toLowerCase();
      if (!/^[a-z_:][a-z0-9_:.-]*$/.test(n)) throw new DesignEditError(`"${name}" is not a valid attribute name.`);
      if (n.startsWith("on")) throw new DesignEditError("Event handler attributes can't be set from the design editor.");
      if (n === "style") continue;
      set(n, value);
    }
    if (change.style) {
      const styles = parseStyle(attrs.find((a) => a.name === "style")?.value ?? "");
      for (const [prop, value] of Object.entries(change.style)) {
        const key = camelToKebab(prop);
        if (!/^-{0,2}[a-z][a-z0-9-]*$/.test(key)) throw new DesignEditError(`"${prop}" is not a valid CSS property.`);
        if (value === null || value.trim() === "") styles.delete(key);
        else if (!SAFE_VALUE.test(value)) throw new DesignEditError(`The value for ${key} contains characters that aren't allowed.`);
        else styles.set(key, value.trim());
      }
      set("style", styles.size ? serializeStyle(styles) : null);
    }
    const original = html.slice(loc.startTag.startOffset, loc.startTag.endOffset);
    const selfClosing = /\/\s*>$/.test(original);
    const tagName = original.match(/^<([^\s/>]+)/)?.[1] ?? el.tagName;
    const rebuilt = `<${tagName}${attrs.map((a) => ` ${a.name}="${escapeAttr(a.value)}"`).join("")}${selfClosing ? " />" : ">"}`;
    out = out.slice(0, loc.startTag.startOffset) + rebuilt + out.slice(loc.startTag.endOffset);
  }

  return out;
}
