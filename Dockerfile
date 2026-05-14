# ┌─ Build stage ───────────────────────────────────────────────────────┐
# │ Использует node — нужен для postinstall-скриптов @prisma/engines     │
# │ (скачивание query engine binaries) и для самого `prisma generate`.   │
# │ oven/bun-образ не содержит node, поэтому install+generate делаем     │
# │ отдельной стадией и затем перекидываем node_modules + generated      │
# │ client в runtime-образ.                                              │
# └──────────────────────────────────────────────────────────────────────┘
FROM node:22-bookworm-slim AS build

WORKDIR /usr/src/app

RUN npm install -g pnpm@10.33.4

COPY package.json pnpm-lock.yaml ./

# Без --prod: prisma CLI нужен в runtime для migrate deploy
# (запускается ролью docker_app внутри контейнера).
RUN pnpm install --frozen-lockfile

# Схема Prisma + конфиг — copy DO `pnpm exec prisma generate`, иначе
# generator не найдёт schema.prisma. Copy всего проекта откладываем
# на runtime stage, чтобы build-кэш не инвалидировался от любых правок.
COPY src/prisma ./src/prisma
COPY prisma.config.ts ./
COPY tsconfig.json ./

RUN pnpm exec prisma generate


# ┌─ Runtime stage ─────────────────────────────────────────────────────┐
# │ Bun исполняет TypeScript нативно. prisma CLI запускается через      │
# │ `bunx prisma …` (см. infra/roles/docker_app, переменная             │
# │ docker_app_prisma_migrate_cmd). Bun имеет node-compat и корректно   │
# │ исполняет CLI-скрипты прислящие с node-shebang.                     │
# └──────────────────────────────────────────────────────────────────────┘
FROM oven/bun:1.3.13-debian

WORKDIR /usr/src/app

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
