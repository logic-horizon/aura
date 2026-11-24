import type { Config } from "drizzle-kit";

export default {
  schema: "./vector/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: "./.aura/aura.sqlite",
  },
} satisfies Config;
