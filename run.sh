#!/usr/bin/env bash
# ============================================================================
#  ZenSkill Navigator — RUN SCRIPT
#  Works on: macOS · Linux · Windows (run inside Git Bash)
#
#  Starts the whole stack on a single port:
#    • Backend API      (internal :3001)
#    • Ollama LLM        (internal :11434, optional — used for AI features)
#    • Frontend gateway  (public   :7000)  ← open this in your browser
#
#  Usage:   ./run.sh
#  Stop:    press Ctrl+C
#
#  If you have not installed yet, run ./installation.sh first.
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")"

# Sanity checks so failures are obvious instead of cryptic.
if [ ! -d node_modules ]; then
  printf '\033[1;31mDependencies are not installed. Run ./installation.sh first.\033[0m\n' >&2
  exit 1
fi
if [ ! -f .env ]; then
  printf '\033[1;31mNo .env file found. Run ./installation.sh first.\033[0m\n' >&2
  exit 1
fi

printf '\033[1;36mStarting ZenSkill Navigator…  → http://localhost:7000\033[0m\n'

# start-all.cjs verifies the DB, then launches backend + Ollama + Vite gateway.
exec npm run dev
