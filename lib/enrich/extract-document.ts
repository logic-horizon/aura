import type { ModelProvider } from "@/lib/models";
import { imageMime, type FileKind } from "@/lib/sanitize";
import { extractPdf } from "@/lib/enrich/extract-pdf";
import { redactPii } from "@/lib/enrich/redact-pii";

/** Style-only prompt for the vision model. Portraits are described by styling and mood, never by identity. */
function imagePrompt(hint: string): string {
  return `Describe only the visual style of this image: palette, lighting, composition, mood, materials, and styling. If a person appears, describe pose, clothing, and setting only. Never describe a face, body shape, age, ethnicity, or identity, and never name anyone. Filename hint (already redacted, use only as a subject hint): ${hint || "none"}.`;
}

/**
 * Turns a sanitized file into plain text for judging: Markdown is decoded as UTF-8, PDFs are
 * extracted, and images are described by the vision model using the redacted filename as a hint.
 * The result is PII-redacted.
 */
export async function extractDocument(
  relative: string,
  kind: FileKind,
  bytes: Uint8Array,
  provider: ModelProvider,
): Promise<string> {
  if (kind === "image") {
    const name = (relative.split(/[\\/]/).pop() ?? "").replace(/\.[^.]+$/, "");
    const hint = await redactPii(provider, name);
    const raw = await provider.describeImage(bytes, imageMime(relative), imagePrompt(hint));
    return redactPii(provider, raw);
  }
  const raw = kind === "md" ? new TextDecoder().decode(bytes) : await extractPdf(bytes);
  return redactPii(provider, raw);
}
