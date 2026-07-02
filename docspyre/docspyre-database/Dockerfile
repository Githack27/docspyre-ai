# syntax=docker/dockerfile:1

# =============================================================================
# docspyre-database — Prisma migration & seed runner
# -----------------------------------------------------------------------------
# This image is NOT a long-running service. It builds the data layer, generates
# the Prisma client, and is run as a one-shot job to apply migrations
# (`prisma migrate deploy`) and optionally seed the database.
# Build context: docspyre/docspyre-database
# =============================================================================

# ---- build ------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Source + schema, then generate client and compile TS.
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate \
 && npm run build

# ---- runtime ----------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m -u 1001 app
WORKDIR /app
ENV NODE_ENV=production

# Full node_modules kept on purpose: the Prisma CLI (migrate) and tsx (seed)
# are dev dependencies but required for this job image.
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/package.json ./package.json

USER app

# Default action: apply pending migrations and exit.
# To also seed, override the command in compose:
#   command: ["sh","-c","npx prisma migrate deploy && npx tsx prisma/seed.ts"]
CMD ["npx", "prisma", "migrate", "deploy"]
