export type AuraConfig = {
  name: string;
  paths: string[];
  remote: string;
  exclude?: string[];
};

export const AURA_JSON = "aura.json";

export const defaultConfig: AuraConfig = {
  name: "personal",
  paths: ["**/*.md"],
  remote: "",
  exclude: [".git", "node_modules", ".aura"],
};

export function configPath(dir: string): string {
  return `${dir.replace(/[\\/]+$/, "")}/${AURA_JSON}`;
}

export function hasRemote(config: AuraConfig): boolean {
  return Boolean(config.remote?.trim());
}

export async function loadConfig(dir: string): Promise<AuraConfig | null> {
  const path = configPath(dir);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return null;
  }
  return (await file.json()) as AuraConfig;
}

export async function requireConfig(dir: string): Promise<AuraConfig> {
  const config = await loadConfig(dir);
  if (!config) {
    throw new Error(`No ${AURA_JSON} in ${dir}. Run \`aura init\` first.`);
  }
  return config;
}
