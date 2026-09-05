# syntax=docker/dockerfile:1

# Build context is the REPO ROOT. npm workspaces hoist dependencies to the root
# node_modules, so a service folder on its own is not installable.
FROM node:24-alpine AS builder
WORKDIR /app

# Manifests before source: this layer is invalidated only when a dependency changes.
# npm ci checks the lockfile against EVERY workspace, so user-management's manifest
# is required even though it is never built here.
COPY package.json package-lock.json ./
COPY packages/auth-lib/package.json packages/auth-lib/
COPY services/user-management/package.json services/user-management/
COPY services/email-ingestion/package.json services/email-ingestion/
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --fetch-retries=5 --fetch-retry-maxtimeout=120000

# Services import auth-lib's compiled dist, so it is built first.
COPY packages/auth-lib packages/auth-lib
RUN npm run build -w packages/auth-lib

COPY services/email-ingestion services/email-ingestion

# Prisma 7 emits plain TypeScript into src/generated/prisma, which is gitignored and
# so absent from the context. It must exist BEFORE nest build compiles it.
# Nothing connects here — prisma.config.ts only needs the variable to resolve.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run prisma:generate -w services/email-ingestion
RUN npm run build -w services/email-ingestion


FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/auth-lib/package.json packages/auth-lib/
COPY services/user-management/package.json services/user-management/
COPY services/email-ingestion/package.json services/email-ingestion/
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --fetch-retries=5 --fetch-retry-maxtimeout=120000

COPY --from=builder /app/packages/auth-lib/dist packages/auth-lib/dist
COPY --from=builder /app/services/email-ingestion/dist services/email-ingestion/dist

USER node
EXPOSE 3002

# One image, two roles — the worker overrides this with dist/main.worker.js. Identical
# code and identical dependencies, so the API and the worker cannot drift apart.
CMD ["node", "services/email-ingestion/dist/main.js"]