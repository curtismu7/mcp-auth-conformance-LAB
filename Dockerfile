# Build the web app, then run the API server, which also serves web/dist. Same pattern as the other labs.
# Node 26 only (rulebook). Docker on OrbStack, never Docker Desktop. Never run with CONFLAB_PROBE_EXTERNAL here.
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci
COPY web web
RUN npm run build -w web

FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production CONFLAB_PORT=4901
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci --omit=dev -w server && npm cache clean --force
COPY server/src server/src
COPY server/data server/data
COPY server/diagrams server/diagrams
COPY --from=build /app/web/dist web/dist
USER node
EXPOSE 4901
# Inside the container the server listens on all interfaces, so CONFLAB_HOST/CONFLAB_BIND are set by compose on purpose.
# Compose publishes the port on 127.0.0.1 only; do not publish it more widely.
CMD ["node", "server/src/index.js"]
