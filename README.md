# ZenSkill Navigator

> **Internal Talent Intelligence Platform for Zensar Technologies**
> React 18 + TypeScript · Node.js + Express · PostgreSQL · AI (Ollama / Gemini)

ZenSkill Navigator maps every associate's real skills from their resume, validates
them through AI-proctored assessments, and gives leadership a live view of the
workforce (skill heatmaps, bench risk, project readiness, GitHub intelligence).

This is the **only** documentation file you need — it covers installation, running,
and everything required to move the project between machines (Windows ⇄ macOS).

---

## Quick start (Windows, macOS or Linux)

You need **two things installed first**:

| Requirement | Get it |
|-------------|--------|
| **Node.js 18+** | https://nodejs.org (LTS) |
| **PostgreSQL 14+** | https://www.postgresql.org/download/ |

Then, from the project root, run **two commands**:

```bash
./installation.sh   # installs deps, creates the DB, pushes the schema
./run.sh            # starts the whole app
```

Open **http://localhost:8080** in your browser. That's it.

> **Windows users:** run the commands inside **Git Bash** (ships with
> [Git for Windows](https://git-scm.com/download/win)), not `cmd` or PowerShell.
> `.sh` scripts need a bash shell. macOS/Linux use the built-in Terminal.

---

## What `installation.sh` does

It is safe to re-run at any time (idempotent). Step by step it:

1. Verifies **Node.js 18+** and **npm** are installed.
2. Verifies the **PostgreSQL client (`psql`)** is installed.
3. Runs `npm install` to fetch all dependencies.
4. Creates a **`.env`** file from `.env.example` if you don't have one, asking once
   for your PostgreSQL password (all other settings use sensible defaults).
5. Creates the **`skillmatrix`** database if it doesn't already exist.
6. Pushes the full schema (tables, indexes, default admin) from
   **`COMPLETE_DATABASE_SETUP.sql`** into PostgreSQL.

If anything is missing it stops with a clear message telling you exactly what to
install — no half-finished state.

## What `run.sh` does

Launches the full stack on a single public port via `npm run dev`:

| Service | Port | Notes |
|---------|------|-------|
| Frontend gateway | **8080** | ← open this in your browser |
| Backend API | 3001 | internal |
| Ollama LLM | 11434 | internal, optional (powers AI features) |

Press **Ctrl+C** to stop everything.

---

## Default admin login

The installer seeds a default admin account (also auto-created by the backend on
first boot):

- **Zensar ID / login:** `admin`
- **Password:** `admin123`

**Change this password after your first login.**

---

## Moving between machines (Windows → Mac, or another Windows PC)

The project is fully portable. On the new machine:

1. Install **Node.js 18+** and **PostgreSQL**.
2. Copy the project folder over (or `git clone` it).
3. Run `./installation.sh` then `./run.sh`.

Nothing is hard-coded to one operating system — the same two scripts work on
Windows (Git Bash), macOS and Linux. Your data lives in PostgreSQL, so to carry
data across use a standard `pg_dump` / `pg_restore` (schema alone is recreated by
the installer).

---

## Manual setup (if you prefer not to use the scripts)

```bash
npm install
cp .env.example .env          # then edit DB_PASSWORD in .env
psql -U postgres -c "CREATE DATABASE skillmatrix;"
psql -U postgres -d skillmatrix -f COMPLETE_DATABASE_SETUP.sql
npm run dev                   # starts backend + gateway on :8080
```

---

## Environment variables (`.env`)

Only `DB_PASSWORD` normally needs changing. Full reference lives in
`.env.example`; the important ones:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DB_HOST` / `DB_PORT` | `localhost` / `5432` | PostgreSQL connection |
| `DB_NAME` | `skillmatrix` | Database name |
| `DB_USER` / `DB_PASSWORD` | `postgres` / — | PostgreSQL credentials |
| `GATEWAY_PORT` | `8080` | Public app URL |
| `PORT` | `3001` | Internal backend API |
| `LLM_PROVIDER` | `ollama` | `ollama` (local, free) or `gemini` (cloud) |
| `CLOUD_API_KEY` | — | Google Gemini key (only if `LLM_PROVIDER=gemini`) |
| `GITHUB_TOKEN` | — | Optional — higher GitHub API limits for ZenCode |

### Optional: local AI (Ollama)

AI features (resume extraction, ZenScan, insights) use a local LLM by default.
Install [Ollama](https://ollama.ai), then:

```bash
ollama pull llama3
```

If Ollama isn't installed the app still runs — AI-powered steps simply fall back
or are skipped.

---

## Bulk resume import (admin)

**Admin → Manage Employees → Bulk Employee Import** lets you upload up to 100
resumes (PDF / `.docx`) at once. For each resume the platform:

- Extracts skills, projects, certifications, education and experience.
- Reads the **Zensar ID** straight from the resume text or the file name.
- If no Zensar ID is found, **auto-assigns the next sequential ID** starting at
  `100001`, and shows a **"Set Zensar ID"** button on that employee's card so you
  can fill in the real ID later (the button disappears once set).
- Applies a **customizable login password** for the batch (field defaults to
  `1234567890`); any credentials already present on a resume are kept.

---

## Useful npm scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the full stack on port 8080 (used by `run.sh`) |
| `npm run server` | Backend API only |
| `npm run dev:ui` | Frontend (Vite) only |
| `npm run build` | Production build into `dist/` |
| `npm test` | Run the test suite |
| `npm run forward` | Expose the app publicly via ngrok tunnel |

---

## Troubleshooting

- **"Could not connect to PostgreSQL"** — make sure the PostgreSQL service is
  running and `DB_PASSWORD` in `.env` matches your Postgres user's password.
- **`./installation.sh: permission denied`** — run `chmod +x installation.sh run.sh`.
- **Windows: `./installation.sh` not found / syntax errors** — you're not in Git
  Bash. Open "Git Bash" and `cd` into the project, then re-run.
- **Port 8080 already in use** — change `GATEWAY_PORT` in `.env`.
