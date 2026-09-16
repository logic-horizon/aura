import { Hono } from "hono";

const stub = { error: "Not implemented. See plan.md" };

export const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

app.post("/sync", (c) => c.json(stub, 501));

app.all("/mcp", (c) => c.json(stub, 501));
