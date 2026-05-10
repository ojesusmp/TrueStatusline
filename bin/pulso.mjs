#!/usr/bin/env node
/**
 * pulso npm bin wrapper.
 * Author: Orlando Molina <https://github.com/ojesusmp>
 * License: MIT
 *
 * Provides the `pulso` command when this repo is installed via:
 *   npx -y github:ojesusmp/pulso pulso <subcmd>
 *   npm install -g github:ojesusmp/pulso && pulso <subcmd>
 *
 * Subcommands map onto the bundled installer at
 * skills/pulso/install.mjs:
 *
 *   install              -> install or update (verbose). Default if no arg.
 *   check                -> --check  (print state, no changes)
 *   uninstall            -> --uninstall
 *   --help, -h           -> print this help
 *
 * Any other args after the subcommand are forwarded to install.mjs verbatim,
 * so flags like --hook stay reachable for advanced/debug usage.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const INSTALLER = resolve(HERE, "..", "skills", "pulso", "install.mjs");

function help() {
  process.stdout.write(`pulso — Claude Code statusline installer

Usage:
  pulso [install]      Install or update (verbose). Default.
  pulso check          Print current state, no changes.
  pulso uninstall      Remove and restore prior statusLine if backed up.
  pulso --help         Show this help.

Underlying installer: ${INSTALLER}
Repo: https://github.com/ojesusmp/pulso
`);
}

function run(args) {
  if (!existsSync(INSTALLER)) {
    process.stderr.write(`pulso: bundled installer missing at ${INSTALLER}\n`);
    process.stderr.write(`This usually means the package was installed without 'skills/pulso'.\n`);
    process.exit(2);
  }
  const res = spawnSync(process.execPath, [INSTALLER, ...args], { stdio: "inherit" });
  process.exit(res.status ?? 0);
}

const [sub, ...rest] = process.argv.slice(2);
switch (sub) {
  case undefined:
  case "install":
    run(rest);
    break;
  case "check":
    run(["--check", ...rest]);
    break;
  case "uninstall":
    run(["--uninstall", ...rest]);
    break;
  case "--help":
  case "-h":
  case "help":
    help();
    process.exit(0);
    break;
  default:
    run([sub, ...rest]);
}
