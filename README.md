<div align="center">

# Aura: Taste memory for other AIs.

### One MCP for reverse engineering across binaries, applications, and runtime behavior.

**See a feature you like. Understand how it works, down to the binary level.**

[![npm version](https://img.shields.io/npm/v/rea-agents?style=flat-square&color=cb3837)](https://www.npmjs.com/package/rea-agents)
[![MCP tool catalog](https://img.shields.io/badge/MCP-tool_catalog-5c4ee5?style=flat-square)](docs/mcp-contracts.md#generated-catalog)
[![Node.js requirements](https://img.shields.io/badge/Node.js-requirements-339933?style=flat-square&logo=nodedotjs&logoColor=white)](#what-you-can-analyze)
[![skills.sh](https://skills.sh/b/morluto/rea?style=flat-square)](https://skills.sh/morluto/rea/reverse-engineer-anything)
[![MIT license](https://img.shields.io/badge/license-MIT-f4c430?style=flat-square)](LICENSE)
[![Discord](https://img.shields.io/discord/1556595354999332884?logo=discord&logoColor=white&label=Discord&color=5865F2)](https://discord.gg/GkcryMnJDM)

<a href="https://trendshift.io/repositories/82054?utm_source=repository-badge&amp;utm_medium=badge&amp;utm_campaign=badge-repository-82054" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/repositories/82054" alt="morluto%2Frea | Trendshift" width="250" height="55"/></a>

**[Website](https://rea.tools/) · [Guides](https://rea.tools/guides/) · [Showcases](https://rea.tools/showcase/)**

[Quick start](#quick-start) · [How REA works](#how-rea-works) · [What you can analyze](#what-you-can-analyze) · [Showcases](#showcases) · [FAQ](#faq) · [Documentation](#documentation)

<code>npx rea-agents setup</code>

<br />

<img src="docs/assets/rea-hopper-analysis.png" alt="REA launching its analysis bridge inside Hopper while inspecting a native binary" width="1200" />

<br /><br />

<table aria-label="REA community">
<tr>
<td align="center" width="360">
  <a href="https://discord.gg/GkcryMnJDM">
    <img src="docs/assets/discord.svg" height="42" alt="Discord" /><br />
    <strong>Join the Reverse Engineering Community</strong>
  </a><br />
  <sub>Discord · Q&amp;A · Show and Tell</sub>
</td>
</tr>
</table>

<br />

</div>

---



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
| `""` (default)       | `.aura/profile.json` and `.aura/aura.sqlite`        |
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
aura train
aura compile
aura pull          # prints .aura/profile.json
aura push          # "Saved locally; no remote."
```

`aura train` reads the configured markdown globs, writes the compiled profile to
`.aura/profile.json`, and stores chunks in `.aura/aura.sqlite`. The local vector
table uses `sqlite-vec` with 1536-dimensional cosine search. Set
`OPENROUTER_API_KEY` to enable OpenRouter embeddings and persona extraction;
without it, local compilation uses privacy-safe heuristics and local search
uses lexical matching. OpenRouter is the only model provider currently supported.

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
| `train`   | Builds a PII-free persona, chunks markdown, and writes `.aura/` |
| `compile` | Rebuilds `.aura/profile.json` from local SQLite chunks        |
| `pull`    | Prints local profile, or remote sync (stub if `remote` is set) |
| `push`    | Confirms local save, or remote sync (stub if `remote` is set)  |
| `login`   | No-op when local-only; remote token later                      |
| `mcp`     | Starts a consume-only stdio MCP server for taste tools        |
| `server`  | Hono listen (`GET /health` works)                              |
| `help`    | Command list                                                   |


---

## MCP

Local MCP exposes `get_profile`, `search_memory`, and
`get_style_guidelines` from the local `.aura/` store. It never exposes source
markdown directly, and compiled data excludes email, phone, address, full
family names, IDs, and other contact or household details. The only family-name
detail kept is its initial, in `identity.name` (for example, `Sifat S.`). Configure Claude Desktop
or Cursor with the folder containing `aura.json` as the working directory:

```json
{
  "mcpServers": {
    "aura": {
      "command": "aura",
      "args": ["mcp"],
      "cwd": "/path/to/my-aura"
    }
  }
}
```

On macOS, if SQLite extension loading fails, install a loadable SQLite build
and set `AURA_SQLITE_LIB` to its library path.

Connecting other applications, including Grammarly, is user-managed through a
local tunnel or compatible MCP bridge and is not part of Aura yet.

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

**Done:** `init`, local markdown training, PII-free persona compilation,
SQLite vector search, consume-only stdio MCP, local `pull`/`push`, `server`
health, Drizzle schema.

**Not done:** remote sync, HTTP MCP, LoRA, billing.

---

## Stack

Bun · Hono · Drizzle + `bun:sql` + pgvector (server) · `bun:sqlite` +
sqlite-vec (local) · optional Bun `S3Client`