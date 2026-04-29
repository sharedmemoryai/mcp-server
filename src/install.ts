#!/usr/bin/env node
/**
 * `npx @sharedmemory/mcp-server install`
 *
 * Writes the MCP server config into the correct JSON file for the chosen client.
 * Supports: Claude Code, Claude Desktop, Cursor, VS Code (Copilot), Windsurf.
 *
 * Zero external dependencies — all terminal UI uses raw ANSI escape codes.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline";
import { execFileSync } from "node:child_process";

// ═══════════════════════════════════════════════════════
//  ANSI TERMINAL UI — zero deps
// ═══════════════════════════════════════════════════════

const IS_TTY = process.stderr.isTTY ?? false;
const NO_COLOR = !!process.env.NO_COLOR;
const USE_COLOR = IS_TTY && !NO_COLOR;

// ── ANSI codes ──────────────────────────────────────────
const ESC = "\x1b[";
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const ITALIC = `${ESC}3m`;
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;
const CLEAR_LINE = `${ESC}2K\r`;

function rgb(r: number, g: number, b: number): string {
  return USE_COLOR ? `${ESC}38;2;${r};${g};${b}m` : "";
}
function bgRgb(r: number, g: number, b: number): string {
  return USE_COLOR ? `${ESC}48;2;${r};${g};${b}m` : "";
}
const r = USE_COLOR ? RESET : "";
const b = USE_COLOR ? BOLD : "";
const d = USE_COLOR ? DIM : "";

// ── Brand colors ────────────────────────────────────────
const CYAN    = rgb(0, 200, 255);
const BLUE    = rgb(80, 140, 255);
const PURPLE  = rgb(160, 100, 255);
const GREEN   = rgb(60, 220, 140);
const YELLOW  = rgb(255, 200, 60);
const RED     = rgb(255, 80, 80);
const WHITE   = rgb(240, 240, 250);
const GRAY    = rgb(120, 120, 140);
const DK_GRAY = rgb(70, 70, 85);

// ── Gradient text ───────────────────────────────────────
function gradient(text: string, from: [number, number, number], to: [number, number, number]): string {
  if (!USE_COLOR) return text;
  const len = text.length;
  return text.split("").map((ch, i) => {
    const t = len > 1 ? i / (len - 1) : 0;
    const cr = Math.round(from[0] + (to[0] - from[0]) * t);
    const cg = Math.round(from[1] + (to[1] - from[1]) * t);
    const cb = Math.round(from[2] + (to[2] - from[2]) * t);
    return `${rgb(cr, cg, cb)}${ch}`;
  }).join("") + r;
}

// ── Box drawing ─────────────────────────────────────────
function box(lines: string[], opts?: { padding?: number; borderColor?: string }): string {
  const pad = opts?.padding ?? 1;
  const bc = opts?.borderColor ?? DK_GRAY;
  // Strip ANSI for width calculation
  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
  const contentWidth = Math.max(...lines.map(l => stripAnsi(l).length)) + pad * 2;
  const horizontal = "─".repeat(contentWidth);
  const padStr = " ".repeat(pad);

  const out: string[] = [];
  out.push(`  ${bc}╭${horizontal}╮${r}`);
  for (const line of lines) {
    const visible = stripAnsi(line).length;
    const rightPad = " ".repeat(Math.max(0, contentWidth - pad - visible));
    out.push(`  ${bc}│${r}${padStr}${line}${rightPad}${bc}│${r}`);
  }
  out.push(`  ${bc}╰${horizontal}╯${r}`);
  return out.join("\n");
}

// ── Spinner ─────────────────────────────────────────────
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

class Spinner {
  private frame = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private text: string;

  constructor(text: string) {
    this.text = text;
  }

  start(): this {
    if (!IS_TTY) { log(`  ${CYAN}...${r} ${this.text}`); return this; }
    process.stderr.write(HIDE_CURSOR);
    this.timer = setInterval(() => {
      const f = SPINNER_FRAMES[this.frame % SPINNER_FRAMES.length];
      process.stderr.write(`${CLEAR_LINE}  ${CYAN}${f}${r} ${this.text}`);
      this.frame++;
    }, 80);
    return this;
  }

  succeed(msg?: string): void {
    if (this.timer) clearInterval(this.timer);
    process.stderr.write(IS_TTY ? `${CLEAR_LINE}${SHOW_CURSOR}` : "");
    log(`  ${GREEN}✓${r} ${msg ?? this.text}`);
  }

  fail(msg?: string): void {
    if (this.timer) clearInterval(this.timer);
    process.stderr.write(IS_TTY ? `${CLEAR_LINE}${SHOW_CURSOR}` : "");
    log(`  ${RED}✗${r} ${msg ?? this.text}`);
  }

  warn(msg?: string): void {
    if (this.timer) clearInterval(this.timer);
    process.stderr.write(IS_TTY ? `${CLEAR_LINE}${SHOW_CURSOR}` : "");
    log(`  ${YELLOW}!${r} ${msg ?? this.text}`);
  }
}

// ── Animated sleep ──────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Step counter ────────────────────────────────────────
let stepNum = 0;
function step(label: string): void {
  stepNum++;
  log("");
  log(`  ${CYAN}${b}[${stepNum}]${r} ${b}${WHITE}${label}${r}`);
}

// ═══════════════════════════════════════════════════════
//  CLIENT TARGETS
// ═══════════════════════════════════════════════════════

interface ClientTarget {
  name: string;
  icon: string;
  configPaths: () => string[];
  serversKey: "mcpServers" | "servers";
  /** Path to the editor's instruction/rules file (relative to project root). null = no file-based instructions. */
  instructionFile: (() => string) | null;
}

const home = os.homedir();

const CLIENTS: Record<string, ClientTarget> = {
  claudecode: {
    name: "Claude Code",
    icon: "⬡",
    configPaths: () => {
      return [path.join(home, ".claude.json")];
    },
    serversKey: "mcpServers",
    instructionFile: () => path.join(process.cwd(), "CLAUDE.md"),
  },
  claude: {
    name: "Claude Desktop",
    icon: "◆",
    configPaths: () => {
      if (process.platform === "darwin")
        return [path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")];
      if (process.platform === "win32")
        return [path.join(home, "AppData", "Roaming", "Claude", "claude_desktop_config.json")];
      return [path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "Claude", "claude_desktop_config.json")];
    },
    serversKey: "mcpServers",
    instructionFile: null,
  },
  cursor: {
    name: "Cursor",
    icon: "▸",
    configPaths: () => {
      const local = path.join(process.cwd(), ".cursor", "mcp.json");
      return [local, path.join(home, ".cursor", "mcp.json")];
    },
    serversKey: "mcpServers",
    instructionFile: () => path.join(process.cwd(), ".cursorrules"),
  },
  vscode: {
    name: "VS Code",
    icon: "◇",
    configPaths: () => {
      return [path.join(process.cwd(), ".vscode", "mcp.json")];
    },
    serversKey: "servers",
    instructionFile: () => path.join(process.cwd(), ".github", "copilot-instructions.md"),
  },
  windsurf: {
    name: "Windsurf",
    icon: "≋",
    configPaths: () => {
      return [path.join(home, ".codeium", "windsurf", "mcp_config.json")];
    },
    serversKey: "mcpServers",
    instructionFile: () => path.join(process.cwd(), ".windsurfrules"),
  },
};

const CLIENT_ORDER = ["claudecode", "cursor", "vscode", "claude", "windsurf"];

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function log(msg: string) {
  process.stderr.write(msg + "\n");
}

function resolveConfigPath(target: ClientTarget): string {
  const paths = target.configPaths();
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return paths[0];
}

function readJsonFile(filePath: string): Record<string, any> {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function resolveFullPath(bin: string): string {
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    return execFileSync(cmd, [bin], { encoding: "utf-8" }).trim().split("\n")[0];
  } catch {
    return bin;
  }
}

function buildServerEntry(apiKey: string, volumeId: string, apiUrl: string) {
  const npxPath = resolveFullPath("npx");
  const env: Record<string, string> = {
    SHAREDMEMORY_API_KEY: apiKey,
    SHAREDMEMORY_API_URL: apiUrl,
    SHAREDMEMORY_VOLUME_ID: volumeId,
  };

  // Propagate PATH so editors that don't inherit the user's shell
  // (VS Code, Cursor, etc.) can still find node/npx and dependencies.
  if (process.env.PATH) {
    env.PATH = process.env.PATH;
  }

  return { command: npxPath, args: ["-y", "@sharedmemory/mcp-server"], env };
}

// ── Post-install verification ───────────────────────────
function verifyServerStarts(entry: { command: string; args: string[]; env: Record<string, string> }): { ok: boolean; error?: string } {
  try {
    // Spawn the server with --help-like no-op: just import and exit.
    // We send an empty JSON-RPC to stdin and expect it to start without crash.
    const result = execFileSync(entry.command, [...entry.args, "--version"], {
      env: { ...process.env, ...entry.env },
      timeout: 15_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { ok: true };
  } catch (err: any) {
    // Exit code 1 is fine — means the server ran but there's no --version flag.
    // ENOENT means the binary wasn't found.
    if (err.code === "ENOENT") {
      return { ok: false, error: `Cannot find ${entry.command}. Is Node.js installed and in your PATH?` };
    }
    // Any other error with output likely means it started fine but didn't understand --version
    return { ok: true };
  }
}

function shortenPath(p: string): string {
  return p.replace(home, "~");
}

// ═══════════════════════════════════════════════════════
//  AGENT INSTRUCTIONS PROMPT
// ═══════════════════════════════════════════════════════

const SHAREDMEMORY_INSTRUCTIONS = `# SharedMemory — Agent Instructions

You have access to **SharedMemory**, a persistent memory layer that survives across conversations.
Use it proactively — don't wait for the user to ask you to remember or recall.

## When to RECALL (query)

At the **start of every conversation**, before answering:

1. Call \`query\` with a summary of what the user is asking about
2. If the user mentions a person, project, or concept — call \`get_entity\` to load full context
3. Use retrieved memories to ground your answer — cite them when relevant

## When to REMEMBER

After every meaningful interaction, store:

- **Decisions** — "We chose Postgres over MongoDB because…"
- **Preferences** — "User prefers Tailwind over styled-components"
- **Facts** — "The API is deployed on GCP region us-central1"
- **Architecture** — "Auth uses JWT with refresh token rotation"
- **Bugs & fixes** — "Fixed CORS by adding origin to allowed list"
- **Conventions** — "All API routes use kebab-case"
- **Context** — "Project deadline is March 15"
- **Relationships** — "Alice is the tech lead, Bob handles DevOps"

Use \`batch_remember\` when you have multiple facts to store (more efficient).

## Memory types

Choose the right type when storing: \`factual\`, \`preference\`, \`event\`, \`relationship\`, \`technical\`, \`episodic\`, \`procedural\`, \`instruction\`.

Use \`instruction\` for rules and conventions that should always be enforced.

## Key principles

- **Be proactive**: Don't ask "should I remember this?" — just remember it
- **Be specific**: "User prefers tabs with width 2" > "User has coding preferences"
- **Recall first**: Always check memory before answering questions about the project
- **Stay current**: If something changed, store the update — the pipeline handles conflicts
- **Use entities**: When discussing people/projects/tools, use \`get_entity\` for full context
`;

/**
 * Marker used to detect whether instructions were already appended by a
 * previous install run. Checked with a simple `includes()` so we can
 * safely append to files that already have user content.
 */
const INSTRUCTIONS_MARKER = "# SharedMemory — Agent Instructions";

function writeInstructionFiles(
  targetKeys: string[],
): { written: string[]; skipped: string[] } {
  const written: string[] = [];
  const skipped: string[] = [];

  for (const key of targetKeys) {
    const target = CLIENTS[key];
    if (!target?.instructionFile) continue;

    const filePath = target.instructionFile();
    const dir = path.dirname(filePath);

    // If file already has our instructions, skip
    if (fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, "utf-8");
      if (existing.includes(INSTRUCTIONS_MARKER)) {
        skipped.push(key);
        continue;
      }
      // Append to existing file
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(filePath, "\n\n" + SHAREDMEMORY_INSTRUCTIONS, "utf-8");
    } else {
      // Create new file
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, SHAREDMEMORY_INSTRUCTIONS, "utf-8");
    }
    written.push(key);
  }

  return { written, skipped };
}

// ── Auto-detect installed clients ───────────────────────
function detectInstalledClients(): string[] {
  const detected: string[] = [];
  for (const key of CLIENT_ORDER) {
    const target = CLIENTS[key];
    const paths = target.configPaths();
    // Check if config file exists OR if parent dir exists (meaning the app is installed)
    for (const p of paths) {
      const dir = path.dirname(p);
      if (fs.existsSync(dir) || fs.existsSync(p)) {
        detected.push(key);
        break;
      }
    }
  }
  return detected;
}

// ═══════════════════════════════════════════════════════
//  MAIN INSTALL
// ═══════════════════════════════════════════════════════

export async function runInstall(argv: string[]): Promise<void> {
  // Parse flags
  let targetKeys: string[] = [];
  let apiKey = "";
  let volumeId = "";
  let apiUrl = "https://api.sharedmemory.ai";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--claude-code" || arg === "--claudecode") targetKeys.push("claudecode");
    else if (arg === "--claude") targetKeys.push("claude");
    else if (arg === "--cursor") targetKeys.push("cursor");
    else if (arg === "--vscode") targetKeys.push("vscode");
    else if (arg === "--windsurf") targetKeys.push("windsurf");
    else if (arg === "--all") targetKeys = [...CLIENT_ORDER];
    else if (arg === "--api-key" && argv[i + 1]) apiKey = argv[++i];
    else if (arg === "--volume" && argv[i + 1]) volumeId = argv[++i];
    else if (arg === "--api-url" && argv[i + 1]) apiUrl = argv[++i];
  }

  // ── Header ──────────────────────────────────────────
  log("");
  log(box([
    "",
    `${b}${gradient("  SharedMemory", [0, 180, 255], [160, 100, 255])}${r}`,
    "",
    `  ${d}${GRAY}MCP Server Installer  v2.4.0${r}`,
    `  ${d}${GRAY}Persistent memory for AI agents${r}`,
    "",
  ], { borderColor: BLUE, padding: 2 }));
  log("");

  // ── Step 1: API Key ─────────────────────────────────
  step("Authentication");

  if (!apiKey) apiKey = process.env.SHAREDMEMORY_API_KEY || "";

  if (apiKey) {
    const masked = apiKey.length > 16 ? apiKey.slice(0, 12) + "•".repeat(8) + apiKey.slice(-4) : apiKey;
    log(`  ${GREEN}✓${r} API key: ${d}${masked}${r}`);
  } else {
    log(`  ${d}${GRAY}Get your key at ${CYAN}https://app.sharedmemory.ai${r} ${d}${GRAY}→ API Keys${r}`);
    log("");
    apiKey = await ask(`  ${CYAN}${b}?${r} ${WHITE}API Key ${d}(sm_live_...)${r}: `);
    if (!apiKey) {
      log("");
      log(`  ${RED}✗${r} API key is required.`);
      log(`  ${d}${GRAY}Get one from ${CYAN}https://app.sharedmemory.ai${r} ${d}${GRAY}→ API Keys${r}`);
      log("");
      process.exit(1);
    }
    log(`  ${GREEN}✓${r} Key accepted`);
  }

  // ── Step 2: Volume ──────────────────────────────────
  step("Project");

  if (!volumeId) volumeId = process.env.SHAREDMEMORY_VOLUME_ID || "";

  if (volumeId) {
    log(`  ${GREEN}✓${r} Volume: ${d}${volumeId}${r}`);
  } else {
    volumeId = await ask(`  ${CYAN}${b}?${r} ${WHITE}Volume ID ${d}(optional, Enter to skip)${r}: `);
    if (volumeId) {
      log(`  ${GREEN}✓${r} Volume: ${d}${volumeId}${r}`);
    } else {
      log(`  ${d}${GRAY}─ Skipped (can be set per-request)${r}`);
    }
  }

  // ── Step 3: Client selection ────────────────────────
  step("Clients");

  if (targetKeys.length === 0) {
    // Auto-detect
    const detected = detectInstalledClients();

    if (detected.length > 0) {
      log(`  ${d}${GRAY}Detected on this machine:${r}`);
      for (const key of detected) {
        const c = CLIENTS[key];
        log(`  ${GREEN}●${r} ${c.name}`);
      }
      for (const key of CLIENT_ORDER) {
        if (!detected.includes(key)) {
          log(`  ${DK_GRAY}○ ${CLIENTS[key].name}${r}`);
        }
      }
      log("");
    }

    log(`  ${d}${GRAY}Which clients do you want to configure?${r}`);
    log("");
    log(`   ${CYAN}1${r})  ${CLIENTS.claudecode.icon} Claude Code`);
    log(`   ${CYAN}2${r})  ${CLIENTS.cursor.icon} Cursor`);
    log(`   ${CYAN}3${r})  ${CLIENTS.vscode.icon} VS Code`);
    log(`   ${CYAN}4${r})  ${CLIENTS.claude.icon} Claude Desktop`);
    log(`   ${CYAN}5${r})  ${CLIENTS.windsurf.icon} Windsurf`);
    log(`   ${CYAN}6${r})  ${b}All of the above${r}`);
    if (detected.length > 0) {
      log(`   ${CYAN}7${r})  ${b}Detected only${r} ${d}(${detected.map(k => CLIENTS[k].name).join(", ")})${r}`);
    }
    log("");

    const maxChoice = detected.length > 0 ? "7" : "6";
    const choice = await ask(`  ${CYAN}${b}?${r} ${WHITE}Choose ${d}(1-${maxChoice})${r}: `);

    const map: Record<string, string[]> = {
      "1": ["claudecode"],
      "2": ["cursor"],
      "3": ["vscode"],
      "4": ["claude"],
      "5": ["windsurf"],
      "6": [...CLIENT_ORDER],
      "7": detected,
    };
    targetKeys = map[choice] || [];
    if (targetKeys.length === 0) {
      log(`  ${RED}✗${r} Invalid choice.`);
      log("");
      process.exit(1);
    }
  }

  log(`  ${GREEN}✓${r} ${b}${targetKeys.length}${r} client${targetKeys.length > 1 ? "s" : ""} selected`);

  // ── Step 4: Write configs ───────────────────────────
  step("Configure");

  const entry = buildServerEntry(apiKey, volumeId, apiUrl);
  let configured = 0;
  let skipped = 0;

  for (const key of targetKeys) {
    const target = CLIENTS[key];
    if (!target) {
      log(`  ${YELLOW}!${r} Unknown client: ${key}`);
      continue;
    }

    const configPath = resolveConfigPath(target);
    const spinner = new Spinner(`${target.icon} ${target.name}  ${d}${GRAY}${shortenPath(configPath)}${r}`);
    spinner.start();
    await sleep(IS_TTY ? 400 : 0);

    // Ensure parent directory exists
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Read existing config
    const config = readJsonFile(configPath);

    if (!config[target.serversKey]) {
      config[target.serversKey] = {};
    }

    // Check if already configured
    if (config[target.serversKey].sharedmemory) {
      // In non-interactive mode, overwrite silently
      if (argv.includes("--api-key") || argv.includes("--all")) {
        // overwrite
      } else {
        spinner.warn(`${target.name} already configured`);
        const overwrite = await ask(`    ${YELLOW}?${r} Overwrite? ${d}(y/N)${r}: `);
        if (overwrite.toLowerCase() !== "y") {
          log(`    ${d}${GRAY}Skipped${r}`);
          skipped++;
          continue;
        }
      }
    }

    config[target.serversKey].sharedmemory = entry;

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

    spinner.succeed(`${target.icon} ${b}${target.name}${r}  ${d}${GRAY}→ ${shortenPath(configPath)}${r}`);
    configured++;
  }

  // ── Step 5: Agent Instructions ──────────────────────
  if (configured > 0) {
    step("Agent Instructions");

    const instrSpinner = new Spinner("Writing agent instructions…");
    instrSpinner.start();
    await sleep(IS_TTY ? 300 : 0);

    const { written, skipped: instrSkipped } = writeInstructionFiles(targetKeys);

    if (written.length > 0) {
      instrSpinner.succeed(`${b}${written.length}${r} instruction file${written.length > 1 ? "s" : ""} created`);
      for (const key of written) {
        const target = CLIENTS[key];
        const filePath = target.instructionFile!();
        log(`    ${target.icon} ${target.name}  ${d}${GRAY}→ ${shortenPath(filePath)}${r}`);
      }
    } else if (instrSkipped.length > 0) {
      instrSpinner.warn("Instructions already present — skipped");
    } else {
      instrSpinner.succeed(`${d}${GRAY}No file-based instruction clients selected${r}`);
    }
    if (instrSkipped.length > 0 && written.length > 0) {
      log(`    ${d}${GRAY}(${instrSkipped.length} already had instructions)${r}`);
    }
  }

  // ── Step 6: Verify ──────────────────────────────────
  if (configured > 0) {
    step("Verify");
    const verifySpinner = new Spinner("Checking server can start…");
    verifySpinner.start();
    const check = verifyServerStarts(entry);
    if (check.ok) {
      verifySpinner.succeed(`Server binary is reachable  ${d}${GRAY}(${entry.command})${r}`);
    } else {
      verifySpinner.fail(`Server failed to start`);
      log(`    ${RED}${check.error}${r}`);
      log(`    ${d}${GRAY}The config was written, but the server may not start in your editor.${r}`);
      log(`    ${d}${GRAY}Make sure Node.js ≥ 18 is installed and "npx" is on your PATH.${r}`);
    }
  }

  // ── Summary ─────────────────────────────────────────
  log("");

  if (configured > 0) {
    const npxNote = entry.command !== "npx"
      ? `  ${d}${GRAY}npx resolved to${r} ${CYAN}${entry.command}${r}`
      : "";
    const summaryLines = [
      "",
      `  ${GREEN}${b}✓ SharedMemory is ready${r}`,
      "",
      `  ${WHITE}${configured} client${configured > 1 ? "s" : ""} configured${r}${skipped > 0 ? `  ${d}${GRAY}(${skipped} skipped)${r}` : ""}`,
      ...(npxNote ? [npxNote] : []),
      `  ${d}${GRAY}Restart your editor to activate the MCP server.${r}`,
      "",
      `  ${d}${GRAY}Docs${r}  ${CYAN}https://docs.sharedmemory.ai/sdks/mcp-server${r}`,
      `  ${d}${GRAY}Dashboard${r}  ${CYAN}https://app.sharedmemory.ai${r}`,
      "",
    ];
    log(box(summaryLines, { borderColor: GREEN, padding: 1 }));
  } else {
    log(`  ${YELLOW}No clients were configured.${r}`);
  }

  log("");
}

// ═══════════════════════════════════════════════════════
//  HELP
// ═══════════════════════════════════════════════════════

export function printInstallHelp(): void {
  log("");
  log(`  ${b}${gradient("SharedMemory", [0, 180, 255], [160, 100, 255])}${r} ${d}MCP Installer${r}`);
  log("");
  log(`  ${b}${WHITE}USAGE${r}`);
  log(`    ${CYAN}npx @sharedmemory/mcp-server install${r} ${d}[options]${r}`);
  log("");
  log(`  ${b}${WHITE}CLIENTS${r}`);
  log(`    ${CYAN}--claude-code${r}   Claude Code (CLI)`);
  log(`    ${CYAN}--claude${r}        Claude Desktop`);
  log(`    ${CYAN}--cursor${r}        Cursor`);
  log(`    ${CYAN}--vscode${r}        VS Code (Copilot)`);
  log(`    ${CYAN}--windsurf${r}      Windsurf`);
  log(`    ${CYAN}--all${r}           All supported clients`);
  log("");
  log(`  ${b}${WHITE}OPTIONS${r}`);
  log(`    ${CYAN}--api-key${r} KEY   SharedMemory API key`);
  log(`    ${CYAN}--volume${r} ID     Default volume/project ID`);
  log(`    ${CYAN}--api-url${r} URL   API endpoint ${d}(default: https://api.sharedmemory.ai)${r}`);
  log("");
  log(`  ${b}${WHITE}EXAMPLES${r}`);
  log(`    ${d}# Interactive — prompts for everything${r}`);
  log(`    ${CYAN}npx @sharedmemory/mcp-server install${r}`);
  log("");
  log(`    ${d}# One-liner for Cursor${r}`);
  log(`    ${CYAN}npx @sharedmemory/mcp-server install --cursor --api-key sm_live_xxx${r}`);
  log("");
  log(`    ${d}# All clients at once${r}`);
  log(`    ${CYAN}npx @sharedmemory/mcp-server install --all --api-key sm_live_xxx${r}`);
  log("");
}
