# ┌─ Build stage ───────────────────────────────────────────────────────┐
# │ Использует node — нужен для postinstall-скриптов @prisma/engines     │
# │ (скачивание query engine binaries) и для самого `prisma generate`.   │
# │ oven/bun-образ не содержит node, поэтому install+generate делаем     │
# │ отдельной стадией и затем перекидываем node_modules + generated      │
# │ client в runtime-образ.                                              │
# └──────────────────────────────────────────────────────────────────────┘
FROM node:22-bookworm-slim AS build

WORKDIR /usr/src/app

# openssl нужен Prisma engines'у (postinstall @prisma/engines иначе
# фолбэчит на "openssl-1.1.x" и при первом запросе к БД ломается).
# node:22-bookworm-slim не содержит openssl по умолчанию.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10.33.4

COPY package.json pnpm-lock.yaml ./

# pnpm применяет patchedDependencies на install — без каталога patches/
# `--frozen-lockfile` не найдёт telegraf@4.16.3.patch и упадёт.
COPY patches ./patches

# Без --prod: prisma CLI нужен в runtime для migrate deploy
# (запускается ролью docker_app внутри контейнера).
RUN pnpm install --frozen-lockfile

# Схема Prisma + конфиг — copy DO `pnpm exec prisma generate`, иначе
# generator не найдёт schema.prisma. Copy всего проекта откладываем
# на runtime stage, чтобы build-кэш не инвалидировался от любых правок.
COPY src/prisma ./src/prisma
COPY prisma.config.ts ./
COPY tsconfig.json ./

# Prisma 7 в prisma.config.ts через `env("DATABASE_URL")` eager-резолвит
# переменную даже для `prisma generate` (хотя generator саму БД не
# трогает). Подсовываем dummy на время этого шага — переменная видна
# только этому RUN, в финальный образ не пробрасывается.
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
    pnpm exec prisma generate


# ┌─ Runtime stage ─────────────────────────────────────────────────────┐
# │ Bun исполняет TypeScript нативно. prisma CLI запускается через      │
# │ `bunx prisma …` (см. infra/roles/docker_app, переменная             │
# │ docker_app_prisma_migrate_cmd). Bun имеет node-compat и корректно   │
# │ исполняет CLI-скрипты прислящие с node-shebang.                     │
# └──────────────────────────────────────────────────────────────────────┘
FROM oven/bun:1.3.13-debian

WORKDIR /usr/src/app

# openssl нужен Prisma query engine'у в runtime (engine — native binary,
# линкуется к libssl системы). Профилактически ставим — bun-debian не
# гарантирует наличие openssl с правильной версией.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Деп-граф приходит из build-стадии — гарантирует, что движки Prisma
# уже скачаны под нужную платформу.
COPY --from=build /usr/src/app/node_modules ./node_modules

# Исходники приложения. .dockerignore исключает src/prisma/generated/,
# поэтому локальный устаревший generated client сюда не попадёт.
COPY . .

# Свежий generated client из build-стадии (он в .dockerignore'нутом
# каталоге, поэтому `COPY . .` его не положил — кладём явно).
COPY --from=build /usr/src/app/src/prisma/generated ./src/prisma/generated

CMD ["bun", "src/index.ts"]
