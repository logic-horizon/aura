import { redactText } from "@/lib/redact-text";
import { getProvider } from "@/lib/models";
import { EMBEDDING_DIM, openStore } from "@/vector/store";
import type { SearchResult } from "@/lib/enrich/types";

const COUNT_VEC = "SELECT count(*) AS count FROM vec_chunks";
const COUNT_IMAGE = "SELECT count(*) AS n FROM chunks WHERE kind = 'image'";
// Image chunks are never returned: they feed the profile and novelty checks only.
const SEARCH_VEC = `SELECT c.content, c.kind, v.distance
  FROM vec_chunks v JOIN chunks c ON c.id = v.chunk_id
  WHERE v.embedding MATCH ? AND k = ? AND c.kind IS NOT 'image'`;
const SEARCH_TEXT = "SELECT content, kind FROM chunks WHERE kind IS NOT 'image' AND (";
const TEXT_MATCH = "lower(content) LIKE ?";

function lexicalSql(termCount: number): string {
  return `${SEARCH_TEXT}${Array.from({ length: termCount }, () => TEXT_MATCH).join(" OR ")}) LIMIT ?`;
}

/**
 * Searches memory for `query`, returning at most `limit` PII-redacted results. Uses vector search
 * when memory has vectors and the query embeds, and a case-insensitive keyword match otherwise.
 */
export async function searchMemory(
  cwd: string,
  query: string,
  limit = 5,
): Promise<SearchResult[]> {
  const store = openStore(cwd);
  try {
    const count = store.sqlite.prepare(COUNT_VEC).get() as { count: number };
    let queryVector: number[] | null = null;
    if (count.count > 0) {
      try {
        queryVector =
          (await (await getProvider(cwd)).embed([query]))[0] ?? null;
      } catch {
        queryVector = null;
      }
    }
    if (queryVector && queryVector.length === EMBEDDING_DIM) {
      const vector = new Uint8Array(new Float32Array(queryVector).buffer);
      // Over-fetch by the image count so filtering out image chunks still leaves `limit` results.
      const imageCount = (store.sqlite.prepare(COUNT_IMAGE).get() as { n: number }).n;
      const rows = store.sqlite
        .prepare(SEARCH_VEC)
        .all(vector, limit + imageCount) as SearchResult[];
      return rows.slice(0, limit).map((row) => ({ ...row, content: redactText(row.content) }));
    }
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    const rows = store.sqlite
      .prepare(lexicalSql(terms.length))
      .all(...terms.map((term) => `%${term}%`), limit) as SearchResult[];
    return rows.map((row) => ({ ...row, content: redactText(row.content) }));
  } finally {
    store.sqlite.close();
  }
}
