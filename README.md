# ZenSkill Navigator — Complete Project Documentation

> **Internal Talent Intelligence Platform for Zensar Technologies**
> Built with React 18 + TypeScript + Node.js + PostgreSQL + AI (Ollama / Gemini)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Database Schema](#4-database-schema)
5. [Page-by-Page Flow](#5-page-by-page-flow)
6. [Feature Deep Dive](#6-feature-deep-dive)
7. [API Endpoints](#7-api-endpoints)
8. [AI / LLM Integration](#8-ai--llm-integration)
9. [Setup & Installation](#9-setup--installation)
10. [Environment Variables](#10-environment-variables)

---

## 1. Project Overview

ZenSkill Navigator is a full-stack internal platform that solves three problems:

| Problem | Solution |
|---|---|
| No visibility into employee skills | ZenMatrix — self-rated skill profiles with AI extraction |
| Manual talent matching for open roles | ZenTalentHub — AI-powered SRF-to-pool matching |
| No central analytics for leadership | ZenRadar — team capability dashboard |

### Two User Roles

| Role | Entry Point | Access |
|---|---|---|
| **Employee** | `/login` | Own dashboard, skills, resume, AI coach |
| **Admin** | `/admin` | All employees, ZenRadar, ZenTalentHub |

---

## 2. Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 18.3 | UI framework |
| TypeScript | 5.8 | Type safety |
| Vite | 5.4 | Build tool + dev server |
| React Router | 6.30 | Client-side routing |
| TanStack Query | 5.83 | Server state management |
| Chart.js + react-chartjs-2 | 4.5 | Analytics charts |
| Recharts | 2.15 | Additional charts |
| Lucide React | 0.462 | Icons |
| Radix UI | various | Accessible UI primitives |
| Tailwind CSS | 3.4 | Utility-first styling |
| Sonner | 1.7 | Toast notifications |
| XLSX | 0.18 | Excel file parsing |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| Node.js | 18+ | Runtime |
| Express | 5.2 | HTTP server |
| PostgreSQL | 14+ | Primary database |
| pg (node-postgres) | 8.20 | DB driver |
| Multer | 1.4 | File upload handling |
| dotenv | 17.3 | Environment config |
| crypto (built-in) | — | AES-256 password encryption |

### AI / LLM
| Provider | Model | Use Case |
|---|---|---|
| Ollama (local) | qwen3-coder:480b-cloud | Primary — all AI features |
| Ollama (fallback) | deepseek-v3.1:671b-cloud | Backup if primary fails |
| Ollama (fallback) | gemini-3-flash-preview:cloud | Backup 2 |
| Google Gemini | gemini-1.5-flash | Optional cloud alternative |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER (React SPA)                   │
│  Port: 8080 (Vite dev) / 80 (production)                │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ Employee │  │  Admin   │  │ZenTalent │  │ZenFind │  │
│  │Dashboard │  │Dashboard │  │   Hub    │  │  er    │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTP REST API
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Node.js Express Server                      │
│              Port: 3001                                  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Employee    │  │  BFSI/SRF    │  │  LLM Proxy    │  │
│  │  APIs        │  │  APIs        │  │  /api/generate│  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────┬───────────────────────────────┘
              ┌───────────┴───────────┐
              ▼                       ▼
┌─────────────────────┐   ┌─────────────────────────────┐
│   PostgreSQL DB     │   │   Ollama (local AI)          │
│   Port: 1234        │   │   Port: 11434                │
│   DB: skillmatrix   │   │   Model: qwen3-coder:480b    │
└─────────────────────┘   └─────────────────────────────┘
```

---

## 4. Database Schema

### 13 Tables

```sql
employees          -- Zensar employee accounts (login, profile)
skills             -- Self-rated skills per employee (32 predefined)
projects           -- Project history per employee
certifications     -- Certifications per employee
education          -- Education records per employee
achievements       -- Awards and recognitions per employee
app_settings       -- Admin credentials, system config

bfsi_workforce     -- Pool + Deallocation employees (from Excel upload)
bfsi_roles         -- Open SRFs (Reactive + Proactive)
bfsi_assignments   -- SRF-to-employee match results
bfsi_certifications-- Certification pipeline for BFSI employees
bfsi_summary_data  -- Demand vs Supply summary (from Excel Summary sheet)
bfsi_uploads       -- Upload history log
```

### Key Relationships
- `employees.id` → `skills.employee_id` (CASCADE DELETE)
- `employees.id` → `certifications.employee_id` (CASCADE DELETE)
- `employees.id` → `projects.employee_id` (CASCADE DELETE)
- `bfsi_workforce.employee_id` → `bfsi_assignments.employee_id`
- `bfsi_roles.role_id` → `bfsi_assignments.role_id`

---

## 5. Page-by-Page Flow

### Route Map

```
/                    → Landing Page (public)
/login               → Employee Login / Signup (public)
/admin               → Admin Login → Admin Dashboard
/admin/bfsi          → ZenTalentHub (BFSI Dashboard)
/admin/employee/:id  → Employee Detail Page (admin view)
/employee/dashboard  → Employee Dashboard (after login)
/employee/skills     → ZenMatrix Skill Page
/employee/report     → Skill Gap Report
/employee/ai         → ZenAI Intelligence Page
/employee/resume-builder → Resume Builder
/employee/certifications → Certifications Page
/employee/projects   → Projects Page
/employee/education  → Education Page
/employee/achievements → Achievements Page
/employee/resume-upload → Resume Upload Page
/setup               → Setup Guide Page (admin)
```

---

### Page 1: Landing Page (`/`)

**What it shows:**
- Zensar branding with animated hero section
- Module overview: ZenMatrix, ZenRadar, ZenTalentHub, ZenFinder, ZenCert, ZenAlign
- Flow diagram showing how modules connect
- CTA buttons: Login as Employee / Admin

**Features:**
- Dark/light mode toggle
- Animated module cards with descriptions
- Responsive layout

**Backend:** None (static page)

---

### Page 2: Auth Page (`/login`)

**What it shows:**
- Login tab: Zensar ID + Password
- Signup tab: Full registration form

**Login Flow:**
1. Employee enters Zensar ID (5 or 6 digits) + password
2. POST `/api/login` → server checks `employees` table
3. Password decrypted with AES-256 and compared
4. Returns role (`employee` or `admin`) + employee data
5. Redirects to `/employee/dashboard` or `/admin`

**Signup Flow:**
1. Employee fills: Zensar ID, Name, Email, Mobile, Password
2. POST `/api/register` → creates record in `employees` table
3. Password encrypted with AES-256 before storage
4. Redirects to Onboarding Page

**Validation:**
- Zensar ID: 5 or 6 digits only
- Email: must include `@`
- Password: minimum 6 characters
- Duplicate check: ID, email, phone

**Backend:** `POST /api/login`, `POST /api/register`

---

### Page 3: Admin Login Page (`/admin`)

**What it shows:**
- Separate admin login form
- Admin ID + Password

**Flow:**
1. Admin enters credentials
2. Checked against `app_settings` table (`admin_id`, `admin_password`)
3. On success → redirects to `/admin` (AdminDashboard)

**Backend:** `POST /api/login` (same endpoint, role detection)

---

### Page 4: Admin Dashboard — ZenRadar (`/admin`)

**Tabs:**
1. **Overview** — Team stats, bar chart, readiness distribution
2. **Manage Employees** — Employee grid with AI search, filters, add/delete
3. **Skill Heatmap** — Average skill ratings across all 32 skills
4. **Certifications** — All employees with certifications, search, See More
5. **Achievements** — All employees with awards, search, See More
6. **Education** — All employees with degrees, search, See More
7. **Projects** — All employees with projects, search, See More

**Hero Stats (top):**
- Team Size (total employees)
- Submitted (validated profiles)
- Avg Readiness % (team benchmark)
- Skill Gaps (beginner-level skills count)

**Manage Employees Features:**
- Search by name/ID/role
- Advanced filters: role, experience, skills, completion %, certifications, projects
- AI Search: type any skill/cert/project → scored results
- Sort: A-Z, Z-A, Newest, Oldest
- Export filtered list to Excel
- Add Employee button → modal with resume scan
- Click any card → opens employee popup on correct tab

**Add Employee Modal:**
- Scan Resume (PDF) → AI extracts name, email, phone, designation, location, skills, projects, certs, education
- Manual form fill
- Creates account in `employees` table
- Saves extracted data to all related tables

**Employee Popup (8 tabs):**
- ZenRadar: full profile summary
- ZenScan: resume upload comparison
- ZenMatrix: skill ratings
- My Education: education records
- My Projects: project history
- My Certification: certifications
- My Achievements: awards
- ZenProfile: edit personal details, delete account

**Backend:** `GET /api/employees`, `POST /api/admin/create-employee`, `DELETE /api/employees/:id`, `POST /api/admin/employees/update`

---

### Page 5: ZenTalentHub — BFSI Dashboard (`/admin/bfsi`)

**4 Main Tabs:**

#### Tab 1: Supply Dashboard
- **Total Pool** banner (Available-Pool employees)
- **Total Deallocation** banner (Deallocating employees)
- **Total Supply** = Pool + Deallocation
- Skill breakdown cards: Automation, SDET, AI/ML, ETL, Functional Mobile, Functional, Security, Performance, Application, Accessibility, Digital
- **Pool Dashboard**: employee cards with name, skill, grade, location, aging days, RMG status, deployable flag
- **Deallocation Dashboard**: employee cards with deallocation date, days left, urgency color coding

#### Tab 2: Demand Dashboard
- **Reactive SRF Total** banner
- **Proactive SRF Total** banner
- **Demand Total** banner
- Skill breakdown cards (same 11 skills)
- SRF list with: title, type, priority, skill, location, grade, customer, View JD button
- Filters: Skill, Customer, Location, Grade, Priority, Month, Search

#### Tab 3: Find a Match
- Search/filter bar for SRFs
- SRF cards with FIND MATCHES button
- **Matching Algorithm (4 phases):**
  1. Fetch Zen Matrix skills for all pool employees (batch API)
  2. Location matching (offshore/onshore/city-level)
  3. Skill matching (BFSI primary_skill + Zen Matrix skills)
  4. Scoring + ranking
- **Match Results Modal:**
  - Source Breakdown: 🟡 BFSI Data (total matched) | 🟢 Zen Matrix (with resume)
  - Employee cards: name, grade, location, Pool/Deallocating status, primary skill, aging days, RMG status, Zen Matrix matched skills
  - Export to CSV
  - TOP 5 RANK toggle
  - Zen Matrix button → opens skill modal
  - Profile button → navigates to employee detail

#### Tab 4: ZenFinder
- Single search input with inline ghost-text autocomplete (Tab to accept)
- Intent detection: certification / achievement / skill / project / general
- Phrase matching with location aliases (bangalore = bengaluru-electronic city)
- Location required when specified in query
- Results: employee cards showing only Zen Matrix data (skills, certs, projects, awards)
- Score breakdown popup (click pts badge): table of source/page/field/value/points
- Quick example chips

**SYNC DATA Button:**
- Upload Excel file (.xlsx)
- Animated loading overlay with step-by-step progress
- Processes 5 sheets: LOB, Reactive, Proactive, Pool, Deallocation
- Final cleanup: marks employees with deallocation_date as Deallocating

**Backend:** `GET /api/bfsi/dashboard`, `GET /api/bfsi/workforce`, `GET /api/bfsi/roles`, `POST /api/bfsi/upload`, `POST /api/bfsi/reset`, `GET /api/bfsi/report/weekly`

---

### Page 6: Employee Dashboard (`/employee/dashboard`)

**What it shows:**
- Welcome card with name, Zensar ID, completion %
- Quick stats: skills rated, certifications, projects, achievements
- Navigation cards to all employee modules
- Recent activity

**Backend:** `GET /api/employees/:id`, loads all employee data

---

### Page 7: ZenMatrix Skill Page (`/employee/skills`)

**What it shows:**
- 32 predefined skills in 7 categories:
  - Tools: Selenium, Appium, JMeter, Postman, JIRA, TestRail
  - Technologies: Python, Java, JavaScript, TypeScript, C#, SQL
  - Applications: API Testing, Mobile Testing, Performance Testing, Security Testing, Database Testing
  - Domains: Banking, Healthcare, E-Commerce, Insurance, Telecom
  - Testing Types: Functional Testing, Automation Testing, Regression Testing, UAT
  - DevOps: Git, Jenkins, Docker, Azure DevOps
  - AI: ChatGPT/Prompt Engineering, AI Test Automation
- Self-rating slider (0-3): Not Rated / Beginner / Intermediate / Advanced
- Skill ring visualization
- Submit button → marks profile as validated

**Backend:** `GET /api/employees/:id/skills`, `POST /api/skills/update`

---

### Page 8: Skill Gap Report (`/employee/report`)

**What it shows:**
- Radar chart of skill ratings vs benchmark
- Gap analysis: which skills are below team average
- Recommended learning paths
- Comparison with role requirements

**Backend:** `GET /api/employees/:id/skills`, `GET /api/employees` (for team average)

---

### Page 9: ZenAI Intelligence Page (`/employee/ai`)

**2 Tabs:**

#### Tab 1: Career Coach (Chat)
- Chat interface with ZenAI
- Context-aware: reads employee's actual skill data
- Suggested questions: career growth, skill gaps, certifications, roadmap
- Streaming responses from Ollama/Gemini

#### Tab 2: Growth Roadmap
- AI-generated phased roadmap based on current skills
- Phase 1: Foundation → Phase 2: Intermediate → Phase 3: Advanced
- Specific skill recommendations per phase
- Timeline estimates

**Backend:** `POST /api/generate` (LLM proxy), reads employee skills for context

---

### Page 10: Resume Upload Page (`/employee/resume-upload`)

**What it shows:**
- PDF/DOCX upload area
- AI extraction preview: skills, projects, certifications, education
- Side-by-side comparison: extracted vs existing data
- Accept/reject individual items
- Save to database

**AI Extraction Flow:**
1. PDF text extracted using pdf.js (visual line detection)
2. LLM Call 1: Extract basic info (name, email, phone, designation, location, years)
3. LLM Call 2: Extract skills (from 32 predefined), projects, certifications, education, achievements
4. Results displayed for review
5. On save: updates all related tables

**Backend:** `POST /api/resume/upload`, `POST /api/skills/update`, `POST /api/projects/save`, etc.

---

### Page 11: Certifications Page (`/employee/certifications`)

**What it shows:**
- List of all certifications
- Add new: cert name, issuing org, issue date, expiry date, credential ID/URL
- No expiry toggle
- Edit/delete existing

**Backend:** `GET /api/certifications/:id`, `POST /api/certifications/save`, `DELETE /api/certifications/:certId`

---

### Page 12: Projects Page (`/employee/projects`)

**What it shows:**
- Project cards: name, client, domain, role, duration, technologies, skills used
- Add/edit/delete projects
- Ongoing project toggle
- Technologies as tags

**Backend:** `GET /api/projects/:id`, `POST /api/projects/save`

---

### Page 13: Education Page (`/employee/education`)

**What it shows:**
- Education records: degree, institution, field of study, year, grade
- Add/edit/delete

**Backend:** `GET /api/education/:id`, `POST /api/education/save`

---

### Page 14: Achievements Page (`/employee/achievements`)

**What it shows:**
- Awards and recognitions: title, type (Pegasus/Gold/Silver/etc.), date, description, issuer
- Add/edit/delete

**Backend:** `GET /api/achievements/:id`, `POST /api/achievements/save`

---

### Page 15: Resume Builder Page (`/employee/resume-builder`)

**What it shows:**
- Auto-generates professional resume from all stored data
- Sections: Profile, Skills, Experience, Projects, Certifications, Education
- Download as PDF
- AI-enhanced descriptions

**Backend:** Reads all employee data, `POST /api/generate` for AI descriptions

---

### Page 16: Employee Detail Page (`/admin/employee/:id`)

**What it shows:**
- Full employee profile (admin view)
- All tabs: skills, projects, certifications, education, achievements
- Edit personal details
- Delete account

**Backend:** `GET /api/employees/:id`, all related data endpoints

---

### Page 17: Setup Guide Page (`/setup`)

**What it shows:**
- Step-by-step setup instructions
- Database connection test
- Ollama status check
- Admin credential change

---

## 6. Feature Deep Dive

### ZenFinder Search Engine

**How it works:**
1. Query parsed into `skillTerms` + `locationTerms`
2. Stop words removed: in, at, with, developer, engineer, tester, etc.
3. Location words separated: pune, bangalore, hyderabad, chennai, etc.
4. Intent detected: certification / achievement / skill / project / general
5. For each pool employee (not In-project):
   - `matchesSkill()`: phrase match → AND match → single term match
   - Dashes normalized: "Automation Testing - SDET" → "automation testing sdet"
   - Location aliases: "bangalore" matches "bengaluru-electronic city"
   - Zen Matrix APIs called based on intent only
   - `hasSkillMatch` gate: location alone never shows a result
   - If location in query: location match REQUIRED
6. Results sorted by score, top 50 shown

**Scoring:**
| Match | Points |
|---|---|
| Zen Matrix Certification | 25 |
| Zen Matrix Achievement | 22 |
| Zen Matrix Skill | 20 |
| BFSI Primary Skill | 20 |
| Zen Matrix Project | 18 |
| BFSI L1-L4 Skill | 12 |
| BFSI Current Project | 10 |
| Location match (bonus) | 10 |
| BFSI Customer | 8 |

---

### Find a Match Algorithm

**Phase 1:** Batch fetch Zen Matrix skills for all pool employees
**Phase 2:** Location matching
- Offshore/onshore group detection
- City-level exact matching (Pune, Hyderabad, Bangalore, Chennai, etc.)
- Hard filter: onshore SRF → skip offshore employees

**Phase 3:** Skill matching
- SKILL_SYNONYMS map: 11 canonical skill groups
- "Automation Testing - SDET" → canonical: "automation-sdet"
- Both BFSI data and Zen Matrix checked
- Must match at least one source

**Phase 4:** Scoring (0-100 pts)
- Location: 15-25 pts
- Skill (both sources): 40 pts
- Skill (Zen Matrix only): 35 pts
- Skill (BFSI only): 30 pts
- Skill level bonus: +5/+10/+15 (L1/L2/L3)
- Grade match: 10 pts
- Availability: 10 pts
- Aging bonus: 3-5 pts

**Source Breakdown:**
- 🟡 BFSI Data: total matched employees
- 🟢 Zen Matrix: employees with Zen Matrix resume uploaded

---

### Excel Upload Processing (SYNC DATA)

**5 sheets processed in order:**

1. **LOB sheet** (1000+ employees)
   - Sets status: Billable → `In-project`, Pool → `Available`
   - Stores: primary_skill from `Primary Skill Name` column
   - Stores: current_skills from L1-L4 skill columns

2. **Reactive sheet** (open urgent SRFs)
   - Creates/updates `bfsi_roles` with type=`Reactive`
   - Stores: skill, location, grade, priority, customer, JD

3. **Proactive sheet** (pipeline SRFs)
   - Creates/updates `bfsi_roles` with type=`Proactive`

4. **Pool sheet** (bench employees)
   - Updates status → `Available-Pool`
   - primary_skill from `l4_skills` → `l3_skills` → `Primary Skill Name`
   - Stores: grade, location, aging days, RMG status, deployable flag

5. **Deallocation sheet** (rolling off)
   - Updates status → `Deallocating`
   - Stores: deallocation_date, release_reason, project info
   - primary_skill from `l4_skills` → `l3_skills`

**Final cleanup:** Any employee with `deallocation_date` set → status = `Deallocating`

---

### Password Security

- AES-256-CBC encryption
- Random IV per password
- Stored as: `iv_hex:encrypted_hex`
- Never stored in plain text
- Never returned in API responses

---

## 7. API Endpoints

### Employee APIs
```
GET    /api/employees              — All employees + skills
GET    /api/employees/:id          — Single employee
POST   /api/employees              — Create employee (admin)
DELETE /api/employees/:id          — Delete employee
POST   /api/register               — Employee self-registration
POST   /api/login                  — Login (employee + admin)
POST   /api/admin/create-employee  — Create with resume data
POST   /api/admin/employees/update — Update employee details
```

### Skills / Data APIs
```
GET    /api/employees/:id/skills   — Employee skills
POST   /api/skills/update          — Save skill ratings
GET    /api/certifications/:id     — Certifications (ALL or per employee)
GET    /api/projects/:id           — Projects (ALL or per employee)
GET    /api/achievements/:id       — Achievements (ALL or per employee)
GET    /api/education/:id          — Education (ALL or per employee)
POST   /api/employees/batch-skills — Batch fetch skills for multiple IDs
```

### BFSI APIs
```
GET    /api/bfsi/dashboard         — KPI data
GET    /api/bfsi/workforce         — All workforce employees
GET    /api/bfsi/roles             — All SRF roles
POST   /api/bfsi/upload            — Upload Excel file
POST   /api/bfsi/reset             — Reset all BFSI data
GET    /api/bfsi/report/weekly     — Weekly report data
GET    /api/bfsi/skill-analysis    — Skill gap analysis
```

### AI APIs
```
POST   /api/generate               — LLM proxy (Ollama/Gemini)
GET    /api/health                 — Server health check
```

---

## 8. AI / LLM Integration

### LLM Proxy (`/api/generate`)

The server acts as a proxy between the frontend and AI providers:

```
Frontend → POST /api/generate → Server → Ollama (localhost:11434)
                                       → Gemini API (if CLOUD_API_KEY set)
                                       → Anthropic (if configured)
```

**Fallback chain for resume extraction:**
```
qwen3-coder:480b-cloud
  → deepseek-v3.1:671b-cloud
  → gemini-3-flash-preview:cloud
  → glm-5.1:cloud
  → gemma4:cloud
```

### Resume Extraction (2 LLM calls)

**Call 1 — Basic Info:**
```json
{"name":"","email":"","phone":"","designation":"","location":"","department":"","yearsIT":0}
```

**Call 2 — Detailed Extraction:**
- Skills (from 32 predefined only)
- Projects (name, client, role, duration, technologies)
- Certifications (name, issuer, date)
- Education (degree, institution, year)
- Achievements (title, type — named awards only, NOT metrics)

### ZenAI Career Coach

- Reads employee's actual skill ratings from DB
- Builds context: "Employee has Selenium L3, Python L2, Banking domain..."
- Sends to LLM with career coaching prompt
- Returns personalized advice, roadmap, certification recommendations

---

## 9. Setup & Installation

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Ollama (for local AI) OR Google Gemini API key

### Step 1: Clone & Install
```bash
git clone https://github.com/magudeshwaran-hmw/zenlap.git
cd zenlap
npm install
```

### Step 2: Database Setup
```bash
# Create database
psql -U postgres -c "CREATE DATABASE skillmatrix;"

# Run schema
psql -U postgres -d skillmatrix -f COMPLETE_DATABASE_SETUP.sql
```

### Step 3: Environment Config
```bash
cp .env.example .env
# Edit .env with your DB credentials and AI config
```

### Step 4: Start Ollama (for local AI)
```bash
ollama pull qwen3-coder:480b-cloud
ollama serve
```

### Step 5: Start the Application
```bash
# Start everything (UI + Server + Ollama)
npm run dev

# Or separately:
npm run dev:ui      # Frontend on port 8080
npm run server      # Backend on port 3001
```

### Step 6: First Login
- Admin: `admin` / `admin123` (change after first login)
- Employee: Register at `/login`

---

## 10. Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=skillmatrix
DB_USER=postgres
DB_PASSWORD=your_password

# Server
PORT=3001

# AI Configuration
LLM_PROVIDER=ollama          # or "gemini"
LLM_MODEL=qwen3-coder:480b-cloud
CLOUD_API_KEY=               # Google Gemini key (optional)
LOCAL_MODEL=qwen3-coder:480b-cloud
```

---

## Project Structure

```
zenlap/
├── src/
│   ├── pages/               # All 22 page components
│   │   ├── LandingPage.tsx
│   │   ├── AuthPage.tsx
│   │   ├── AdminDashboard.tsx    # ZenRadar
│   │   ├── BFSIDashboard.tsx     # ZenTalentHub (3689 lines)
│   │   ├── EmployeeDashboard.tsx
│   │   ├── SkillMatrixPage.tsx   # ZenMatrix
│   │   ├── AIIntelligencePage.tsx # ZenAI Coach
│   │   ├── ResumeUploadPage.tsx
│   │   ├── CertificationsPage.tsx
│   │   ├── ProjectsPage.tsx
│   │   ├── EducationPage.tsx
│   │   ├── AchievementsPage.tsx
│   │   └── ...
│   ├── components/
│   │   ├── AppHeader.tsx         # Top navigation
│   │   ├── ui/                   # Radix UI components
│   │   └── ...
│   ├── lib/
│   │   ├── llm.ts               # AI/LLM integration
│   │   ├── api.ts               # API base URL
│   │   ├── authContext.tsx      # Authentication state
│   │   ├── themeContext.tsx     # Dark/light mode
│   │   ├── appStore.ts          # Employee data loader
│   │   └── ...
│   └── App.tsx                  # Routes
├── server-postgres.cjs          # Express backend (3095 lines)
├── COMPLETE_DATABASE_SETUP.sql  # Full DB schema
├── .env.example                 # Environment template
├── package.json
└── vite.config.ts
```

---

## Key Design Decisions

| Decision | Reason |
|---|---|
| Single Express server | Simpler deployment, no microservices overhead |
| AES-256 password encryption | Passwords stored encrypted, not hashed (admin can view for support) |
| Ollama local AI | Privacy-first, no data leaves the network |
| BFSI data separate from employee data | BFSI workforce (Excel) ≠ Zen Matrix users (self-registered) |
| Pool-only Zen Matrix search | Only available employees are relevant for placement |
| l4_skills as primary_skill | Most specific skill category from Excel, more accurate than ACTUALSKILL |
| 5 or 6 digit Zensar ID | Supports both old (5-digit) and new (6-digit) ID formats |

---

*Last updated: May 2026 | Version: 2.0*
