# Docspyre AI Containerization Guide

This document explains the containerization setup for the Docspyre AI application. It is designed for local development (Next.js + Tauri desktop compatibility) and cloud/on-premise deployments (VPS, Docker, Kubernetes).

---

## 1. Services Architecture

All containers are prefixed with `docspyre_` to avoid conflicts and maintain a clean Docker environment namespace.

| Container Name | Base Image / Source | Internal Port | External Port | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **`docspyre_postgres`** | `postgres:16-alpine` | `5432` | `5434` | Relational database (stores documents, users, workspaces, etc.). |
| **`docspyre_etcd`** | `quay.io/coreos/etcd:v3.5.5` | `2379` / `2380` | None | Milvus metadata store. |
| **`docspyre_minio`** | `minio/minio:RELEASE.2023-03-20T20-16-18Z` | `9000` / `9001` | None | Milvus object storage. |
| **`docspyre_milvus`** | `milvusdb/milvus:v2.4.0` | `19530` / `9091` | `19530` | Vector database for document embeddings and semantic search. |
| **`docspyre_litellm`** | `ghcr.io/berriai/litellm:main-latest` | `4000` | `4000` | LLM router/proxy, translating 100+ LLMs to OpenAI format. |
| **`docspyre_backend`** | `apps/backend/Dockerfile` | `8000` | `8000` | FastAPI Python API + Database migrations handler. |
| **`docspyre_web`** | `apps/web/Dockerfile` | `80` | `3000` | Next.js Frontend served via Nginx. |

---

## 2. Orchestration and Startup

### Running the Services
To build and start all containers in the background, run:
```sh
docker compose up -d --build
```

### Stopping the Services
To stop all running containers:
```sh
docker compose down
```

To stop containers and wipe persistent volumes (resets databases):
```sh
docker compose down -v
```

---

## 3. Persistent Volumes

Data is stored persistently across container restarts using named volumes:
* `docspyre_postgres_data`: Stores PostgreSQL transaction logs and table space records.
* `docspyre_milvus_data`: Stores Milvus vector data.
* `docspyre_etcd_data`: Stores Milvus etcd logs.
* `docspyre_minio_data`: Stores Milvus MinIO buckets.

---

## 4. Configuration

### Database Migrations
On startup, the `docspyre_backend` container runs `apps/backend/start.sh`, which:
1. Pings and waits for `docspyre_postgres` to pass its health checks.
2. Automatically executes the SQLAlchemy/Alembic migration sequence using `apps/database/init_db.py`.
3. Appends custom PostgreSQL triggers and functions from `functions.sql` and `triggers.sql`.

### LLM Routing with LiteLLM
Configure models inside `litellm-config.yaml` at the root directory. Env variables are injected from the host system:
```yaml
model_list:
  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: "os.environ/OPENAI_API_KEY"
  - model_name: claude-3-5-sonnet
    litellm_params:
      model: anthropic/claude-3-5-sonnet-20241022
      api_key: "os.environ/ANTHROPIC_API_KEY"
  - model_name: gemini-1.5-pro
    litellm_params:
      model: gemini/gemini-1.5-pro
      api_key: "os.environ/GEMINI_API_KEY"
```

---

## 5. Desktop (Tauri) Integration

The containerization is designed to be fully compatible with local desktop execution:
* **PostgreSQL** is mapped to port `5434` on your local host interface. If you run the Tauri app locally on the desktop, it will seamlessly connect to the running database at `localhost:5434` without any configuration changes.
* **Milvus** is mapped to port `19530` on your host interface for local integration.
* **LiteLLM** is mapped to port `4000` on your host interface.
