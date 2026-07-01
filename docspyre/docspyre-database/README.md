# @docspyre/database

The Docspyre **data layer**. Owns the PostgreSQL schema (Prisma), migrations,
seed data, and exports a single shared, configured `PrismaClient`. Every other
service (starting with `docspyre-backend`) depends on this package instead of
talking to Prisma directly, so the database boundary stays explicit and the
schema has exactly one owner.

## Why a separate package

- **Single source of truth** for the schema and generated client.
- **No duplicate Prisma clients** — one connection pool, imported everywhere.
- **Clean dependency direction**: services depend on the data layer, never the
  other way around. Swapping or mocking the DB touches one module.

## Layout

```
docspyre-database/
├── prisma/
│   ├── schema.prisma          # Models, enums, indexes
│   ├── migrations/            # Versioned SQL migrations
│   └── seed.ts                # Idempotent dev seed
├── src/
│   ├── client.ts              # Shared PrismaClient (hot-reload safe)
│   └── index.ts               # Public surface (client + generated types)
├── .env.example
└── tsconfig.json
```

## Schema design

UUID primary keys, `created_at` / `updated_at` everywhere, and `deleted_at`
soft-delete columns on long-lived entities. The schema is intentionally broader
than the auth feature so the product can grow without a redesign:

| Model             | Purpose                                                        |
| ----------------- | ------------------------------------------------------------- |
| `User`            | Core principal. Stores only a bcrypt hash, never a password.  |
| `Session`         | DB-backed refresh sessions. Stores the token **hash** only.   |
| `Workspace`       | Tenant boundary for future multi-tenant collaboration.        |
| `WorkspaceMember` | User ↔ workspace join with a role (RBAC foundation).          |
| `AuditLog`        | Append-only security event trail (logins, logout, etc.).      |

Key decisions:

- **Sessions are first-class rows.** Logout and admin revocation take effect
  immediately rather than waiting for a JWT to expire.
- **Refresh tokens are stored hashed** (HMAC), so a DB leak cannot resurrect
  sessions.
- **Workspaces + roles ship from day one** so document/collaboration features
  attach to an existing tenancy model instead of forcing a migration later.
- **`emailNormalized`** is a dedicated unique column for reliable
  case-insensitive lookups without functional-index gymnastics.

## Local setup

1. Provision PostgreSQL 16 and a `docspyre` database/role. Either:
   - run the project's Docker Postgres (see `docspyre-docs/containerization.md`,
     host port **5434**), or
   - use a native install (then point `DATABASE_URL` at port **5432**).

   > Heads-up: a native Postgres may already occupy port 5434 on this machine.
   > Make sure `DATABASE_URL` points at the instance you actually intend to use.

2. Configure env and install:

   ```sh
   copy .env.example .env   # then edit DATABASE_URL
   npm install
   ```

3. Apply migrations and seed:

   ```sh
   npm run migrate:dev      # creates/updates the schema in dev
   npm run db:seed          # optional: default admin + workspace
   ```

## Scripts

| Script                   | Description                                         |
| ------------------------ | --------------------------------------------------- |
| `npm run build`          | Compile the exported client (`src` → `dist`).       |
| `npm run migrate:dev`    | Create & apply a dev migration from schema changes. |
| `npm run migrate:deploy` | Apply pending migrations (CI / production).         |
| `npm run migrate:reset`  | Drop, re-migrate and re-seed (dev only).            |
| `npm run db:seed`        | Run the idempotent seed.                            |
| `npm run studio`         | Open Prisma Studio.                                 |

## Consuming the client

```ts
import { prisma, UserStatus } from '@docspyre/database';

const activeUsers = await prisma.user.findMany({
  where: { status: UserStatus.ACTIVE },
});
```
