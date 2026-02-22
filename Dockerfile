# ═══════════════════════════════════════════════
# FacturaPE Backend — Multi-stage Production Build
# Node.js 22 LTS | NestJS 11 | Prisma 7
# ═══════════════════════════════════════════════

# ───────────────────────────────────────────────
# Stage 1: Install dependencies
# ───────────────────────────────────────────────
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

# ───────────────────────────────────────────────
# Stage 2: Build the application
# ───────────────────────────────────────────────
FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy all source files
COPY . .

# Generate Prisma client (output to src/generated/prisma)
RUN pnpm db:generate

# Build the NestJS application
RUN pnpm build

# Prune dev dependencies for production
RUN pnpm prune --prod

# ───────────────────────────────────────────────
# Stage 3: Production image
# ───────────────────────────────────────────────
FROM node:22-alpine AS production

# dumb-init for proper PID 1 signal handling
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production

WORKDIR /app

# Copy production node_modules
COPY --from=build /app/node_modules ./node_modules

# Copy compiled application
COPY --from=build /app/dist ./dist

# Copy Prisma files for migrations (prisma migrate deploy)
COPY --from=build /app/prisma ./prisma

# Copy generated Prisma client
COPY --from=build /app/src/generated ./src/generated

# Copy package.json (needed by Node.js for ESM resolution)
COPY --from=build /app/package.json ./

EXPOSE 3000

# Run as non-root user for security
USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
