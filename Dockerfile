# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --include=dev
COPY tsconfig.base.json ./
COPY prisma ./prisma
COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api
COPY apps/web ./apps/web
RUN npm run build \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS app
ENV NODE_ENV=test
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist
USER node
EXPOSE 8000
CMD ["node", "apps/api/dist/main.js"]

FROM caddy:2.10-alpine AS web
COPY deploy/demo/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
EXPOSE 8080

FROM node:22-bookworm-slim AS fake-source
WORKDIR /app
COPY test/fake-source ./test/fake-source
COPY test/fixtures/source ./test/fixtures/source
ENV FAKE_SOURCE_HOST=0.0.0.0 FAKE_SOURCE_PORT=9999
EXPOSE 9999
CMD ["node", "--experimental-strip-types", "test/fake-source/cli.ts"]
