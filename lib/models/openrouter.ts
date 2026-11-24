import { OpenRouter } from "@openrouter/sdk";
import { z, type ZodType } from "zod";
import type { AuraConfig } from "@/cli/config";
import { modelIds, openrouterKey, reasoningEffort } from "@/cli/config";
import { md5Bytes } from "@/lib/md5-bytes";
import type { ModelProvider } from "@/lib/models/provider";
import { readModelCache, writeModelCache } from "@/vector/store";
import { SendChatCompletionRequestResponse } from "@openrouter/sdk/models/operations";

function chatText(response: SendChatCompletionRequestResponse): string {
  if (typeof response === "object" && response && "choices" in response) {
    const content = (
      response as { choices?: Array<{ message?: { content?: unknown } }> }
    ).choices?.[0]?.message?.content;

    if (typeof content === "string") return content;

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") return part;

          if (part && typeof part === "object" && "text" in part)
            return String(part.text ?? "");

          return "";
        })
        .join("");
    }
  }

  throw new Error("OpenRouter response was not text.");
}

function parseJson(text: string): unknown {
  const unwrapped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  return JSON.parse(unwrapped);
}

function jsonSchemaOf(schema: ZodType): Record<string, unknown> {
  const { $schema: _version, ...json } = z.toJSONSchema(schema) as Record<
    string,
    unknown
  >;
  return json;
}

/** Hashes a request so that the same request always maps to the same cache entry. */
function cacheKey(request: Record<string, unknown>): string {
  return md5Bytes(JSON.stringify(request));
}

/**
 * Creates a `ModelProvider` backed by OpenRouter, using the key from `aura.json` or
 * `OPENROUTER_API_KEY`. Throws when no key is set. Results are cached in the store at `cwd`,
 * keyed by the whole request (model, reasoning, prompts, schema, image), so an identical request
 * is answered from the cache. Structured completions are validated against the schema and
 * retried once on an invalid reply. An invalid reply is never cached.
 */
export function openRouterProvider(config: AuraConfig, cwd: string): ModelProvider {
  const apiKey = openrouterKey(config);
  if (!apiKey) {
    throw new Error(
      "Missing OpenRouter key. Set aura.json keys.openrouter or OPENROUTER_API_KEY.",
    );
  }
  const models = modelIds(config);
  const effort = reasoningEffort(config);
  // Applied to every chat call (not embeddings). Omitted when unset so the model default holds.
  const reasoning = effort ? { reasoning: { effort } } : {};
  const client = new OpenRouter({ apiKey, appTitle: "aura" });

  /** Returns the cached text for `key`, or runs `request` and caches its result. */
  async function cachedText(key: string, request: () => Promise<string>): Promise<string> {
    const hit = (await readModelCache(cwd, [key])).get(key);
    if (hit !== undefined) return hit;
    const value = await request();
    await writeModelCache(cwd, [{ key, value }]);
    return value;
  }

  /** Requests one vector per text, in input order. Throws when the counts do not match. */
  async function requestEmbeddings(texts: string[]): Promise<number[][]> {
    const body = await client.embeddings.generate({
      requestBody: { model: models.embedding, input: texts },
    });
    if (typeof body === "string")
      throw new Error("OpenRouter embeddings response was not JSON.");
    const vectors = (body.data ?? [])
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((item) => item.embedding)
      .filter((embedding): embedding is number[] => Array.isArray(embedding));
    if (vectors.length !== texts.length) {
      throw new Error("OpenRouter embedding count did not match inputs.");
    }
    return vectors;
  }

  return {
    async embed(texts) {
      if (texts.length === 0) return [];
      const keys = texts.map((text) =>
        cacheKey({ op: "embed", model: models.embedding, text }),
      );
      const hits = await readModelCache(cwd, keys);
      // Only texts without a cache entry go to the API; `missing` keeps their input order.
      const missing = texts.flatMap((text, index) =>
        hits.has(keys[index]!) ? [] : [{ text, key: keys[index]! }],
      );
      const fetched = missing.length > 0 ? await requestEmbeddings(missing.map((item) => item.text)) : [];
      await writeModelCache(
        cwd,
        missing.map((item, index) => ({ key: item.key, value: JSON.stringify(fetched[index]) })),
      );
      let next = 0;
      return keys.map((key) => {
        const hit = hits.get(key);
        return hit !== undefined ? (JSON.parse(hit) as number[]) : fetched[next++]!;
      });
    },

    async complete(system, user) {
      const key = cacheKey({ op: "complete", model: models.llm, effort, system, user });
      return cachedText(key, async () => {
        const response = await client.chat.send({
          chatRequest: {
            model: models.llm,
            stream: false,
            ...reasoning,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          },
        });
        return chatText(response);
      });
    },

    async completeStructured<T>(
      system: string,
      user: string,
      schema: ZodType<T>,
    ): Promise<T> {
      const jsonSchema = jsonSchemaOf(schema);
      const key = cacheKey({
        op: "structured",
        model: models.llm,
        effort,
        system,
        user,
        schema: jsonSchema,
      });
      // The cached value is the parsed reply, stored only after it passes the schema.
      const json = await cachedText(key, async () => {
        let lastError: unknown;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await client.chat.send({
              chatRequest: {
                model: models.llm,
                stream: false,
                ...reasoning,
                responseFormat: {
                  type: "json_schema",
                  jsonSchema: {
                    name: "output",
                    strict: true,
                    schema: jsonSchema,
                  },
                },
                messages: [
                  { role: "system", content: system },
                  { role: "user", content: user },
                ],
              },
            });
            return JSON.stringify(schema.parse(parseJson(chatText(response))));
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError instanceof Error
          ? lastError
          : new Error(String(lastError));
      });
      return schema.parse(JSON.parse(json));
    },

    async describeImage(bytes, mime, prompt) {
      const key = cacheKey({
        op: "describe",
        model: models.vlm,
        effort,
        mime,
        prompt,
        image: md5Bytes(bytes),
      });
      return cachedText(key, async () => {
        const url = `data:${mime};base64,${bytes.toBase64()}`;
        const response = await client.chat.send({
          chatRequest: {
            model: models.vlm,
            stream: false,
            ...reasoning,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  { type: "image_url", imageUrl: { url } },
                ],
              },
            ],
          },
        });
        return chatText(response);
      });
    },
  };
}
