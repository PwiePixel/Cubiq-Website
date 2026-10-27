# syntax=docker/dockerfile:1.7
# Cubiq-Website, API und Doku – Nitro-Server (Nuxt 4, node-server) auf Node 24 LTS (Alpine).
# Build-Kontext ist der Repo-Ordner (api/ + docs-site/), siehe docker-compose.yml:
#   docker build -f api/Dockerfile --build-arg SITE_URL=https://deine-domain.de .

FROM node:24-alpine AS build
WORKDIR /src
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NUXT_TELEMETRY_DISABLED=1
# Adressen für die Links der Doku (statisch, entsteht beim Bauen) – docker-compose.yml reicht sie aus .env durch.
ARG SITE_URL=
ARG WIKI_URL=
RUN corepack enable
COPY api ./api
COPY docs-site ./docs-site
RUN cd api && pnpm install --frozen-lockfile
# npm install statt npm ci (wie in der CI): npm lehnt die Lock-Datei bei `ci` fälschlich ab.
RUN cd docs-site && npm install --no-audit --no-fund
# Baut die Website und erzeugt dabei die Doku mit (modules/docs.ts → .output/docs-wiki).
RUN cd api && pnpm build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data
WORKDIR /app
# Nur das gebaute Server-Bundle (bringt seine node_modules und die Doku selbst mit).
COPY --from=build --chown=root:root /src/api/.output ./.output
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", ".output/server/index.mjs"]
