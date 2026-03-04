# syntax=docker/dockerfile:1

# --- Frontend build ---
FROM node:22-slim AS frontend-build
WORKDIR /app/client
COPY client/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY client/ ./
RUN npm run build

# --- Backend build ---
FROM node:22-slim AS backend-build
WORKDIR /app

# better-sqlite3 needs build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY tsconfig.json drizzle.config.ts ./
COPY src/ ./src/
COPY shared/ ./shared/
RUN npx tsc
RUN npm prune --omit=dev

# --- Production ---
FROM node:22-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=backend-build /app/node_modules ./node_modules
COPY --from=backend-build /app/dist ./dist
COPY --from=backend-build /app/package.json ./
COPY --from=backend-build /app/drizzle.config.ts ./
COPY --from=backend-build /app/src/db/migrations ./src/db/migrations
COPY --from=frontend-build /app/client/dist ./client/dist

RUN mkdir -p /app/seeds /app/data

ENV NODE_ENV=production
ENV PORT=3080
ENV DATABASE_URL=/app/data/jobscout.db

EXPOSE 3080

VOLUME ["/app/data", "/app/seeds"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3080/api/health || exit 1

CMD ["node", "dist/src/index.js"]
