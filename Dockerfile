# syntax=docker/dockerfile:1
# Imagen multi-etapa de la carta digital. La etapa final no incluye npm cache, devDependencies ni herramientas de compilacion.

# --- Etapa 1: dependencias de produccion ---
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- Etapa 2: dependencias de desarrollo + pruebas (la usa el ambiente QA) ---
FROM node:24-alpine AS test
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["npm", "test"]

# --- Etapa 3: imagen final de ejecucion ---
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
COPY db ./db
COPY public ./public
# Directorio de subidas (se monta como volumen aparte) con dueno no-root.
RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]

# --- Etapa 4: pruebas de extremo a extremo con navegador real (ambiente QA) ---
FROM mcr.microsoft.com/playwright:v1.64.1-noble AS e2e
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY playwright.config.js ./
COPY tests ./tests
COPY public/imagenes ./public/imagenes
CMD ["npx", "playwright", "test"]
