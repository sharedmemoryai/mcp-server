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
  },
  cursor: {
    name: "Cursor",
    icon: "▸",
    configPaths: () => {
      const local = path.join(process.cwd(), ".cursor", "mcp.json");
      return [local, path.join(home, ".cursor", "mcp.json")];
    },
    serversKey: "mcpServers",
  },
  vscode: {
    name: "VS Code",
    icon: "◇",
    configPaths: () => {
      return [path.join(process.cwd(), ".vscode", "mcp.json")];
    },
    serversKey: "servers",
  },
  windsurf: {
    name: "Windsurf",
    icon: "≋",
    configPaths: () => {
      return [path.join(home, ".codeium", "windsurf", "mcp_config.json")];
    },
    serversKey: "mcpServers",
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

function buildServerEntry(apiKey: string, volumeId: string, apiUrl: string) {
  return {
    command: "npx",
    args: ["-y", "@sharedmemory/mcp-server"],
    env: {
      SHAREDMEMORY_API_KEY: apiKey,
      SHAREDMEMORY_API_URL: apiUrl,
      SHAREDMEMORY_VOLUME_ID: volumeId,
    },
  };
}

function shortenPath(p: string): string {
  return p.replace(home, "~");
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
    `  ${d}${GRAY}MCP Server Installer  v2.1.0${r}`,
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

  // ── Summary ─────────────────────────────────────────
  log("");

  if (configured > 0) {
    const summaryLines = [
      "",
      `  ${GREEN}${b}✓ SharedMemory is ready${r}`,
      "",
      `  ${WHITE}${configured} client${configured > 1 ? "s" : ""} configured${r}${skipped > 0 ? `  ${d}${GRAY}(${skipped} skipped)${r}` : ""}`,
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
