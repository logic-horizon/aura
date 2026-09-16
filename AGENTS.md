# Aura — agent notes

- Runtime and package manager are **Bun**. Do not use Node APIs. The `aura` bin shebang is `#!/usr/bin/env bun`. Users install from npm: `bun add -g aura` (npm client is registry-only).
- **Commands** live in [`cli/commands.ts`](cli/commands.ts). CLI and local MCP are thin wrappers. Do not add a Hono-only train path.
- **Persistence:** empty `aura.json` `remote` → [`lib/local/store.ts`](lib/local/store.ts) (`.aura/` JSON). Non-empty `remote` → HTTP `/sync`. Same compiled JSON shape.
- **Schema:** [`lib/db/schema.ts`](lib/db/schema.ts) is the source of truth. Apply with `bun run db:push` (`drizzle-kit push`). Do not add hand-written `.sql` migrations.
- **Server:** [`server/index.ts`](server/index.ts) + [`lib/api/app.ts`](lib/api/app.ts). Postgres + pgvector via Drizzle on `bun:sql` when hosting.
