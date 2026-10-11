/** Normalizes and validates a project-relative file path. Returns null if unsafe. */
export function normalizeProjectPath(input: string): string | null {
  if (typeof input !== "string") return null;
  let p = input.trim().replace(/\\/g, "/");
  while (p.startsWith("./")) p = p.slice(2);
  p = p.replace(/^\/+/, "").replace(/\/{2,}/g, "/").replace(/\/$/, "");
  if (!p || p.length > 400) return null;
  const parts = p.split("/");
  for (const part of parts) {
    if (!part || part === "." || part === "..") return null;
    if (part.length > 120) return null;
    // Printable characters only; no control characters.
    if (/[\u0000-\u001f\u007f<>:"|?*]/.test(part)) return null;
  }
  return parts.join("/");
}

export function dirname(path: string) {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function basename(path: string) {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

export function extname(path: string) {
  const b = basename(path);
  const i = b.lastIndexOf(".");
  return i <= 0 ? "" : b.slice(i + 1).toLowerCase();
}

export type TreeNode = { name: string; path: string; type: "file" | "dir"; size?: number; children?: TreeNode[] };

/** Builds a sorted folder tree from flat file paths. Folders are implied by file paths. */
export function buildTree(files: { path: string; size: number }[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", type: "dir", children: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");
      node.children ??= [];
      let child = node.children.find((c) => c.name === part && c.type === (isFile ? "file" : "dir"));
      if (!child) {
        child = isFile ? { name: part, path, type: "file", size: f.size } : { name: part, path, type: "dir", children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (n: TreeNode) => {
    n.children?.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    n.children?.forEach(sort);
  };
  sort(root);
  return root.children ?? [];
}
