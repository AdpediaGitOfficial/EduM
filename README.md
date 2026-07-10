# EduM — School Management ERP

Full-stack, permission-enforced school ERP: academics, attendance, progress
tracking, finance, payroll, transport, assets, library, communication and
analytics — for admins, principals, HR, accountants, teachers, parents and
students.

| Layer      | Stack |
|------------|-------|
| Frontend   | Next.js 15 (App Router) · React 19 · TailwindCSS 4 · React Query · React Hook Form · Recharts |
| Backend    | NestJS 11 · Prisma 6 · JWT (access + refresh, rotating sessions) · bcrypt |
| Data       | PostgreSQL 16 · Redis 7 (rate limiting/queues) · S3-compatible file storage (optional — local-disk fallback) |
| Testing    | Jest + Supertest (RBAC guards, tenant isolation, fee reconciliation) |
| Deployment | Standard Node.js server: PM2 process manager + Nginx reverse proxy (no Docker) |

EduM is fully standalone: auth (JWT + bcrypt), authorization (database-driven
RBAC), data access (Prisma), file storage (S3-compatible) and background
providers are all first-party code — no app-builder or BaaS dependencies.

---

## Quick start (local development)

Prerequisites: Node 20+, PostgreSQL 16, Redis (optional), any S3-compatible
store (optional — uploads fall back to local `./uploads`).

```bash
npm install
cp .env.example apps/api/.env          # adjust DATABASE_URL if needed
npm run migrate -w apps/api            # prisma migrate deploy
npm run seed                           # idempotent demo seed
npm run dev                            # api on :4000 + web on :3000
```

## Production deployment (PM2 + Nginx)

```bash
npm install && npm run build           # build API + web
npm run migrate -w apps/api && npm run seed
pm2 start ecosystem.config.js          # edum-api (cluster) + edum-web
sudo cp deploy/nginx.conf /etc/nginx/sites-available/edum   # then enable + certbot
```

Full step-by-step (Linux and Windows, TLS, backups, updates, troubleshooting):
**[DEPLOYMENT.md](DEPLOYMENT.md)**.

## Demo logins

Seeding prints these; the login page also has one-click demo buttons.
**Password for every demo account: `Password123!`**

| Role           | Email |
|----------------|-------|
| super_admin    | superadmin@demo.edum.school |
| school_admin   | admin@demo.edum.school |
| principal      | principal@demo.edum.school |
| vice_principal | vice.principal@demo.edum.school |
| hr             | hr@demo.edum.school |
| accountant     | accountant@demo.edum.school |
| teacher        | teacher1@… teacher8@demo.edum.school |
| parent         | parent1@… parent40@demo.edum.school |
| student        | student1@… student40@demo.edum.school |

The demo school ships with 40 students across 6 sections, 60 days of
attendance, 2 published exams with full results, invoices (70% paid / 20%
partial / 10% overdue — always reconciled), payroll, leave requests, 3 bus
routes, 20 assets, a 30-book library with active borrows, announcements,
complaints and chat threads.

## Tests

```bash
npm test        # from repo root (runs apps/api Jest suite)
```

The suite boots the real Nest app against the seeded database and asserts:

- every probed module returns **403 for wrong roles** (users, staff, payroll,
  fees, assets, fleet, access-control…),
- **Parent A cannot read Parent B's children** (records, attendance,
  gradebook, homework, analytics, or pay their invoices),
- students see **only their own record**, teachers only assigned
  subjects/sections,
- **every invoice reconciles**: payments − refunds + outstanding = total,
  and statuses (paid/partial/overdue) match the math,
- grading/GPA and asset-depreciation helpers.

## Architecture notes

- **RBAC**: every endpoint carries `@RequirePermission(module, action)`;
  a global guard resolves it against the `permissions` table (editable at
  runtime in *Admin → Access Control*, reset-to-defaults supported). Routes
  without a permission declaration are **rejected — fail closed**.
- **Scoping** (the real boundary, enforced in services with query-level
  filters, never trusting client ids): teachers → assigned sections/subjects;
  parents → children via the `guardians` table; students → self.
- **Multi-school ready**: every tenant table carries `school_id`; the demo
  runs one school.
- **Hardware/provider integrations are interface-first mocks**: QR/RFID
  attendance capture endpoints, GPS ingestion (`POST /api/fleet/gps/ping`
  with `X-Device-Key`), email/SMS/push providers, and a sandbox payment
  gateway — swap real providers via env vars without restructuring.
- Seed is deterministic and idempotent (`FORCE_RESEED=1` wipes & rebuilds).

## Repository layout

```
apps/api             NestJS API (src/modules/* one file per domain module)
  prisma/            schema.prisma, migrations, seed.ts
  test/              Jest integration + unit tests
apps/web             Next.js app (src/app portals, src/features shared UI logic)
ecosystem.config.js  PM2 process definitions (edum-api cluster + edum-web)
deploy/nginx.conf    reverse-proxy config (/api → :4000, rest → :3000)
DEPLOYMENT.md        server setup guide (Linux + Windows, TLS, backups)
BUILD_LOG.md         honest per-phase build record incl. known gaps
```
