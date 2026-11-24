import {
  AURA_JSON,
  configPath,
  defaultConfig,
  hasRemote,
  loadConfig,
  modelIds,
  openrouterKey,
  reasoningEffort,
  requireConfig,
} from "@/cli/config";
import { startCommandUi, style, summaryCard, useTty } from "@/cli/tui";
import { writeSkill } from "@/lib/skill";
import { initStore, readCompiled, storeStats } from "@/vector/store";
import type { EnrichMode, Skip } from "@/lib/enrich";

/** Message shown by commands that are not implemented yet. */
export const STUB = "Not implemented. See plan.md";

const COMMANDS: Array<[string, string]> = [
  ["init", `Write ${AURA_JSON} in the current directory`],
  ["enrich", "Profile + memory from local files"],
  ["enrich again", "Incremental enrich (embedding check + inbox)"],
  ["enrich --version", "Snapshot a new profile version"],
  ["enrich profile", "Profile JSON only"],
  ["enrich memory", "Vector memory only"],
  ["profile", "Browse the compiled local persona (JSON when piped)"],
  ["status", "Show profile, memory, sources, and model state"],
  ["pull", "Fetch compiled taste (remote) or print local .aura/"],
  ["push", "Sync to remote, or confirm local store if remote is empty"],
  ["login", "Authenticate to remote (no-op when local-only)"],
  ["mcp", "Start the HTTP MCP server (--network for optional tunnel)"],
  ["help", "Show this message"],
];

function enrichMode(args: string[]): EnrichMode {
  if (args.includes("--version")) return "version";
  const sub = args.find((arg) => !arg.startsWith("-"));
  if (sub === "again" || sub === "profile" || sub === "memory") return sub;
  return "full";
}

const WORDMARK = ["▄▀█ █ █ █▀█ ▄▀█", "█▀█ █▄█ █▀▄ █▀█"];
const TAGLINE = "taste memory from markdown, PDF, and images";

/** Prints the usage table and returns exit code 0. The wordmark appears only in a terminal. */
export async function help(): Promise<number> {
  const width = Math.max(...COMMANDS.map(([name]) => name.length)) + 2;
  const header = useTty()
    ? WORDMARK.map((line) => `  ${style(line, "accent", "bold")}`).concat(`  ${style(TAGLINE, "dim")}`)
    : [`  ${style("◆ Aura", "accent", "bold")}  ${style(TAGLINE, "dim")}`];
  console.log(
    [
      "",
      ...header,
      "",
      `  ${style("Usage", "bold")}  aura <command>`,
      "",
      ...COMMANDS.map(([name, description]) => `  ${style(name.padEnd(width), "accent")}${description}`),
      "",
    ].join("\n"),
  );
  return 0;
}

/**
 * Writes `aura.json` when it is missing, creates the local store, and always writes `SKILL.md`.
 * Returns 0 on success. Throws when a step fails.
 */
export async function init(cwd: string): Promise<number> {
  const path = configPath(cwd);
  const created = !(await Bun.file(path).exists());
  if (created) await Bun.write(path, `${JSON.stringify(defaultConfig, null, 2)}\n`);
  const store = await initStore(cwd);
  const skill = await writeSkill(cwd);

  if (useTty()) {
    console.log(
      summaryCard("ready", [
        [AURA_JSON, created ? "created" : "already exists"],
        ["skill", skill],
        ["store", store],
        ["next", "set keys.openrouter, then run aura enrich"],
      ]),
    );
    return 0;
  }
  console.log(created ? `Wrote ${path} (set keys.openrouter to enrich)` : `${AURA_JSON} already exists at ${path}`);
  console.log(`Wrote ${skill}`);
  console.log(`Store ready at ${store} (aura.sqlite)`);
  return 0;
}

/** Groups skipped entries by reason, for example "2 too large, 1 unknown type". */
function skipLine(skipped: Skip[]): string {
  const counts = new Map<string, number>();
  for (const item of skipped) counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
  return [...counts].map(([reason, count]) => `${count} ${reason}`).join(", ");
}

/**
 * Runs enrich in the mode given by `args`. In a terminal it shows the progress footer and then a
 * summary card; otherwise it prints one plain line. Returns 0 on success. Throws when enrich fails.
 */
export async function enrich(cwd: string, args: string[]): Promise<number> {
  const config = await requireConfig(cwd);
  const mode = enrichMode(args);
  const { enrich: enrichProfile } = await import("@/lib/enrich");
  const ui = await startCommandUi(mode);
  const result = await enrichProfile(cwd, config, mode, ui?.onProgress).catch(async (error) => {
    await ui?.finish(1);
    throw error;
  });
  await ui?.finish(0);

  if (ui) {
    const rows: Array<[string, string]> = [];
    if (result.profile) rows.push(["profile", `v${result.profile}`]);
    if (result.chunks != null) rows.push(["memory", `${result.chunks} chunks`]);
    if (result.skipped.length) rows.push(["skipped", `${result.skipped.length} · ${skipLine(result.skipped)}`]);
    console.log(summaryCard(`enrich ${mode}`, rows));
    return 0;
  }

  const parts = [`enrich ${mode}`];
  if (result.profile) parts.push(`profile v${result.profile}`);
  if (result.chunks != null) parts.push(`${result.chunks} memory chunks`);
  console.log(parts.join(" · "));
  for (const item of result.skipped) console.error(`skipped ${item.path}: ${item.reason}`);
  return 0;
}

/** Browses the stored profile in a terminal, or prints it as JSON when piped. Returns 1 when no profile exists. */
export async function profile(cwd: string): Promise<number> {
  await requireConfig(cwd);
  const stored = await readCompiled(cwd);
  if (!stored) {
    console.error(style("No local .aura/profile.json. Run aura enrich first.", "err"));
    return 1;
  }
  if (!useTty()) {
    console.log(JSON.stringify(stored.profile, null, 2));
    return 0;
  }
  const { browseProfile } = await import("@/cli/browse");
  await browseProfile(stored.profile);
  return 0;
}

/**
 * Prints the project's Aura state: config, remote, key presence (never the key), models, profile
 * version, last training time, and memory and inbox counts. Returns 1 when there is no aura.json.
 */
export async function status(cwd: string): Promise<number> {
  const config = await loadConfig(cwd);
  if (!config) {
    console.error(style(`No ${AURA_JSON} in ${cwd}. Run aura init first.`, "err"));
    return 1;
  }
  const stats = await storeStats(cwd);
  const models = modelIds(config);
  console.log(
    summaryCard("status", [
      ["project", config.name],
      ["remote", hasRemote(config) ? config.remote : "local only"],
      ["key", openrouterKey(config) ? "set" : "missing (set keys.openrouter or OPENROUTER_API_KEY)"],
      ["models", `llm ${models.llm} · vlm ${models.vlm} · embed ${models.embedding}`],
      ["reasoning", reasoningEffort(config) ?? "model default"],
      ["profile", stats.profileVersion ? `v${stats.profileVersion}` : "none yet"],
      ["trained", stats.lastTrainedAt ? new Date(stats.lastTrainedAt).toLocaleString() : "never"],
      ["sources", `${stats.sources}`],
      ["memory", `${stats.chunks} chunks · ${stats.imageChunks} from images`],
      ["inbox", `${stats.inbox} pending`],
    ]),
  );
  return 0;
}

/**
 * Without a remote, prints the local profile. With a remote, returns 1 because sync is not
 * implemented yet.
 */
export async function pull(cwd: string): Promise<number> {
  const config = await requireConfig(cwd);
  if (!hasRemote(config)) {
    const stored = await readCompiled(cwd);
    if (!stored) {
      console.error(style("No local .aura/profile.json. Run aura enrich first.", "err"));
      return 1;
    }
    console.log(JSON.stringify(stored.profile, null, 2));
    return 0;
  }
  console.error(style(`pull: ${STUB}`, "err"));
  return 1;
}

/**
 * Without a remote, checks that a local profile exists. With a remote, returns 1 because sync
 * is not implemented yet.
 */
export async function push(cwd: string): Promise<number> {
  const config = await requireConfig(cwd);
  if (!hasRemote(config)) {
    const stored = await readCompiled(cwd);
    if (!stored) {
      console.error(style("No local compiled profile. Run aura enrich first.", "err"));
      return 1;
    }
    console.log("Saved locally; no remote.");
    return 0;
  }
  console.error(style(`push: ${STUB}`, "err"));
  return 1;
}

/**
 * Without a remote, does nothing. With a remote, returns 1 because login is not implemented yet.
 */
export async function login(cwd: string): Promise<number> {
  const config = await requireConfig(cwd);
  if (!hasRemote(config)) {
    console.log("No remote; local FS only.");
    return 0;
  }
  console.error(style(`login: ${STUB}`, "err"));
  return 1;
}

/** Starts the HTTP MCP server. `network` also opens a public tunnel to it. */
export async function mcp(network: boolean): Promise<number> {
  const { startMcpServer } = await import("@/mcp/listen");
  await startMcpServer({ network });
  return 0;
}

/**
 * Dispatches a CLI verb to its command and returns the exit code. Unknown verbs print help and return 1.
 */
export async function run(verb: string, cwd: string, args: string[] = []): Promise<number> {
  const network = args.includes("--network");
  switch (verb) {
    case "help":
    case "--help":
    case "-h":
      return help();
    case "init":
      return init(cwd);
    case "enrich":
      return enrich(cwd, args);
    case "profile":
      return profile(cwd);
    case "status":
      return status(cwd);
    case "pull":
      return pull(cwd);
    case "push":
      return push(cwd);
    case "login":
      return login(cwd);
    case "mcp":
      return mcp(network);
    default:
      console.error(style(`Unknown command: ${verb}`, "err"));
      await help();
      return 1;
  }
}

export { loadConfig, requireConfig };
