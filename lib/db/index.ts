import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";

let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function db() {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("Missing DATABASE_URL. See .env.example and plan.md.");
    }
    instance = drizzle({ client: new SQL(url), schema });
  }
  return instance;
}
