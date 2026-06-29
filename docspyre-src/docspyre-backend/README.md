# @docspyre/backend

Docspyre's API: **Node + Express + TypeScript**. Handles authentication,
session management and all database access (via `@docspyre/database`) for the
Angular web app.

## Architecture

A layered, feature-modular structure. Dependencies point inward: routes →
controllers → services → data layer. HTTP concerns never leak into services,
and business rules never leak into controllers.

```
src/
├── config/         # Validated env (zod). Boot fails fast on misconfig.
├── db/             # Thin re-export of the shared Prisma client.
├── middleware/     # authenticate, authorize (RBAC), validate, rate-limit,
│                   #   error-handler, not-found
├── modules/
│   └── auth/       # Feature module: routes, controller, service,
│                   #   validation, types  (the template for future modules)
├── routes/         # API v1 composition + /health
├── types/          # Express Request augmentation (req.auth)
├── utils/          # api-error, async-handler, jwt, tokens, password,
│                   #   cookies, logger  (reusable, framework-agnostic)
├── app.ts          # Express app factory (testable, no port binding)
└── server.ts       # Composition root: connect DB, listen, graceful shutdown
```

### Why this shape

- **Feature modules** (`modules/auth`) keep everything for a capability
  together. New capabilities (workspaces, documents) drop in as sibling modules
  and mount in `routes/index.ts` — no cross-cutting rewrites.
- **`app.ts` vs `server.ts`** split lets integration tests build the app
  without binding a port or owning process lifecycle.
- **Reusable utilities** are pure and dependency-light, so they're trivial to
  unit test and reuse across modules.

## Authentication & session model

Short-lived **access JWT** + DB-backed **refresh session**:

1. **Register / Login** → returns an access token (JSON body, held in memory by
   the SPA) and sets a refresh token as an **HttpOnly, SameSite cookie**.
2. **Access token** (default 15m) carries `sub` (user id) and `sid` (session
   id). The `authenticate` middleware verifies it *and* confirms the session is
   still live, so revocation is immediate.
3. **Refresh** (`POST /auth/refresh`) validates the cookie, then **rotates**:
   the old session is revoked and replaced by a new one (reuse is rejected).
4. **Logout** (`POST /auth/logout`) revokes the session and clears the cookie.

### Security decisions

| Area              | Decision                                                                 |
| ----------------- | ------------------------------------------------------------------------ |
| Password storage  | bcrypt, configurable work factor (default 12).                           |
| Refresh tokens    | High-entropy opaque tokens; only an **HMAC** is stored. Rotated on use.  |
| Token transport   | Refresh in HttpOnly cookie (XSS-safe); access token in memory.           |
| Revocation        | Session row checked per request → logout is instant, not TTL-bound.      |
| Login enumeration | Generic error + constant-ish timing; failures are audit-logged.          |
| Input             | All input validated/whitelisted with zod before reaching handlers.       |
| Transport headers | `helmet` security headers; explicit CORS allow-list with credentials.    |
| Abuse             | Global rate limit + stricter limit on credential endpoints.              |
| Errors            | Central handler; stack traces and DB internals never leak in production. |

## API (v1)

Base path: `/api/v1`

| Method | Path             | Auth   | Description                          |
| ------ | ---------------- | ------ | ------------------------------------ |
| GET    | `/health`        | —      | Liveness probe.                      |
| POST   | `/auth/register` | —      | Create account, start a session.     |
| POST   | `/auth/login`    | —      | Authenticate, start a session.       |
| POST   | `/auth/refresh`  | cookie | Rotate session, issue new tokens.    |
| POST   | `/auth/logout`   | cookie | Revoke current session.              |
| GET    | `/auth/me`       | Bearer | Current user profile.                |

Error shape:

```json
{ "error": { "code": "BAD_REQUEST", "message": "Validation failed", "details": { } } }
```

## Local setup

```sh
copy .env.example .env   # set DATABASE_URL + JWT secrets (>= 32 chars each)
npm install              # also links the local @docspyre/database package
npm run dev              # tsx watch on http://localhost:8000
```

Generate strong secrets:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Ensure the database is migrated first (see `../docspyre-database`).

## Scripts

| Script              | Description                          |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Watch-mode dev server (tsx).         |
| `npm run build`     | Compile to `dist/`.                  |
| `npm run start`     | Run the compiled server.             |
| `npm run typecheck` | Type-check without emitting.         |

## Adding a new feature module

1. Create `src/modules/<feature>/` with `*.routes.ts`, `*.controller.ts`,
   `*.service.ts`, `*.validation.ts`.
2. Keep HTTP in the controller, rules in the service, DB access via
   `@docspyre/database`.
3. Mount the router in `src/routes/index.ts`.
4. Reuse `authenticate` and `requireWorkspaceRole` for protection/RBAC.
