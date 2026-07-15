# syntax=docker/dockerfile:1

# ---- Build stage ----
# Builds the Next.js static export inside an isolated environment so host
# package.json / node_modules never interfere with dependency resolution.
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies from lockfile only (reproducible).
# Disable audit/fund (their exit hooks trigger npm's "Exit handler never
# called" bug under BuildKit) and give slow native-binary fetches room.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund \
      --fetch-timeout=600000 \
      --fetch-retries=5 \
      --fetch-retry-maxtimeout=120000

# Build static export -> /app/out
COPY . .
RUN npm run build

# ---- Runtime stage ----
# Serve the static files with nginx. No Node, no deps at runtime.
FROM nginx:1.27-alpine AS runner
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/out /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
