## Scope

This is a large multi-module expansion. I'll ship it in phased milestones so each phase is reviewable and functional on its own, rather than one giant unreviewable drop. All new UI reuses the existing design tokens, card styles, and status colors. Parent role and the four already-built pages (Homework tab, Attendance tab, Parent Dashboard, Student Detailed Report) will not be touched — Admin views link into them.

## Roles & routing (foundation, ships first)

Roles already exist in DB (`admin`, `teacher`, `student`, `parent`). I'll:
- Add `staff` and `class_teacher` variants via a `staff_role` column on a new `staff_profiles` table (keeping the `app_role` enum untouched to avoid breaking existing policies). Class-teacher scoping via `teacher_classes` already exists.
- Post-login redirect by primary role: parent → `/dashboard` (unchanged), teacher/staff → `/staff`, admin → `/admin`.
- Admin-only role switcher in the top bar (writes a `demo_role` to sessionStorage; purely UI, RLS still enforces real role server-side).
- New sidebar for admin/teacher routes; parent layout untouched.

## Data model additions (one migration)

New tables (all with GRANTs, RLS, updated_at trigger):
- `complaints` (student_id, raised_by, severity, status, subject, body)
- `complaint_messages` (complaint_id, sender_id, body) — threaded chat
- `broadcasts` (sender_id, audience_type, audience_ref, subject, body, attachment_url)
- `broadcast_recipients` (broadcast_id, user_id, read_at)
- `progress_notes` (student_id, teacher_id, note, tone, date) — feeds the day-wise progress hub
- `staff_permissions` (user_id, permission_key, enabled) + `permission_audit_log`
- `assets` (name, category, location, condition, status) — placeholder
- `library_books` + `library_loans` — placeholder
- `buses` + `bus_locations` — placeholder
- RLS: parents see only their linked child's rows; teachers see their class's rows; admin sees all — via `has_role` + `parent_student` + `teacher_classes`.

Fee tables (`fee_assignments`, `payments`, `fee_structures`) already exist and get reused for Fee Management.

## Milestone 1 — Foundation + Admin shell (ship first)
1. Migration for new tables + `staff_profiles`.
2. `/admin` layout with sidebar (Dashboard, Attendance, Progress, Fees, Communication, Reports, Staff, Access, Fleet, Assets, Library, Analytics).
3. `/staff` layout with sidebar (My Classes, Attendance, Complaints, Homework).
4. Login redirect by role + admin role-switcher.
5. Admin Home Dashboard: stat cards (fee collected, pending, attendance % today, active complaints), revenue chart, quick links. Real data via server functions.

## Milestone 2 — Admin Attendance + Progress + Fees
6. Attendance Overview: day-wise school summary, period-wise grid, drill-down to per-student.
7. Progress Reports Hub: child search → links to existing Student Detailed Report; day-wise feed of `progress_notes`.
8. Fee Management: collection table with filters, Record Payment form (writes to existing `payments`), receipt view (print-to-PDF via browser), search.

## Milestone 3 — Communication + Complaints + Reports Generator
9. Communication: broadcast composer, audience selector, sent history with read status.
10. Complaints: teacher raise-complaint form, threaded chat teacher↔parent and teacher↔admin, escalation, history. Parent Dashboard gets a small "Notifications" surface pulling from complaints/broadcasts (minimal, non-invasive).
11. Reports Generator: type + date range + filters → table + CSV download + print PDF.

## Milestone 4 — Monitoring + Access Control
12. Teacher/Staff Monitoring: directory, "attendance marked today" flag, activity log.
13. Staff Access Control: role dropdown, permission toggles, audit log.

## Milestone 5 — Placeholders (functional stubs)
14. Fleet, Assets, Library, Analytics, Teacher Performance — real tables + basic list UI, mocked live data where noted (bus GPS uses a static map with mock coordinates).

## Technical notes
- All admin/teacher data reads via `createServerFn` + `requireSupabaseAuth`.
- Charts reuse `recharts` (already in use).
- PDFs = browser print stylesheet (no new deps), CSV = client-side blob.
- No changes to `src/routes/_authenticated/dashboard.tsx` (parent), `children.*` routes, or the existing report page.

## Confirmation needed
Given the scale, I'll ship **Milestone 1** in the next turn and pause for your review before moving to M2. Reply "go" to proceed with Milestone 1, or tell me to reorder / drop milestones.