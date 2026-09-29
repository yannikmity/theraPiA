FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
# TZ: Kalendertage der App gelten in Europe/Berlin (src/lib/dates.ts); die Server-Uhr folgt demselben Tag, damit
# Log-Zeitstempel und alles, was noch lokale Zeit nutzt, dazu passen. Betreiber:innen überschreiben TZ in der .env.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 AUTH_TRUST_HOST=true TZ=Europe/Berlin
RUN addgroup -S app && adduser -S app -G app
# Ablage des Feedback-Widgets. Ein neues benanntes Volume übernimmt Besitzer und Rechte (700) dieses Verzeichnisses,
# damit nur der Nicht-Root-User app dort lesen und schreiben kann (Bind-Mounts brauchen ein manuelles chown, siehe Doku).
RUN mkdir -p /data/feedback && chown app:app /data/feedback && chmod 700 /data/feedback
ENV FEEDBACK_DIR=/data/feedback
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/migrations ./migrations
COPY --from=build --chown=app:app /app/scripts/migrate.mjs ./scripts/migrate.mjs
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node server.js"]
