# TenantDesk

Tiny multi-tenant project tracker: Next.js 16 (App Router) · Auth.js v5 (Credentials, JWT) · `pg` + plain SQL migrations · Postgres (Supabase) · Vitest against the real DB.

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill DATABASE_URL and AUTH_SECRET (openssl rand -base64 32)
pnpm db:migrate              # applies migrations/*.sql once (tracked in schema_migrations)
pnpm db:seed                 # idempotent; safe to re-run
pnpm dev                     # http://localhost:3000
```

| Env var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres URL (Supabase pooler, session 5432 or transaction 6543) |
| `DATABASE_SSL` | `no-verify` (default), `verify`, `disable` (local only) |
| `AUTH_SECRET` | Auth.js JWT secret |
| `SEED_PASSWORD_ALICE/BOB/VERA` | Optional overrides of the test-only passwords |

## Test logins (test-only data, no real users)

| User | Password (default) | Access |
|---|---|---|
| alice@acme.test | `alice-test-only` | editor in **Acme** only |
| bob@globex.test | `bob-test-only` | editor in **Globex** only |
| vera@acme.test | `vera-test-only` | **viewer** in Acme |

If the reviewer's deployment uses `SEED_PASSWORD_*`, those are shared privately.

## Tests

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Tests hit the real database (no mocks below the session lookup): unauthenticated → 401; alice list/rename/create in Globex → 404 with DB and audit unchanged (also with a spoofed tenant id); vera create/rename → 404, DB unchanged; invalid names (`""`, `"   "`, 101 chars, number, null, object, non-JSON body) → validation/400; malformed ids → 404 (not 500); duplicate name (case-insensitive) → conflict/409; alice rename → success + exactly one audit row with old/new name; audit failure (a real DB trigger raising on insert) rolls back rename and create; credential check.

## Architecture & authorization

- **Identity only from the server session** (`src/server/session.ts` → `auth()`). The tenant in the cookie/URL/form is a *request*; it is never trusted.
- **One data-access module**, `src/server/projects.ts`. Every statement is driven by `memberships` on `(user_id, tenant_id, active)`:
  - list: `memberships LEFT JOIN projects`; no membership row → `not_found`.
  - create: `INSERT … SELECT FROM memberships WHERE role IN (editor, admin)`.
  - rename: a single `UPDATE … WHERE id = $ AND tenant_id = $ AND EXISTS(membership editor/admin) RETURNING`, with the old name read under `FOR UPDATE` for the audit row.
  - The write and its `audit_events` insert run in **one transaction**.
  - Non-member, wrong tenant, viewer write and malformed id all return the **same `not_found` / 404**, so no existence leaks.
- Input is validated with zod (`trim`, 1..100). The DB also enforces `CHECK length(trim(name)) BETWEEN 1 AND 100` and `UNIQUE (tenant_id, lower(name))` (→ 409). Index `(tenant_id, created_at DESC, id)` serves the list.
- Route handlers (`/api/tenants/[tenantId]/projects[/projectId]`) and Server Actions call only this module. The UI hides write controls for viewers; the server enforces anyway.

### Why application-level authorization and not RLS (yet)

The app connects through the Supabase pooler as a privileged role that bypasses RLS, and pooled connections don't carry a per-request user identity. RLS would therefore need a non-bypass role plus `SET LOCAL app.user_id` inside every transaction. That's doable, but out of scope for this slice. Authorization lives in the SQL of the single data-access module and is tested against the real DB. **RLS with a least-privilege role is the next defense-in-depth step.**

## Known limitations

- RLS not enabled (see above); the DB role is privileged.
- `DATABASE_SSL=no-verify` encrypts but does not verify the CA; use `verify` with the Supabase CA in production.
- Route-handler tests inject the session lookup; Auth.js JWT/cookie handling itself is not exercised end-to-end (no browser/e2e test).
- JWT sessions: a revoked membership takes effect immediately (checked per query), but a deleted user's JWT stays valid until it expires.
- The list is capped at 100 rows (no pagination); no rate limiting on login; audit is append-only by convention, not by DB permission.
