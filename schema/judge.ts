import { z } from "zod";

/** Reply schema for snippet judging: the 0-based indices of the snippets to keep. */
export const judgeSchema = z.object({
  keep: z.array(z.number().int()),
});
