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

# `node` (uid 1000) ships with the image and matches the first-user uid on
# most Linux hosts, so the bind-mounted ./data stays writable. A system user
# from adduser -S lands around uid 100 and cannot open the database there.
RUN mkdir -p /app/data && chown node:node /app /app/data
VOLUME /app/data
USER node

# Documentation only — the published port comes from compose. next start reads
# PORT at runtime, so this image listens wherever PORT says.
EXPOSE 3000
# next directly, not `npm start`: npm as PID 1 does not forward SIGTERM, so
# every stop would wait out the grace period and be killed mid-write.
CMD ["node_modules/.bin/next", "start"]
