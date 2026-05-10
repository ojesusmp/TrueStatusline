#!/usr/bin/env bash
# pulso curl-pipe-bash installer.
# Author: Orlando Molina <https://github.com/ojesusmp>
# License: MIT
#
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/ojesusmp/pulso/main/install.sh | bash
#
# Clones (or pulls) the repo into ~/.pulso and runs the bundled
# Node installer. Idempotent: safe to re-run.
#
# Environment overrides:
#   PULSO_DIR    target clone dir       (default: ~/.pulso)
#   PULSO_REF    git ref to check out   (default: main)
#   PULSO_REPO   git URL                 (default: https://github.com/ojesusmp/pulso.git)
#   NO_RUN       set to 1 to clone but skip install.mjs
#
# Flags:
#   --check        run install.mjs --check (no changes)
#   --uninstall    run install.mjs --uninstall
#   --no-pull      do not `git pull` if the repo is already present
#   --help         this text

set -eu

REPO="${PULSO_REPO:-https://github.com/ojesusmp/pulso.git}"
REF="${PULSO_REF:-main}"
DIR="${PULSO_DIR:-$HOME/.pulso}"
NO_PULL=0
EXTRA_ARGS=()

# ── Color (auto-disable on non-TTY) ────────────────────────────────────────
if [ -t 1 ] && [ "${NO_COLOR:-0}" != "1" ]; then
  C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'; C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_CYAN=$'\033[36m'; C_RESET=$'\033[0m'
else
  C_BOLD=""; C_DIM=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_CYAN=""; C_RESET=""
fi
say()  { printf '%s[pulso]%s %s\n' "$C_CYAN" "$C_RESET" "$*" >&2; }
warn() { printf '%s[pulso] warn:%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
die()  { printf '%s[pulso] error:%s %s\n' "$C_RED"   "$C_RESET" "$*" >&2; exit 1; }

# ── Args ───────────────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h)
      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    --check)     EXTRA_ARGS+=(--check); shift ;;
    --uninstall) EXTRA_ARGS+=(--uninstall); shift ;;
    --no-pull)   NO_PULL=1; shift ;;
    --) shift; while [ $# -gt 0 ]; do EXTRA_ARGS+=("$1"); shift; done ;;
    *) warn "ignoring unknown arg: $1"; shift ;;
  esac
done

# ── Prereqs ────────────────────────────────────────────────────────────────
command -v git  >/dev/null 2>&1 || die "git not found on PATH"
command -v node >/dev/null 2>&1 || die "node not found on PATH (need Node.js 18+)"

NODE_MAJOR="$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))' 2>/dev/null || echo 0)"
if [ "${NODE_MAJOR:-0}" -lt 18 ] 2>/dev/null; then
  die "Node.js 18+ required (found $(node --version))"
fi

# ── Clone or pull ──────────────────────────────────────────────────────────
if [ -d "$DIR/.git" ]; then
  if [ "$NO_PULL" = "1" ]; then
    say "using existing clone at ${C_BOLD}$DIR${C_RESET} (--no-pull set)"
  else
    say "pulling latest into ${C_BOLD}$DIR${C_RESET}"
    git -C "$DIR" fetch --quiet origin "$REF" || die "git fetch failed"
    git -C "$DIR" checkout --quiet "$REF" || die "git checkout $REF failed"
    git -C "$DIR" reset --hard --quiet "origin/$REF" || die "git reset --hard failed"
  fi
elif [ -e "$DIR" ]; then
  die "$DIR exists and is not a git checkout. Move or remove it, or set PULSO_DIR."
else
  say "cloning ${C_BOLD}$REPO${C_RESET} (${REF}) -> ${C_BOLD}$DIR${C_RESET}"
  git clone --quiet --branch "$REF" --depth 1 "$REPO" "$DIR" || die "git clone failed"
fi

# ── Install ────────────────────────────────────────────────────────────────
INSTALLER="$DIR/skills/pulso/install.mjs"
[ -f "$INSTALLER" ] || die "installer not found at $INSTALLER"

if [ "${NO_RUN:-0}" = "1" ]; then
  say "NO_RUN=1 set; clone done, skipping install.mjs"
  exit 0
fi

say "running ${C_BOLD}node $INSTALLER ${EXTRA_ARGS[*]:-}${C_RESET}"
if [ ${#EXTRA_ARGS[@]} -gt 0 ]; then
  node "$INSTALLER" "${EXTRA_ARGS[@]}"
else
  node "$INSTALLER"
fi
status=$?

if [ "$status" -eq 0 ]; then
  printf '%s[pulso]%s %sdone.%s Restart Claude Code to apply.\n' \
    "$C_CYAN" "$C_RESET" "$C_GREEN" "$C_RESET" >&2
fi
exit "$status"
