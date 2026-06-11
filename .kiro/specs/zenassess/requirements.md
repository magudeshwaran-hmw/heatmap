# Requirements Document

## Introduction

ZenAssess is an AI-powered skill validation feature for ZenSkill Navigator. It provides a structured, three-section assessment flow that validates employee skills extracted from their resume before saving them to the database. The system generates personalized questions using the existing LLM infrastructure, assigns validated skill levels, and produces AI-generated study paths for failed assessments.

## Glossary

- **ZenAssess**: The AI-powered skill validation page at `/employee/zenassess`
- **Level_Path**: The assessment track determined by years of IT experience — Junior (0–2 yrs), Mid-Level (2–5 yrs), or Senior/Lead (5+ yrs)
- **Session**: A single assessment attempt stored in the `zenassess_sessions` database table
- **Skill_Matrix**: The employee's validated skill ratings stored in the `skills` table
- **LLM_Proxy**: The existing `/api/llm` backend endpoint used for all AI calls
- **Evidence_Form**: The Senior-path submission form for certifications, deliverables, and mentoring records
- **Study_Path**: An AI-generated 14-day personalized learning plan for failed assessments
- **Validated_Badge**: A visual indicator shown on skills that have passed ZenAssess validation

## Requirements

### Requirement 1: Resume Upload Redirect

**User Story:** As an employee, I want to be redirected to ZenAssess after uploading my resume, so that my extracted skills are validated before being saved to the database.

#### Acceptance Criteria

1. WHEN a user confirms extracted resume data on ResumeUploadPage, THE ResumeUploadPage SHALL redirect to `/employee/zenassess` with extracted data passed as route state.
2. THE ResumeUploadPage SHALL save education, certifications, projects, and achievements to the database during the redirect flow.
3. THE ResumeUploadPage SHALL NOT save skill ratings to the backend database before ZenAssess validation is complete.
4. WHEN the user is in popup mode, THE ResumeUploadPage SHALL navigate to the ZenAssess tab instead of the Dashboard tab.

### Requirement 2: Profile Review Section

**User Story:** As an employee, I want to review and edit my extracted skills before starting the assessment, so that the test accurately reflects my actual skill set.

#### Acceptance Criteria

1. WHEN a user arrives at ZenAssessPage, THE ZenAssessPage SHALL display Section A (Profile Review) as the first section.
2. THE ZenAssessPage SHALL display all skills extracted from the resume with their detected proficiency levels.
3. WHEN a user changes a skill's proficiency level, THE ZenAssessPage SHALL update the skill entry immediately.
4. WHEN a user adds a new skill, THE ZenAssessPage SHALL append it to the skills list if the skill name is not already present.
5. IF a duplicate skill name is entered, THEN THE ZenAssessPage SHALL display an error message and reject the addition.
6. WHEN a user removes a skill, THE ZenAssessPage SHALL remove it from the skills list immediately.
7. THE ZenAssessPage SHALL detect and display the experience level (Junior/Mid-Level/Senior) based on `yearsIT` from the extracted profile.
8. IF no resume data is present in route state, THEN THE ZenAssessPage SHALL display a warning with a link to the resume upload page.
9. IF the employee has a previous failed session with an active retry restriction, THEN THE ZenAssessPage SHALL disable the Start Validation button and display the retry date.

### Requirement 3: AI-Generated Test — Junior Path

**User Story:** As a Junior employee, I want to take an AI-generated MCQ test based on my specific skills, so that my knowledge is validated objectively.

#### Acceptance Criteria

1. WHEN a Junior employee starts validation, THE ZenAssessPage SHALL call the LLM_Proxy to generate 20–30 MCQ questions based on the employee's specific skills and experience level.
2. THE LLM_Proxy SHALL generate questions that are unique per session and tailored to the employee's skill list.
3. WHEN a user selects an answer, THE ZenAssessPage SHALL highlight the selected option immediately.
4. THE ZenAssessPage SHALL display each question's difficulty level and associated skill.
5. IF the LLM_Proxy fails to generate questions, THEN THE ZenAssessPage SHALL display an error message with a retry button.

### Requirement 4: AI-Generated Test — Mid-Level Path

**User Story:** As a Mid-Level employee, I want to take a timed assessment combining MCQ and practical scenarios, so that both my knowledge and applied experience are validated.

#### Acceptance Criteria

1. WHEN a Mid-Level employee starts validation, THE ZenAssessPage SHALL generate 20 MCQ questions and 5 practical scenario questions via the LLM_Proxy.
2. THE ZenAssessPage SHALL display a countdown timer starting at 45 minutes.
3. WHILE the timer is active, THE ZenAssessPage SHALL decrement the timer every second.
4. WHEN the timer reaches zero, THE ZenAssessPage SHALL automatically submit the assessment.
5. THE ZenAssessPage SHALL generate scenario questions based on the employee's actual project experience from the resume.
6. THE ZenAssessPage SHALL calculate the combined score as 60% MCQ score plus 40% contribution evidence score.

### Requirement 5: Senior Path — Evidence Submission

**User Story:** As a Senior/Lead employee, I want to submit evidence of my expertise instead of taking a test, so that my advanced skills are validated through demonstrated experience.

#### Acceptance Criteria

1. WHEN a Senior employee starts validation, THE ZenAssessPage SHALL display the Evidence_Form instead of generating test questions.
2. THE Evidence_Form SHALL include fields for certifications, project deliverables, mentoring records, publications, and awards.
3. THE ZenAssessPage SHALL calculate an evidence completeness score based on the number of fields with substantive content (more than 20 characters).
4. WHEN a Senior employee submits, THE ZenAssessPage SHALL set the session status to `review_required` and display a manager review notice.

### Requirement 6: Results and Level Assignment

**User Story:** As an employee, I want to see my assessment results with an assigned skill level, so that I know my validated proficiency.

#### Acceptance Criteria

1. WHEN an assessment is submitted, THE ZenAssessPage SHALL calculate the score and display Section C (Results).
2. FOR Junior path: WHEN score is below 60%, THE ZenAssessPage SHALL assign status `failed` and display a 14-day study path.
3. FOR Junior path: WHEN score is 60–79%, THE ZenAssessPage SHALL assign level `Beginner` and status `passed`.
4. FOR Junior path: WHEN score is 80–100%, THE ZenAssessPage SHALL assign level `Intermediate` and status `passed`.
5. FOR Mid-Level path: WHEN combined score is below 70, THE ZenAssessPage SHALL assign status `failed`.
6. FOR Mid-Level path: WHEN combined score is 70–84, THE ZenAssessPage SHALL assign level `Intermediate` and status `passed`.
7. FOR Mid-Level path: WHEN combined score is 85 or above, THE ZenAssessPage SHALL assign level `Intermediate+` and status `passed`.
8. FOR Senior path: WHEN evidence completeness is below 60%, THE ZenAssessPage SHALL assign status `failed`.
9. FOR Senior path: WHEN evidence completeness is 60% or above, THE ZenAssessPage SHALL assign status `review_required` and level `Advanced/Expert (Pending)`.
10. WHEN status is `passed`, THE ZenAssessPage SHALL display Validated_Badges on all assessed skills.

### Requirement 7: Skill Matrix Update

**User Story:** As an employee, I want my validated skills saved to the database only after passing, so that the skill matrix reflects only verified proficiency.

#### Acceptance Criteria

1. WHEN an assessment status is `passed` or `review_required`, THE ZenAssessPage SHALL call `POST /api/zenassess/complete` with the skill ratings payload.
2. THE Backend SHALL upsert skill ratings into the `skills` table with `validated=true` for `passed` sessions.
3. THE Backend SHALL upsert skill ratings with `validated=false` for `review_required` sessions.
4. IF an assessment status is `failed`, THEN THE Backend SHALL NOT update the `skills` table.

### Requirement 8: AI Study Path Generation

**User Story:** As an employee who failed the assessment, I want an AI-generated personalized study plan, so that I know exactly what to study before retrying.

#### Acceptance Criteria

1. WHEN an assessment status is `failed`, THE ZenAssessPage SHALL call the LLM_Proxy to generate a 14-day Study_Path.
2. THE Study_Path SHALL be personalized based on the skills where the employee scored below 60%.
3. THE Study_Path SHALL include specific resources and estimated days per skill.
4. THE ZenAssessPage SHALL display the Study_Path in Section C after a failed assessment.
5. THE ZenAssessPage SHALL display the retry date (14 days from failure) to the employee.

### Requirement 9: Backend Session Management

**User Story:** As the system, I want to persist assessment sessions in the database, so that retry restrictions and history are maintained across sessions.

#### Acceptance Criteria

1. THE Backend SHALL expose `POST /api/zenassess/session` to create a new assessment session record.
2. THE Backend SHALL expose `POST /api/zenassess/complete` to update session results and conditionally update the skill matrix.
3. THE Backend SHALL expose `GET /api/zenassess/status/:employeeId` to retrieve the most recent session status for an employee.
4. WHEN a session status is `failed`, THE Backend SHALL set `retry_after` to 14 days from the completion timestamp.
5. THE Backend SHALL create the `zenassess_sessions` table idempotently on startup if it does not exist.

### Requirement 10: Navigation and Routing

**User Story:** As an employee, I want to access ZenAssess from the navigation bar, so that I can start an assessment at any time.

#### Acceptance Criteria

1. THE AppHeader SHALL display a "ZenAssess" navigation item in the employee navigation bar.
2. THE App SHALL register the route `/employee/zenassess` mapped to ZenAssessPage.
3. WHEN an unauthenticated user navigates to `/employee/zenassess`, THE App SHALL redirect to `/login`.
4. THE ZenAssessPage SHALL respect the existing dark/light theme using `useDark` and `mkTheme`.
