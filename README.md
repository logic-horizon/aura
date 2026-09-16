# Aura

Aura is **taste memory** for other AIs. You train on **markdown** in a folder. Compiled taste lives in that folder (`.aura/`), or you set `remote` to **our cloud** or **your own Aura server**. Email, image, and other agents pull it over MCP so they do not need “write like me.”

---

## Install

```sh
bun add -g aura
```

or from the npm registry:

```sh
npm install -g aura
```

The `aura` binary still runs with Bun (`#!/usr/bin/env bun`). Install [Bun](https://bun.sh) first. `npm` here is only the registry/client that puts the package on your PATH.

```sh
aura help
```

---

## Local folder (default)

```sh
mkdir ~/my-aura && cd ~/my-aura
aura init
# add *.md, then:
aura compile
aura pull          # prints .aura/profile.json
aura push          # "Saved locally; no remote."
```

`aura.json`:


| Field     | Default                         | Meaning                                                  |
| --------- | ------------------------------- | -------------------------------------------------------- |
| `paths`   | `["**/*.md"]`                   | Train globs                                              |
| `remote`  | `""`                            | Empty = `.aura/` only. Set to our API or your server URL |
| `name`    | `personal`                      | Label                                                    |
| `exclude` | `.git`, `node_modules`, `.aura` |                                                          |


---

## Our cloud vs their server vs disk


| `remote`       | Where compiled taste lives                       |
| -------------- | ------------------------------------------------ |
| `""`           | `.aura/profile.json` and `.aura/chunks.json`     |
| our hosted URL | Same Hono `/sync` + Postgres we operate          |
| their URL      | They run `aura server` with their `DATABASE_URL` |


Protocol is identical for our cloud and theirs.

---

## Self-host

Postgres with pgvector. Schema lives in Drizzle (`[lib/db/schema.ts](lib/db/schema.ts)`) — apply it with Drizzle, not a hand-written `.sql` file:

```sh
export DATABASE_URL=postgres://...
bun x drizzle-kit push
export AURA_TOKEN=... MCP_BEARER_TOKEN=...
aura server
```

- `GET /health` → `{ ok: true }`
- `POST /sync`, `ALL /mcp` → not implemented yet

---

## Commands


| Command         |                                                   |
| --------------- | ------------------------------------------------- |
| `init`          | Write `aura.json`                                 |
| `train`         | Embed markdown (not implemented)                  |
| `compile`       | Write `.aura/` (empty profile until train exists) |
| `pull` / `push` | Local store or remote sync                        |
| `login`         | Remote token (no-op if no remote)                 |
| `mcp`           | stdio stub; tools = CLI + `run_cli`               |
| `server`        | Hono listen                                       |
| `help`          | This list                                         |


---

## Stack

Bun · Hono · Drizzle ORM + `bun:sql` + pgvector (server) · JSON `.aura/` (local) · Bun `S3Client` (optional)