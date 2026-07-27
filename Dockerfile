# OOH Dashboard — multi-stage build (F018)
# Build stage: install production dependencies only
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# Build-time smoke check (CT IM-02): the keyless-Cosmos path imports @azure/identity at
# runtime. It must be a first-class dependency, not merely a transitive dev dep, or
# `npm ci --omit=dev` silently omits it and the prod image throws ERR_MODULE_NOT_FOUND
# on first store access. Fail the build loudly here if it is not resolvable.
RUN node -e "require.resolve('@azure/identity')"

# Runtime stage
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package.json server.js config.js ./
COPY services ./services
COPY routes ./routes
COPY public ./public
COPY data/fixtures ./data/fixtures

# Non-root user (alpine node image ships the 'node' user)
USER node

EXPOSE 3001
# Fail-secure: production refuses to start without AUTH_MODE=oidc, DATA_MODE=live
# and their secrets — all supplied as K8s secrets/env by the pipeline (SR-2).
CMD ["node", "server.js"]
