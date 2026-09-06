# FactoryFlow deployment and recovery

## Release checks

Run npm ci, npm run db:generate, npm run db:validate, npm run format:check,
npm run lint, npm run typecheck, npm test, npm run test:e2e, and npm run build.
Integration and browser tests require an isolated PostgreSQL database/schema;
never point tests at production. Browser tests include a synthetic camera
stream decoding a real QR label. Physical phone/printer acceptance is still
required on the chosen factory hardware.

The application uses Next.js standalone output. Dockerfile builds a Node 22
runtime image running as the non-root node user. Build-only environment
placeholders are confined to build commands; runtime must receive a real
AUTH_SECRET and DATABASE_URL from the deployment secret store.

Apply prisma migrate deploy through a deployment job with migration privileges
before switching application traffic. Use a separate, least-privilege runtime
database user. Protect append-only ProductTransition, WeightEvent, and AuditLog
tables by denying runtime UPDATE/DELETE grants. ProductAssignment may be
updated only to close the active responsibility period through the application;
never grant the app schema-owner/superuser authority.

Example build and startup:

```powershell
docker build -t factoryflow .
# Set DATABASE_URL and AUTH_SECRET in a protected runtime environment file.
docker run --name factoryflow -p 3000:3000 --env-file .env.production.local factoryflow
```

For a non-container host, run npm run build followed by npm run start. A
standalone server can be started with node .next/standalone/server.js after
copying .next/static into .next/standalone/.next/static.

## Host configuration

- Terminate HTTPS at the chosen reverse proxy; camera APIs need a secure origin.
- Set AUTH_URL to the canonical HTTPS origin and configure Auth.js trusted-host
  handling for that deployment. Do not trust arbitrary client-forwarded headers.
- Pass a random AUTH_SECRET of at least 32 characters. Rotate only as an
  intentional operation because it invalidates sessions.
- Restrict the database network to the application and maintenance hosts.
- Configure edge/IP rate limiting at the trusted ingress as well as the shared
  application limits. Account/global login limits do not identify source IPs.
- Security headers deny framing and MIME sniffing, restrict camera access to
  this origin, disable microphone/geolocation, and enable HSTS in production.
- Keep application and migration connection pools within database capacity.
- Store logs in the host's protected log system and alert on request_failed,
  authjs_error, repeated rate_limit_exceeded, and unavailable health checks.

## Application rate limits and logs

PostgreSQL-backed atomic rate buckets are shared across app instances:
10 credential attempts per account per 15 minutes, 300 credential attempts
globally per minute, and 120 production requests per user/tenant per minute.
Limits fail closed if their backing database is unavailable. Requests that
exceed a limit get a safe, localized response; login failures remain generic.
Tune these fixed MVP limits against measured factory traffic before increasing
capacity. Buckets store hashed identifiers and expiration timestamps.

Schedule daily maintenance with the deployment's existing job scheduler:

```sql
DELETE FROM "RateLimitBucket" WHERE "expiresAt" < CURRENT_TIMESTAMP;
```

Do not delete idempotency records without an explicit retention/retry policy.
Pino emits structured logs; the Next.js request error hook records digest,
route template, method, and error category without raw request/credential data.
Business history and audit are stored in PostgreSQL, not only in logs.

## Backup policy to configure at deployment

Use encrypted managed PostgreSQL backups with point-in-time recovery when the
selected provider supports it. The owner must approve recovery-point and
recovery-time targets, retention, region, encryption keys, and restoration
access before go-live. Suggested starting targets for approval are at most
15 minutes data loss and restoration within 4 hours. These targets are not
claimed as achieved by the local restore test.

Keep daily encrypted logical backups in a separately controlled storage
location as an additional recovery option. Monitor backup failures and restore
into an isolated environment at least monthly and before risky migrations.
Never store database dumps in Git or expose them through the application.

For the local Docker Compose database:

```powershell
node scripts/local-backup.mjs --verify-restore
```

The script exports a PostgreSQL repeatable-read snapshot, creates a custom
pg_dump backup plus a checksum/count manifest under ignored backups/, then
restores into a newly named database. It compares Product, assignment,
transition, audit, weight and issue counts against that consistent snapshot.
It never overwrites the source database or drops restored databases. Remove
old local restore databases and dumps only after review.

## Existing local database caveat

The inspected pre-existing public schema was created without Prisma migration
history and lacks several custom integrity constraints. It also contains two
test workflow families with multiple active versions. A backup was created.
Attempted integrity repair rolled back when the workflow uniqueness check
failed, preserving the original data.

The running preview therefore uses the separate factoryflow_verification
schema. Do not baseline an arbitrary database by blindly marking migrations
applied. Compare tables, columns, foreign keys, indexes and checks against a
clean migration-chain database first. Resolve conflicting workflow versions
through an explicit reviewed choice before applying the missing unique index.

## Go-live responsibilities still requiring an environment owner

Production hosting/DNS/TLS, production secrets, a privileged first System
Admin bootstrap, encrypted off-host backups/retention, alerts, workload
targets, and physical phone/printer acceptance cannot be inferred from this
repository. The local app and tests do not constitute a production deployment.

