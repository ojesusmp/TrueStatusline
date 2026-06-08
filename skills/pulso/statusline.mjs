#!/usr/bin/env node
// PERMANENT - pulso
// pulso v1.4.0
/**
 * pulso — Claude Code statusline.
 * Author: Orlando Molina <https://github.com/ojesusmp>
 * License: MIT
 *
 * Layout (top -> bottom):
 *   1. token line:   tok cached/new/total [ctx] mcp hk
 *   2. model line:   [mdl:<Name>[<ver>]] vX.Y.Z[1m] fx:<effort> think:on style:<name>
 *   3. session line: [5h:NN% (in Xh)  7d:NN% (in Xd)]  $cost  +adds/-dels  [duration]
 *   4. OMC HUD line (if oh-my-claudecode plugin is installed; otherwise omitted)
 *   5. skills line:  full plugin list, soft-wrapped to terminal width, with
 *                    bold cyan highlight on the most-recently-active skill plus a
 *                    [active: <name>] tail.
 *
 * De-duplication: when the OMC HUD line (4) is present it owns the model name,
 * ctx%, 5h/7d rate limits, and session duration, so pulso omits those from
 * lines 1-3 (the bracketed fields above) and shows only what the HUD does not
 * (token breakdown, CC version, [1m], effort, thinking, cost, diff). In
 * standalone mode (no HUD) all fields render. Lines 2 and 3 are also skipped
 * silently when the upstream JSON omits the relevant fields (e.g., free-tier
 * accounts have no rate_limits, models without effort omit effort.level).
 *
 * Design notes:
 *   - Skills line at BOTTOM so a long plugin list does not push the
 *     token/model/session info off-screen on narrow terminals.
 *   - Wrap width is dynamic: process.stdout.columns -> $COLUMNS -> 100.
 *   - HUD delegation runs as a child process (spawnSync) so its output is
 *     guaranteed to flush before the skills line is printed.
 *   - Silent fail on any error -- never breaks statusline rendering.
 *   - Diagnostic capture is opt-in: set PULSO_DEBUG=1 to dump the raw
 *     statusline stdin to PULSO_DEBUG_FILE (default /tmp/pulso-stdin.json)
 *     on each render. Off by default so normal renders never touch disk.
 */

import { existsSync, readdirSync, readFileSync, statSync, openSync, readSync, closeSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  white: "\x1b[97m",
};
const wrap = (color, s) => `${color}${s}${C.reset}`;

async function bufferStdin() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  try {
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) chunks.push(chunk);
    const raw = chunks.join("");
    return raw.trim() ? raw : null;
  } catch { return null; }
}

function parseJsonSafe(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Opt-in diagnostic capture. Dumps the raw statusline stdin so the exact
// keys the running CC build sends can be inspected. Enabled by EITHER:
//   - a live sentinel file (<config>/.pulso-debug) -- toggle with touch/rm,
//     takes effect on the next render, no restart needed; or
//   - PULSO_DEBUG=1 in the environment (set in settings.json, applies on
//     the next CC launch).
// Silent-fail so it can never break rendering.
function writeDiagnostic(raw) {
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  const enabled = process.env.PULSO_DEBUG === "1" || existsSync(join(configDir, ".pulso-debug"));
  if (!enabled) return;
  try {
    const path = process.env.PULSO_DEBUG_FILE || join(tmpdir(), "pulso-stdin.json");
    writeFileSync(path, raw ?? "", "utf8");
  } catch { /* never break the statusline */ }
}

function readEnabledPlugins() {
  try {
    const cfgPath = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "settings.json");
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    return Object.entries(cfg.enabledPlugins || {})
      .filter(([, v]) => v)
      .map(([k]) => k.split("@")[0]);
  } catch { return []; }
}

function tailRead(path, bytes = 65536) {
  try {
    const st = statSync(path);
    const start = Math.max(0, st.size - bytes);
    const len = st.size - start;
    const buf = Buffer.allocUnsafe(len);
    const fd = openSync(path, "r");
    try { readSync(fd, buf, 0, len, start); } finally { closeSync(fd); }
    return buf.toString("utf8");
  } catch { return ""; }
}

function inspectTranscript(transcriptPath) {
  const out = { lastSkill: null, mcpCount: 0, hkCount: 0 };
  if (!transcriptPath || !existsSync(transcriptPath)) return out;
  const tail = tailRead(transcriptPath);
  if (!tail) return out;

  const lines = tail.split("\n").filter(Boolean);
  const parsed = [];
  for (const ln of lines) {
    try { parsed.push(JSON.parse(ln)); } catch { /* skip partial first line */ }
  }

  for (let i = parsed.length - 1; i >= 0; i--) {
    const m = parsed[i];
    if (m?.type !== "assistant") continue;
    const content = m?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type !== "tool_use") continue;
      const n = block?.name || "";
      if (n.startsWith("mcp__")) out.mcpCount++;
      if (!out.lastSkill && (n === "Skill" || n === "proxy_Skill")) {
        out.lastSkill = block?.input?.skill || block?.input?.name || null;
      }
    }
    break;
  }

  if (!out.lastSkill) {
    const cmdRe = /<command-name>\s*([^<\n]+?)\s*<\/command-name>/i;
    for (let i = parsed.length - 1; i >= 0; i--) {
      const m = parsed[i];
      const content = m?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (m.type === "assistant" && block?.type === "tool_use"
            && (block.name === "Skill" || block.name === "proxy_Skill")) {
          out.lastSkill = block?.input?.skill || block?.input?.name || null;
          break;
        }
        if (m.type === "user") {
          const txt = block?.type === "text" ? block.text
            : block?.type === "tool_result" && typeof block.content === "string" ? block.content
            : "";
          const match = txt && cmdRe.exec(txt);
          if (match) {
            const raw = match[1].replace(/^\//, "");
            out.lastSkill = raw.includes(":") ? raw.split(":").pop() : raw;
            break;
          }
        }
      }
      if (out.lastSkill) break;
    }
  }

  let lastUserIdx = -1;
  for (let i = parsed.length - 1; i >= 0; i--) {
    if (parsed[i]?.type === "user") { lastUserIdx = i; break; }
  }
  if (lastUserIdx >= 0) {
    for (let i = lastUserIdx + 1; i < parsed.length; i++) {
      const m = parsed[i];
      if (m?.type !== "attachment") break;
      if ((m?.attachment?.type || "").startsWith("hook_")) out.hkCount++;
    }
    for (let i = lastUserIdx - 1; i >= 0; i--) {
      const m = parsed[i];
      if (m?.type !== "attachment") break;
      if ((m?.attachment?.type || "").startsWith("hook_")) out.hkCount++;
    }
  }
  return out;
}

function fmtNum(n) {
  if (n == null) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return null;
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
}

function fmtCountdown(epochSec) {
  if (!epochSec) return null;
  const diff = epochSec - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "now";
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `in ${d}d${h % 24}h`;
  if (h > 0) return `in ${h}h${m}m`;
  return `in ${m}m`;
}

function pctColor(pct) {
  if (pct == null) return C.gray;
  if (pct >= 80) return C.red;
  if (pct >= 50) return C.yellow;
  return C.green;
}

function effortColor(level) {
  switch ((level || "").toLowerCase()) {
    case "max":
    case "xhigh": return C.red;
    case "high": return C.yellow;
    case "medium": return C.cyan;
    case "low": return C.gray;
    default: return C.gray;
  }
}

function parseModelVersion(id) {
  if (!id) return null;
  const m = /(\d+)-(\d+)/.exec(id);
  return m ? `${m[1]}.${m[2]}` : null;
}

function getTermWidth() {
  if (process.stdout.columns && process.stdout.columns > 20) return process.stdout.columns;
  const env = parseInt(process.env.COLUMNS || "", 10);
  if (env && env > 20) return env;
  return 100;
}

function printSkillsLine(active) {
  const plugins = readEnabledPlugins();
  if (!plugins.length) return;
  const width = getTermWidth();
  const activeKey = active ? String(active).toLowerCase() : "";
  const sep = " · ";
  const header = "skills: ";
  const indent = "        ";
  let line = wrap(C.magenta, header);
  let visibleLen = header.length;
  let first = true;
  for (const p of plugins) {
    const match = activeKey && (p.toLowerCase().includes(activeKey) || activeKey.includes(p.toLowerCase()));
    const decorated = match ? `${C.bold}${C.cyan}${p}${C.reset}` : `${C.cyan}${p}${C.reset}`;
    const addLen = (first ? 0 : sep.length) + p.length;
    if (!first && visibleLen + addLen > width) {
      line += "\n" + indent;
      visibleLen = indent.length;
      line += decorated;
      visibleLen += p.length;
    } else {
      if (!first) { line += `${C.dim}${sep}${C.reset}`; visibleLen += sep.length; }
      line += decorated;
      visibleLen += p.length;
    }
    first = false;
  }
  if (active) {
    const tail = ` [active: ${active}]`;
    if (visibleLen + tail.length > width) line += "\n" + indent;
    line += ` ${wrap(C.dim, "[active:")} ${C.bold}${C.cyan}${active}${C.reset}${wrap(C.dim, "]")}`;
  }
  process.stdout.write(line + "\n");
}

function printTokenLine(stdin, mcpCount, hkCount, hudShown) {
  const usage = stdin?.context_window?.current_usage || {};
  const cached = usage.cache_read_input_tokens || 0;
  const fresh = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  const total = cached + fresh;
  const ctxPct = stdin?.context_window?.used_percentage;
  const ctxColor = ctxPct == null ? C.gray : ctxPct >= 80 ? C.red : ctxPct >= 50 ? C.yellow : C.green;
  const parts = [
    wrap(C.magenta, "tok"),
    `${wrap(C.dim, "cached:")}${wrap(C.cyan, fmtNum(cached))}`,
    `${wrap(C.dim, "new:")}${wrap(C.yellow, fmtNum(fresh))}`,
    `${wrap(C.dim, "total:")}${wrap(C.white, fmtNum(total))}`,
  ];
  // ctx% is shown by the OMC HUD line; only render it here in standalone mode.
  if (!hudShown && ctxPct != null) parts.push(`${wrap(C.dim, "ctx:")}${wrap(ctxColor, ctxPct + "%")}`);
  parts.push(`${wrap(C.dim, "mcp:")}${wrap(C.magenta, mcpCount + "x")}`);
  parts.push(`${wrap(C.dim, "hk:")}${wrap(C.gray, hkCount + "x")}`);
  process.stdout.write(parts.join(" ") + "\n");
}

function printModelLine(stdin, hudShown) {
  const model = stdin?.model;
  const name = model ? (model.display_name || model.id || "?") : null;
  const ver = parseModelVersion(model?.id);
  const ctxSize = stdin?.context_window?.context_window_size;
  const is1m = ctxSize === 1_000_000;
  const effort = stdin?.effort?.level;
  const thinking = stdin?.thinking?.enabled;
  const style = stdin?.output_style?.name;
  const ccVer = stdin?.version;

  const parts = [];
  let oneMShown = false;
  // The OMC HUD line already shows the model name; in standalone mode pulso
  // renders it (with the [1m] badge attached). When the HUD is present we omit
  // the name and attach [1m] to the CC version instead so the badge survives.
  if (!hudShown && name) {
    const verSuffix = ver && !name.includes(ver) ? " " + ver : "";
    let mdl = `${C.bold}${C.cyan}${name}${verSuffix}${C.reset}`;
    if (is1m) { mdl += wrap(C.yellow, "[1m]"); oneMShown = true; }
    parts.push(`${wrap(C.dim, "mdl:")}${mdl}`);
  }
  if (ccVer) {
    let v = `${wrap(C.dim, "v")}${wrap(C.gray, ccVer)}`;
    if (is1m && !oneMShown) { v += wrap(C.yellow, "[1m]"); oneMShown = true; }
    parts.push(v);
  }
  if (is1m && !oneMShown) parts.push(wrap(C.yellow, "[1m]"));
  if (effort) parts.push(`${wrap(C.dim, "fx:")}${wrap(effortColor(effort), effort)}`);
  if (thinking != null) {
    parts.push(`${wrap(C.dim, "think:")}${thinking ? wrap(C.green, "on") : wrap(C.gray, "off")}`);
  }
  if (style && style !== "default") parts.push(`${wrap(C.dim, "style:")}${wrap(C.cyan, style)}`);
  if (parts.length) process.stdout.write(parts.join(" ") + "\n");
}

function printSessionLine(stdin, hudShown) {
  const cost = stdin?.cost || {};
  const rl = stdin?.rate_limits || {};
  const parts = [];

  // Rate limits and session duration are shown by the OMC HUD line; render
  // them here only in standalone mode. Cost and diff are pulso-only and always
  // shown (the HUD reports neither).
  if (!hudShown && rl.five_hour) {
    const p = rl.five_hour.used_percentage;
    const r = fmtCountdown(rl.five_hour.resets_at);
    let s = `${wrap(C.dim, "5h:")}${wrap(pctColor(p), (p != null ? p.toFixed(0) : "?") + "%")}`;
    if (r) s += ` ${wrap(C.gray, "(" + r + ")")}`;
    parts.push(s);
  }
  if (!hudShown && rl.seven_day) {
    const p = rl.seven_day.used_percentage;
    const r = fmtCountdown(rl.seven_day.resets_at);
    let s = `${wrap(C.dim, "7d:")}${wrap(pctColor(p), (p != null ? p.toFixed(0) : "?") + "%")}`;
    if (r) s += ` ${wrap(C.gray, "(" + r + ")")}`;
    parts.push(s);
  }
  if (typeof cost.total_cost_usd === "number") {
    const c = cost.total_cost_usd;
    const col = c >= 5 ? C.red : c >= 1 ? C.yellow : C.green;
    parts.push(wrap(col, "$" + c.toFixed(c >= 1 ? 2 : 3)));
  }
  const adds = cost.total_lines_added;
  const dels = cost.total_lines_removed;
  if (adds != null || dels != null) {
    parts.push(`${wrap(C.green, "+" + (adds || 0))}${wrap(C.dim, "/")}${wrap(C.red, "-" + (dels || 0))}`);
  }
  if (!hudShown) {
    const dur = fmtDuration(cost.total_duration_ms);
    if (dur) parts.push(wrap(C.white, dur));
  }

  if (parts.length) process.stdout.write(parts.join("  ") + "\n");
}

function findHudPath() {
  const home = homedir();
  if (process.env.OMC_DEV === "1") {
    const devPaths = [
      join(home, "Workspace/oh-my-claudecode/dist/hud/index.js"),
      join(home, "workspace/oh-my-claudecode/dist/hud/index.js"),
      join(home, "projects/oh-my-claudecode/dist/hud/index.js"),
    ];
    for (const p of devPaths) if (existsSync(p)) return p;
  }
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(home, ".claude");
  const base = join(configDir, "plugins", "cache", "omc", "oh-my-claudecode");
  if (existsSync(base)) {
    try {
      const versions = readdirSync(base).filter(v => existsSync(join(base, v, "dist/hud/index.js")));
      if (versions.length) {
        const latest = versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).reverse()[0];
        return join(base, latest, "dist/hud/index.js");
      }
    } catch { /* fall through */ }
  }
  return null;
}

function runHudSync(rawStdin, hudPath) {
  if (!hudPath) return false;
  try {
    const res = spawnSync(process.execPath, [hudPath], {
      input: rawStdin || "",
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 4000,
    });
    if (res.stdout) process.stdout.write(res.stdout);
    return true;
  } catch { return false; }
}

async function main() {
  const raw = await bufferStdin();
  writeDiagnostic(raw);
  const stdin = parseJsonSafe(raw);
  const inspect = inspectTranscript(stdin?.transcript_path);

  // When the OMC HUD line is present it owns model/ctx/rate-limits/duration,
  // so pulso drops those to avoid duplication; standalone, pulso shows them.
  const hudPath = findHudPath();
  const hudShown = hudPath != null;

  printTokenLine(stdin, inspect.mcpCount, inspect.hkCount, hudShown);
  printModelLine(stdin, hudShown);
  printSessionLine(stdin, hudShown);
  runHudSync(raw, hudPath);
  printSkillsLine(inspect.lastSkill);
}

main();
