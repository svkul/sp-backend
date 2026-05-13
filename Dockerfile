# syntax=docker/dockerfile:1
# Node image has Corepack but not pnpm — enable it before any `pnpm` command.
ARG NODE_VERSION=20

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

FROM base AS builder
COPY package.json pnpm-lock.yaml prisma.config.ts ./
COPY prisma ./prisma/
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src/
RUN pnpm install --frozen-lockfile
RUN pnpm run build

FROM base AS runner
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml prisma.config.ts ./
COPY prisma ./prisma/
COPY --from=builder /app/dist ./dist
RUN pnpm install --frozen-lockfile --prod
EXPOSE 3000
CMD ["pnpm", "run", "start:prod"]
