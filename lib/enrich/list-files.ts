import type { AuraConfig } from "@/cli/config";
import { classifyPath } from "@/lib/sanitize";
import { excluded } from "@/lib/enrich/excluded";

/**
 * Returns the sorted, de-duplicated relative paths of supported files that match the configured
 * glob patterns and are not excluded.
 */
export async function listFiles(cwd: string, config: AuraConfig): Promise<string[]> {
  const files = new Set<string>();
  for (const pattern of config.paths) {
    const glob = new Bun.Glob(pattern);
    for await (const path of glob.scan({ cwd, onlyFiles: true })) {
      if (!excluded(path, config) && classifyPath(path)) files.add(path);
    }
  }
  return [...files].sort();
}
