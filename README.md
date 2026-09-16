# Aura

Taste memory for other AIs.

Email drafters, image generators, and coding agents do not know how you write, what you like to look at, or how you decide. Generic memory stores facts. Aura stores **taste**: linguistic fingerprint, visual aesthetic, behavioral heuristics. Other tools pull that profile over **MCP** so you stop repeating “write like me.”

You train on **markdown** in a folder. Compiled taste lives next to that folder, on **hosted Aura**, or on **your own Aura server**. Raw mail and images do not have to sit on disk.

---

## Why

Three people ask an AI for a resume or a cover image. They get the same vanilla output. Aura is the missing layer: a structured profile other agents consume instead of guessing.


| Layer      | What it captures                                             |
| ---------- | ------------------------------------------------------------ |
| Linguistic | Cadence, humor, words you refuse, formal vs casual           |
| Aesthetic  | Color, grain, composition, visual tropes you hate            |
| Behavioral | Risk, how you explain things, what “good” looks like for you |


---

## How it fits

```text
markdown in a folder  →  aura train / compile  →  compiled taste
                                                 (.aura/  or  remote Postgres)
                                                         │
                                                         ▼
                                              MCP (Claude, Cursor, email, image)
```


| `aura.json` `remote` | Where compiled taste lives                          |
| -------------------- | --------------------------------------------------- |
| `""` (default)       | `.aura/profile.json` and `.aura/chunks.json`        |
| Hosted Aura URL      | Same HTTP contract we run (`POST /sync` + Postgres) |
| Your URL             | You run `aura server` with your `DATABASE_URL`      |


Hosted and self-hosted speak the same protocol.

---

## Install

Install [Bun](https://bun.sh) first. The `aura` bin is `#!/usr/bin/env bun`.

```sh
bun add -g aura
aura help
```

`npm install -g aura` only uses npm as a **registry client**. The process still runs on Bun.

From this repo:

```sh
bun install
bun run aura help
```

---

## Local folder (default)

```sh
mkdir ~/my-aura && cd ~/my-aura
aura init
# add *.md samples (sent-mail dumps, notes, style guides)
aura compile
aura pull          # prints .aura/profile.json
aura push          # "Saved locally; no remote."
```

`train` (embed markdown) is not implemented yet. `compile` currently writes an **empty** three-layer profile so the store path is real.

### `aura.json`


| Field     | Default                         | Meaning                                                    |
| --------- | ------------------------------- | ---------------------------------------------------------- |
| `paths`   | `["**/*.md"]`                   | Globs to train on                                          |
| `remote`  | `""`                            | Empty = disk only. Otherwise our API or your server origin |
| `name`    | `personal`                      | Label                                                      |
| `exclude` | `.git`, `node_modules`, `.aura` | Skip these                                                 |


Example: `[examples/aura.json](examples/aura.json)`.

---

## Commands


| Command   | What it does now                                               |
| --------- | -------------------------------------------------------------- |
| `init`    | Writes `aura.json`                                             |
| `train`   | Stub — will embed markdown matching `paths`                    |
| `compile` | Writes `.aura/` (empty profile until train exists)             |
| `pull`    | Prints local profile, or remote sync (stub if `remote` is set) |
| `push`    | Confirms local save, or remote sync (stub if `remote` is set)  |
| `login`   | No-op when local-only; remote token later                      |
| `mcp`     | stdio stub; tools = CLI verbs + `run_cli` + consume profile    |
| `server`  | Hono listen (`GET /health` works)                              |
| `help`    | Command list                                                   |


---

## MCP (intended)

Local MCP will expose CLI verbs plus consume tools (`get_taste_profile`, `search_taste`) from `.aura/` or HTTP MCP on a remote.

Wire the stdio server in Claude Desktop / Cursor once `aura mcp` is implemented. Until then the command exits with a stub message.

---

## Self-host

Needs Postgres with **pgvector**. Schema is Drizzle (`[lib/db/schema.ts](lib/db/schema.ts)`) — apply it with Drizzle, not a hand-written `.sql` file.

```sh
export DATABASE_URL=postgres://...
bun run db:push          # drizzle-kit push
export AURA_TOKEN=...
export MCP_BEARER_TOKEN=...
aura server              # HOST/PORT default 0.0.0.0:8787
```


| Route         | Status         |
| ------------- | -------------- |
| `GET /health` | `{ ok: true }` |
| `POST /sync`  | 501            |
| `ALL /mcp`    | 501            |


---

## Status

Scaffold, not the full product.

**Done:** `init`, local `.aura/` read/write, `compile` empty profile, local `pull`/`push`, `server` health, Drizzle schema.

**Not done:** real embeddings (`train`), remote sync, working MCP SDK, LoRA, billing.

---

## Stack

Bun · Hono · Drizzle + `bun:sql` + pgvector (server) · JSON `.aura/` (local) · optional Bun `S3Client`