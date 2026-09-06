# syntax=docker/dockerfile:1

# Build context is the REPO ROOT. npm workspaces hoist dependencies to the root
# node_modules, so a service folder on its own is not installable.
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/auth-lib/package.json packages/auth-lib/
COPY services/user-management/package.json services/user-management/
COPY services/email-ingestion/package.json services/email-ingestion/
COPY services/gateway/package.json services/gateway/
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --fetch-retries=5 --fetch-retry-maxtimeout=120000

# The gateway imports shared-types for TYPES only, but tsc still resolves them
# through its package.json "types" field — so the .d.ts must exist.
COPY packages/shared-types packages/shared-types
RUN npm run build -w packages/shared-types

COPY services/gateway services/gateway
RUN npm run build -w services/gateway


FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# No npm ci here. The gateway has zero runtime dependencies — every import is a
# node: builtin, and the shared-types import is `import type`, which
# verbatimModuleSyntax erases entirely.
#
# package.json is still required: it carries "type": "module". Without it Node
# resolves upward, finds the ROOT package.json which has no type field, treats
# dist/main.js as CommonJS, and the first `import` is a syntax error.
COPY services/gateway/package.json services/gateway/
COPY --from=builder /app/services/gateway/dist services/gateway/dist

USER node
EXPOSE 3000

CMD ["node", "services/gateway/dist/main.js"]