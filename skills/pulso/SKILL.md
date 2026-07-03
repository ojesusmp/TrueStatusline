---
name: pulso
description: Six-line Claude Code statusline with host:path prefix, token breakdown (cached/new/total/ctx%), model + reasoning effort + thinking + Claude Code version, session rate-limits + cost + diff impact + duration, memory-leak watch, MCP and hook counts, and a soft-wrapped enabled-skills list with active-skill highlight. Augments oh-my-claudecode HUD when present, runs standalone otherwise. Trigger phrases - "install pulso", "pulso install", "/pulso".
---

# pulso

Single-file Node.js statusline for Claude Code. Drop-in for any machine with Node 18+.

## What it shows

```
myhost:~/skill-hardener tok cached:50.2k new:1.0k total:51.2k ctx:42% mcp:3x hk:5x
mdl:Opus 4.7[1m] v2.1.90 fx:high think:on
5h:24% (in 4h12m)  7d:41% (in 5d3h)  $0.12  +156/-23  9m4s
mem top:1.2G node:1.4G claude:0.8G
[OMC HUD line, if oh-my-claudecode is installed]
skills: line-check · pulso · forge-council · ... [active: pulso]
```

Six layers, top to bottom (lines 2–5 collapse silently when their data is absent):

1. **Token line** — `host:path` prefix (hostname + shortened cwd) followed by context-window breakdown:
   - `cached` (cyan) — `cache_read_input_tokens`
   - `new` (yellow) — `input_tokens + cache_creation_input_tokens`
   - `total` (white) — sum
   - `ctx` (green/yellow/red @ 50/80 thresholds) — used percentage
   - `mcp:Nx` (magenta) — count of `mcp__*` tool_use blocks in last assistant turn
   - `hk:Nx` (gray) — count of `hook_*` attachments around the most recent user prompt

2. **Model line** — live session metadata from the Claude Code statusline JSON:
   - `mdl:<DisplayName> <X.Y>` — `model.display_name` + parsed major.minor from `model.id`. The `[1m]` suffix appears when `context_window.context_window_size === 1_000_000` (Opus 1M-context flavor).
   - `v<version>` — Claude Code version string (so you notice in-place upgrades).
   - `fx:<level>` — `effort.level`, color-coded gray → cyan → yellow → red as it climbs `low/medium/high/xhigh/max`. Reflects mid-session `/effort` changes on the next refresh.
   - `think:on|off` — extended-thinking toggle, when the model exposes it.
   - `style:<name>` — `output_style.name`, hidden when set to `default`.
   - Each segment is independently optional; missing JSON fields just disappear instead of leaving a placeholder.

3. **Session line** — running-session totals:
   - `5h:NN% (in Xh Ym)` and `7d:NN% (in Xd Yh)` — Pro/Max rate-limit usage with countdown to reset (`rate_limits.{five_hour,seven_day}`). Color-coded at 50% / 80%.
   - `$NN.NN` — `cost.total_cost_usd`, color-coded at $1 / $5 thresholds.
   - `+adds/-dels` — `cost.total_lines_added` / `cost.total_lines_removed`.
   - `<duration>` — `cost.total_duration_ms` formatted human-friendly.
   - Free-tier and quiet sessions silently skip this line.

4. **Mem line** — memory-leak watch: biggest single `node.exe`/`claude.exe` process plus totals for each, from one `tasklist` call per render (throttled ~3s). Yellow at 5120MB / red at 6656MB on the largest single process, with a `resume?` warning at the red threshold — thresholds match the `claude-guard.ps1` watchdog. Windows-only; silently absent elsewhere.

5. **OMC HUD line** — preserved when oh-my-claudecode plugin is installed; silently skipped otherwise.

6. **Skills line** (bottom) — magenta `skills:` label + cyan plugin names from `enabledPlugins`. Bolds the most-recently-used skill (detected via `Skill` tool_use OR `<command-name>` slash invocation parsed from transcript tail). Soft-wraps to terminal width.

> **Honest limit**: per-tool token attribution does not exist in transcript JSONL. `mcp:` and `hk:` are **counts**, not tokens.

## Why bottom-anchor the skills line?

Long plugin lists used to push token/HUD info off-screen on narrow terminals (half-width tile, side-by-side panes). Moving skills to the bottom keeps token / model / session data + HUD always visible regardless of plugin count.

## Install

Three install paths, pick one. Marketplace is the recommended path for Claude Code users.

### A) Claude Code marketplace

```text
/plugin marketplace add ojesusmp/pulso
/plugin install pulso@pulso
```

Restart Claude Code. The plugin's `SessionStart` hook auto-runs `install.mjs` (idempotent) and the statusline activates on the next session start.

> **Note**: the SessionStart hook patches `~/.claude/settings.json` `statusLine.command` and copies the runtime to `~/.claude/hud/pulso.mjs`. Both are reversible via the uninstaller.

### B) Curl-pipe-bash (over `git clone`)

```sh
curl -fsSL https://raw.githubusercontent.com/ojesusmp/pulso/main/install.sh | bash
```

Clones the repo to `~/.pulso` (or pulls if already present) and runs `install.mjs`. Idempotent.

### C) npm / npx

```sh
npx -y github:ojesusmp/pulso pulso install
```

Or globally:

```sh
npm install -g github:ojesusmp/pulso
pulso install
```

Subcommands: `install` (default), `check`, `uninstall`.

### Manual install

Already cloned the repo? Run the installer directly:

```sh
node "$(find ~/.claude/plugins -path '*pulso*install.mjs' | head -1)"
```

Check current state without changing anything:

```sh
node <path>/install.mjs --check
```

Uninstall (restores prior command if backed up):

```sh
node <path>/install.mjs --uninstall
```

## Verification

After install, restart Claude Code. Or test directly with a synthetic JSON payload that exercises all six lines (save it to a file and pipe it in — inline `-e` strings can mangle Windows backslashes in some shells):

```json
{
  "model": { "id": "claude-opus-4-7", "display_name": "Opus" },
  "version": "2.1.90",
  "effort": { "level": "high" },
  "thinking": { "enabled": true },
  "workspace": { "current_dir": "/home/you/some/project" },
  "context_window": {
    "context_window_size": 1000000, "used_percentage": 42,
    "current_usage": { "input_tokens": 1000, "cache_read_input_tokens": 50000, "cache_creation_input_tokens": 2000 }
  },
  "cost": { "total_cost_usd": 0.12, "total_duration_ms": 544000, "total_lines_added": 156, "total_lines_removed": 23 },
  "rate_limits": {
    "five_hour":  { "used_percentage": 24, "resets_at": 9999999999 },
    "seven_day":  { "used_percentage": 41, "resets_at": 9999999999 }
  }
}
```

```sh
node ~/.claude/hud/pulso.mjs < payload.json
```

Expect up to 6 lines: host:path+token, model, session, mem (Windows only), optional OMC HUD, skills. Lines 2, 3, and 4 are silently skipped on free-tier accounts, very early in a session, or on non-Windows platforms (mem line) respectively.

## Files

- `SKILL.md` — this file
- `statusline.mjs` — the runtime (reads stdin, prints up to 6 lines)
- `install.mjs` — installer that wires `settings.json`

## Notes

- File at `~/.claude/hud/pulso.mjs` survives plugin updates (lives outside the plugin cache).
- HUD delegation runs as `spawnSync` child process so its output is guaranteed to flush before the skills line is printed.
- Silent fail on malformed input — never breaks statusline rendering.
- Idempotency markers in source: `// PERMANENT - pulso` and `// pulso v1.5.0`.
- Migrating from `oj-statusline`? `install.mjs` carries forward any `_ojStatuslinePriorCommand` backup into `_pulsoPriorCommand`, so `pulso uninstall` still rolls back to whatever was there before either plugin touched your settings.
- Mem line thresholds (5120MB warn / 6656MB crit) match the `claude-guard.ps1` watchdog so the statusline and the watchdog agree on when a session is worth resuming.
