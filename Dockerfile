# coursSQL — multi-stage build: compile the React client and the Node/TS API,
# then a slim runtime image where the API serves both the JSON API and the static client.

# ---- Stage 1: build the React client ----
FROM node:22-alpine AS client-build
WORKDIR /client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ ./
RUN npm run build

# ---- Stage 2: build the API ----
FROM node:22-alpine AS api-build
WORKDIR /api
COPY api/package.json api/package-lock.json* ./
RUN npm install
COPY api/ ./
RUN npm run build

# ---- Stage 3: runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY api/package.json api/package-lock.json* ./
RUN npm install --omit=dev
COPY --from=api-build /api/dist ./dist
COPY --from=client-build /client/dist ./public
EXPOSE 3000
CMD ["node", "dist/index.js"]
