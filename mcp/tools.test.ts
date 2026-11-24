import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { app } from "@/mcp/app";
import { emptyProfile, initStore, writeProfile } from "@/vector/store";

const originalCwd = process.cwd();
const root = `${process.env.TEMP ?? process.env.TMPDIR ?? "/tmp"}/aura-mcp-${crypto.randomUUID()}`;
let dir: string;
let log: { mock: { calls: unknown[][] }; mockRestore(): void };

/** Calls one MCP tool over the HTTP app and returns the text of its result. */
async function callTool(name: string, args: Record<string, unknown> = {}): Promise<string> {
  const response = await app.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        host: "localhost",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  return response.text();
}

/** Lines printed to the server terminal so far. */
function logged(): string[] {
  return log.mock.calls.map((call) => String(call[0]));
}

async function writeVersion(version: number): Promise<void> {
  const profile = emptyProfile();
  profile.meta.version = version;
  await writeProfile(dir, profile);
}

beforeEach(async () => {
  dir = `${root}/${crypto.randomUUID()}`;
  await initStore(dir);
  await writeVersion(2);
  process.chdir(dir);
  log = spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  log.mockRestore();
});

afterAll(async () => {
  process.chdir(originalCwd);
  // Windows keeps the SQLite file locked until unreferenced handles are collected.
  Bun.gc(true);
  await Bun.sleep(100);
  await Bun.$`rm -rf ${root}`.quiet().nothrow();
});

describe("tool call log", () => {
  test("prints one line per call with the tool, outcome, cache status, and duration", async () => {
    await callTool("get_profile");
    expect(logged()).toEqual([expect.stringMatching(/^\d{2}:\d{2}:\d{2} get_profile -> v2 \(miss\) \d+ms$/)]);
  });

  test("marks a repeated read as a cache hit", async () => {
    await callTool("get_profile");
    await callTool("get_profile");
    expect(logged()[1]).toMatch(/get_profile -> v2 \(hit\) \d+ms$/);
  });

  test("never prints the search query text unredacted", async () => {
    await callTool("search_memory", { query: "reach me at jane.doe@example.com" });
    const line = logged().find((entry) => entry.includes("search_memory"));
    expect(line).toBeDefined();
    expect(line).not.toContain("jane.doe@example.com");
  });
});

describe("style guidelines", () => {
  test("return the requested category plus identity, principles, expertise, career, and voice", async () => {
    // The MCP response is server-sent events; the JSON-RPC message is on the `data:` line.
    const raw = await callTool("get_style_guidelines", { format: "code" });
    const data = raw.split("\n").find((line) => line.startsWith("data: "))!.slice("data: ".length);
    const payload = JSON.parse(JSON.parse(data).result.content[0].text);
    expect(payload.code).toBeDefined();
    expect(payload.write).toBeUndefined();
    expect(payload.categories).toBeUndefined();
    expect(payload).toEqual(
      expect.objectContaining({
        identity: expect.anything(),
        principles: expect.anything(),
        expertise: expect.anything(),
        career: expect.anything(),
        voice: expect.anything(),
      }),
    );
  });
});

describe("tool result cache", () => {
  test("reuses a result while the store is unchanged", async () => {
    const first = await callTool("get_profile");
    const second = await callTool("get_profile");
    expect(second).toBe(first);
    expect(logged()[1]).toContain("(hit)");
  });

  test("reads again after the profile version changes", async () => {
    await callTool("get_profile");
    await writeVersion(3);
    await callTool("get_profile");
    expect(logged()[1]).toMatch(/get_profile -> v3 \(miss\)/);
  });

  test("never caches save_memory", async () => {
    await callTool("save_memory", { content: "a note" });
    await callTool("save_memory", { content: "a note" });
    const saves = logged().filter((entry) => entry.includes("save_memory"));
    expect(saves).toHaveLength(2);
    for (const entry of saves) expect(entry).not.toMatch(/\((hit|miss)\)/);
  });
});
