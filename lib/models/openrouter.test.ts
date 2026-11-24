import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { z } from "zod";
import type { AuraConfig } from "@/cli/config";
import type { ModelProvider } from "@/lib/models/provider";

type Request = Record<string, any>;

const embeddingsGenerate = mock((_args: { requestBody: Request }) =>
  Promise.resolve<unknown>({ data: [] }),
);
const chatSend = mock((_args: { chatRequest: Request }) => Promise.resolve<unknown>({ choices: [] }));
const clientOptions = mock((_options: { apiKey: string }) => {});

mock.module("@openrouter/sdk", () => ({
  OpenRouter: class {
    embeddings = { generate: embeddingsGenerate };
    chat = { send: chatSend };
    constructor(options: { apiKey: string }) {
      clientOptions(options);
    }
  },
}));

// Imported after mock.module so the provider gets the mocked SDK client.
const { openRouterProvider } = await import("@/lib/models/openrouter");

const root = `${process.env.TEMP ?? process.env.TMPDIR ?? "/tmp"}/aura-provider-${crypto.randomUUID()}`;

const config: AuraConfig = {
  name: "test",
  paths: [],
  remote: "",
  keys: { openrouter: "test-key" },
  models: { llm: "llm-model", vlm: "vlm-model", embedding: "embed-model" },
};

// Each test gets its own store directory, so cached replies never leak between tests.
let dir: string;
let provider: ModelProvider;

beforeEach(() => {
  dir = `${root}/${crypto.randomUUID()}`;
  provider = openRouterProvider(config, dir);
  embeddingsGenerate.mockReset();
  chatSend.mockReset();
});

afterAll(async () => {
  // Windows keeps the SQLite file locked until unreferenced handles are collected.
  Bun.gc(true);
  await Bun.sleep(100);
  await Bun.$`rm -rf ${root}`.quiet().nothrow();
});

function chatReply(content: unknown) {
  return { choices: [{ message: { content } }] };
}

describe("openRouterProvider", () => {
  test("creates the client with the configured key", () => {
    expect(clientOptions.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ apiKey: "test-key" }),
    );
  });

  test("throws when no OpenRouter key is configured", () => {
    const saved = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      expect(() => openRouterProvider({ ...config, keys: { openrouter: "" } }, dir)).toThrow(
        "Missing OpenRouter key",
      );
    } finally {
      if (saved !== undefined) process.env.OPENROUTER_API_KEY = saved;
    }
  });
});

describe("reasoning", () => {
  test("sends the configured effort on every chat call", async () => {
    const reasoningProvider = openRouterProvider({ ...config, reasoning: "low" }, dir);

    chatSend.mockResolvedValueOnce(chatReply("hello"));
    await reasoningProvider.complete("s", "u");
    expect(chatSend.mock.calls[0]?.[0]?.chatRequest.reasoning).toEqual({ effort: "low" });

    chatSend.mockResolvedValueOnce(chatReply('{"name":"Ada"}'));
    await reasoningProvider.completeStructured("s", "u", z.object({ name: z.string() }));
    expect(chatSend.mock.calls[1]?.[0]?.chatRequest.reasoning).toEqual({ effort: "low" });

    chatSend.mockResolvedValueOnce(chatReply("a dog"));
    await reasoningProvider.describeImage(new Uint8Array([1]), "image/png", "describe");
    expect(chatSend.mock.calls[2]?.[0]?.chatRequest.reasoning).toEqual({ effort: "low" });
  });

  test("does not send reasoning to the embeddings API", async () => {
    const reasoningProvider = openRouterProvider({ ...config, reasoning: "low" }, dir);
    embeddingsGenerate.mockResolvedValueOnce({ data: [{ index: 0, embedding: [0.1] }] });
    await reasoningProvider.embed(["a"]);
    expect(embeddingsGenerate.mock.calls[0]?.[0]?.requestBody).not.toHaveProperty("reasoning");
  });

  test("omits reasoning when unset", async () => {
    chatSend.mockResolvedValueOnce(chatReply("hello"));
    await provider.complete("s", "u");
    expect(chatSend.mock.calls[0]?.[0]?.chatRequest).not.toHaveProperty("reasoning");
  });

  test("throws on an unknown reasoning value", () => {
    expect(() => openRouterProvider({ ...config, reasoning: "huge" as never }, dir)).toThrow(
      'Invalid reasoning "huge"',
    );
  });
});

describe("embed", () => {
  test("returns no vectors and skips the API for empty input", async () => {
    expect(await provider.embed([])).toEqual([]);
    expect(embeddingsGenerate).not.toHaveBeenCalled();
  });

  test("orders vectors by index to match the input order", async () => {
    embeddingsGenerate.mockResolvedValueOnce({
      data: [
        { index: 1, embedding: [0.2] },
        { index: 0, embedding: [0.1] },
      ],
    });
    expect(await provider.embed(["a", "b"])).toEqual([[0.1], [0.2]]);
    expect(embeddingsGenerate.mock.calls[0]?.[0]).toEqual({
      requestBody: { model: "embed-model", input: ["a", "b"] },
    });
  });

  test("throws when the embedding count does not match the inputs", async () => {
    embeddingsGenerate.mockResolvedValueOnce({ data: [{ index: 0, embedding: [0.1] }] });
    await expect(provider.embed(["a", "b"])).rejects.toThrow("embedding count did not match");
  });

  test("throws when the embeddings response is not JSON", async () => {
    embeddingsGenerate.mockResolvedValueOnce("<html>");
    await expect(provider.embed(["a"])).rejects.toThrow("not JSON");
  });
});

describe("complete", () => {
  test("returns the assistant text and sends the system and user messages", async () => {
    chatSend.mockResolvedValueOnce(chatReply("hello"));
    expect(await provider.complete("be brief", "hi")).toBe("hello");
    expect(chatSend.mock.calls[0]?.[0]?.chatRequest).toEqual({
      model: "llm-model",
      stream: false,
      messages: [
        { role: "system", content: "be brief" },
        { role: "user", content: "hi" },
      ],
    });
  });

  test("joins text parts when the content is an array", async () => {
    chatSend.mockResolvedValueOnce(chatReply([{ type: "text", text: "foo" }, "bar"]));
    expect(await provider.complete("s", "u")).toBe("foobar");
  });

  test("throws when the response has no text", async () => {
    chatSend.mockResolvedValueOnce({ choices: [] });
    await expect(provider.complete("s", "u")).rejects.toThrow("was not text");
  });
});

describe("completeStructured", () => {
  const shape = z.object({ name: z.string() });

  test("parses the reply against the schema and sends a strict json_schema", async () => {
    chatSend.mockResolvedValueOnce(chatReply('{"name":"Ada"}'));
    expect(await provider.completeStructured("s", "u", shape)).toEqual({ name: "Ada" });

    const responseFormat = chatSend.mock.calls[0]?.[0]?.chatRequest.responseFormat;
    expect(responseFormat).toMatchObject({
      type: "json_schema",
      jsonSchema: { name: "output", strict: true },
    });
    const schema = responseFormat.jsonSchema.schema;
    expect(schema).toMatchObject({ type: "object", required: ["name"] });
    expect(schema).not.toHaveProperty("$schema");
  });

  test("accepts a reply wrapped in a json code fence", async () => {
    chatSend.mockResolvedValueOnce(chatReply('```json\n{"name":"Ada"}\n```'));
    expect(await provider.completeStructured("s", "u", shape)).toEqual({ name: "Ada" });
  });

  test("retries once when the first reply is invalid", async () => {
    chatSend.mockResolvedValueOnce(chatReply("not json"));
    chatSend.mockResolvedValueOnce(chatReply('{"name":"Grace"}'));
    expect(await provider.completeStructured("s", "u", shape)).toEqual({ name: "Grace" });
    expect(chatSend).toHaveBeenCalledTimes(2);
  });

  test("throws after two replies that fail the schema", async () => {
    chatSend.mockResolvedValue(chatReply('{"name":42}'));
    await expect(provider.completeStructured("s", "u", shape)).rejects.toThrow();
    expect(chatSend).toHaveBeenCalledTimes(2);
  });
});

describe("describeImage", () => {
  test("sends the image as a base64 data URL with the prompt", async () => {
    chatSend.mockResolvedValueOnce(chatReply("a red circle"));
    const bytes = new TextEncoder().encode("hi");

    expect(await provider.describeImage(bytes, "image/png", "describe")).toBe("a red circle");
    expect(chatSend.mock.calls[0]?.[0]?.chatRequest).toEqual({
      model: "vlm-model",
      stream: false,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "describe" },
            { type: "image_url", imageUrl: { url: "data:image/png;base64,aGk=" } },
          ],
        },
      ],
    });
  });
});

describe("cache", () => {
  test("answers an identical complete call from the cache", async () => {
    chatSend.mockResolvedValueOnce(chatReply("hello"));
    expect(await provider.complete("s", "u")).toBe("hello");
    expect(await provider.complete("s", "u")).toBe("hello");
    expect(chatSend).toHaveBeenCalledTimes(1);
  });

  test("calls the API again when the reasoning effort changes", async () => {
    chatSend.mockResolvedValue(chatReply("hello"));
    await provider.complete("s", "u");
    await openRouterProvider({ ...config, reasoning: "low" }, dir).complete("s", "u");
    expect(chatSend).toHaveBeenCalledTimes(2);
  });

  test("caches a valid structured reply but not an invalid one", async () => {
    const shape = z.object({ name: z.string() });
    chatSend.mockResolvedValueOnce(chatReply("not json"));
    chatSend.mockResolvedValueOnce(chatReply('{"name":"Ada"}'));
    expect(await provider.completeStructured("s", "u", shape)).toEqual({ name: "Ada" });
    expect(await provider.completeStructured("s", "u", shape)).toEqual({ name: "Ada" });
    expect(chatSend).toHaveBeenCalledTimes(2);
  });

  test("embed sends only the texts that are not cached", async () => {
    embeddingsGenerate.mockResolvedValueOnce({ data: [{ index: 0, embedding: [0.1] }] });
    expect(await provider.embed(["a"])).toEqual([[0.1]]);

    embeddingsGenerate.mockResolvedValueOnce({ data: [{ index: 0, embedding: [0.3] }] });
    expect(await provider.embed(["a", "b"])).toEqual([[0.1], [0.3]]);
    expect(embeddingsGenerate.mock.calls[1]?.[0]?.requestBody.input).toEqual(["b"]);
  });

  test("describeImage caches by image bytes", async () => {
    chatSend.mockResolvedValue(chatReply("a red circle"));
    const bytes = new TextEncoder().encode("hi");
    await provider.describeImage(bytes, "image/png", "describe");
    await provider.describeImage(bytes, "image/png", "describe");
    expect(chatSend).toHaveBeenCalledTimes(1);

    await provider.describeImage(new TextEncoder().encode("yo"), "image/png", "describe");
    expect(chatSend).toHaveBeenCalledTimes(2);
  });
});
