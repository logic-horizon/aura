import type { ModelProvider } from "@/lib/models";
import type { Chunk } from "@/vector/store";

/**
 * Embeds snippets into memory chunks of the given kind, one vector per snippet in input order.
 * Returns an empty list for no snippets.
 */
export async function embed(
  provider: ModelProvider,
  snippets: string[],
  kind: "memory" | "image" = "memory",
): Promise<Chunk[]> {
  if (snippets.length === 0) return [];
  const vectors = await provider.embed(snippets);
  return snippets.map((content, index) => ({
    content,
    kind,
    embedding: vectors[index] ?? [],
  }));
}
