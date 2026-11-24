import { requireConfig } from "@/cli/config";
import { openRouterProvider } from "@/lib/models/openrouter";
import type { ModelProvider } from "@/lib/models/provider";

export type { ModelProvider } from "@/lib/models/provider";

/**
 * Loads the project's `aura.json` and returns the OpenRouter-backed model provider. Its responses
 * are cached in the project's store. Throws when `aura.json` is missing or no OpenRouter key is set.
 */
export async function getProvider(cwd: string): Promise<ModelProvider> {
  return openRouterProvider(await requireConfig(cwd), cwd);
}
