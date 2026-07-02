# Docspyre — Containerized Deployment (Dokploy / VPS)

Three independently composed stacks that integrate over one shared Docker
network. Deploy them in order: **db → backend → webapp**.

| Stack   | Compose file                 | Image build context            | Port | Public? |
|---------|------------------------------|--------------------------------|------|---------|
| db      | `docker-compose.db.yml`      | `docspyre/docspyre-database`   | 5432 | no      |
| backend | `docker-compose.backend.yml` | `docspyre` (monorepo parent)   | 8000 | via `/api` |
| webapp  | `docker-compose.webapp.yml`  | `docspyre/docspyre-webapp`     | 4000 | yes (`/`) |

All images are multi-stage, run as a non-root user, and are based on
`node:22-bookworm-slim` (Debian is used deliberately — Prisma's engine is most
reliable on glibc + OpenSSL).

---

## 1. How the pieces connect

```
                         ┌──────────────────────── dokploy-network ───────────────────────┐
   Internet ── Traefik ──┤                                                                 │
      (443)   (Dokploy)   │   webapp:4000  ──HTTP(SSR)                                      │
        │                 │      ▲                                                          │
        │  Host app.example.com  │  browser calls  /api/v1/*                                │
        └── PathPrefix /  ───────┘                                                          │
        └── PathPrefix /api ───────────►  backend:8000  ──►  postgres:5432 (docspyre-postgres)
                                                              ▲
                                              migrate job (prisma migrate deploy)
```

**Key design point — one public origin.** The web app's production build calls
the API at the **relative** path `/api/v1`. So the browser must reach the API on
the *same* host as the site. On Dokploy this means the public host routes:

- `PathPrefix(/)`    → `webapp:4000`
- `PathPrefix(/api)` → `backend:8000`

Cross-service traffic (backend → Postgres, Traefik → services) uses Docker DNS
service names on the external `dokploy-network`, so the backend reaches Postgres
at `docspyre-postgres:5432`.

> Alternative (subdomain) model: host the API on `api.example.com`, rebuild the
> web app with an absolute `apiBaseUrl`, and add that origin to `CORS_ORIGINS`.
> The relative same-origin model above needs no rebuild and avoids CORS, so it
> is the recommended default.

---

## 2. Prerequisites

- A VPS with Docker and a running **Dokploy** installation.
- The external network Dokploy creates, `dokploy-network`. Every stack attaches
  to it. For local testing without Dokploy, create it once:
  ```bash
  docker network create dokploy-network
  ```
- A DNS record pointing your domain (e.g. `app.example.com`) at the VPS.

---

## 3. Environment files

Copy each example and fill in real values (never commit the real files):

```bash
cp .env.db.example      .env.db
cp .env.backend.example .env.backend
cp .env.webapp.example  .env.webapp
```

Generate strong secrets:

```bash
openssl rand -hex 32   # JWT_ACCESS_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET (must differ)
```

The **same** Postgres credentials must appear in `DATABASE_URL` in both
`.env.db` and `.env.backend`. Inside containers the host is the service name
`docspyre-postgres` on port `5432` (the `5434` in local dev docs is only a host
port mapping and does not apply here).

---

## 4. Deploy with Dokploy

For each stack, in the Dokploy dashboard: **Create → Compose**, point it at this
repository, set the **Compose Path** to the stack's file, add the environment
variables (paste from your `.env.*`), then **Deploy**.

1. **Database** — deploy `docker-compose.db.yml` first.
   - Postgres starts; the `migrate` job runs `prisma migrate deploy` and exits.
   - First-time seeding: in the compose file switch the `migrate` command to the
     seed variant (commented in the file), deploy once, then switch it back.
2. **Backend** — deploy `docker-compose.backend.yml`.
   - In the service's **Domains**, add your host with **Path** `/api` and enable
     HTTPS. Container port `8000`.
3. **Webapp** — deploy `docker-compose.webapp.yml`.
   - In **Domains**, add the same host with **Path** `/` and enable HTTPS.
     Container port `4000`.

Because both domains share the same host, Traefik sends `/api/*` to the backend
and everything else to the web app — satisfying the relative `/api/v1` calls.

---

## 5. Deploy locally (smoke test)

From the repo root, with `dokploy-network` created:

```bash
# 1) Database + migrations
docker compose -f docker-compose.db.yml --env-file .env.db up -d --build

# 2) Backend
docker compose -f docker-compose.backend.yml --env-file .env.backend up -d --build

# 3) Web app
docker compose -f docker-compose.webapp.yml --env-file .env.webapp up -d --build
```

Local routing note: without Traefik there is no shared `/api` path. For a quick
check, temporarily publish ports (`ports: ["8000:8000"]` / `["4000:4000"]`) and
hit `http://localhost:8000/api/v1/...` and `http://localhost:4000` directly.

Tear down (data volumes preserved):
```bash
docker compose -f docker-compose.webapp.yml down
docker compose -f docker-compose.backend.yml down
docker compose -f docker-compose.db.yml down
```

---

## 6. Migrations & seeding

- Migrations live in `docspyre/docspyre-database/prisma/migrations` and are
  applied by the `migrate` job (`prisma migrate deploy`) — safe and idempotent.
- After adding a migration, redeploy the **db** stack to apply it.
- To seed, run the seed variant of the `migrate` command once:
  ```
  command: ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts"]
  ```

---

## 7. Persistent data & backups

Two named volumes hold state:

- `docspyre-pgdata` — PostgreSQL data (db stack).
- `docspyre-uploads` — uploaded files, mounted at
  `/app/docspyre-backend/uploads` (backend stack).

Back up the database:
```bash
docker exec docspyre-postgres pg_dump -U docspyre docspyre_app > backup.sql
```

Neither volume is deleted by `docker compose down`; use `down -v` only when you
intend to wipe data.

---

## 8. Updates / redeploys

Each stack rebuilds and redeploys independently. In Dokploy, push to the tracked
branch and **Redeploy** the affected stack (or enable auto-deploy). Order only
matters when a backend change depends on a new migration — deploy **db** first.

---

## 9. Security notes

- Postgres is not published to the internet (no `ports:`). Reach it via an SSH
  tunnel for admin tasks.
- Set a strong `POSTGRES_PASSWORD` and unique 32+ char JWT secrets.
- `CORS_ORIGINS` should list only your real public origin(s).
- The refresh token is an HttpOnly cookie; serve everything over HTTPS
  (Dokploy/Traefik issues Let's Encrypt certificates automatically).

---

## 10. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `network dokploy-network not found` | Create it (`docker network create dokploy-network`) or let Dokploy manage it. |
| Backend can't reach DB (`ECONNREFUSED`/DNS) | db stack not up, or `DATABASE_URL` host isn't `docspyre-postgres`, or stacks not on the same network. |
| API 404s from the browser but backend is healthy | Path routing missing: the public host must send `/api` to the backend. |
| Prisma engine / OpenSSL errors | Ensure images build on `node:22-bookworm-slim` (provided) — don't switch to Alpine without adjusting Prisma binary targets. |
| Migrations didn't apply | Check the `docspyre-migrate` job logs; redeploy the db stack. |
| Uploads lost after redeploy | Confirm the `docspyre-uploads` volume is mounted on the backend service. |
