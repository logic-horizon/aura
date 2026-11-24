import { $ } from "bun";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as sqliteVec from "sqlite-vec";
import * as schema from "@/vector/schema";

/** An open SQLite connection (`sqlite`) with its Drizzle wrapper (`db`). */
export type VectorStore = {
  sqlite: Database;
  db: ReturnType<typeof drizzle<typeof schema>>;
};

const TABLE_INFO = "PRAGMA table_info(chunks)";
const DROP_LEGACY = "DROP TABLE IF EXISTS chunks; DROP TABLE IF EXISTS vec_chunks;";
const ADD_SOURCE_ID = "ALTER TABLE chunks ADD COLUMN source_id INTEGER";
const CREATE_TABLES = `
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      path_hash TEXT NOT NULL,
      content_md5 TEXT NOT NULL,
      trained_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sources_content_md5 ON sources(content_md5);
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      kind TEXT,
      source_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS inbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'mcp',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS model_cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
      chunk_id INTEGER PRIMARY KEY,
      embedding FLOAT[1536] distance_metric=cosine
    );
  `;

/** Creates the directory at `path` (and parents) if it does not exist. */
export async function ensureVectorDir(path: string): Promise<void> {
  await $`mkdir -p ${path}`.quiet();
}

/**
 * Opens the SQLite file at `path`, loads sqlite-vec, and creates or migrates the tables.
 * Drops the legacy `chunks` schema and adds `source_id` when needed. The caller must close `sqlite`.
 * Throws with a hint when sqlite-vec cannot load.
 */
export function openVectorStore(path: string): VectorStore {
  const sqliteLibrary = process.env.AURA_SQLITE_LIB;
  if (sqliteLibrary) Database.setCustomSQLite(sqliteLibrary);
  const sqlite = new Database(path, { create: true });
  try {
    sqliteVec.load(sqlite);
  } catch (error) {
    sqlite.close();
    const hint = process.platform === "darwin"
      ? " Set AURA_SQLITE_LIB to a loadable SQLite library."
      : "";
    throw new Error(`Could not load sqlite-vec.${hint}`, { cause: error });
  }
  const chunkCols = sqlite.prepare(TABLE_INFO).all() as Array<{ name: string }>;
  if (chunkCols.some((col) => col.name === "layer")) {
    sqlite.exec(DROP_LEGACY);
  }
  sqlite.exec(CREATE_TABLES);
  const cols = sqlite.prepare(TABLE_INFO).all() as Array<{ name: string }>;
  if (cols.length > 0 && !cols.some((col) => col.name === "source_id")) {
    sqlite.exec(ADD_SOURCE_ID);
  }
  return { sqlite, db: drizzle({ client: sqlite, schema }) };
}
