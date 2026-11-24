// Calls the real OpenRouter API. Runs only with AURA_LIVE=1 and OPENROUTER_API_KEY set.
// Costs a few cheap requests per run: bun run test:live
import { beforeAll, describe, expect, test } from "bun:test";
import { z } from "zod";
import { defaultConfig } from "@/cli/config";
import { openRouterProvider } from "@/lib/models/openrouter";
import type { ModelProvider } from "@/lib/models/provider";
import { EMBEDDING_DIM } from "@/vector/schema";

const TIMEOUT = 30_000;

// 1x1 transparent PNG.
const TINY_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (char) => char.charCodeAt(0),
);

describe.skipIf(process.env.AURA_LIVE !== "1")("OpenRouter live API", () => {
  let provider: ModelProvider;

  beforeAll(() => {
    // Throws when the key is missing, so an explicit live run fails instead of skipping.
    // A fresh store directory keeps cached responses from hiding a real API call.
    provider = openRouterProvider(defaultConfig, `${process.env.TEMP ?? process.env.TMPDIR ?? "/tmp"}/aura-live-${crypto.randomUUID()}`);
  });

  test(
    "embed returns one full-size vector per input",
    async () => {
      const vectors = await provider.embed(["taste memory", "short notes"]);
      expect(vectors).toHaveLength(2);
      for (const vector of vectors) {
        expect(vector).toHaveLength(EMBEDDING_DIM);
        expect(vector.every(Number.isFinite)).toBe(true);
      }
    },
    TIMEOUT,
  );

  test(
    "complete returns a non-empty reply",
    async () => {
      const reply = await provider.complete(
        "Answer in one word.",
        "What color is the sky on a clear day?",
      );
      expect(reply.trim().length).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  test(
    "completeStructured returns JSON that matches the schema",
    async () => {
      const shape = z.object({ color: z.string() });
      const result = await provider.completeStructured(
        "Reply with JSON only.",
        "Name one primary color.",
        shape,
      );
      expect(result.color.trim().length).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  test(
    "describeImage describes a tiny image",
    async () => {
      const description = await provider.describeImage(
        TINY_PNG,
        "image/png",
        "Describe this image in a few words.",
      );
      expect(description.trim().length).toBeGreaterThan(0);
    },
    TIMEOUT,
  );
});
