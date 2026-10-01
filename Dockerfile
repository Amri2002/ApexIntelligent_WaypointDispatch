# Waypoint Dispatch — one image for the web app. Build context is the repo root (needs web/ and data/).
FROM node:22-bookworm-slim AS deps
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app/web
COPY --from=deps /app/web/node_modules ./node_modules
COPY web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app/web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 DATA_DIR=/app/data
COPY --from=build /app/web ./
COPY data/ /app/data/
EXPOSE 3000
# Migrate + seed (idempotent), then serve.
CMD ["sh", "-c", "node scripts/migrate.mjs && npx next start -p ${PORT:-3000}"]
