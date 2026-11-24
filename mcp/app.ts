import { createMcpHonoApp } from "@modelcontextprotocol/hono";
import { createMcpHandler } from "@modelcontextprotocol/server";
import type { Context } from "hono";
import { createMcpServer } from "@/mcp/tools";

/**
 * Hostnames the app accepts in the `Host` header, guarding against DNS rebinding. Localhost only by
 * default. Network mode pushes the tunnel hostname into this same array after the tunnel opens.
 */
export const allowedHosts = ["localhost", "127.0.0.1", "[::1]"];

/** Serves each MCP request with a fresh server bound to the directory the app was started in. */
const handler = createMcpHandler(() => createMcpServer(process.cwd()));

/** The HTTP app: `/health`, and `/mcp`. Host and Origin checks run first, then the JSON body is parsed. */
export const app = createMcpHonoApp({ allowedHosts });

app.get("/health", (c) => c.json({ ok: true }));

app.all("/mcp", (c: Context) =>
  handler.fetch(c.req.raw, { parsedBody: c.get("parsedBody") }),
);

export default app;
