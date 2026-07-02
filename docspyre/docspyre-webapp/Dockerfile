# syntax=docker/dockerfile:1

# =============================================================================
# docspyre-webapp — Angular 21 SSR (Node/Express server, port 4000)
# -----------------------------------------------------------------------------
# Serves the server-side-rendered app. The production build uses a RELATIVE API
# base (`/api/v1`), so the reverse proxy must route `/api` to the backend on the
# same public origin (see DEPLOYMENT.md).
# Build context: docspyre/docspyre-webapp
# =============================================================================

# ---- build ------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Default configuration is `production` (relative /api/v1).
RUN npm run build \
 && npm prune --omit=dev

# ---- runtime ----------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
RUN useradd -m -u 1001 app
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000

COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json

USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/docspyre-webapp/server/server.mjs"]
