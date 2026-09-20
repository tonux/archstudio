# syntax=docker/dockerfile:1
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
# The export renderer reads /viewer at request time, not at build time:
# exportHtml.ts resolves it from process.cwd(). Without it every export and
# every preview 500s on a missing style.css.
COPY --from=builder /app/viewer ./viewer

# The database directory is a bind mount, so who may write it is decided by the
# host: root:root on a Linux server or a PaaS deploy, uid 501 on macOS with
# Docker Desktop, uid 1000 in a named volume. No single `USER` here is right on
# all three, and getting it wrong surfaces as SQLITE_CANTOPEN — "unable to open
# database file" — which points at the database rather than at the mount.
#
# So the image starts as root and the entrypoint drops to the uid that owns the
# data directory, claiming it for uid 1000 when nobody has. `su-exec` is the
# 10 KB alpine idiom for that step; the server itself never runs as root.
RUN apk add --no-cache su-exec

RUN mkdir -p /app/data && chown node:node /app /app/data
VOLUME /app/data

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
# next directly, not `npm start`: npm as PID 1 does not forward SIGTERM, so
# every stop would wait out the grace period and be killed mid-write. The
# entrypoint `exec`s this for the same reason — it must not linger as PID 1.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node_modules/.bin/next", "start"]
