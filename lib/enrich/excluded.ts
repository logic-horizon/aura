import type { AuraConfig } from "@/cli/config";

/**
 * Returns true when a path has a segment equal to an excluded name (such as `node_modules`),
 * or starts with an excluded directory.
 */
export function excluded(path: string, config: AuraConfig): boolean {
  const parts = path.split(/[\\/]/);
  return (config.exclude ?? []).some((item) => parts.includes(item) || path.startsWith(`${item}/`));
}
