# One image for every host: Zoho Catalyst AppSail, AWS (App Runner/ECS/Lightsail) or your own server.
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
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 AUTH_TRUST_HOST=true
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --chown=app:app docker-entrypoint.sh ./
USER app
# Documentation only. AppSail sets X_ZOHO_CATALYST_LISTEN_PORT (default 9000); elsewhere PORT or 3000.
EXPOSE 9000 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
