/** The contents of `aura.json`. `paths` are glob patterns for files to enrich, and `remote` is empty for local-only use. */
export type AuraConfig = {
  name: string;
  paths: string[];
  remote: string;
  exclude?: string[];
  keys?: { openrouter?: string };
  models?: { llm?: string; vlm?: string; embedding?: string };
  /** Reasoning effort for every chat call. Unset leaves the model's default. */
  reasoning?: ReasoningEffort;
};

/** Accepted values for `reasoning` in `aura.json`. */
export const reasoningEfforts = ["none", "minimal", "low", "medium", "high"] as const;

/** Reasoning effort level sent to OpenRouter. */
export type ReasoningEffort = (typeof reasoningEfforts)[number];

/** Name of the project config file. */
export const AURA_JSON = "aura.json";

/** Model IDs used when `aura.json` does not set a model. */
export const defaultModels = {
  llm: "openai/gpt-4o-mini",
  vlm: "openai/gpt-4o-mini",
  embedding: "openai/text-embedding-3-small",
};

/** Config written by `aura init`: local-only, with default file patterns, exclusions, and models. */
export const defaultConfig: AuraConfig = {
  name: "personal",
  paths: ["**/*.md", "**/*.pdf", "**/*.{png,jpg,jpeg,webp}"],
  remote: "",
  exclude: [".git", "node_modules", ".aura"],
  keys: { openrouter: "" },
  models: { ...defaultModels },
};

/** Path of `aura.json` inside a directory. */
export function configPath(dir: string): string {
  return `${dir.replace(/[\\/]+$/, "")}/${AURA_JSON}`;
}

/** True when `remote` is set to a non-blank value. */
export function hasRemote(config: AuraConfig): boolean {
  return Boolean(config.remote?.trim());
}

/** Reads `aura.json` from a directory. Returns null when the file does not exist. */
export async function loadConfig(dir: string): Promise<AuraConfig | null> {
  const path = configPath(dir);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return null;
  }
  return (await file.json()) as AuraConfig;
}

/** Like `loadConfig`, but throws with a hint to run `aura init` when the file is missing. */
export async function requireConfig(dir: string): Promise<AuraConfig> {
  const config = await loadConfig(dir);
  if (!config) {
    throw new Error(`No ${AURA_JSON} in ${dir}. Run \`aura init\` first.`);
  }
  return config;
}

/** Returns the OpenRouter key from `aura.json`, falling back to `OPENROUTER_API_KEY`. Empty string when neither is set. */
export function openrouterKey(config: AuraConfig): string {
  return config.keys?.openrouter?.trim() || process.env.OPENROUTER_API_KEY?.trim() || "";
}

/** Returns the configured reasoning effort, or undefined when unset. Throws on an unknown value. */
export function reasoningEffort(config: AuraConfig): ReasoningEffort | undefined {
  const value = config.reasoning;
  if (!value) return undefined;
  if (!(reasoningEfforts as readonly string[]).includes(value)) {
    throw new Error(
      `Invalid reasoning "${value}" in ${AURA_JSON}. Use one of: ${reasoningEfforts.join(", ")}.`,
    );
  }
  return value;
}

/** Returns the LLM, vision, and embedding model IDs, using the defaults for any blank value. */
export function modelIds(config: AuraConfig) {
  return {
    llm: config.models?.llm?.trim() || defaultModels.llm,
    vlm: config.models?.vlm?.trim() || defaultModels.vlm,
    embedding: config.models?.embedding?.trim() || defaultModels.embedding,
  };
}
