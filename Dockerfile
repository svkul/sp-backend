# syntax=docker/dockerfile:1
# Keep ARG in sync with package.json "packageManager" (e.g. pnpm@10.33.2 → 10.33.2).
# We install pnpm via npm instead of Corepack to avoid flaky mid-download TLS (UND_ERR_SOCKET).
ARG NODE_VERSION=20
ARG PNPM_VERSION=10.33.2

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
RUN npm install -g pnpm@${PNPM_VERSION}

FROM base AS builder
COPY package.json pnpm-lock.yaml ./
COPY prisma.config.ts ./
COPY prisma ./prisma/
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src/
RUN pnpm install --frozen-lockfile
RUN pnpm run build

FROM base AS runner
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
COPY prisma.config.ts ./
COPY prisma ./prisma/
COPY --from=builder /app/dist ./dist
RUN pnpm install --frozen-lockfile --prod
EXPOSE 3000
CMD ["pnpm", "run", "start:prod"]
