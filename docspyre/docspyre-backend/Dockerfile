# syntax=docker/dockerfile:1

# =============================================================================
# docspyre-backend — Express + Prisma API (port 8000)
# -----------------------------------------------------------------------------
# The backend depends on the local package `@docspyre/database` (file:..), so
# the build context MUST be the parent `docspyre/` directory. Both packages are
# built here and the Prisma client is generated against the data layer.
#
# Build (from repo root):
#   docker build -f docspyre/docspyre-backend/Dockerfile -t docspyre-backend ./docspyre
# =============================================================================

# ---- build ------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# 1) Data layer: install, generate Prisma client, compile.
COPY docspyre-database/package.json docspyre-database/package-lock.json ./docspyre-database/
RUN npm --prefix docspyre-database ci
COPY docspyre-database/ ./docspyre-database/
RUN npm --prefix docspyre-database run prisma:generate \
 && npm --prefix docspyre-database run build

# 2) Backend: install (resolves the file: link to ../docspyre-database), build,
#    then drop dev dependencies from the backend package.
COPY docspyre-backend/package.json docspyre-backend/package-lock.json ./docspyre-backend/
RUN npm --prefix docspyre-backend ci
COPY docspyre-backend/ ./docspyre-backend/
RUN npm --prefix docspyre-backend run build \
 && npm --prefix docspyre-backend prune --omit=dev

# ---- runtime ----------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m -u 1001 app
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8000

# Data layer (compiled + generated Prisma client + engine) and backend build.
# The relative symlink docspyre-backend/node_modules/@docspyre/database ->
# ../../docspyre-database is preserved by keeping the same directory layout.
COPY --from=build --chown=app:app /app/docspyre-database ./docspyre-database
COPY --from=build --chown=app:app /app/docspyre-backend ./docspyre-backend

USER app
WORKDIR /app/docspyre-backend

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8000/api/v1',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/server.js"]
