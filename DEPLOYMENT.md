# Docspyre — Deployment & Database Stack

## Architecture Note

Docspyre has transitioned to desktop application development (`docspyre/docspyre-desktop`) bundled with Tauri v2. The standalone web application and web API backend stacks have been removed.

Database infrastructure (`docspyre/docspyre-database`) can still be run locally or containerized using `docker-compose.db.yml`:

| Stack | Compose file | Image build context | Port | Public? |
|---|---|---|---|---|
| db | `docker-compose.db.yml` | `docspyre/docspyre-database` | 5432 | no |

## Running the Database

```bash
docker compose -f docker-compose.db.yml up -d
```
