#!/usr/bin/env bash
# ============================================================================
#  ZenSkill Navigator — ONE-SHOT INSTALLER
#  Works on: macOS · Linux · Windows (run inside Git Bash)
#
#  What it does, end to end, with no further steps:
#    1. Verifies Node.js (>=18) and npm are installed
#    2. Verifies the PostgreSQL client (psql) is installed
#    3. Installs all npm dependencies
#    4. Generates the QE skill-taxonomy JSON the backend reads (166 skills)
#    5. Creates a .env file (asks for your Postgres password) if missing
#    6. Creates the 'skillmatrix' database if it does not exist
#    7. Pushes the full schema into PostgreSQL (COMPLETE_DATABASE_SETUP.sql)
#       (the QISL chain columns from migration 011 are also auto-applied by the
#        backend on first start, so no manual migration step is needed)
#
#  Run it from the project root:   ./installation.sh
#  Then start everything with:     ./run.sh
# ============================================================================
set -euo pipefail

# Always operate from the directory this script lives in.
cd "$(dirname "$0")"

# ── pretty output helpers ───────────────────────────────────────────────────
say()  { printf '\033[1;36m%s\033[0m\n' "$*"; }   # cyan
ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$*"; } # green
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; } # yellow
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# ── detect OS (for helpful install hints) ───────────────────────────────────
OS="unknown"
case "$(uname -s)" in
  Darwin*) OS="mac" ;;
  Linux*)  OS="linux" ;;
  MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
esac

say "════════════════════════════════════════════════════════"
say " ZenSkill Navigator — Installer  (detected OS: $OS)"
say "════════════════════════════════════════════════════════"

# ── 1. Node.js + npm ────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  case "$OS" in
    mac)     die "Node.js not found. Install it:  brew install node   (or https://nodejs.org)";;
    linux)   die "Node.js not found. Install it:  sudo apt install nodejs npm   (or https://nodejs.org)";;
    *)       die "Node.js not found. Install the LTS build from https://nodejs.org and re-run.";;
  esac
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "Node.js 18+ required (found $(node -v)). Please upgrade."
command -v npm >/dev/null 2>&1 || die "npm not found — it ships with Node.js. Reinstall Node.js."
ok "Node.js $(node -v) / npm $(npm -v)"

# ── 2. PostgreSQL client ────────────────────────────────────────────────────
if ! command -v psql >/dev/null 2>&1; then
  case "$OS" in
    mac)     die "psql not found. Install PostgreSQL:  brew install postgresql@16  then re-run.";;
    linux)   die "psql not found. Install PostgreSQL:  sudo apt install postgresql postgresql-client  then re-run.";;
    *)       die "psql not found. Install PostgreSQL from https://www.postgresql.org/download/windows/ and make sure 'psql' is on your PATH.";;
  esac
fi
ok "PostgreSQL client: $(psql --version)"

# ── 3. npm dependencies ─────────────────────────────────────────────────────
say ""
say "[1/4] Installing npm dependencies (this can take a couple of minutes)…"
# Skip Puppeteer's Chrome download — it's only used for optional screenshot
# tooling, is large, and often fails behind proxies/VPNs. The app runs without it.
export PUPPETEER_SKIP_DOWNLOAD=true
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
npm install
ok "Dependencies installed"

# ── 3b. Generate the QE skill-taxonomy JSON ─────────────────────────────────
# The CommonJS backend can't import the TS taxonomy, so it reads a generated JSON
# (src/data/qeTaxonomy.generated.json) produced from src/lib/qeSkillTaxonomy.ts.
node scripts/gen-taxonomy.cjs
ok "QE skill taxonomy generated (166 skills)"

# ── 4. .env file ────────────────────────────────────────────────────────────
say ""
say "[2/4] Configuring environment (.env)…"
if [ ! -f .env ]; then
  cp .env.example .env
  # Ask for the Postgres password (input hidden). Everything else uses sane defaults.
  printf 'Enter your PostgreSQL password for user "postgres" (leave blank to use "postgres"): '
  read -rs PW_INPUT || true
  echo
  DB_PW="${PW_INPUT:-postgres}"
  # Replace the placeholder in .env, portable across GNU/BSD sed.
  tmp="$(mktemp)"
  sed "s|^DB_PASSWORD=.*|DB_PASSWORD=${DB_PW}|" .env > "$tmp" && mv "$tmp" .env
  ok ".env created from .env.example"
else
  ok ".env already exists — leaving it untouched"
fi

# Read the DB settings back out of .env (ignores comments / blank lines).
get_env() { grep -E "^$1=" .env | tail -n1 | cut -d'=' -f2- | tr -d '\r'; }
DB_HOST="$(get_env DB_HOST)";     DB_HOST="${DB_HOST:-localhost}"
DB_PORT="$(get_env DB_PORT)";     DB_PORT="${DB_PORT:-1234}"
DB_NAME="$(get_env DB_NAME)";     DB_NAME="${DB_NAME:-skillmatrix}"
DB_USER="$(get_env DB_USER)";     DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="$(get_env DB_PASSWORD)"
export PGPASSWORD="$DB_PASSWORD"

# ── 5. Create the database if it is missing ─────────────────────────────────
say ""
say "[3/4] Creating database '$DB_NAME' (if it does not exist)…"
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c '\q' >/dev/null 2>&1; then
  die "Could not connect to PostgreSQL at $DB_HOST:$DB_PORT as '$DB_USER'. Is the server running and the password in .env correct?"
fi
EXISTS="$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'")"
if [ "$EXISTS" = "1" ]; then
  ok "Database '$DB_NAME' already exists"
else
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE ${DB_NAME}"
  ok "Database '$DB_NAME' created"
fi

# ── 6. Push the schema ──────────────────────────────────────────────────────
say ""
say "[4/4] Pushing schema into '$DB_NAME'…"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f COMPLETE_DATABASE_SETUP.sql >/dev/null
ok "Schema pushed (tables, indexes and default admin are ready)"

unset PGPASSWORD

say ""
say "════════════════════════════════════════════════════════"
ok  "Installation complete!"
say "  Start the app with:   ./run.sh"
say "  Then open:            http://localhost:7000"
say "════════════════════════════════════════════════════════"
