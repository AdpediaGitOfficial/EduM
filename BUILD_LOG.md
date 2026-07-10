# EduM Build Log

Honest record of what was built, what is mock/interface-only, and what is not
done. Built in one autonomous session (2026-07-10) following the master build
prompt phases.

## Phase 0 — Scaffold
- Monorepo: npm workspaces (`apps/api` NestJS 11 + Prisma 6, `apps/web` Next.js 15).
- Pre-existing Lovable/Supabase prototype moved intact to `legacy-lovable/`
  (not deleted; not used by the ERP).

## Phase 1 — Foundation ✅
- Prisma schema: all spec tables + the required additions (payroll,
  leave_requests, staff_performance, behavior_notes, rubrics, notifications,
  sessions) + supporting tables (login_events, teaching_assignments,
  exam_subjects, fee_invoice_items, staff_attendance, staff_tasks,
  ip_allowlist_entries, certificates, student_documents…). `school_id` on
  every tenant-scoped table. Indexes per spec (`attendance(student_id,date)`,
  `fee_invoices(student_id,status)`, `users(school_id,role)`); financial FKs
  RESTRICT, dependent rows CASCADE.
- Auth: JWT access (15 min) + refresh tokens stored hashed in `sessions`
  with rotation; login history; forgot/reset password (mock email returns the
  token in dev so the flow is testable); change password revokes sessions.
- RBAC: `@RequirePermission(module, action)` on **every** endpoint, enforced
  by a global guard that reads the `permissions` table (30 s cache,
  invalidated on matrix edits). Routes without a permission declaration are
  rejected — fail closed. `@AuthOnly` is reserved for endpoints self-scoped
  by construction (own notifications, own profile, own tasks, file streams).
- Scoping in the service layer (`ScopeService`): teacher → assigned
  sections/subjects (strict: class-teacher status alone does NOT grant
  subject write access), parent → children via `guardians` query-level
  filter, student → self. Client-passed ids are always re-checked.

## Phase 2 — People ✅
Users (invite w/ temp password, roles, suspend/archive, activity log, login
history, admin password reset), staff profiles (departments, qualifications,
documents metadata, subject/section allocation, performance reviews, tasks),
students (admission incl. optional guardian creation, profile, medical,
guardians link/unlink, promotion, alumni, certificates, soft-delete when
financial records exist).

## Phase 3 — Academics & Attendance ✅
Classes/sections/subjects CRUD (deletes blocked while students enrolled),
timetable builder with teacher double-booking detection, per-role timetable
views. Attendance: daily marking sheet (bulk upsert, roster-validated),
QR + RFID capture endpoint contracts (simulate-able from the UI; no physical
hardware attached), monthly grid, analytics with visible <75% rule.

## Phase 4 — Progress Hub ✅
Homework/assignments/projects with per-roster submission slots, student
submit (late auto-flagged), teacher grading with max-score validation,
exams + exam-subjects + rubrics, bulk marks entry, gradebook with GPA
(10-point), section ranking, performance comparison charts, printable report
cards, behavior notes (positive/negative), progress notes, per-student
overview (attendance/exam/homework/fees/remarks in one view).

## Phase 5 — Finance ✅
Fee structures by category & class, invoice generation (class/section/student,
1–12 equal installments, discount/scholarship at generation or per-invoice,
late fees), invoice status derived from payments (single source of truth),
offline payment recording (over-payment rejected), **mock payment gateway**
behind a `PaymentGateway` interface (checkout → confirm; swap via
`PAYMENT_GATEWAY` env), refunds as linked records, PDF receipts, fee
analytics, payroll generation per month + payslip PDFs, leave request
workflow (staff request → HR/admin approve/reject).

## Phase 6 — Communication ✅
Announcements with audience targeting (school/role/section/individual) and
in-app fan-out (+optional mock email), pinned notice board, notification
center (unread counts, mark read), direct chat with role-scoped contact
lists (parents ↔ their children's teachers, students ↔ their teachers),
complaints with priority, assignment, resolution, escalation (complainants
can self-escalate after 48 h) and status notifications.

## Phase 7 — Operations ✅
Staff monitoring (KPI table: attendance %, pending leaves, open tasks,
latest review; staff attendance marking), fleet (vehicles/drivers/routes/
stops, student stop assignment, maintenance + fuel logs, **GPS ingestion
endpoint** `POST /api/fleet/gps/ping` authenticated by `X-Device-Key`),
assets (QR/barcode tag field, straight-line depreciation, AMC expiry,
vendors, maintenance records, dispose-not-delete), library (catalog,
borrow/return with ₹5/day fines, reservations, fine collection, digital flag).

## Phase 8 — Reports, Analytics, Access Control ✅
Report builder: 8 parameterized reports (attendance, academic, fees, payroll,
transport, assets, library, students) with role-filtered catalog and
CSV/XLSX/PDF export (export restricted to roles with export permission).
Analytics: executive (revenue/attendance/section performance/teacher
ratings/invoices/complaints), teacher (completion, trends, **visible**
weak-student rule: attendance <75% OR ≥2 missed assignments), parent/student
overviews, finance, HR — all computed from live data, no mock numbers.
Access control: permission-matrix editor (per role × module × action, scope
badges, reset to defaults), audit log viewer, active session list + revoke,
IP allowlist CRUD.

## Phase 9 — Hardening & Deployment ✅ (with caveats below)
- `docker-compose.yml`: postgres + redis + minio + api + web; api entrypoint
  runs `migrate deploy` + idempotent seed; healthchecks gate startup order.
- `.env.example` documents every variable; no secrets in the repo
  (`apps/api/.env` is gitignored).
- Seed (Section 7 complete): 1 school, year + 2 terms, 3 grades × 2 sections,
  8 subjects, 6 core-role users + 8 teachers + 40 students + 40 parents
  (4 sibling pairs sharing a parent; 4 secondary guardians), full-week
  timetables, 60 school-days attendance (~90% present), 15 homework/section
  with mixed statuses, 2 published exams with 640 results, invoices 70/20/10
  paid/partial/overdue (reconciled), 10 payroll rows, 5 leave requests,
  10 announcements, 8 complaints, 3 buses/routes/stops with assigned
  students, 20 assets, 30 books + 10 active borrows, behavior/progress notes,
  chat + notifications samples. Idempotent; `FORCE_RESEED=1` to wipe.
- Jest: **34/34 passing** (see audit below).

## Final audit (Section 9 checklist)

| Check | Result |
|---|---|
| Every Section 5 route renders for its role | ✅ Playwright audit: **61/61 routes** render with zero JS page errors; wrong-role access redirects to the user's own portal (client) and the API returns 403 (server) |
| Every endpoint has a permission guard | ✅ AST-ish grep audit: **195/195** HTTP endpoints carry `@RequirePermission` / `@AuthOnly` / `@Public`; the guard also rejects any undeclared route at runtime |
| No orphan/dead components or duplicate pages | ✅ shared feature components reused across portals; no "Coming Soon" pages exist |
| List views have search/filter/pagination/loading/empty/error | ✅ all lists use the shared `DataTable` (server pagination, debounced search, filters, spinner/empty/error+retry states) |
| Seed loads cleanly; app explorable immediately | ✅ single command; verified counts (94 users, 2 400 attendance rows, 600 submissions, 640 results…) |
| Parent A cannot view Parent B's children | ✅ automated tests: list isolation + 403 on record/attendance/gradebook/homework/analytics/checkout |
| Fee/payment numbers reconcile | ✅ automated test over every seeded invoice: payments − refunds + outstanding = total; status matches math; analytics totals reconcile; over-payment rejected; live checkout verified (overdue → paid, due 0) |
| `docker-compose up` from clean clone | ⚠️ **written but not executed end-to-end** — the build environment has no Docker daemon. Compose file, Dockerfiles and entrypoint follow the exact commands verified on bare metal (migrate → seed → serve). Flagged as the main untested surface. |
| Jest suite passes | ✅ 34/34 (2 suites: RBAC/scoping/financial integration + grading/depreciation units) |
| BUILD_LOG reflects real state | ✅ this file |

## Interface-only / mock (by design, per spec Section 10)
- **Email/SMS/push**: mock providers log + store notification rows; nothing
  is delivered externally. Swap via `NOTIFY_*_PROVIDER`.
- **Payment gateway**: sandbox auto-approve implementing the
  `PaymentGateway` interface. Swap via `PAYMENT_GATEWAY`.
- **QR/RFID attendance & GPS tracking**: endpoint contracts implemented and
  simulate-able from the UI; no physical hardware connected.
- **File storage**: MinIO-backed with local-disk fallback; upload endpoint
  works, but document-upload UI is metadata-only in staff/student profiles.

## Known gaps / honest notes
- **PWA/offline + i18n**: not implemented beyond architecture affordances;
  no service worker registered, no i18n string catalog. (Spec allowed
  stubbing; being explicit that nothing was wired.)
- **Bulk Excel import**: not implemented (export is; import UI was cut for time).
- **IP allowlist is advisory**: stored/managed in the UI; request-level
  enforcement is left to a reverse proxy (noted in the UI).
- **Redis/BullMQ**: Redis runs in compose and rate limiting is in-process
  (@nestjs/throttler default storage); notification fan-out is synchronous
  rather than queued through BullMQ — the dependency is installed and the
  provider interfaces make the swap local to `NotifyService`.
- **Timetable per-teacher override**: slots store `teacherStaffId` from the
  subject's assigned teacher; reassigning subject teachers doesn't rewrite
  existing slots automatically.
- **hr users scope**: HR's `users` CRUD is restricted to staff roles in the
  service layer (per matrix `CRUD(staff)`).
- Docker images unbuilt in this environment (no daemon) — see audit table.
- Legacy Lovable prototype left untouched in `legacy-lovable/`; it is not
  part of the ERP runtime.
