# pulso

> Six-line Claude Code statusline. Host:path, tokens, model + reasoning effort, session rate-limits + cost, memory-leak watch, MCP and hook counts, soft-wrapped enabled-skills list with active-skill highlight.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Marketplace](https://img.shields.io/badge/Claude%20Code-Marketplace-7c3aed)](#install)
[![npm](https://img.shields.io/badge/npx-github%3Aojesusmp%2Fpulso-cb3837)](#c-npm--npx)

```
myhost:~/skill-hardener tok cached:50.2k new:1.0k total:51.2k ctx:42% mcp:3x hk:5x
mdl:Opus 4.7[1m] v2.1.90 fx:high think:on
5h:24% (in 4h12m)  7d:41% (in 5d3h)  $0.12  +156/-23  9m4s
mem top:1.2G node:1.4G claude:0.8G
[OMC HUD line, if oh-my-claudecode is installed]
skills: pulso · oh-my-claudecode · silex · ... [active: pulso]
```

Lines 2–5 collapse silently when their data is absent — free tier sees fewer rows; Opus 1M-context user sees them all. The mem line (4) is Windows-only (uses `tasklist`) and silently absent elsewhere; it turns yellow at 5120MB and red with a `resume?` warning at 6656MB on the largest single node/claude process.

When the oh-my-claudecode HUD line is present, pulso de-duplicates against it: the fields the HUD already shows (model name, `ctx%`, `5h`/`7d` rate limits, session duration) are dropped from pulso's own lines, leaving only what the HUD doesn't render (token breakdown, CC version, `[1m]`, effort, thinking, cost, diff). Without the HUD, pulso shows everything (as in the example above).

## Why

Default Claude Code statusline shows a working directory and not much else. For someone running Claude Code as their daily driver, the genuinely useful state lives in the JSON the harness already passes to your statusline command: model variant, reasoning effort, thinking toggle, rate-limit usage with countdown to reset, session cost and diff impact, and per-turn MCP/hook activity. Pulso renders all of that, color-coded, in a layout that survives narrow terminals.

## Install

Pick one. Marketplace is recommended.

### A) Claude Code marketplace

```text
/plugin marketplace add ojesusmp/pulso
/plugin install pulso@pulso
```

Then restart Claude Code. The plugin's `SessionStart` hook auto-runs `install.mjs` (idempotent) and the statusline activates on the next session start.

> **First install needs two restarts** because Claude Code reads `statusLine.command` once at session start, before plugin SessionStart hooks fire. The bundled `/pulso:setup` slash command collapses this to one restart.

### B) Curl-pipe-bash

```sh
curl -fsSL https://raw.githubusercontent.com/ojesusmp/pulso/main/install.sh | bash
```

Clones to `~/.pulso` (or pulls if present) and runs `install.mjs`. Override the path with `PULSO_DIR=...`. Re-runnable.

```sh
# Inspect, don't change
curl -fsSL https://raw.githubusercontent.com/ojesusmp/pulso/main/install.sh | bash -s -- --check

# Roll back
curl -fsSL https://raw.githubusercontent.com/ojesusmp/pulso/main/install.sh | bash -s -- --uninstall
```

### C) npm / npx

No clone, no marketplace, just the bin wrapper:

```sh
npx -y github:ojesusmp/pulso pulso install
```

Or globally:

```sh
npm install -g github:ojesusmp/pulso
pulso install
pulso check
pulso uninstall
```

## What it shows

Six layers, top to bottom — see [skills/pulso/SKILL.md](./skills/pulso/SKILL.md) for the full field reference.

| Line | Source | Color logic |
|---|---|---|
| **token** (+ host:path) | `os.hostname()`, `workspace.current_dir`, `context_window.current_usage` | `ctx%` green/yellow/red @ 50/80 |
| **model** | `model`, `effort`, `thinking`, `output_style`, `version` | `fx:` gray→cyan→yellow→red across `low/medium/high/xhigh/max` |
| **session** | `cost`, `rate_limits` | rate-limit % at 50/80; cost yellow ≥$1, red ≥$5 |
| **mem** (Windows only) | `tasklist` (biggest node/claude process) | green/yellow/red @ 5120/6656MB, `resume?` at red |
| **OMC HUD** | upstream child process | OMC's own colors |
| **skills** | `enabledPlugins` + transcript scan | active skill bold cyan |

All field names map 1:1 to the [Claude Code statusLine docs](https://code.claude.com/docs/en/statusline.md).

## Slash command

After install, `/pulso:setup` re-runs the installer in verbose mode and walks the user through the restart cycle. Use it if the SessionStart hook didn't fire or to recover from a broken statusline.

## Diagnostics

To inspect the exact statusline JSON your Claude Code build sends pulso (useful when a field doesn't render), enable opt-in capture. It dumps the raw stdin to `/tmp/pulso-stdin.json` (override with `PULSO_DEBUG_FILE`) on each render. Off by default — normal renders never touch disk.

```sh
# Live toggle — effective on the next render, no restart:
touch ~/.claude/.pulso-debug      # on
cat /tmp/pulso-stdin.json         # inspect after the statusline repaints
rm   ~/.claude/.pulso-debug       # off

# Static toggle — set in settings.json env, applies on next launch:
#   "env": { "PULSO_DEBUG": "1" }
```

## Uninstall

Any of these:

```sh
pulso uninstall
# or
node ~/.pulso/skills/pulso/install.mjs --uninstall
# or
curl -fsSL https://raw.githubusercontent.com/ojesusmp/pulso/main/install.sh | bash -s -- --uninstall
```

If pulso patched your `settings.json` `statusLine.command`, the uninstaller restores the prior value (saved under `_pulsoPriorCommand`). It also picks up legacy `_ojStatuslinePriorCommand` backups from the older `oj-statusline` plugin — so migrating from `oj-statusline → pulso → uninstall` still leaves you back at whatever you originally had.

## Migration from `oj-statusline`

`pulso` is the rebrand of the earlier `oj-statusline` plugin. Differences:

| | oj-statusline | pulso |
|---|---|---|
| HUD destination | `~/.claude/hud/oj-statusline.mjs` | `~/.claude/hud/pulso.mjs` |
| Marker file | `.oj-statusline-bootstrapped` | `.pulso-bootstrapped` |
| Backup key | `_ojStatuslinePriorCommand` | `_pulsoPriorCommand` (auto-migrates from legacy key) |
| Slash command | `/oj-statusline:setup` | `/pulso:setup` |
| Repo | `github.com/ojesusmp/claude-skills` (multi-plugin marketplace) | `github.com/ojesusmp/pulso` (dedicated repo) |
| Layout | 3 lines (token, OMC HUD, skills) | 5 lines (+model, +session) |

Both can coexist — installing `pulso` will not delete the old `oj-statusline.mjs` file or its marker. After verifying pulso works, uninstall the legacy plugin via Claude Code's `/plugin uninstall` flow.

## Files

```
pulso/
├── .claude-plugin/
│   ├── marketplace.json     # /plugin marketplace add ojesusmp/pulso
│   └── plugin.json          # plugin manifest
├── bin/
│   └── pulso.mjs            # npm bin wrapper (npx / npm install -g)
├── commands/
│   └── setup.md             # /pulso:setup slash command
├── skills/
│   └── pulso/
│       ├── SKILL.md         # full skill docs
│       ├── statusline.mjs   # the runtime
│       └── install.mjs      # installer (idempotent, --hook / --check / --uninstall)
├── install.sh               # curl-pipe-bash entry
├── package.json             # npm metadata + bin
├── README.md                # this file
├── CHANGELOG.md             # version history
└── LICENSE                  # MIT
```

## Compatibility

- Claude Code 1.x or newer (any platform: macOS, Linux, Windows, WSL).
- Node.js 18+ (uses async stdin iteration and `node:` import prefixes).
- Single file runtime, zero npm dependencies.

## License

MIT — see [LICENSE](./LICENSE).

## Origin

Built by [Orlando Molina](https://github.com/ojesusmp). Pulso is the post-rebrand of `oj-statusline`, a Karpathy-style single-purpose skill paired with a caveman-style multi-channel installer.
