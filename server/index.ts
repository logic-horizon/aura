import { app } from "../lib/api/app";

export async function start(): Promise<void> {
  const port = Number(process.env.PORT ?? 8787);
  const hostname = process.env.HOST ?? "127.0.0.1";
  Bun.serve({
    port,
    hostname,
    fetch: (req) => app.fetch(req),
  });
  console.log(`Aura server http://${hostname}:${port}`);
  await new Promise<void>(() => {});
}

if (import.meta.main) {
  await start();
}
