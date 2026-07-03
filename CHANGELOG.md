# Changelog

All notable changes to pulso are documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] — 2026-07-03

### Added

- **`host:path` prefix** on the token line — hostname (lowercased) + a shortened working directory (`~`-relative, truncated to first + last two path segments when deep). Always renders when either is available; independent of OMC-HUD de-duplication (the HUD shows neither).
- **Memory-leak watch line** — the biggest single `node.exe`/`claude.exe` process, plus totals for each, computed from one `tasklist` call per render (throttled with a ~3s temp-file cache). Color-coded yellow at 5120MB / red at 6656MB on the largest single process, with a `resume?` warning at the red threshold — thresholds match the `claude-guard.ps1` watchdog so the statusline and the watchdog agree on when a session is worth resuming. Windows-only (`tasklist`); silently absent on platforms without it, same silent-fail convention as the rest of the file.

### Fixed

- **Fleet drift**: this repo had fallen behind the hand-maintained `oj-statusline.mjs` copies running on Orlando's actual machines, which had independently gained both features above. This release ports them back into the canonical `pulso` source so there is one real, installable artifact instead of N hand-copies — see engram project `pulso` for the reconciliation history.

### Notes

- Verified with the synthetic-payload command in the README/SKILL.md, run three independent times (full payload, repeat, and an empty/free-tier payload) — all lines render once, no duplication, graceful degradation confirmed on missing fields.

## [1.4.0] — 2026-06-08

### Added

- **Opt-in diagnostic capture** — dumps the raw statusline stdin JSON so the exact keys a given Claude Code build sends can be inspected. Enabled by either a live sentinel file (`<config>/.pulso-debug`, toggled with `touch`/`rm`, effective on the next render with no restart) or the `PULSO_DEBUG=1` environment variable. Output path defaults to `/tmp/pulso-stdin.json`, overridable via `PULSO_DEBUG_FILE`. Off by default — normal renders never touch disk. Silent-fail so it can never break rendering.

### Changed

- **De-duplication against the OMC HUD line.** When the oh-my-claudecode HUD line is present, pulso now omits the fields the HUD already shows — model name (line 2), `ctx%` (line 1), `5h`/`7d` rate limits and session duration (line 3) — and renders only what the HUD does not (token breakdown, CC version, `[1m]`, effort, thinking, cost, diff). In standalone mode (no HUD) all fields render as before. The `[1m]` badge now attaches to the CC version when the model name is omitted, so it always remains visible.

### Fixed

- **Duplicated model version** on the model line (e.g. `Opus 4.8 4.8`). The parsed `model.id` version is now appended only when `model.display_name` does not already contain it, so display names that already include the version render once.

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
