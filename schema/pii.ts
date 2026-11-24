import { z } from "zod";

/** Reply schema for PII redaction: the text with personal details replaced. */
export const piiSchema = z.object({
  text: z.string(),
});
