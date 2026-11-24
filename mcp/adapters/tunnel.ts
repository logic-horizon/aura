/**
 * Opens a public URL for a local port using the `localtunnel` package. Returns the public base URL,
 * or null when the package is missing or fails, after logging an install hint instead of throwing.
 */
export async function openTunnel(port: number): Promise<string | null> {
  const packageName = "localtunnel";

  try {
    const module = (await import(packageName)) as {
      default?: (options: { port: number }) => Promise<{ url: string }>;
    };

    const tunnel = await (
      module.default ??
      (module as unknown as (options: {
        port: number;
      }) => Promise<{ url: string }>)
    )({ port });
    console.log(`Aura MCP public URL ${tunnel.url}/mcp`);

    return tunnel.url;
  } catch (error) {
    console.error(
      `Network mode unavailable. Install localtunnel with \`bun add localtunnel\`. ${String(error)}`,
    );

    return null;
  }
}
