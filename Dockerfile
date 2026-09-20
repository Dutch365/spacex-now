# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
RUN npm run build

FROM caddy:2-alpine
WORKDIR /app
COPY Caddyfile /app/Caddyfile
COPY --from=build /app/dist /app/dist
ENV PORT=8080
EXPOSE 8080
CMD ["caddy", "run", "--config", "/app/Caddyfile", "--adapter", "caddyfile"]
