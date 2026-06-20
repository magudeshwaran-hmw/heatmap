# ZenSkill Navigator — Setup Guide (New Laptop)

This guide gets the project running from scratch on a fresh machine.
For full feature/architecture documentation see [`README.md`](./README.md).

---

## Prerequisites

Install these first:

1. **Node.js v18 or above** — https://nodejs.org
   Verify: `node --version`
2. **PostgreSQL 14 or above** — https://www.postgresql.org/download
   Verify: `psql --version`
3. **Git** — https://git-scm.com
   Verify: `git --version`
4. **Ollama** (AI features — optional) — https://ollama.ai
   After install: `ollama pull llama3`
   (The app falls back gracefully if Ollama is not running.)

---

## Additional Requirements for ZenAssess (AI Proctoring)

ZenAssess AI proctoring has a few extra requirements:

1. **HTTPS or localhost only.** The browser Camera API requires a secure
   context. For development, `localhost` works fine. For production, the app
   **must** be served over HTTPS (a tunnel URL like `forward:cf` is HTTPS).

2. **Model files — already in the repo, no separate download.**
   - face-api.js detection models → `public/models/`
   - MediaPipe FaceMesh / iris models → `public/mediapipe/`
   These ship with the repository and are served locally. A CDN fallback exists
   if a file is missing, so first load still works either way.

3. **Supported browsers:**
   - Chrome 90+ (recommended), Firefox 88+, Edge 90+
   - **Not supported:** Safari on iOS, and any mobile browser — the assessment
     is intentionally blocked on mobile.

4. **Camera:** any webcam works (built-in laptop camera is fine). Minimum
   640×480; 720p or higher recommended for better gaze/iris accuracy.

---

## Step 1 — Copy or Clone the Project

**From USB / drive:** copy the entire `zenlap` folder to your location
(e.g. `Desktop/zenlap`).

**From Git:**
```bash
git clone <your-repo-url>
cd zenlap
```

---

## Step 2 — Install Dependencies

In the project folder:
```bash
npm install
```
Installs all frontend and backend dependencies. Wait for it to finish.

---

## Step 3 — Set Up the PostgreSQL Database

1. Open **pgAdmin** (or `psql`).
2. Create a database named **`skillmatrix`**:
   - pgAdmin: right-click *Databases → Create → Database* → name `skillmatrix`
   - psql: `CREATE DATABASE skillmatrix;`
3. Run [`SETUP_DATABASE.sql`](./SETUP_DATABASE.sql) (in the project root) against it:
   - **pgAdmin:** open the Query Tool on `skillmatrix`, open `SETUP_DATABASE.sql`, press **F5**.
   - **psql:**
     ```
     \c skillmatrix
     \i /path/to/SETUP_DATABASE.sql
     ```
   This creates every table, index, the SQL sandbox schema, the default admin
   login, and cleans up any test data. It is safe to re-run.

---

## Step 4 — Configure Environment

1. Copy the template:
   - Windows: `copy .env.example .env`
   - Mac/Linux: `cp .env.example .env`
2. Open `.env` and set your PostgreSQL password:
   ```
   DB_PASSWORD=YOUR_POSTGRES_PASSWORD
   ```
   (`DB_NAME=skillmatrix`, `DB_HOST=localhost`, `DB_PORT=5432`, `DB_USER=postgres`
   are correct defaults for a standard local install.)
3. All other values can stay as default for local development.

Quick check that the DB connects:
```bash
npm run db:test
```

---

## Step 4 — Setup Database (Terminal Method)

Open terminal and run this single command:

```bash
psql -U postgres -c "CREATE DATABASE skillmatrix;" && psql -U postgres -d skillmatrix -f SETUP_DATABASE.sql
```

It will ask for PostgreSQL password twice.
Type your password each time.

Done — all tables created automatically.

---

## Step 5 — Run the Application

Open a terminal in the project folder:
```bash
npm run dev
```
Wait for the startup banner:
```
✅ Database connected
🚀 ALL SERVICES RUNNING — open http://localhost:8080
```
Open your browser at **http://localhost:8080**.

`npm run dev` starts everything through a single gateway on port **8080**
(frontend + backend API + Ollama proxy). No other ports need to be opened.

---

## Step 6 — Share Publicly (Optional)

To expose a public URL, open a **second** terminal (keep `npm run dev` running)
and start a tunnel:
```bash
npm run forward:cf
```
Copy the printed URL (e.g. `https://xxxx.trycloudflare.com`) and share it.
Both terminals must stay open while sharing.

Alternatives:
```bash
npm run forward:lt    # LocalTunnel
npm run forward       # ngrok (requires NGROK_AUTHTOKEN in .env)
```

---

## Step 7 — Login

**Admin** (created automatically by `SETUP_DATABASE.sql`):
- ID: `admin`
- Password: `admin123`

> Change the admin password for any non-local/shared deployment by updating the
> `admin_password` row in the `app_settings` table.

**Employees:** created by the admin from the Admin Dashboard, or via resume
upload. There are no pre-seeded employee accounts after cleanup.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm run dev` fails with a DB error | Check `.env` `DB_PASSWORD` (and that PostgreSQL is running). Test with `npm run db:test`. |
| Port 8080 already in use | Windows: `netstat -ano \| findstr :8080` then `taskkill /PID <number> /F` |
| `npm install` fails | Delete `node_modules` and `package-lock.json`, then run `npm install` again. |
| `forward:cf` shows no URL | Check internet connection; try `npm run forward:lt`. |
| Ollama not working | Install from ollama.ai and run `ollama pull llama3`. AI features fall back to a built-in mode without it. |
| Camera not working in ZenAssess | 1) Confirm the browser has camera permission. 2) Browser settings → Privacy → Camera → allow `localhost`. 3) Refresh and retry. Camera needs `localhost` or HTTPS. |
| "Iris tracking not loaded" in console | Non-critical. The assessment still works — face + head detection stay active. Check the console for the specific load error. |
| Models loading slowly on first use | First load can take 10–30s (models load/cache). After that they're cached in the browser and load instantly. |
| `GITHUB_ERROR:401` | An invalid/expired token is set in `GITHUB_TOKEN`. Either: 1) Remove `GITHUB_TOKEN` from `.env` entirely (leave it blank) — ZenCode works fine without it; or 2) Generate a fresh token at github.com/settings/tokens. |
| GitHub analysis shows "rate limit reached" | Without a token, GitHub allows 60 requests/hour — enough for ~15–20 repositories. Either: 1) Wait 1 hour and reconnect; or 2) Add a free GitHub token to `.env` for 5000 requests/hour. |

---

## Port Reference

All traffic goes through **port 8080** — no other ports need to be opened.

| Service | Port | Visibility |
|---|---|---|
| Frontend (gateway) | 8080 | public |
| Backend API | 3001 | internal |
| Ollama AI | 11434 | internal |
| PostgreSQL | 5432 | internal |

---

## npm Scripts Reference

| Command | Description |
|---|---|
| `npm run dev` | Start everything locally (single port 8080) |
| `npm run forward:cf` | Get a public Cloudflare tunnel URL |
| `npm run forward:lt` | Get a public LocalTunnel URL |
| `npm run forward` | Get an ngrok URL (needs `NGROK_AUTHTOKEN`) |
| `npm run db:test` | Test the database connection |
| `npm run build` | Build the frontend for production |
| `npm test` | Run the test suite |
