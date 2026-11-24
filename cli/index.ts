#!/usr/bin/env bun

import { run } from "@/cli/commands";
import { style } from "@/cli/tui";

const argv = Bun.argv.slice(2);
const verb = argv[0] ?? "help";
const args = argv.slice(1);
const cwd = process.cwd();

try {
  process.exit(await run(verb, cwd, args));
} catch (error) {
  console.error(`${style("✗", "err")} ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
