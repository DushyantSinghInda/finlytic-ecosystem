# syntax=docker/dockerfile:1

# Build context is the REPO ROOT. npm workspaces hoist dependencies to the root
# node_modules, so a service folder on its own is not installable.
FROM node:24-alpine AS builder
WORKDIR /app

# Manifests before source: this layer is invalidated only when a dependency changes.
# npm ci checks the lockfile against EVERY workspace, so user-management's manifest
# is required even though it is never built here.
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/auth-lib/package.json packages/auth-lib/
COPY services/user-management/package.json services/user-management/
COPY services/email-ingestion/package.json services/email-ingestion/
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --fetch-retries=5 --fetch-retry-maxtimeout=120000

# shared-types first: auth-lib re-exports it, so tsc needs its .d.ts to exist.
COPY packages/shared-types packages/shared-types
RUN npm run build -w packages/shared-types

# Services import auth-lib's compiled dist, so it is built next — after the
# contract it re-exports.
COPY packages/auth-lib packages/auth-lib
RUN npm run build -w packages/auth-lib

COPY services/email-ingestion services/email-ingestion

# Scoped to this one command — an ENV would persist into every stage built FROM builder,
# including the migrator, where a missing compose value would silently point it at
# localhost inside its own container.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    npm run prisma:generate -w services/email-ingestion
RUN npm run build -w services/email-ingestion


FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/auth-lib/package.json packages/auth-lib/
COPY services/user-management/package.json services/user-management/
COPY services/email-ingestion/package.json services/email-ingestion/
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --omit=optional --fetch-retries=5 --fetch-retry-maxtimeout=120000

# auth-lib's types.js does `require("@finlytic/shared-types")` at load time —
# the manifest alone gives npm the symlink, but the symlink needs a target.
COPY --from=builder /app/packages/shared-types/dist packages/shared-types/dist
COPY --from=builder /app/packages/auth-lib/dist packages/auth-lib/dist
COPY --from=builder /app/services/email-ingestion/dist services/email-ingestion/dist

USER node
EXPOSE 3002

# One image, two roles — the worker overrides this with dist/main.worker.js. Identical
# code and identical dependencies, so the API and the worker cannot drift apart.
CMD ["node", "services/email-ingestion/dist/main.js"]

FROM builder AS migrator
WORKDIR /app
# Through the workspace script, not a bare `prisma migrate deploy` — the Prisma 7 CLI
# discovers prisma.config.ts from cwd, and cwd here is /app.
CMD ["npm", "run", "prisma:deploy", "-w", "services/email-ingestion"]