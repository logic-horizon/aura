import { redactValue } from "@/lib/redact-value";
import type { ModelProvider } from "@/lib/models";
import { profileSchema, type Profile } from "@/schema/profile";
import { excludeSimilar } from "@/lib/enrich/exclude-similar";
import type { Progress } from "@/lib/enrich/types";

const TEXT_SAMPLE = 12000;

const SYSTEM = `Extract a compact Aura profile JSON from the text. Use only the provided schema keys.
Fill each field only from evidence in the text. Leave it empty when the text has none.
- identity, principles (values, ethics, decision_rules, boundaries, avoid), expertise, and career (profession, industries, projects, goals, working_style).
- code, write, create, work, communicate: top-level entries, each with summary, style, preferences, rules, and avoid. They hold how the user works in each area. Writing style goes in write. Image descriptions are evidence for create. Learning signals (how they study, how they want material explained) go in work.
- voice: only how the user speaks, from transcripts, dialogue, or their own description of their speech. Fields: summary, pace, pitch, accent (only if stated), tone, cadence, vocabulary, fillers, avoid. Never invent a voice.
No emails, phones, street addresses, full family/last names, IDs, or household details. identity.name is the person's given first name followed by the initial of their family name, as the text states it (for example, "Name: Alex Kim" or "Name: Alex K." gives "Alex K."). Never a full family name. Use a public handle only when no name is stated. Do not leave it empty when the text states one. identity.location is city/region only. Empty strings or arrays if unknown.`;

/**
 * Reduces `identity.name` to the given first name plus the initial of the family name, such as
 * "Sifat S.". Stray quotes or punctuation are removed, and words after the second are dropped, so a
 * full family name never reaches the profile. Returns "" when no name is present.
 */
function displayName(name: string): string {
  const [given, family] = name.replace(/[^\p{L}\p{N}@_'.-]+/gu, " ").trim().split(/\s+/);
  if (!given) return "";
  const initial = family?.replace(/\.$/, "")[0];
  return initial ? `${given} ${initial.toUpperCase()}.` : given;
}

/**
 * Builds the profile from judged snippets. Without a previous profile it creates version 1. Otherwise
 * it merges the snippets into the previous profile and raises the version by one. Returns null when
 * there is no text to use, or when every snippet is already similar to memory on an incremental run.
 */
export async function buildProfile(
  cwd: string,
  provider: ModelProvider,
  snippets: string[],
  previous: Profile | null,
  incremental: boolean,
  onProgress?: Progress,
): Promise<Profile | null> {
  const judged = snippets.slice(0, 80);
  const sample = judged.join("\n\n").slice(0, TEXT_SAMPLE);
  if (!sample) return null;

  if (!previous || previous.meta.version === 0) {
    onProgress?.({ stage: "profile", detail: "generating profile" });
    const profile = await provider.completeStructured(
      SYSTEM,
      sample,
      profileSchema,
    );
    profile.meta.version = 1;
    profile.meta.updated_at = new Date().toISOString();
    profile.identity.name = displayName(profile.identity.name);
    return redactValue(profile);
  }

  if (incremental) {
    onProgress?.({
      stage: "novelty",
      detail: `checking ${judged.length} snippets for profile`,
    });
  }
  const distinct = incremental
    ? await excludeSimilar(cwd, provider, judged)
    : judged;
  if (distinct.length === 0) return null;

  onProgress?.({
    stage: "profile",
    detail: `merging ${distinct.length} new snippets`,
  });
  const merged = await provider.completeStructured(
    `${SYSTEM} Merge into the existing profile. Keep stable identity, but fill identity.name from the new signal if it is empty. Raise meta.version by 1.`,
    `Existing profile:\n${JSON.stringify(previous)}\n\nNew signal:\n${distinct.join("\n\n").slice(0, TEXT_SAMPLE)}`,
    profileSchema,
  );
  merged.meta.version = previous.meta.version + 1;
  merged.meta.updated_at = new Date().toISOString();
  merged.identity.name = displayName(merged.identity.name);
  return redactValue(merged);
}
