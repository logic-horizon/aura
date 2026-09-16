import {
  AURA_JSON,
  configPath,
  defaultConfig,
  hasRemote,
  loadConfig,
  requireConfig,
} from "./config";
import { emptyProfile, readCompiled, writeCompiled } from "../lib/local/store";

export const STUB = "Not implemented. See plan.md";

export async function help(): Promise<number> {
  console.log(`Aura CLI — taste memory from markdown.

Usage: aura <command>

Commands:
  init      Write ${AURA_JSON} in the current directory
  train     Embed markdown matching paths (requires ${AURA_JSON})
  compile   Build the three-layer profile into .aura/
  pull      Fetch compiled taste (remote) or print local .aura/
  push      Sync to remote, or confirm local store if remote is empty
  login     Authenticate to remote (no-op when local-only)
  mcp       stdio MCP (CLI verbs + run_cli; consume from .aura/ or remote)
  server    Self-host the Hono Aura API (Postgres)
  help      Show this message

Storage: empty remote → .aura/ in this folder. Set remote to our cloud or
your aura server. See plan.md.
`);
  return 0;
}

export async function init(cwd: string): Promise<number> {
  const path = configPath(cwd);
  if (await Bun.file(path).exists()) {
    console.error(`${AURA_JSON} already exists at ${path}`);
    return 1;
  }
  await Bun.write(path, `${JSON.stringify(defaultConfig, null, 2)}\n`);
  console.log(`Wrote ${path} (local store .aura/; set remote to sync)`);
  return 0;
}

export async function train(cwd: string): Promise<number> {
  await requireConfig(cwd);
  console.error(`train: ${STUB}

v1 input is markdown globs in aura.json paths. Raw email/images are not required.`);
  return 1;
}

export async function compile(cwd: string): Promise<number> {
  await requireConfig(cwd);
  await writeCompiled(cwd, emptyProfile(), []);
  console.log(`Wrote empty compiled profile under .aura/ (train not implemented).`);
  return 0;
}

export async function pull(cwd: string): Promise<number> {
  const config = await requireConfig(cwd);
  if (!hasRemote(config)) {
    const stored = await readCompiled(cwd);
    if (!stored) {
      console.error("No local .aura/profile.json. Run aura compile first.");
      return 1;
    }
    console.log(JSON.stringify(stored.profile, null, 2));
    return 0;
  }
  console.error(`pull: ${STUB}`);
  return 1;
}

export async function push(cwd: string): Promise<number> {
  const config = await requireConfig(cwd);
  if (!hasRemote(config)) {
    const stored = await readCompiled(cwd);
    if (!stored) {
      console.error("No local compiled profile. Run aura compile first.");
      return 1;
    }
    console.log("Saved locally; no remote.");
    return 0;
  }
  console.error(`push: ${STUB}`);
  return 1;
}

export async function login(cwd: string): Promise<number> {
  const config = await requireConfig(cwd);
  if (!hasRemote(config)) {
    console.log("No remote; local FS only.");
    return 0;
  }
  console.error(`login: ${STUB}`);
  return 1;
}

export async function mcp(): Promise<number> {
  console.error(`mcp: ${STUB}

Tools: init, train, compile, pull, push, login, run_cli.
Consume: get_taste_profile, search_taste from .aura/ or remote HTTP MCP.`);
  return 1;
}

export async function server(): Promise<number> {
  const { start } = await import("../server/index");
  await start();
  return 0;
}

export async function run(verb: string, cwd: string): Promise<number> {
  switch (verb) {
    case "help":
    case "--help":
    case "-h":
      return help();
    case "init":
      return init(cwd);
    case "train":
      return train(cwd);
    case "compile":
      return compile(cwd);
    case "pull":
      return pull(cwd);
    case "push":
      return push(cwd);
    case "login":
      return login(cwd);
    case "mcp":
      return mcp();
    case "server":
      return server();
    default:
      console.error(`Unknown command: ${verb}\n`);
      await help();
      return 1;
  }
}

export { loadConfig, requireConfig };
