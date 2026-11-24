const ALLOWED = new Set([".md", ".pdf", ".png", ".jpg", ".jpeg", ".webp"]);
const ARCHIVE = new Set([".zip", ".gz", ".7z", ".rar", ".tgz"]);

const SIZE = {
  ".md": 2 * 1024 * 1024,
  ".pdf": 10 * 1024 * 1024,
  ".png": 8 * 1024 * 1024,
  ".jpg": 8 * 1024 * 1024,
  ".jpeg": 8 * 1024 * 1024,
  ".webp": 8 * 1024 * 1024,
};

/** Maximum number of characters accepted from one PDF's extracted text. */
export const EXTRACT_TEXT_CAP = 20 * 1024 * 1024;

/** How a sanitized file is read: Markdown text, PDF text, or an image to describe. */
export type FileKind = "md" | "pdf" | "image";

function extOf(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot).toLowerCase();
}

function startsWith(bytes: Uint8Array, ascii: string): boolean {
  const expect = new TextEncoder().encode(ascii);
  if (bytes.length < expect.length) return false;
  return expect.every((value, index) => bytes[index] === value);
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[1] === 0x8b && bytes[0] === 0x1f;
}

function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 1024));
  let zeros = 0;
  for (const value of sample) if (value === 0) zeros += 1;
  return zeros > 8;
}

function kindFromExt(ext: string): FileKind | null {
  if (ext === ".md") return "md";
  if (ext === ".pdf") return "pdf";
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") return "image";
  return null;
}

function magicMatches(kind: FileKind, ext: string, bytes: Uint8Array): boolean {
  if (kind === "pdf") return startsWith(bytes, "%PDF");
  if (kind === "image") {
    if (ext === ".png") return bytes.length >= 4 && bytes[0] === 0x89 && startsWith(bytes.subarray(1), "PNG");
    if (ext === ".jpg" || ext === ".jpeg") {
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    }
    if (ext === ".webp") {
      return startsWith(bytes, "RIFF") && bytes.length >= 12 && startsWith(bytes.subarray(8), "WEBP");
    }
  }
  if (kind === "md") {
    if (looksBinary(bytes) || startsWith(bytes, "%PDF")) return false;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Returns the file kind for a supported extension, or null for any other path. */
export function classifyPath(path: string): FileKind | null {
  return kindFromExt(extOf(path));
}

/** Returns the MIME type for an image path by extension. Unknown extensions map to `image/jpeg`. */
export function imageMime(path: string): string {
  const ext = extOf(path);
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

/**
 * Checks a file before it is read into memory: allowed extension, within the size cap, not empty,
 * not an archive or gzip payload, magic bytes match the extension, and not an encrypted PDF.
 * Returns the kind and bytes, or the reason the file was skipped.
 */
export async function sanitizeFile(absPath: string): Promise<{ kind: FileKind; bytes: Uint8Array } | string> {
  const ext = extOf(absPath);
  if (ARCHIVE.has(ext) || !ALLOWED.has(ext)) return "extension not allowed";
  const file = Bun.file(absPath);
  if (!(await file.exists())) return "missing";
  const size = file.size;
  if (size <= 0) return "empty";
  const cap = SIZE[ext as keyof typeof SIZE];
  if (size > cap) return "too large";
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isZip(bytes) || isGzip(bytes)) return "archive or compressed payload";
  const kind = kindFromExt(ext);
  if (!kind) return "unknown type";
  if (!magicMatches(kind, ext, bytes)) return "content does not match extension";
  if (kind === "pdf") {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 8192)));
    if (/\/Encrypt\b/.test(head)) return "encrypted PDF";
  }
  return { kind, bytes };
}
