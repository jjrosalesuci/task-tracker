# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app

FROM base AS dependencies
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM dependencies AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM dependencies AS build
COPY . .
RUN npm run build \
    && npm prune --omit=dev

FROM node:22-alpine AS production
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
CMD ["npm", "start"]
