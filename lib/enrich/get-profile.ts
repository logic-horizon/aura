import { redactValue } from "@/lib/redact-value";
import type { Profile } from "@/schema/profile";
import { readProfile } from "@/vector/store";

/**
 * Returns the stored profile with personal details redacted. Throws when no profile exists,
 * so enrich must run first.
 */
export async function getProfile(cwd: string): Promise<Profile> {
  const profile = await readProfile(cwd);
  if (!profile) throw new Error("No local profile. Run aura enrich first.");
  return redactValue(profile);
}
