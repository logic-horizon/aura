import { z } from "zod";

const strings = z.array(z.string());

/** The five use categories a client can ask for. Each is a top-level profile entry. */
export const CATEGORY_NAMES = ["code", "write", "create", "work", "communicate"] as const;

/** How the user works in one category: a short summary, style, preferences, rules, and things to avoid. */
const category = z.object({
  summary: strings,
  style: strings,
  preferences: strings,
  rules: strings,
  avoid: strings,
});

/**
 * The compiled Aura profile: identity, the five use categories, principles, expertise, career, a
 * spoken-voice brief, and current context, plus `meta` with version, update time, and confidence.
 * It stores taste and working style only and contains no personal details.
 */
export const profileSchema = z.object({
  identity: z.object({
    name: z.string(),
    role: z.string(),
    bio: z.string(),
    location: z.string(),
    languages: strings,
  }),
  code: category,
  write: category,
  create: category,
  work: category,
  communicate: category,
  principles: z.object({
    values: strings,
    ethics: strings,
    decision_rules: strings,
    boundaries: strings,
    avoid: strings,
  }),
  expertise: z.object({
    domains: strings,
    skills: strings,
    technologies: strings,
    knowledge_level: z.record(z.string(), z.string()),
  }),
  career: z.object({
    profession: z.string(),
    industries: strings,
    projects: strings,
    goals: strings,
    working_style: strings,
  }),
  voice: z.object({
    summary: z.string(),
    pace: z.string(),
    pitch: z.string(),
    accent: z.string(),
    tone: strings,
    cadence: strings,
    vocabulary: strings,
    fillers: strings,
    avoid: strings,
  }),
  context: z.object({
    current_focus: strings,
    important_entities: strings,
    active_topics: strings,
  }),
  meta: z.object({
    version: z.number(),
    updated_at: z.string(),
    confidence: z.number(),
  }),
});

/** A validated profile, inferred from `profileSchema`. */
export type Profile = z.infer<typeof profileSchema>;
