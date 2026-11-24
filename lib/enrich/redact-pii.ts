import type { ModelProvider } from "@/lib/models";
import { piiSchema } from "@/schema/pii";

const SYSTEM = `Redact personally identifiable information from the text.
Remove emails, phones, street and postal addresses, family and last names, IDs, and household details.
Keep a given name or public handle. Location may stay as city or region only.
Replace removed spans with [redacted]. Keep the rest of the wording. Return JSON { "text": "..." }.`;

/**
 * Asks the LLM to replace personal details with `[redacted]` and returns the cleaned text.
 * Blank input is returned unchanged without a model call.
 */
export async function redactPii(
  provider: ModelProvider,
  text: string,
): Promise<string> {
  if (!text.trim()) return text;
  const result = await provider.completeStructured(SYSTEM, text, piiSchema);
  return result.text;
}
