export type TasteLayer = Record<string, unknown>;

export type CompiledProfile = {
  linguistic: TasteLayer;
  aesthetic: TasteLayer;
  behavioral: TasteLayer;
  updatedAt: string;
};

export type TasteChunk = {
  layer: "linguistic" | "aesthetic" | "behavioral";
  content: string;
  embedding: number[];
};

export const DIR_NAME = ".aura";

export function emptyProfile(): CompiledProfile {
  return {
    linguistic: {},
    aesthetic: {},
    behavioral: {},
    updatedAt: new Date().toISOString(),
  };
}

export function storeDir(cwd: string): string {
  return `${cwd.replace(/[\\/]+$/, "")}/${DIR_NAME}`;
}

export function profilePath(cwd: string): string {
  return `${storeDir(cwd)}/profile.json`;
}

export function chunksPath(cwd: string): string {
  return `${storeDir(cwd)}/chunks.json`;
}

export async function writeCompiled(
  cwd: string,
  profile: CompiledProfile,
  chunks: TasteChunk[],
): Promise<void> {
  await Bun.write(profilePath(cwd), `${JSON.stringify(profile, null, 2)}\n`);
  await Bun.write(chunksPath(cwd), `${JSON.stringify(chunks, null, 2)}\n`);
}

export async function readCompiled(
  cwd: string,
): Promise<{ profile: CompiledProfile; chunks: TasteChunk[] } | null> {
  const file = Bun.file(profilePath(cwd));
  if (!(await file.exists())) {
    return null;
  }
  const profile = (await file.json()) as CompiledProfile;
  const chunksFile = Bun.file(chunksPath(cwd));
  const chunks = (await chunksFile.exists())
    ? ((await chunksFile.json()) as TasteChunk[])
    : [];
  return { profile, chunks };
}
