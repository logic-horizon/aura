import { allowedHosts, app } from "@/mcp/app";

/** Options for `startMcpServer`. `network` also opens a public tunnel to the port. */
export type McpServerOptions = {
  host?: string;
  port?: number;
  network?: boolean;
};

/**
 * Starts the HTTP MCP server and keeps running. Host and port come from the options, then the
 * `HOST` and `PORT` environment variables, then `127.0.0.1` and `8787`.
 */
export async function startMcpServer(options: McpServerOptions = {}): Promise<void> {
  const port = options.port ?? Number(process.env.PORT ?? 8787);
  const hostname = options.host ?? process.env.HOST ?? "127.0.0.1";
  Bun.serve({ port, hostname, fetch: app.fetch });
  console.log(`Aura MCP http://${hostname}:${port}/mcp`);

  if (options.network) {
    const { openTunnel } = await import("@/mcp/adapters/tunnel");
    const url = await openTunnel(port);
    if (url) allowedHosts.push(new URL(url).hostname);
  }

  await new Promise<void>(() => {});
}

if (import.meta.main) {
  await startMcpServer();
}
