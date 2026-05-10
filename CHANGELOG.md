# Changelog

All notable changes to pulso are documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] — 2026-05-09

Initial release of `pulso` — the rebrand of the earlier `oj-statusline` plugin, with new model and session lines and a multi-channel installer.

### Added

- **Model line** (line 2 of the statusline) showing live Claude Code session metadata pulled from the statusline JSON contract:
  - `mdl:<DisplayName> <X.Y>[1m]` — `model.display_name` + parsed major.minor from `model.id` (e.g. `Opus 4.7`, `Sonnet 4.6`, `Haiku 4.5`). The `[1m]` suffix is auto-detected when `context_window.context_window_size === 1_000_000`.
  - `v<version>` — Claude Code's own version string from the JSON, in dim gray.
  - `fx:<level>` — `effort.level` (`low`/`medium`/`high`/`xhigh`/`max`) when the model exposes it. Color-coded: gray → cyan → yellow → red as effort climbs. Reflects mid-session `/effort` changes on the next refresh.
  - `think:on|off` — `thinking.enabled` boolean when the model exposes extended thinking. Green when on.
  - `style:<name>` — `output_style.name`, only rendered when not `default`.
  - Each segment is independently optional: missing JSON fields silently disappear instead of leaving placeholders.

- **Session line** (line 3 of the statusline) summarizing the running session:
  - `5h:NN% (in Xh Ym)` and `7d:NN% (in Xd Yh)` — `rate_limits.five_hour` and `rate_limits.seven_day`, with `used_percentage` color-coded green/yellow/red at the 50%/80% thresholds and a dim countdown to `resets_at` (Unix epoch). Pro/Max only — silently absent on free tier.
  - `$NN.NN` — `cost.total_cost_usd`, color-coded green / yellow (≥$1) / red (≥$5).
  - `+adds/-dels` — `cost.total_lines_added` / `cost.total_lines_removed`.
  - `<duration>` — `cost.total_duration_ms` formatted as `Xh Ym` / `Xm Ys` / `Xs`.
  - The whole line is silently skipped when no data is available.

- **Multi-channel install**:
  - **Claude Code marketplace** — `/plugin marketplace add ojesusmp/pulso` + `/plugin install pulso@pulso`. Auto-wires via `SessionStart` hook.
  - **Curl-pipe-bash** — `curl -fsSL https://raw.githubusercontent.com/ojesusmp/pulso/main/install.sh | bash`. Clones to `~/.pulso` and runs `install.mjs`. Supports `--check`, `--uninstall`, `--no-pull`. Honors `PULSO_DIR`, `PULSO_REF`, `PULSO_REPO` env overrides.
  - **npm / npx** — `npx -y github:ojesusmp/pulso pulso install`, or `npm install -g github:ojesusmp/pulso && pulso install`. Subcommands: `install` (default), `check`, `uninstall`.
  - All three paths converge on the same idempotent `install.mjs`.

- **Migration from `oj-statusline`**:
  - `install.mjs` detects the legacy `_ojStatuslinePriorCommand` settings key and carries it forward into the new `_pulsoPriorCommand` key, so `pulso uninstall` still rolls back to whatever the user had before either plugin touched their settings.
  - `install.mjs --check` reports the presence of the legacy HUD file (`~/.claude/hud/oj-statusline.mjs`) without touching it. Removing the legacy plugin via `/plugin uninstall oj-statusline` cleans it up the normal way.

- **Verification command** in SKILL.md and README that emits a synthetic statusline JSON exercising every field the model and session lines render — useful for testing renames and color thresholds locally.

### Layout

Five lines, top-to-bottom: token line → model line → session line → optional OMC HUD line → skills line. Lines 2–4 collapse silently when their upstream JSON fields are absent, so narrow terminals stay tight.

### Notes

- All new fields come from the upstream Claude Code statusline JSON contract — no new dependencies, no new transcript scans, no extra disk reads. See [Claude Code statusLine docs](https://code.claude.com/docs/en/statusline.md) for the field source.
- Inherits all behavior from `oj-statusline` v1.2.2, including: idempotent `--hook` mode for plugin SessionStart, content-aware copy (only re-writes the HUD file when `statusline.mjs` actually differs), bottom-anchored skills line with active-skill highlight, and silent-fail on malformed input.

## Lineage

`pulso` v1.3.0 is the successor to `oj-statusline` v1.2.2 (last shipped via the [`claude-skills`](https://github.com/ojesusmp/claude-skills) marketplace). The earlier plugin's history through v1.0.0 → v1.2.2 lives in that repo's `plugins/oj-statusline/skills/oj-statusline/CHANGELOG.md`. From v1.3.0 forward, all releases ship from this repo.
