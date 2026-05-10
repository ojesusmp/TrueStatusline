#!/usr/bin/env node
/**
 * pulso installer.
 * Author: Orlando Molina <https://github.com/ojesusmp>
 * License: MIT
 *
 * Modes:
 *   node install.mjs                install or update (verbose)
 *   node install.mjs --hook         SessionStart hook mode: silent if already
 *                                    installed; otherwise install + emit JSON
 *                                    additionalContext prompting a restart.
 *                                    Always exits 0 so CC never blocks startup.
 *   node install.mjs --check        print state, no changes
 *   node install.mjs --uninstall    remove and restore prior command if backed up
 *
 * The --hook mode is what the plugin manifest calls on SessionStart. It is
 * idempotent: after the first successful install, every subsequent session
 * start is a no-op with no console output.
 *
 * Migration: if an oj-statusline install is detected (legacy backup key
 * `_ojStatuslinePriorCommand` or HUD file at ~/.claude/hud/oj-statusline.mjs),
 * the prior command is preserved under the new `_pulsoPriorCommand` key so
 * --uninstall can roll back cleanly. The legacy HUD file is left in place.
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, unlinkSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "statusline.mjs");
const HOME = homedir();
const CFG_DIR = process.env.CLAUDE_CONFIG_DIR || join(HOME, ".claude");
const HUD_DIR = join(CFG_DIR, "hud");
const DEST = join(HUD_DIR, "pulso.mjs");
const SETTINGS = join(CFG_DIR, "settings.json");
const MARKER = join(HUD_DIR, ".pulso-bootstrapped");
const DESIRED_COMMAND = `node "${DEST}"`;
const BACKUP_KEY = "_pulsoPriorCommand";
const LEGACY_BACKUP_KEY = "_ojStatuslinePriorCommand";

const arg = process.argv[2];
const HOOK = arg === "--hook";

function log(...a) { if (!HOOK) console.log(...a); }
function err(...a) { console.error(...a); }

function emitHookContext(text) {
  const payload = { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } };
  process.stdout.write(JSON.stringify(payload));
}

function readSettings() {
  if (!existsSync(SETTINGS)) return {};
  try { return JSON.parse(readFileSync(SETTINGS, "utf8")); } catch (e) {
    err(`pulso: cannot parse ${SETTINGS}: ${e.message}`);
    return null;
  }
}

function writeSettings(obj) {
  writeFileSync(SETTINGS, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function srcMatches() {
  if (!existsSync(SRC) || !existsSync(DEST)) return false;
  try { return statSync(SRC).size === statSync(DEST).size && readFileSync(SRC, "utf8") === readFileSync(DEST, "utf8"); }
  catch { return false; }
}

function isCorrectlyWired(s) {
  return s && s.statusLine && s.statusLine.command === DESIRED_COMMAND && existsSync(DEST) && srcMatches();
}

function check() {
  console.log(`config dir:   ${CFG_DIR}`);
  console.log(`hud script:   ${DEST} ${existsSync(DEST) ? "[present]" : "[missing]"}`);
  console.log(`runtime sync: ${srcMatches() ? "yes" : "no (will copy on install)"}`);
  const s = readSettings() || {};
  console.log(`statusLine:   ${s.statusLine?.command || "<none>"}`);
  console.log(`installed:    ${isCorrectlyWired(s) ? "yes" : "no"}`);
  console.log(`marker:       ${existsSync(MARKER) ? "present" : "absent"}`);
  if (s[BACKUP_KEY]) console.log(`prior backup: ${s[BACKUP_KEY]}`);
  if (s[LEGACY_BACKUP_KEY]) console.log(`legacy oj-statusline backup detected: ${s[LEGACY_BACKUP_KEY]}`);
  const legacyDest = join(HUD_DIR, "oj-statusline.mjs");
  if (existsSync(legacyDest)) console.log(`legacy oj-statusline HUD present: ${legacyDest}`);
}

function doInstall({ silent }) {
  if (!existsSync(SRC)) {
    err(`pulso: source missing: ${SRC}`);
    return { ok: false, firstRun: false };
  }
  if (!existsSync(HUD_DIR)) mkdirSync(HUD_DIR, { recursive: true });

  const firstRun = !existsSync(MARKER);

  if (!srcMatches()) {
    copyFileSync(SRC, DEST);
    if (!silent) log(`copied: ${SRC} -> ${DEST}`);
  }

  const s = readSettings();
  if (s === null) return { ok: false, firstRun };

  let settingsChanged = false;
  const prior = s.statusLine?.command;

  // Migration from oj-statusline: if the prior command points at the legacy
  // HUD file, do not save it as our backup -- the user is upgrading from the
  // old plugin, not coming from a third-party statusline.
  const isLegacyOjStatusline = typeof prior === "string"
    && prior.includes("oj-statusline.mjs");

  if (prior && prior !== DESIRED_COMMAND && !s[BACKUP_KEY] && !isLegacyOjStatusline) {
    s[BACKUP_KEY] = prior;
    if (!silent) log(`backed up prior command: ${prior}`);
    settingsChanged = true;
  } else if (s[LEGACY_BACKUP_KEY] && !s[BACKUP_KEY]) {
    // Carry forward any legacy backup so --uninstall can still roll back.
    s[BACKUP_KEY] = s[LEGACY_BACKUP_KEY];
    if (!silent) log(`migrated legacy backup: ${s[LEGACY_BACKUP_KEY]}`);
    settingsChanged = true;
  }
  if (!s.statusLine || s.statusLine.command !== DESIRED_COMMAND) {
    s.statusLine = { type: "command", command: DESIRED_COMMAND };
    settingsChanged = true;
  }
  if (settingsChanged) {
    writeSettings(s);
    if (!silent) log(`patched ${SETTINGS} statusLine.command`);
  }

  if (firstRun) writeFileSync(MARKER, new Date().toISOString() + "\n", "utf8");

  return { ok: true, firstRun };
}

function uninstall() {
  const s = readSettings() || {};
  if (s.statusLine?.command === DESIRED_COMMAND) {
    if (s[BACKUP_KEY]) {
      s.statusLine = { type: "command", command: s[BACKUP_KEY] };
      log(`restored prior command: ${s[BACKUP_KEY]}`);
      delete s[BACKUP_KEY];
    } else {
      delete s.statusLine;
      log(`cleared statusLine (no prior backup)`);
    }
    writeSettings(s);
  } else {
    log(`statusLine.command was not ours; left untouched`);
  }
  if (existsSync(DEST)) { unlinkSync(DEST); log(`removed: ${DEST}`); }
  if (existsSync(MARKER)) { unlinkSync(MARKER); log(`removed: ${MARKER}`); }
  log(`done. restart Claude Code to apply.`);
}

function hookMode() {
  const sBefore = readSettings();
  if (isCorrectlyWired(sBefore) && existsSync(MARKER)) {
    process.exit(0);
  }
  const { ok, firstRun } = doInstall({ silent: true });
  if (!ok) process.exit(0);
  if (firstRun) {
    emitHookContext(
      "[pulso] First-time setup complete. Statusline runtime copied to ~/.claude/hud/pulso.mjs and settings.json statusLine.command wired. Restart Claude Code one more time so the new statusLine takes effect."
    );
  }
  process.exit(0);
}

if (HOOK) hookMode();
else if (arg === "--check") check();
else if (arg === "--uninstall") uninstall();
else {
  const { ok, firstRun } = doInstall({ silent: false });
  if (!ok) process.exit(1);
  log(firstRun ? "done. restart Claude Code to activate the statusline." : "already up to date. no changes made.");
}
