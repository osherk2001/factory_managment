# FactoryFlow

FactoryFlow is a multi-tenant manufacturing execution system. This repository currently contains the Phase 1 foundation, the Phase 2 core database model, and the Phase 3 development fixtures.

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- Docker Desktop with Docker Compose

## Local development

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Create local environment configuration:

   ```powershell
   Copy-Item .env.example .env
   ```

   Keep `POSTGRES_PASSWORD` and the password in `DATABASE_URL` aligned. The example uses a placeholder value; set a local development password before starting PostgreSQL.

   `POSTGRES_PORT` is the host port mapped to PostgreSQL. The default is `5432`; choose another free host port if that port is already in use and update the port in `DATABASE_URL` to match.

3. Start PostgreSQL:

   ```powershell
   docker compose up -d postgres
   docker compose ps
   ```

4. Apply the Phase 2 migration, generate the Prisma client, and verify the connection:

   ```powershell
   npx prisma migrate deploy
   npm run db:generate
   npm run db:check
   ```

   The migration creates the core tenant, identity, production, workflow, tracking, history, audit, and idempotency tables. It also creates the PostgreSQL partial unique index that allows only one active ProductAssignment per Product.

   Migration name: `20260815220009_init_core_database`.

5. Seed local development fixtures:

   To load the deterministic development organization and reference data, run:

   ```powershell
   npm run db:seed
   ```

   The seed command requires `SEED_ENV=development`, refuses to run when `NODE_ENV=production`, is safe to run repeatedly, and never creates passwords or products. It creates only configuration and development user records for the next implementation phase.

6. Start the Next.js development server:

   ```powershell
   npm run dev
   ```

   Open <http://localhost:3000>. The health endpoint is <http://localhost:3000/api/health>.

## Verification commands

```powershell
npm run format
npm run lint
npm run typecheck
npm test
npm run db:seed
npx playwright install chromium
npm run test:e2e
docker compose config
npm run db:check
Invoke-RestMethod http://localhost:3000/api/health
```

The integration tests require PostgreSQL and an applied migration. The Playwright smoke test starts a local Next.js server automatically. The health endpoint requires PostgreSQL to be running and the `.env` file to be configured.

## Foundation layout

The source layout follows the modular-monolith boundaries described in `docs/ARCHITECTURE.md`:

```text
src/
  app/                 Next.js App Router routes and UI shell
  components/          Shared UI components, including shadcn/ui foundation
  modules/             Domain module boundaries for future phases
  lib/                 Database, logging, validation, auth, and i18n infrastructure
  shared/              Cross-module types, errors, and utilities
prisma/                Prisma schema and migration history
tests/                 Vitest unit/integration tests and Playwright smoke tests
```

## Deliberate Phase 3 boundaries

This phase does not include Auth.js, login, sessions, password hashing, middleware, permission guards, Product lifecycle services, barcode scanning, worker or manager dashboards, the workflow business engine, reports, or production execution. The seed establishes development users, tenant access roles, permissions, production roles, employees, departments, and locations only. `SYSTEM_ADMIN` remains a platform-level concept and is not seeded as a tenant access role.
