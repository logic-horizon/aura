import {
  BoxRenderable,
  TextRenderable,
  createCliRenderer,
} from "@opentui/core";
import type { Profile } from "@/schema/profile";
import { palette } from "@/cli/tui";

const label = (key: string) => key.replace(/_/g, " ");

/** Renders one profile section as readable text: bullets for lists, `key: value` for fields. */
function sectionText(section: Record<string, unknown>): string {
  return Object.entries(section)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        const items = value.length
          ? value.map((item) => `  • ${String(item)}`)
          : ["  —"];
        return [label(key), ...items, ""].join("\n");
      }
      if (value && typeof value === "object") {
        const fields = Object.entries(value).map(
          ([name, item]) => `  ${label(name)}: ${String(item)}`,
        );
        return [label(key), ...fields, ""].join("\n");
      }
      return `${label(key)}: ${String(value ?? "") || "—"}\n`;
    })
    .join("\n");
}

/**
 * Opens an interactive browser for the profile: a section list on the left and the selected
 * section on the right. `↑`/`↓` or `k`/`j` move, and `q`, Esc, or Ctrl+C quits.
 */
export async function browseProfile(profile: Profile): Promise<void> {
  const sections = Object.entries(profile) as Array<
    [string, Record<string, unknown>]
  >;

  const renderer = await createCliRenderer({
    screenMode: "alternate-screen",
    exitOnCtrlC: false,
    consoleMode: "disabled",
    backgroundColor: palette.bg,
  });

  const root = new BoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    flexDirection: "column",
    backgroundColor: palette.bg,
    padding: 1,
  });
  const title = new TextRenderable(renderer, {
    content: "◆  aura profile",
    fg: palette.accent,
    height: 1,
  });
  const columns = new BoxRenderable(renderer, {
    flexGrow: 1,
    flexDirection: "row",
  });
  const menu = new BoxRenderable(renderer, {
    width: 26,
    border: true,
    borderStyle: "rounded",
    borderColor: palette.border,
    title: " sections ",
    titleColor: palette.dim,
    paddingX: 1,
    flexDirection: "column",
  });
  const detail = new BoxRenderable(renderer, {
    flexGrow: 1,
    border: true,
    borderStyle: "rounded",
    borderColor: palette.border,
    titleColor: palette.accent,
    paddingX: 2,
    flexDirection: "column",
  });
  const menuRows = sections.map(
    () =>
      new TextRenderable(renderer, { content: "", fg: palette.dim, height: 1 }),
  );
  const body = new TextRenderable(renderer, { content: "", fg: palette.text });
  const footer = new TextRenderable(renderer, {
    content: "↑/↓ move   ·   q quit",
    fg: palette.dim,
    height: 1,
  });

  for (const row of menuRows) menu.add(row);
  detail.add(body);
  columns.add(menu);
  columns.add(detail);
  root.add(title);
  root.add(columns);
  root.add(footer);
  renderer.root.add(root);

  let selected = 0;

  function paint(): void {
    menuRows.forEach((row, index) => {
      const active = index === selected;
      row.content = `${active ? "› " : "  "}${label(sections[index]![0])}`;
      row.fg = active ? palette.accent : palette.dim;
    });
    const [key, section] = sections[selected]!;
    detail.title = ` ${label(key)} `;
    body.content = sectionText(section);
    renderer.requestRender();
  }

  paint();

  await new Promise<void>((resolve) => {
    renderer.keyInput.on("keypress", (key) => {
      if (key.name === "down" || key.name === "j") {
        selected = Math.min(sections.length - 1, selected + 1);
      } else if (key.name === "up" || key.name === "k") {
        selected = Math.max(0, selected - 1);
      } else if (
        key.name === "q" ||
        key.name === "escape" ||
        (key.ctrl && key.name === "c")
      ) {
        renderer.destroy();
        resolve();
        return;
      } else {
        return;
      }
      paint();
    });
  });
}
