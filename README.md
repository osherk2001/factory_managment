# FactoryFlow

FactoryFlow is a multi-tenant manufacturing execution system. This repository currently contains the Phase 1 project foundation only.

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

4. Generate the Prisma client and verify the connection:

   ```powershell
   npm run db:generate
   npm run db:check
   ```

   Phase 1 intentionally has no FactoryFlow domain models or migrations. The schema is introduced from `docs/DATABASE.md` in Phase 2.

5. Start the Next.js development server:

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
npx playwright install chromium
npm run test:e2e
docker compose config
npm run db:check
Invoke-RestMethod http://localhost:3000/api/health
```

The Playwright smoke test starts a local Next.js server automatically. The health endpoint requires PostgreSQL to be running and the `.env` file to be configured.

## Foundation layout

The source layout follows the modular-monolith boundaries described in `docs/ARCHITECTURE.md`:

```text
src/
  app/                 Next.js App Router routes and UI shell
  components/          Shared UI components, including shadcn/ui foundation
  modules/             Domain module boundaries for future phases
  lib/                 Database, logging, validation, auth, and i18n infrastructure
  shared/              Cross-module types, errors, and utilities
prisma/                Phase 1 Prisma client and datasource configuration
tests/                 Vitest unit tests and Playwright smoke tests
```

## Deliberate Phase 1 boundaries

This phase does not include authentication, permissions, the FactoryFlow domain schema, Product lifecycle rules, barcode scanning, workflow behavior, dashboards, or reports. No business requirements have been added beyond the approved documentation.
