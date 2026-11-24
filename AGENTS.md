# Aura — agent notes

- Runtime and package manager are **Bun**. Do not use Node APIs. The `aura` bin shebang is `#!/usr/bin/env bun`. Users install from npm: `bun add -g aura` (npm client is registry-only).
- **Commands** live in [`cli/commands.ts`](cli/commands.ts). CLI (TTY commands use a live progress view in [`tui/app.ts`](tui/app.ts); not a separate app) and local MCP are thin wrappers. Do not add a Hono-only train path.
- **Persistence:** empty `aura.json` `remote` → [`lib/local/store.ts`](lib/local/store.ts) (`.aura/profile.json` plus `.aura/aura.sqlite` via `bun:sqlite`/`sqlite-vec`). Non-empty `remote` → HTTP `/sync`. Same compiled JSON profile shape.
- **Persona privacy:** compiled and MCP-served data is taste-only and PII-free. Never expose emails, phones, addresses, full family/last names, IDs, or household details. `identity.name` is the given first name plus the family-name initial (for example `Sifat S.`). OpenRouter via `@openrouter/sdk` is the only model client for now.
- **Local MCP:** [`cli/mcp.ts`](cli/mcp.ts) is consume-only: `get_profile`, `search_memory`, and `get_style_guidelines`. Training stays in the CLI.
- **Schema:** [`lib/db/schema.ts`](lib/db/schema.ts) is the source of truth. Apply with `bun run db:push` (`drizzle-kit push`). Do not add hand-written `.sql` migrations.
- **Server:** [`server/index.ts`](server/index.ts) + [`lib/api/app.ts`](lib/api/app.ts). Postgres + pgvector via Drizzle on `bun:sql` when hosting.
