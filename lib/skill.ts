/** Agent Skills name for a folder: lowercase letters, digits, and single hyphens, at most 64 characters. */
export function skillName(folder: string): string {
  const name = folder
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  return name || "aura";
}

/** Writes the packaged `SKILL.md` into `cwd`, named after the folder. Overwrites any existing file. */
export async function writeSkill(cwd: string): Promise<string> {
  const template = await Bun.file(
    new URL("../assets/SKILL.md", import.meta.url),
  ).text();
  const folder = cwd.split(/[\\/]/).filter(Boolean).pop() ?? "";
  const path = `${cwd.replace(/[\\/]+$/, "")}/SKILL.md`;
  await Bun.write(path, template.replace("__SKILL_NAME__", skillName(folder)));
  return path;
}
