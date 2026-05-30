# Stage 1: Build static assets using Node.js & pnpm
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy lockfile, configurations, and packages
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web

# Install dependencies and build web client
RUN pnpm install --frozen-lockfile
RUN pnpm --filter web build

# Stage 2: Serve static files with Nginx
FROM nginx:alpine
COPY --from=builder /app/apps/web/out /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
