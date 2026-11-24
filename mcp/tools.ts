import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { redactText } from "@/lib/redact-text";
import { redactValue } from "@/lib/redact-value";
import { getProfile, searchMemory } from "@/lib/enrich";
import { CATEGORY_NAMES, type Profile } from "@/schema/profile";
import { saveMemory, storeStats } from "@/vector/store";

type CategoryName = (typeof CATEGORY_NAMES)[number];

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

/**
 * The profile slice a client needs for one use category: identity, principles, expertise, career,
 * and the spoken-voice brief on every call, plus that category's entry only.
 */
function styleGuidelines(profile: Profile, category: CategoryName): unknown {
  return {
    identity: profile.identity,
    principles: profile.principles,
    expertise: profile.expertise,
    career: profile.career,
    voice: profile.voice,
    [category]: profile[category],
  };
}

/** Most cached results kept at once. The cache is cleared when it is full. */
const CACHE_LIMIT = 100;

/** Cached tool results, keyed by tool and arguments. Each entry is valid for one store fingerprint. */
const cache = new Map<string, { fingerprint: string; value: unknown }>();

/**
 * Summarizes the store state for the cache. It changes when `aura enrich` writes a profile or
 * memory, including writes made by another process.
 */
async function storeFingerprint(cwd: string): Promise<string> {
  const stats = await storeStats(cwd);
  return `${stats.profileVersion}|${stats.lastTrainedAt}|${stats.chunks}`;
}

/** Returns the cached value for `key` when the store is unchanged. Otherwise runs `run` and caches its result. */
async function cachedCall<T>(
  cwd: string,
  key: string,
  run: () => Promise<T>,
): Promise<{ value: T; hit: boolean }> {
  const fingerprint = await storeFingerprint(cwd);
  const entry = cache.get(key);
  if (entry?.fingerprint === fingerprint) return { value: entry.value as T, hit: true };
  const value = await run();
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, { fingerprint, value });
  return { value, hit: false };
}

/**
 * Runs one tool handler and prints a single line to the server terminal: time, tool name,
 * arguments, outcome, cache status, and duration. With `cache`, the result is read through the
 * cache. A failure is printed and rethrown, so the SDK still returns an `isError` result.
 * `outcome` summarizes a successful value for the log.
 */
async function traced<T>(
  tool: string,
  args: string,
  run: () => Promise<T>,
  outcome: (value: T) => string = () => "ok",
  cache?: { cwd: string; key: string },
): Promise<T> {
  const started = performance.now();
  const finish = (result: string, status?: string) => {
    const time = new Date().toTimeString().slice(0, 8);
    const ms = Math.round(performance.now() - started);
    console.log([time, tool, args, "->", result, status, `${ms}ms`].filter(Boolean).join(" "));
  };
  try {
    const { value, hit } = cache
      ? await cachedCall(cache.cwd, cache.key, run)
      : { value: await run(), hit: undefined };
    finish(outcome(value), hit === undefined ? undefined : hit ? "(hit)" : "(miss)");
    return value;
  } catch (error) {
    finish(`error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Builds an MCP server exposing the four Aura tools for a project directory.
 * Errors thrown by a tool are returned to the client as `isError` results.
 */
export function createMcpServer(cwd: string): McpServer {
  const server = new McpServer(
    { name: "aura", version: "0.1.0" },
    {
      instructions:
        "Style and identity come from the profile. Before doing the user's work, call get_style_guidelines with the category that matches the task: code, write, create, work, or communicate. Call search_memory only when the profile does not contain the passage you need. Call save_memory to queue new memory for the next enrich.",
    },
  );

  /**
   * Tool `get_profile`: returns the compiled Aura profile for the project as JSON.
   *
   * Use it when a client needs every category at once. For one task, call `get_style_guidelines`
   * with that task's category instead. It takes no arguments, reads `profile.json` on every call,
   * and does not embed or search memory.
   *
   * The result is redacted before it is returned, so emails, phone numbers, addresses, and other
   * personal details are not included.
   *
   * Fails with an `isError` result when no profile exists yet. Run `aura enrich` first.
   */
  server.registerTool(
    "get_profile",
    {
      description:
        "Read the whole compiled Aura profile: identity, principles, expertise, career, voice, and all five categories. Reads profile.json only; no embedding.",
    },
    async () => {
      const profile = await traced(
        "get_profile",
        "",
        () => getProfile(cwd),
        (value) => `v${value.meta.version}`,
        { cwd, key: "profile" },
      );
      return textResult(redactValue(profile));
    },
  );

  /**
   * Tool `search_memory`: searches the user's trained memory for passages relevant to a query.
   *
   * Arguments:
   * - `query`: what to search for. Must be non-empty.
   * - `limit`: maximum number of results, an integer of at least 1. Defaults to 5.
   *
   * Use it only when `get_style_guidelines` or `get_profile` does not contain the passage you need,
   * such as an exact quote the user wrote. It embeds the query when embeddings exist, and otherwise
   * falls back to a case-insensitive keyword match. Image-derived chunks are never returned, so
   * visual style comes from `create`.
   *
   * Returns a JSON array of `{ content, kind, distance? }` objects, redacted before they are sent.
   * An empty array means nothing matched.
   */
  server.registerTool(
    "search_memory",
    {
      description: "Search trained memory for original passages when the profile summary is not enough. Embeds the query.",
      inputSchema: z.object({
        query: z.string().min(1).describe("What to search for."),
        limit: z
          .number()
          .int()
          .min(1)
          .default(5)
          .describe("Maximum results, default 5."),
      }),
    },
    async ({ query, limit }) => {
      const rows = await traced(
        "search_memory",
        `"${redactText(query)}" limit=${limit}`,
        () => searchMemory(cwd, query, limit),
        (value) => `${value.length} results`,
        { cwd, key: JSON.stringify(["search_memory", query, limit]) },
      );
      return textResult(redactValue(rows));
    },
  );

  /**
   * Tool `save_memory`: saves a piece of memory into the local queue for the next `aura enrich` run.
   *
   * Arguments:
   * - `content`: the memory text. Must be non-empty. It is redacted before it is stored.
   * - `source`: optional label for where the memory came from. Blank or missing values become `mcp`.
   *
   * The memory stays in the queue until `aura enrich` embeds it, so the call never changes search
   * results. Returns `{ saved: true, embedded: false }` on success.
   */
  server.registerTool(
    "save_memory",
    {
      description:
        "Save memory into the queue. It is not embedded until aura enrich.",
      inputSchema: z.object({
        content: z.string().min(1).describe("Memory text to store in the queue."),
        source: z.string().optional().describe("Optional source label."),
      }),
    },
    async ({ content, source }) => {
      const label = source?.trim() || "mcp";
      await traced("save_memory", `chars=${content.length} source=${label}`, () =>
        saveMemory(cwd, redactText(content), label),
      );
      return textResult({ saved: true, embedded: false });
    },
  );

  /**
   * Tool `get_style_guidelines`: returns the profile slice for one use category.
   *
   * Arguments:
   * - `format`: the category of the task, one of `code`, `write`, `create`, `work`, or `communicate`.
   *   - `code`: coding, development, and technical agents.
   *   - `write`: writing, grammar, copy, and documents.
   *   - `create`: image, video, design, audio, and creative work.
   *   - `work`: research, business, productivity, data, and learning.
   *   - `communicate`: chat, spoken conversation, email, meetings, and social.
   *
   * Every result includes `identity`, `principles`, `expertise`, `career`, and `voice`, so a
   * text-to-speech client can speak as the user. It also includes the requested category only.
   * Call it before doing the user's work. It reads `profile.json` and does not embed. The result is
   * redacted, and it fails with an `isError` result when no profile exists yet.
   */
  server.registerTool(
    "get_style_guidelines",
    {
      description:
        "Profile slice for one use category (code, write, create, work, communicate), plus identity, principles, expertise, career, and voice. Call before doing the user's work. Reads profile.json only.",
      inputSchema: z.object({ format: z.enum(CATEGORY_NAMES) }),
    },
    async ({ format }) => {
      const profile = await traced(
        "get_style_guidelines",
        `format=${format}`,
        () => getProfile(cwd),
        (value) => `v${value.meta.version}`,
        { cwd, key: "profile" },
      );
      return textResult(redactValue(styleGuidelines(profile, format)));
    },
  );

  return server;
}
