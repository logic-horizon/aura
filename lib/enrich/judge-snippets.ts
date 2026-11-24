import { judgeSchema } from "@/schema/judge";
import type { ModelProvider } from "@/lib/models";
import type { Progress } from "@/lib/enrich/types";

const BATCH = 12;

const SYSTEM = `You pick high-signal snippets for a personal Aura profile.
Keep snippets that inform identity, principles and ethics, expertise, career, spoken voice, or any category: code, write, create, work (including how the user learns), communicate. Keep concrete context.
Drop licenses, tables of contents, navigation, page furniture, repeated headers, and empty boilerplate.
Return JSON { "keep": [indices] } using 0-based indices from the numbered list. No PII.`;

/**
 * Asks the LLM to keep only the high-signal snippets for the profile, in batches of 12.
 * Returns only the snippets the model keeps. `label` prefixes progress messages.
 */
export async function judgeSnippets(
  provider: ModelProvider,
  snippets: string[],
  onProgress?: Progress,
  label = "",
): Promise<string[]> {
  if (snippets.length === 0) return [];
  const kept: string[] = [];
  const batches = Math.ceil(snippets.length / BATCH);
  for (let offset = 0; offset < snippets.length; offset += BATCH) {
    const batch = snippets.slice(offset, offset + BATCH);
    const index = offset / BATCH + 1;
    onProgress?.({
      stage: "judge",
      detail: `${label} batch ${index}/${batches}`.trim(),
      done: index - 1,
      total: batches,
    });
    const listed = batch.map((text, item) => `[${item}] ${text}`).join("\n\n");
    const result = await provider.completeStructured(SYSTEM, listed, judgeSchema);
    const indices = new Set(
      result.keep.filter((item) => Number.isInteger(item) && item >= 0 && item < batch.length),
    );
    for (const item of indices) {
      const snippet = batch[item];
      if (snippet) kept.push(snippet);
    }
  }
  return kept;
}
