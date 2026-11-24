import { afterAll, expect, test } from "bun:test";
import { initStore, persistSource } from "@/vector/store";
import { searchMemory } from "@/lib/enrich/search-memory";

const root = `${process.env.TEMP ?? process.env.TMPDIR ?? "/tmp"}/aura-search-${crypto.randomUUID()}`;

afterAll(async () => {
  // Windows keeps the SQLite file locked until unreferenced handles are collected.
  Bun.gc(true);
  await Bun.sleep(100);
  await Bun.$`rm -rf ${root}`.quiet().nothrow();
});

test("memory search never returns image chunks", async () => {
  const cwd = `${root}/project`;
  await initStore(cwd);
  await persistSource(
    cwd,
    { path: "notes/voice.md", pathHash: "hash-notes", contentMd5: "md5-notes" },
    [{ content: "minimal palette and calm voice", kind: "memory", embedding: [] }],
  );
  await persistSource(
    cwd,
    { path: "images/portrait.png", pathHash: "hash-image", contentMd5: "md5-image" },
    [{ content: "minimal palette with soft lighting", kind: "image", embedding: [] }],
  );

  const results = await searchMemory(cwd, "palette");

  expect(results.map((item) => item.content)).toEqual(["minimal palette and calm voice"]);
  expect(results.every((item) => item.kind !== "image")).toBe(true);
});
