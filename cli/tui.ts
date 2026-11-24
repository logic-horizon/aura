import { BoxRenderable, TextRenderable, createCliRenderer } from "@opentui/core";
import type { EnrichMode, Progress, ProgressStage } from "@/lib/enrich";

/** Colors shared by the CLI and the terminal views. */
export const palette = {
  bg: "#0d1117",
  panel: "#11161e",
  border: "#2a3242",
  accent: "#7c9cff",
  text: "#e6e9ef",
  dim: "#6b7385",
  ok: "#5eead4",
  warn: "#fbbf24",
  err: "#f87171",
};

const ANSI = {
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  accent: "\x1b[38;2;124;156;255m",
  ok: "\x1b[38;2;94;234;212m",
  err: "\x1b[38;2;248;113;113m",
  reset: "\x1b[0m",
};

/** A named text style that `style` can apply. */
export type StyleRole = Exclude<keyof typeof ANSI, "reset">;

/** True when stdin and stdout are both terminals. */
export function useTty(): boolean {
  return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}

/** Wraps text in ANSI codes when stdout is a terminal. Returns plain text otherwise. */
export function style(text: string, ...roles: StyleRole[]): string {
  if (!process.stdout.isTTY || roles.length === 0) return text;
  return `${roles.map((role) => ANSI[role]).join("")}${text}${ANSI.reset}`;
}

/** Formats a titled block of aligned label and value rows. */
export function summaryCard(title: string, rows: Array<[string, string]>): string {
  const width = rows.reduce((max, [label]) => Math.max(max, label.length), 0);
  return [
    "",
    `  ${style("◆", "accent")} ${style(title, "bold")}`,
    ...rows.map(([label, value]) => `    ${style(label.padEnd(width), "dim")}  ${value}`),
    "",
  ].join("\n");
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FOOTER_ROWS = 6;

const LABELS: Record<ProgressStage, string> = {
  scan: "Scan files",
  check: "Check ledger",
  extract: "Extract",
  judge: "Judge signal",
  novelty: "Novelty check",
  profile: "Build profile",
  embed: "Embed",
  write: "Write to store",
  done: "Done",
};

/** Stages each enrich mode runs, in order. */
const PIPELINES: Record<EnrichMode, ProgressStage[]> = {
  full: ["scan", "check", "extract", "judge", "profile", "embed", "write"],
  again: ["scan", "check", "extract", "judge", "novelty", "profile", "embed", "write"],
  profile: ["scan", "check", "extract", "judge", "profile", "write"],
  memory: ["scan", "check", "extract", "judge", "embed", "write"],
  version: ["write"],
};

/** Handle for a running enrich view. `onProgress` feeds it, and `finish` removes it and leaves the output in scrollback. */
export type CommandUi = {
  onProgress: Progress;
  finish(code: number): Promise<void>;
};

function bar(done: number, total: number, width: number): string {
  const ratio = Math.min(1, Math.max(0, done / total));
  const filled = Math.round(ratio * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}  ${done}/${total}`;
}

function elapsed(started: number): string {
  const seconds = (Date.now() - started) / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
}

function fit(text: string, width: number): string {
  return text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text;
}

/**
 * Opens the enrich progress footer below the scrolling output. Returns null when not running in a
 * terminal or when the renderer fails to start, so callers fall back to plain output.
 * Keys: `d` toggles per-file detail lines, and `q` or Ctrl+C stops the run.
 */
export async function startCommandUi(mode: EnrichMode): Promise<CommandUi | null> {
  if (!useTty()) return null;

  let renderer: Awaited<ReturnType<typeof createCliRenderer>>;
  try {
    renderer = await createCliRenderer({
      screenMode: "split-footer",
      footerHeight: FOOTER_ROWS,
      exitOnCtrlC: false,
      consoleMode: "disabled",
      backgroundColor: palette.bg,
    });
  } catch {
    return null;
  }

  const stages = PIPELINES[mode];
  const seen = new Set<ProgressStage>();
  const started = Date.now();
  let current: ProgressStage | null = null;
  let detail = "";
  let progressBar = "";
  let status = "starting";
  let failed = false;
  let stopped = false;
  let verbose = false;
  let finished = false;
  let frame = 0;

  const root = new BoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    flexDirection: "column",
    backgroundColor: palette.bg,
    paddingX: 2,
  });
  const header = new TextRenderable(renderer, { content: "", fg: palette.accent, height: 1 });
  const rule = new TextRenderable(renderer, { content: "", fg: palette.border, height: 1 });
  const active = new TextRenderable(renderer, { content: "", fg: palette.text, height: 1 });
  const barRow = new TextRenderable(renderer, { content: "", fg: palette.accent, height: 1 });
  const chips = new TextRenderable(renderer, { content: "", fg: palette.dim, height: 1 });
  const hints = new TextRenderable(renderer, { content: "", fg: palette.dim, height: 1 });
  for (const row of [header, rule, active, barRow, chips, hints]) root.add(row);
  renderer.root.add(root);

  const columns = () => Math.max(20, (process.stdout.columns || 80) - 4);

  const chip = (stage: ProgressStage) => {
    const glyph = current === stage ? "●" : seen.has(stage) ? "✓" : "·";
    return `${glyph} ${stage}`;
  };

  function paint(): void {
    const cols = columns();
    const spin = SPINNER[frame % SPINNER.length]!;
    const left = `◆ aura ${mode}`;
    const right = elapsed(started);
    header.content = `${left}${" ".repeat(Math.max(1, cols - left.length - right.length))}${right}`;
    rule.content = "─".repeat(cols);
    if (failed) {
      active.fg = palette.err;
      active.content = fit(stopped ? "■  stopped" : "✗  failed", cols);
    } else {
      active.fg = palette.text;
      const line = current ? `${spin}  ${LABELS[current]}${detail ? `  ·  ${detail}` : ""}` : status;
      active.content = fit(line, cols);
    }
    barRow.content = progressBar ? fit(progressBar, cols) : "";
    chips.content = fit(stages.map(chip).join("  "), cols);
    hints.content = `d ${verbose ? "hide" : "show"} details   ·   q stop`;
    renderer.requestRender();
  }

  async function finish(code: number): Promise<void> {
    if (finished) return;
    finished = true;
    clearInterval(ticker);
    failed = code !== 0;
    stopped = code === 130;
    if (!failed) {
      current = null;
      status = "done";
    }
    paint();
    await Bun.sleep(250);
    renderer.destroy();
  }

  const ticker = setInterval(() => {
    frame += 1;
    paint();
  }, 90);

  renderer.keyInput.on("keypress", (key) => {
    if (key.name === "d") {
      verbose = !verbose;
      paint();
    } else if (key.name === "q" || (key.ctrl && key.name === "c")) {
      void finish(130).then(() => process.exit(130));
    }
  });

  const onProgress: Progress = (event) => {
    if (event.stage === "done") {
      current = null;
      progressBar = "";
      status = event.outcome === "skip" ? "nothing new" : "done";
      paint();
      return;
    }
    current = event.stage;
    seen.add(event.stage);
    detail = event.detail ?? "";
    progressBar = event.total ? bar(event.done ?? 0, event.total, Math.min(40, columns() - 16)) : "";
    if (verbose && detail) console.log(style(`   ${LABELS[event.stage]}  ${detail}`, "dim"));
    paint();
  };

  paint();
  return { onProgress, finish };
}
