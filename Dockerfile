# OOH Dashboard — multi-stage build (F018)
# Build stage: install production dependencies only
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

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
