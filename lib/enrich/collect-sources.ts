import type { AuraConfig } from "@/cli/config";
import { md5Bytes } from "@/lib/md5-bytes";
import type { ModelProvider } from "@/lib/models";
import { pathHash } from "@/lib/path-hash";
import { sanitizeFile } from "@/lib/sanitize";
import { listInbox, resolveSource } from "@/vector/store";
import { extractDocument } from "@/lib/enrich/extract-document";
import { judgeSnippets } from "@/lib/enrich/judge-snippets";
import { listFiles } from "@/lib/enrich/list-files";
import { redactPii } from "@/lib/enrich/redact-pii";
import { splitSnippets } from "@/lib/enrich/split-snippets";
import type { PendingSource, Progress, Skip } from "@/lib/enrich/types";

/**
 * Scans the project files and queued inbox notes. Returns the sources that need training, with
 * their judged snippets, and a message for each file or note skipped and why. Files whose content
 * is already in the ledger are skipped.
 */
export async function collectSources(
  cwd: string,
  config: AuraConfig,
  provider: ModelProvider,
  onProgress?: Progress,
): Promise<{ pending: PendingSource[]; skipped: Skip[] }> {
  const pending: PendingSource[] = [];
  const skipped: Skip[] = [];

  onProgress?.({ stage: "scan", detail: "looking for files" });
  const files = await listFiles(cwd, config);
  onProgress?.({ stage: "scan", detail: `${files.length} files`, outcome: "ok" });

  for (const [position, relative] of files.entries()) {
    const abs = `${cwd}/${relative}`;
    onProgress?.({ stage: "check", detail: relative, done: position, total: files.length });
    const result = await sanitizeFile(abs);
    if (typeof result === "string") {
      skipped.push({ path: relative, reason: result });
      continue;
    }
    const contentMd5 = md5Bytes(result.bytes);
    const fileHash = pathHash(relative);
    const decision = await resolveSource(cwd, relative, contentMd5);
    if (decision.action === "skip") {
      skipped.push({ path: relative, reason: decision.reason });
      continue;
    }
    try {
      onProgress?.({
        stage: "extract",
        detail: result.kind === "image" ? `describing ${relative}` : relative,
        done: position,
        total: files.length,
      });
      const text = await extractDocument(relative, result.kind, result.bytes, provider);
      const snippets = await judgeSnippets(provider, splitSnippets(text), onProgress, relative);
      pending.push({
        path: relative,
        pathHash: fileHash,
        contentMd5,
        replaceId: decision.action === "replace" ? decision.sourceId : undefined,
        snippets,
        kind: result.kind === "image" ? "image" : "memory",
      });
    } catch (error) {
      skipped.push({ path: relative, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  for (const item of await listInbox(cwd)) {
    const text = await redactPii(provider, item.content);
    if (!text) continue;
    const path = `inbox:${item.id}`;
    const contentMd5 = md5Bytes(text);
    const decision = await resolveSource(cwd, path, contentMd5);
    if (decision.action === "skip") {
      skipped.push({ path, reason: decision.reason });
      continue;
    }
    const snippets = await judgeSnippets(provider, splitSnippets(text), onProgress, path);
    pending.push({
      path,
      pathHash: pathHash(path),
      contentMd5,
      replaceId: decision.action === "replace" ? decision.sourceId : undefined,
      snippets,
      kind: "memory",
    });
  }

  return { pending, skipped };
}
