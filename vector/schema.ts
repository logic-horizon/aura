import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Dimension of every embedding vector. Must match the `vec_chunks` column width. */
export const EMBEDDING_DIM = 1536;

/** One row per ingested file: its path, path hash, content MD5, and training time. */
export const sources = sqliteTable("sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  path: text("path").notNull().unique(),
  pathHash: text("path_hash").notNull(),
  contentMd5: text("content_md5").notNull(),
  trainedAt: integer("trained_at").notNull(),
});

/** Memory text chunks. Each one links to a source by `sourceId`. */
export const chunks = sqliteTable("chunks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  content: text("content").notNull(),
  kind: text("kind"),
  sourceId: integer("source_id"),
});

/** Cached model responses keyed by a hash of the request, so an identical request skips the API. */
export const modelCache = sqliteTable("model_cache", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: integer("created_at").notNull(),
});

/** Notes saved through the MCP `save_memory` tool, waiting for the next enrich run. */
export const inbox = sqliteTable("inbox", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  content: text("content").notNull(),
  source: text("source").notNull().default("mcp"),
  createdAt: integer("created_at").notNull(),
});
