import type { ModelProvider } from "@/lib/models";
import { EMBEDDING_DIM, openStore } from "@/vector/store";

const SIMILARITY = 0.35;
const COUNT_VEC = "SELECT count(*) AS count FROM vec_chunks";
const NEAREST = "SELECT distance FROM vec_chunks WHERE embedding MATCH ? AND k = 1";

/**
 * Keeps the snippets whose nearest stored memory vector is at least `SIMILARITY` (0.35) away.
 * Returns every snippet when memory is empty.
 */
export async function excludeSimilar(
  cwd: string,
  provider: ModelProvider,
  snippets: string[],
): Promise<string[]> {
  if (snippets.length === 0) return [];
  const store = openStore(cwd);
  try {
    const count = store.sqlite.prepare(COUNT_VEC).get() as { count: number };
    if (count.count === 0) return snippets;
    const kept: string[] = [];
    for (const snippet of snippets) {
      const [vector] = await provider.embed([snippet]);
      if (!vector || vector.length !== EMBEDDING_DIM) continue;
      const packed = new Uint8Array(new Float32Array(vector).buffer);
      const row = store.sqlite.prepare(NEAREST).get(packed) as { distance?: number } | undefined;
      if (row?.distance == null || row.distance >= SIMILARITY) kept.push(snippet);
    }
    return kept;
  } finally {
    store.sqlite.close();
  }
}
