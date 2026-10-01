FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && mkdir /app/var && chown node:node /app/var
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src/domain ./src/domain
COPY --from=build /app/scripts/database.ts ./scripts/database.ts
ENV NODE_ENV=production BIND_HOST=0.0.0.0 PORT=4310 DB_PATH=/app/var/warehouse.db
USER node
EXPOSE 4310
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:4310/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
