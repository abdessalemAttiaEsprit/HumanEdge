# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Baked in at build time (Vite env vars are compile-time only) - pass a different value
# per environment via `docker build --build-arg VITE_API_BASE_URL=https://api.example.com`.
ARG VITE_API_BASE_URL=http://localhost:8081
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ---- Runtime stage ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
