# FactoryFlow

FactoryFlow is a multi-tenant manufacturing execution system. This repository currently contains the Phase 1 foundation, the Phase 2 core database model, the Phase 3 development fixtures, the Phase 4 authentication and authorization foundation, and the Phase 5 Product creation flow.

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

   Set `AUTH_SECRET` to at least 32 random characters. The example intentionally leaves it blank; Auth.js uses it to protect the JWT session cookie. Production startup rejects missing, short, or documented placeholder values. Do not commit the real value.

   `POSTGRES_PORT` is the host port mapped to PostgreSQL. The default is `5432`; choose another free host port if that port is already in use and update the port in `DATABASE_URL` to match.

3. Start PostgreSQL:

   ```powershell
   docker compose up -d postgres
   docker compose ps
   ```

4. Apply the migrations, generate the Prisma client, and verify the connection:

   ```powershell
   npx prisma migrate deploy
   npm run db:generate
   npm run db:check
   ```

   The migrations create the core tenant, identity, production, workflow, tracking, history, audit, and idempotency tables. They also create the PostgreSQL partial unique index that allows only one active ProductAssignment per Product, the database integrity hardening constraints, and the tenant/year Product serial counter.

5. Seed local development fixtures:

   To load the deterministic development organization and reference data, run:

   ```powershell
   npm run db:seed
   ```

   The seed command requires `SEED_ENV=development`, refuses to run when `NODE_ENV=production`, is safe to run repeatedly, and never creates passwords or products. It creates only configuration and development user records.

6. Set a password for a seeded development user when manual login testing is needed:

   ```powershell
   $env:SEED_ENV = "development"
   $env:AUTH_DEV_USERNAME = "factoryflow-admin"
   npm run auth:set-dev-password
   ```

   If `AUTH_DEV_PASSWORD` is not provided, the command prompts without echoing the password. The command only accepts users belonging to the development organization and never prints the password.

7. Bootstrap a platform System Admin explicitly when needed:

   ```powershell
   $env:AUTH_BOOTSTRAP_USERNAME = "platform-admin"
   npm run auth:bootstrap-system-admin
   ```

   The password is read from `AUTH_BOOTSTRAP_PASSWORD` or a hidden prompt. This command is intentionally usable as an explicit production bootstrap operation; it does not require `SEED_ENV=development`. In production, inject the password from an approved secret manager or use the hidden prompt, never a command-line argument, and remove temporary environment variables afterward. A missing username or password is rejected. A new username creates only a platform System Admin User; an existing System Admin may be reset, while an existing non-System-Admin User is refused. The command never creates a tenant `SYSTEM_ADMIN` role or an Organization Membership.

8. Start the Next.js development server:

   ```powershell
   npm run dev
   ```

   Open <http://localhost:3000>. The health endpoint is <http://localhost:3000/api/health>.

   Users with `products.create` can create a Product at
   <http://localhost:3000/app/products/new>. Product creation assigns the
   next UTC-year serial, creates a non-guessable `ff_` barcode identity, and
   records the creation transition and audit event atomically.

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

## Authentication and authorization foundation

Auth.js uses a Credentials provider with globally unique usernames as the MVP login identifier. Sessions use encrypted JWT cookies with a 30-day maximum age. Session claims are minimal and are never treated as authoritative for active-user, Membership, or Permission checks; secure server helpers re-read current state from PostgreSQL.

`/login` is the localized Hebrew-default login page. `/app` is the minimal protected verification route. `proxy.ts` performs only optimistic authentication redirects; sensitive operations must call `requireAuthenticatedUser()`, `requireTenantContext()`, `requireSystemAdmin()`, or a permission helper on the server.

Login rate limiting is not implemented yet because the MVP does not include Redis or another shared rate-limit service. It remains a production-readiness requirement.

## Deliberate Phase 5 boundaries

This phase includes Product creation only. It does not include barcode scanning
or printing, later Product lifecycle operations, worker or manager dashboards,
the workflow business engine, reports, or production execution. The seed still
establishes users without passwords; local password setup and System Admin
bootstrap are explicit commands. `SYSTEM_ADMIN` remains a platform-level
concept and is not seeded as a tenant access role.
