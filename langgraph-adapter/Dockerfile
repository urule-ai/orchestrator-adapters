# syntax=docker/dockerfile:1
# Build context: urule-repos/ (parent of urule and orchestrator-adapters).
# Compose:
#   build:
#     context: ../../..
#     dockerfile: orchestrator-adapters/langgraph-adapter/Dockerfile
#
# orchestrator-adapters/ is itself an npm workspace (containing
# goose-adapter and langgraph-adapter). The Dockerfile reproduces enough of
# that workspace inside the image to let `npm ci` resolve everything.
#
# Workspace-external deps (@urule/auth-middleware, @urule/correlation-id,
# @urule/events) are file: refs to ../urule/packages/*. Caller is expected to
# have run `npm --prefix urule run build` so the consumed dist/ directories
# are populated before `docker compose build`.

FROM node:20-slim AS builder
WORKDIR /app
# urule packages this adapter consumes
COPY urule/packages/auth-middleware/package.json urule/packages/auth-middleware/package.json
COPY urule/packages/auth-middleware/dist urule/packages/auth-middleware/dist
COPY urule/packages/correlation-id/package.json urule/packages/correlation-id/package.json
COPY urule/packages/correlation-id/dist urule/packages/correlation-id/dist
COPY urule/packages/events/package.json urule/packages/events/package.json
COPY urule/packages/events/dist urule/packages/events/dist
COPY urule/packages/observability/package.json urule/packages/observability/package.json
COPY urule/packages/observability/dist urule/packages/observability/dist
COPY orchestrator-contract/package.json orchestrator-contract/package.json
COPY orchestrator-contract/dist orchestrator-contract/dist
# orchestrator-adapters workspace root + every sub-workspace package.json so
# `npm ci` can resolve the workspace tree
COPY orchestrator-adapters/package.json orchestrator-adapters/package-lock.json orchestrator-adapters/
COPY orchestrator-adapters/goose-adapter/package.json orchestrator-adapters/goose-adapter/
COPY orchestrator-adapters/langgraph-adapter/package.json orchestrator-adapters/langgraph-adapter/
WORKDIR /app/orchestrator-adapters
RUN npm ci --install-links
WORKDIR /app
COPY orchestrator-adapters/langgraph-adapter/tsconfig.json orchestrator-adapters/langgraph-adapter/tsconfig.json
COPY orchestrator-adapters/langgraph-adapter/src orchestrator-adapters/langgraph-adapter/src
WORKDIR /app/orchestrator-adapters
RUN npm run build -w @urule/langgraph-adapter

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY urule/packages/auth-middleware/package.json urule/packages/auth-middleware/package.json
COPY urule/packages/auth-middleware/dist urule/packages/auth-middleware/dist
COPY urule/packages/correlation-id/package.json urule/packages/correlation-id/package.json
COPY urule/packages/correlation-id/dist urule/packages/correlation-id/dist
COPY urule/packages/events/package.json urule/packages/events/package.json
COPY urule/packages/events/dist urule/packages/events/dist
COPY urule/packages/observability/package.json urule/packages/observability/package.json
COPY urule/packages/observability/dist urule/packages/observability/dist
COPY orchestrator-contract/package.json orchestrator-contract/package.json
COPY orchestrator-contract/dist orchestrator-contract/dist
COPY orchestrator-adapters/package.json orchestrator-adapters/package-lock.json orchestrator-adapters/
COPY orchestrator-adapters/goose-adapter/package.json orchestrator-adapters/goose-adapter/
COPY orchestrator-adapters/langgraph-adapter/package.json orchestrator-adapters/langgraph-adapter/
WORKDIR /app/orchestrator-adapters
RUN npm ci --install-links -w @urule/langgraph-adapter --omit=dev --include-workspace-root
COPY --from=builder /app/orchestrator-adapters/langgraph-adapter/dist /app/orchestrator-adapters/langgraph-adapter/dist
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"
WORKDIR /app/orchestrator-adapters/langgraph-adapter
CMD ["node", "dist/index.js"]
