/** A memory match from `searchMemory`. `distance` is set for vector matches and absent for keyword matches. */
export type SearchResult = {
  content: string;
  kind?: string | null;
  distance?: number;
};

/**
 * Which part of enrich to run: `full` (profile and memory), `again` (incremental, skips similar snippets),
 * `profile` (profile only), `memory` (memory only), or `version` (snapshot the current profile as a new version).
 */
export type EnrichMode = "full" | "again" | "profile" | "memory" | "version";

/** Pipeline stage named in a progress event, in run order. `done` marks the end of a run. */
export type ProgressStage =
  | "scan"
  | "check"
  | "extract"
  | "judge"
  | "novelty"
  | "profile"
  | "embed"
  | "write"
  | "done";

/** Callback that receives progress events during enrich. `done` and `total` drive progress bars. */
export type Progress = (event: {
  stage: ProgressStage;
  detail?: string;
  done?: number;
  total?: number;
  outcome?: "ok" | "skip" | "fail";
}) => void;

/** A file or inbox note that enrich did not use, and why. `path` is relative to the project, or `inbox:<id>`. */
export type Skip = {
  path: string;
  reason: string;
};

/** A file or inbox note that passed the ledger check and is ready to persist. `replaceId` is set when an existing source is replaced. */
export type PendingSource = {
  path: string;
  pathHash: string;
  contentMd5: string;
  replaceId?: number;
  snippets: string[];
  /** `image` for chunks described from an image file. These are never returned by memory search. */
  kind: "memory" | "image";
};
