# EduM — Agent & Contributor Guide

EduM is a standalone School Management ERP monorepo (npm workspaces).
No external app builders or BaaS platforms are involved — auth, data access,
storage and permissions are all first-party code in this repository.

## Layout

- `apps/api` — NestJS 11 + Prisma 6 (PostgreSQL). One file per domain module
  in `src/modules/*.module.ts` (controller + service + module colocated).
  Schema/migrations/seed in `prisma/`. Tests in `test/`.
- `apps/web` — Next.js 15 App Router. Portal pages in `src/app/{admin,teacher,parent,student}`,
  reusable domain UI in `src/features`, primitives in `src/components`.
  `/api/*` is rewritten to the NestJS backend (see `next.config.ts`).
- `docker/` + `docker-compose.yml` — full stack (postgres, redis, minio, api, web).

## Commands (repo root)

- `npm install` — install all workspaces
- `npm run dev` — API on :4000 + web on :3000
- `npm run migrate -w apps/api` / `npm run seed` — migrate + idempotent demo seed
- `npm test` — Jest suite (requires the seeded database)
- `npm run build` — build both apps

## Non-negotiable conventions

1. **Every API endpoint** must carry `@RequirePermission(module, action)`,
   or `@AuthOnly()` (self-scoped by construction), or `@Public()` (auth
   endpoints/health only). The global guard rejects undeclared routes.
2. **Scoping lives in the service layer** (`ScopeService`): teacher → assigned
   sections/subjects, parent → children via `guardians`, student → self.
   Never trust a client-passed student/section id.
3. Financial records (invoices/payments/payroll) are never hard-deleted;
   entities referencing them soft-delete (archive/withdraw/dispose).
4. New tenant-scoped tables must carry `school_id`.
5. Hardware/provider integrations (payments, email/SMS, GPS, QR/RFID) go
   behind interfaces with mock defaults; real providers are env-selected.
6. Demo credentials are seeded — password `Password123!` for all
   `*@demo.edum.school` accounts.
