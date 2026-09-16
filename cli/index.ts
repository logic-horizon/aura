#!/usr/bin/env bun

import { run } from "./commands";

const argv = Bun.argv.slice(2);
const verb = argv[0] ?? "help";
const cwd = process.cwd();

process.exit(await run(verb, cwd));
