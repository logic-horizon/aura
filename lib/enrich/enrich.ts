import type { AuraConfig } from "@/cli/config";
import { getProvider } from "@/lib/models";
import {
  clearInbox,
  persistSource,
  readProfile,
  writeProfile,
} from "@/vector/store";
import { buildProfile } from "@/lib/enrich/build-profile";
import { collectSources } from "@/lib/enrich/collect-sources";
import { embed } from "@/lib/enrich/embed";
import { excludeSimilar } from "@/lib/enrich/exclude-similar";
import type { EnrichMode, Progress, Skip } from "@/lib/enrich/types";

/** Takes one item from each list in turn, so a size limit applied later keeps every source represented. */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let index = 0; index < longest; index++) {
    for (const list of lists) if (index < list.length) out.push(list[index]!);
  }
  return out;
}

/**
 * Runs enrich for a project. Mode `version` snapshots the current profile as a new version and returns.
 * Other modes collect pending sources, rebuild the profile when the mode needs it, and write memory chunks.
 * Throws when there are no usable files and no existing profile. The `chunks` count is set only for
 * modes that write memory.
 */
export async function enrich(
  cwd: string,
  config: AuraConfig,
  mode: EnrichMode,
  onProgress?: Progress,
): Promise<{ profile?: number; chunks?: number; skipped: Skip[] }> {
  if (mode === "version") {
    const profile = await readProfile(cwd);
    if (!profile)
      throw new Error("No profile to version. Run aura enrich first.");
    profile.meta.version += 1;
    profile.meta.updated_at = new Date().toISOString();
    onProgress?.({
      stage: "write",
      detail: `profile v${profile.meta.version}`,
    });
    await writeProfile(cwd, profile);
    onProgress?.({ stage: "done", outcome: "ok" });
    return { profile: profile.meta.version, skipped: [] };
  }

  const provider = await getProvider(cwd);
  const { pending, skipped } = await collectSources(
    cwd,
    config,
    provider,
    onProgress,
  );
  const judged = interleave(pending.map((item) => item.snippets));
  const previous = await readProfile(cwd);
  const later = Boolean(previous && previous.meta.version > 0);
  let profile = previous;

  if (pending.length === 0 && !later && mode !== "memory") {
    throw new Error(
      `No usable files.${skipped.length ? `\n${skipped.map((item) => `skipped ${item.path}: ${item.reason}`).join("\n")}` : ""}`,
    );
  }

  if (mode === "full" || mode === "again" || mode === "profile") {
    const next = await buildProfile(
      cwd,
      provider,
      judged,
      previous,
      later,
      onProgress,
    );
    if (next) {
      onProgress?.({ stage: "write", detail: `profile v${next.meta.version}` });
      await writeProfile(cwd, next);
      profile = next;
    }
  }

  if (mode === "full" || mode === "again" || mode === "memory") {
    let written = 0;
    for (const [position, item] of pending.entries()) {
      if (mode === "again") {
        onProgress?.({
          stage: "novelty",
          detail: item.path,
          done: position,
          total: pending.length,
        });
      }
      const selected =
        mode === "again"
          ? await excludeSimilar(cwd, provider, item.snippets)
          : item.snippets;
      onProgress?.({
        stage: "embed",
        detail: `${selected.length} snippets from ${item.path}`,
        done: position,
        total: pending.length,
      });
      const chunks = await embed(provider, selected, item.kind);
      onProgress?.({
        stage: "write",
        detail: item.path,
        done: position,
        total: pending.length,
      });
      await persistSource(cwd, item, chunks);
      written += chunks.length;
    }
    await clearInbox(cwd);
    onProgress?.({
      stage: "done",
      outcome: pending.length === 0 ? "skip" : "ok",
    });
    return { profile: profile?.meta.version, chunks: written, skipped };
  }

  onProgress?.({
    stage: "done",
    outcome: pending.length === 0 ? "skip" : "ok",
  });
  return { profile: profile?.meta.version, skipped };
}
