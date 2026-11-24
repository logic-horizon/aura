import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { init } from "@/cli/commands";
import { skillName } from "@/lib/skill";

const originalCwd = process.cwd();
const root = `${process.env.TEMP ?? process.env.TMPDIR ?? "/tmp"}/aura-cli-${crypto.randomUUID()}`;
let log: { mockRestore(): void };

beforeEach(() => {
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

describe("skillName", () => {
  test("keeps a simple lowercase folder name", () => {
    expect(skillName("me")).toBe("me");
  });

  test("turns spaces and symbols into single hyphens", () => {
    expect(skillName("My Project")).toBe("my-project");
    expect(skillName("--Weird__Name--")).toBe("weird-name");
  });

  test("falls back to aura when nothing usable remains", () => {
    expect(skillName("")).toBe("aura");
    expect(skillName("中文")).toBe("aura");
  });

  test("caps the name at 64 characters without a trailing hyphen", () => {
    const name = skillName(`${"a".repeat(63)} b`);
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name.endsWith("-")).toBe(false);
  });
});

describe("init writes SKILL.md", () => {
  test("names the skill after the folder and overwrites it on every run", async () => {
    const dir = `${root}/My Project`;
    await Bun.write(`${dir}/.keep`, "");
    process.chdir(dir);

    expect(await init(dir)).toBe(0);
    const first = await Bun.file(`${dir}/SKILL.md`).text();
    expect(first).toContain("name: my-project\n");
    expect(first).not.toContain("__SKILL_NAME__");

    await Bun.write(`${dir}/SKILL.md`, "stale");
    expect(await init(dir)).toBe(0);
    expect(await Bun.file(`${dir}/SKILL.md`).text()).toBe(first);
  });
});
