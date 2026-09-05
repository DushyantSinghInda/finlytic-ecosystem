# syntax=docker/dockerfile:1

# Build context is the REPO ROOT. npm workspaces hoist dependencies to the root
# node_modules, so a service folder on its own is not installable.
FROM node:24-alpine AS builder
WORKDIR /app

# Manifests before source: this layer is invalidated only when a dependency changes.
# npm ci checks the lockfile against EVERY workspace, so email-ingestion's manifest
# is required even though it is never built here.
COPY package.json package-lock.json ./
COPY packages/auth-lib/package.json packages/auth-lib/
COPY services/user-management/package.json services/user-management/
COPY services/email-ingestion/package.json services/email-ingestion/
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    apk add --no-cache --virtual .build-deps python3 make g++ \
 && npm ci --fetch-retries=5 --fetch-retry-maxtimeout=120000 \
 && apk del .build-deps

# Services import auth-lib's compiled dist, so it is built first.
COPY packages/auth-lib packages/auth-lib
RUN npm run build -w packages/auth-lib

COPY services/user-management services/user-management

# Scoped to this one command — an ENV would persist into every stage built FROM builder,
# including the migrator, where a missing compose value would silently point it at
# localhost inside its own container.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    npm run prisma:generate -w services/user-management
RUN npm run build -w services/user-management


FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/auth-lib/package.json packages/auth-lib/
COPY services/user-management/package.json services/user-management/
COPY services/email-ingestion/package.json services/email-ingestion/
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    apk add --no-cache --virtual .build-deps python3 make g++ \
 && npm ci --omit=dev --fetch-retries=5 --fetch-retry-maxtimeout=120000 \
 && apk del .build-deps

COPY --from=builder /app/packages/auth-lib/dist packages/auth-lib/dist
COPY --from=builder /app/services/user-management/dist services/user-management/dist

USER node
EXPOSE 3001

# Single role. The migrator stage below reuses the same builder, so the migration
# runs against exactly the code this image was built from.
CMD ["node", "services/user-management/dist/src/main.js"]

FROM builder AS migrator
WORKDIR /app
# Through the workspace script, not a bare `prisma migrate deploy` — the Prisma 7 CLI
# discovers prisma.config.ts from cwd, and cwd here is /app.
CMD ["npm", "run", "prisma:deploy", "-w", "services/user-management"]