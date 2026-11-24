import { eq, inArray } from "drizzle-orm";
import { profileSchema, type Profile } from "@/schema/profile";
import { openVectorStore, ensureVectorDir, type VectorStore } from "@/vector/client";
import * as schema from "@/vector/schema";
import { EMBEDDING_DIM } from "@/vector/schema";

export type { Profile };

const SOURCE_BY_PATH = "SELECT * FROM sources WHERE path = ?";
const SOURCE_BY_MD5 = "SELECT * FROM sources WHERE content_md5 = ?";
const CHUNK_IDS = "SELECT id FROM chunks WHERE source_id = ?";
const DELETE_VEC = "DELETE FROM vec_chunks WHERE chunk_id = ?";
const DELETE_CHUNKS = "DELETE FROM chunks WHERE source_id = ?";
const LAST_ID = "SELECT last_insert_rowid() AS id";
const INSERT_VEC = "INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)";
const BEGIN = "BEGIN;";
const COMMIT = "COMMIT;";
const ROLLBACK = "ROLLBACK;";
const WIPE_VEC = "BEGIN; DELETE FROM vec_chunks;";
const COUNT_SOURCES = "SELECT count(*) AS n FROM sources";
const COUNT_CHUNKS = "SELECT count(*) AS n FROM chunks";
const COUNT_INBOX = "SELECT count(*) AS n FROM inbox";
const COUNT_IMAGE_CHUNKS = "SELECT count(*) AS n FROM chunks WHERE kind = 'image'";
const LAST_TRAINED = "SELECT max(trained_at) AS t FROM sources";

/**
 * A memory chunk and its embedding. `sourceId` links it to a row in `sources`.
 * Chunks whose embedding length is not `EMBEDDING_DIM` are stored without a vector.
 */
export type Chunk = {
  id?: number;
  content: string;
  kind?: string | null;
  sourceId?: number | null;
  embedding: number[];
};

/**
 * Result of checking a file against the sources ledger: skip it (already trained,
 * or the same content exists at another path), replace an existing source, or add it as new.
 */
export type SourceDecision =
  | { action: "skip"; reason: "already trained" | "duplicate content" }
  | { action: "new" }
  | { action: "replace"; sourceId: number };

/** A note saved with `save_memory`, waiting for the next enrich run to embed it. */
export type InboxItem = {
  id: number;
  content: string;
  source: string;
  createdAt: number;
};

/** Name of the Aura store directory inside a project. */
export const DIR_NAME = ".aura";
/** Name of the SQLite database file inside the store directory. */
export const DATABASE_NAME = "aura.sqlite";
export { EMBEDDING_DIM };

/** Returns a blank profile with every list empty and version 0. */
export function emptyProfile(): Profile {
  const category = () => ({ summary: [], style: [], preferences: [], rules: [], avoid: [] });
  return {
    identity: { name: "", role: "", bio: "", location: "", languages: [] },
    code: category(),
    write: category(),
    create: category(),
    work: category(),
    communicate: category(),
    principles: { values: [], ethics: [], decision_rules: [], boundaries: [], avoid: [] },
    expertise: { domains: [], skills: [], technologies: [], knowledge_level: {} },
    career: { profession: "", industries: [], projects: [], goals: [], working_style: [] },
    voice: {
      summary: "",
      pace: "",
      pitch: "",
      accent: "",
      tone: [],
      cadence: [],
      vocabulary: [],
      fillers: [],
      avoid: [],
    },
    context: { current_focus: [], important_entities: [], active_topics: [] },
    meta: { version: 0, updated_at: "", confidence: 0 },
  };
}

/** Absolute path of the `.aura` store directory for a project, without a trailing slash. */
export function storeDir(cwd: string): string {
  return `${cwd.replace(/[\\/]+$/, "")}/${DIR_NAME}`;
}

/** Path of the compiled `profile.json` for a project. */
export function profilePath(cwd: string): string {
  return `${storeDir(cwd)}/profile.json`;
}

/** Path of the SQLite database file for a project. */
export function chunksPath(cwd: string): string {
  return `${storeDir(cwd)}/${DATABASE_NAME}`;
}

/** Creates the store directory for a project if it does not exist. */
export async function ensureStoreDir(cwd: string): Promise<void> {
  await ensureVectorDir(storeDir(cwd));
}

/**
 * Opens the project's SQLite database with sqlite-vec loaded and tables created.
 * The caller must close `store.sqlite` when done.
 */
export function openStore(cwd: string): VectorStore {
  return openVectorStore(chunksPath(cwd));
}

/**
 * Creates the store directory and the database tables. Returns the store directory path.
 */
export async function initStore(cwd: string): Promise<string> {
  await ensureStoreDir(cwd);
  openStore(cwd).sqlite.close();
  return storeDir(cwd);
}

/** Validates the profile and writes `profile.json`. */
export async function writeProfile(cwd: string, profile: Profile): Promise<void> {
  await ensureStoreDir(cwd);
  const parsed = profileSchema.parse(profile);
  await Bun.write(profilePath(cwd), `${JSON.stringify(parsed, null, 2)}\n`);
}

/** Reads and validates `profile.json`. Returns null when no profile has been written. */
export async function readProfile(cwd: string): Promise<Profile | null> {
  const file = Bun.file(profilePath(cwd));
  if (!(await file.exists())) return null;
  return profileSchema.parse(await file.json());
}

/**
 * Checks a file against the sources ledger. Returns skip when the same path and content
 * are already trained, or the same content is stored under another path. Returns replace
 * when the path is known but its content changed, and new otherwise.
 */
export async function resolveSource(cwd: string, path: string, contentMd5: string): Promise<SourceDecision> {
  await ensureStoreDir(cwd);
  const store = openStore(cwd);
  try {
    const byPath = store.sqlite.prepare(SOURCE_BY_PATH).get(path) as
      | { id: number; path: string; path_hash: string; content_md5: string; trained_at: number }
      | undefined;
    if (byPath && byPath.content_md5 === contentMd5) {
      return { action: "skip", reason: "already trained" };
    }
    const byMd5 = store.sqlite.prepare(SOURCE_BY_MD5).get(contentMd5) as
      | { id: number; path: string }
      | undefined;
    if (byMd5 && byMd5.path !== path) {
      return { action: "skip", reason: "duplicate content" };
    }
    if (byPath) return { action: "replace", sourceId: byPath.id };
    return { action: "new" };
  } finally {
    store.sqlite.close();
  }
}

function deleteSourceChunks(store: VectorStore, sourceId: number): void {
  const ids = store.sqlite.prepare(CHUNK_IDS).all(sourceId) as Array<{ id: number }>;
  const remove = store.sqlite.prepare(DELETE_VEC);
  for (const row of ids) remove.run(row.id);
  store.sqlite.prepare(DELETE_CHUNKS).run(sourceId);
}

function insertChunks(store: VectorStore, chunks: Chunk[]): void {
  for (const chunk of chunks) {
    store.db.insert(schema.chunks).values({
      content: chunk.content,
      kind: chunk.kind ?? null,
      sourceId: chunk.sourceId ?? null,
    }).run();
    if (chunk.embedding.length === EMBEDDING_DIM) {
      const vector = new Uint8Array(new Float32Array(chunk.embedding).buffer);
      const row = store.sqlite.prepare(LAST_ID).get() as { id: number };
      store.sqlite.prepare(INSERT_VEC).run(row.id, vector);
    }
  }
}

function upsertSourceRow(
  store: VectorStore,
  path: string,
  fileHash: string,
  contentMd5: string,
  replaceId?: number,
): number {
  const trainedAt = Date.now();
  if (replaceId != null) {
    store.db.update(schema.sources).set({
      pathHash: fileHash,
      contentMd5,
      trainedAt,
    }).where(eq(schema.sources.id, replaceId)).run();
    return replaceId;
  }
  store.db.insert(schema.sources).values({
    path,
    pathHash: fileHash,
    contentMd5,
    trainedAt,
  }).run();
  const row = store.sqlite.prepare(LAST_ID).get() as { id: number };
  return row.id;
}

/**
 * Writes a source row and its chunks in one transaction. When `meta.replaceId` is set,
 * the old chunks for that source are deleted first. Returns the source ID. Rolls back on error.
 */
export async function persistSource(
  cwd: string,
  meta: { path: string; pathHash: string; contentMd5: string; replaceId?: number },
  chunks: Chunk[],
): Promise<number> {
  await ensureStoreDir(cwd);
  const store = openStore(cwd);
  try {
    store.sqlite.exec(BEGIN);
    if (meta.replaceId != null) deleteSourceChunks(store, meta.replaceId);
    const sourceId = upsertSourceRow(store, meta.path, meta.pathHash, meta.contentMd5, meta.replaceId);
    insertChunks(store, chunks.map((chunk) => ({ ...chunk, sourceId })));
    store.sqlite.exec(COMMIT);
    return sourceId;
  } catch (error) {
    store.sqlite.exec(ROLLBACK);
    throw error;
  } finally {
    store.sqlite.close();
  }
}

/** Replaces all memory chunks and vectors with the given chunks, in one transaction. */
export async function writeMemory(cwd: string, chunks: Chunk[]): Promise<void> {
  await ensureStoreDir(cwd);
  const store = openStore(cwd);
  try {
    store.sqlite.exec(WIPE_VEC);
    store.db.delete(schema.chunks).run();
    insertChunks(store, chunks);
    store.sqlite.exec(COMMIT);
  } catch (error) {
    store.sqlite.exec(ROLLBACK);
    throw error;
  } finally {
    store.sqlite.close();
  }
}

/** Adds chunks and their vectors to the existing memory in one transaction. Does nothing for an empty list. */
export async function appendMemory(cwd: string, chunks: Chunk[]): Promise<void> {
  if (chunks.length === 0) return;
  await ensureStoreDir(cwd);
  const store = openStore(cwd);
  try {
    store.sqlite.exec(BEGIN);
    insertChunks(store, chunks);
    store.sqlite.exec(COMMIT);
  } catch (error) {
    store.sqlite.exec(ROLLBACK);
    throw error;
  } finally {
    store.sqlite.close();
  }
}

/** Writes the profile and replaces all memory chunks with the given chunks. */
export async function writeCompiled(
  cwd: string,
  profile: Profile,
  chunks: Chunk[],
): Promise<void> {
  await writeProfile(cwd, profile);
  await writeMemory(cwd, chunks);
}

/** Reads the profile and every memory chunk. Returns null when no profile exists. */
export async function readCompiled(
  cwd: string,
): Promise<{ profile: Profile; chunks: Chunk[] } | null> {
  const profile = await readProfile(cwd);
  if (!profile) return null;
  const store = openStore(cwd);
  const chunks = store.db.select().from(schema.chunks).all() as Chunk[];
  store.sqlite.close();
  return { profile, chunks };
}

/**
 * Counts of profile version, sources, memory chunks (and how many came from images), inbox notes,
 * and the time of the most recent training (epoch ms, or null when nothing has been trained).
 */
export type StoreStats = {
  profileVersion: number;
  sources: number;
  chunks: number;
  imageChunks: number;
  inbox: number;
  lastTrainedAt: number | null;
};

/**
 * Returns the store counts. When the database file does not exist yet, every count is zero
 * (the profile version is still read if a profile exists).
 */
export async function storeStats(cwd: string): Promise<StoreStats> {
  const profile = await readProfile(cwd).catch(() => null);
  const empty: StoreStats = {
    profileVersion: profile?.meta.version ?? 0,
    sources: 0,
    chunks: 0,
    imageChunks: 0,
    inbox: 0,
    lastTrainedAt: null,
  };
  if (!(await Bun.file(chunksPath(cwd)).exists())) return empty;
  const store = openStore(cwd);
  try {
    const count = (sql: string) => (store.sqlite.prepare(sql).get() as { n: number }).n;
    const last = store.sqlite.prepare(LAST_TRAINED).get() as { t: number | null };
    return {
      ...empty,
      sources: count(COUNT_SOURCES),
      chunks: count(COUNT_CHUNKS),
      imageChunks: count(COUNT_IMAGE_CHUNKS),
      inbox: count(COUNT_INBOX),
      lastTrainedAt: last.t,
    };
  } finally {
    store.sqlite.close();
  }
}

/** Saves a note to the inbox under the given source label. It is embedded on the next enrich run. */
export async function saveMemory(cwd: string, content: string, source = "mcp"): Promise<void> {
  await ensureStoreDir(cwd);
  const store = openStore(cwd);
  try {
    store.db.insert(schema.inbox).values({
      content,
      source,
      createdAt: Date.now(),
    }).run();
  } finally {
    store.sqlite.close();
  }
}

/** Returns every inbox note. */
export async function listInbox(cwd: string): Promise<InboxItem[]> {
  await ensureStoreDir(cwd);
  const store = openStore(cwd);
  try {
    return store.db.select().from(schema.inbox).all() as InboxItem[];
  } finally {
    store.sqlite.close();
  }
}

/** Deletes every inbox note. */
export async function clearInbox(cwd: string): Promise<void> {
  const store = openStore(cwd);
  try {
    store.db.delete(schema.inbox).run();
  } finally {
    store.sqlite.close();
  }
}

/** Returns the cached values for the given keys. Keys with no entry are absent from the map. */
export async function readModelCache(cwd: string, keys: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (keys.length === 0) return found;
  await ensureStoreDir(cwd);
  const store = openStore(cwd);
  try {
    const rows = store.db
      .select()
      .from(schema.modelCache)
      .where(inArray(schema.modelCache.key, keys))
      .all();
    for (const row of rows) found.set(row.key, row.value);
  } finally {
    store.sqlite.close();
  }
  return found;
}

/** Stores cache entries. An existing key is left alone, since one key always maps to one result. */
export async function writeModelCache(
  cwd: string,
  entries: Array<{ key: string; value: string }>,
): Promise<void> {
  if (entries.length === 0) return;
  await ensureStoreDir(cwd);
  const store = openStore(cwd);
  try {
    for (const entry of entries) {
      store.db
        .insert(schema.modelCache)
        .values({ ...entry, createdAt: Date.now() })
        .onConflictDoNothing()
        .run();
    }
  } finally {
    store.sqlite.close();
  }
}
