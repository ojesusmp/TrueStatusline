---
description: Install or repair pulso (idempotent). Use after /plugin install or to recover from a broken statusline.
---

Run the bundled installer in verbose mode and report the result. The installer copies `statusline.mjs` to `~/.claude/hud/pulso.mjs`, patches `~/.claude/settings.json` `statusLine.command`, and is safe to re-run.

After it completes, instruct the user:

1. Quit Claude Code fully (close all windows / kill the CLI process).
2. Reopen Claude Code.
3. The new statusline should appear at the bottom of the next session.

If the user reports nothing changed, re-run the installer with the `--check` flag using the same discovered path and surface the output verbatim so the user can see exactly which piece is missing (HUD script absent, settings.json statusLine.command pointing elsewhere, etc.).

The path to `install.mjs` differs by OS and install method, so discover it at runtime rather than baking in a literal path. Locate it with `find` under `~/.claude/plugins`, run it, then run `--check`.

Run this now:

```bash
INSTALLER="$(find "$HOME/.claude/plugins" -path '*pulso*install.mjs' 2>/dev/null | head -1)"
if [ -z "$INSTALLER" ]; then echo "pulso install.mjs not found under ~/.claude/plugins"; exit 1; fi
node "$INSTALLER"
echo "---"
node "$INSTALLER" --check
```
