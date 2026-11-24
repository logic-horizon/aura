import { md5Bytes } from "@/lib/md5-bytes";

/**
 * Returns the MD5 of a project-relative path with backslashes changed to forward slashes,
 * so the same file hashes the same on every OS.
 */
export function pathHash(relative: string): string {
  return md5Bytes(relative.replace(/\\/g, "/"));
}
