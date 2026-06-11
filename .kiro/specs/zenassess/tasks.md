# ZenAssess — Task List

## ✅ COMPLETED

### Backend
- [x] `POST /api/zenassess/session` — create assessment session in DB
- [x] `POST /api/zenassess/complete` — save results, update skill matrix if passed
- [x] `GET /api/zenassess/status/:employeeId` — get last session status
- [x] `zenassess_sessions` table auto-created on startup
- [x] Employee ID resolution (zensar_id → employees.id) in complete endpoint
- [x] Skill matrix updated with `validated=true` on pass
- [x] 14-day retry_after set on failed sessions

### Frontend — ZenAssessPage
- [x] Route `/employee/zenassess` registered in App.tsx
- [x] "ZenAssess" added to employee nav in AppHeader
- [x] BETA badge shown in header
- [x] 4 experience bands detected from resume yearsIT:
  - 0–2 yrs → Beginner
  - 2–5 yrs → Intermediate
  - 5–8 yrs → Advanced
  - 8+ yrs → Expert
- [x] Exactly 10 questions shown (beta — Performance Testing only)
- [x] All 50 Performance Testing questions loaded from Excel
- [x] Per-topic tab pagination
- [x] 45-minute countdown timer
- [x] No difficulty label shown to user
- [x] Answers never revealed — only A/B/C/D options
- [x] Skills to Validate panel — non-editable, read-only
- [x] Score calculation per topic
- [x] Level assignment: Beginner / Intermediate / Intermediate+ / Advanced / Expert
- [x] 14-day study path shown on fail
- [x] Retry restriction enforced
- [x] Skill matrix updated in DB only on pass

### Frontend — ZenMatrix (SkillMatrixPage)
- [x] Rating buttons disabled — no manual edit allowed
- [x] "✓ Validated" badge shown on validated skills
- [x] Submit Final button hidden (skills set by ZenAssess only)

### Frontend — ResumeUploadPage
- [x] Skills NOT saved to DB on resume confirm
- [x] Redirects to ZenAssess with extracted data as route state
- [x] Graceful error handling when server offline (no scary red error)
- [x] `safeFetch` wrapper — never throws on network failure

---

## ❌ PENDING

### Bug Fixes
- [ ] **ZenMatrix not refreshing after test** — after completing ZenAssess and clicking
      "View ZenMatrix", the page shows old data. Need to force a data reload when
      navigating from ZenAssess results to /employee/skills.

### ZenAssess Improvements
- [ ] **Show level label on result** — result card should clearly say
      "Beginner", "Intermediate", "Advanced" as large text (not just score %)
- [ ] **ZenMatrix read-only notice** — add a banner on ZenMatrix page explaining
      "Skills are set by ZenAssess validation. Go to ZenAssess to update."
- [ ] **Navigation loading** — ZenRadar, ZenMatrix, ZenAssess, ZenAICoach, My Projects,
      My Education, My Certification, My Awards should show loading indicator
      while page data loads in background (non-blocking)

### Future (not started)
- [ ] All 32 skills assessed (currently Performance Testing only)
- [ ] Admin view: see all employee assessment results
- [ ] Manager approval flow for Advanced/Expert (Senior path)
- [ ] Evidence submission form for Advanced/Expert band
- [ ] GitHub/CI contribution scan for Intermediate band
- [ ] Email notification on assessment completion
