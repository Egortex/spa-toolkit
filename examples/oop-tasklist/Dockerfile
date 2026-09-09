# Собирается из корня монорепозитория (см. docker-compose.yml: build.context: ../..),
# т.к. пример зависит от @chepchik/* через "workspace:*" — их резолвит только pnpm
# внутри всего workspace, а не изолированная установка одного пакета.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile
# packages/* нужно собрать первыми — example импортирует их через dist/,
# а .dockerignore не копирует уже собранный dist из хоста.
RUN pnpm --filter "./packages/*" run build
RUN pnpm --filter oop-tasklist-example run build
# pnpm deploy собирает самодостаточную (без workspace-симлинков) папку
# с prod-зависимостями и билдом example — то, что реально нужно в runtime-образе.
RUN pnpm deploy --filter oop-tasklist-example --prod --legacy /deploy
# "pnpm deploy" копирует файлы пакета с учётом .gitignore (как при `npm pack`),
# поэтому только что собранный dist/ (он в .gitignore) в /deploy не попадает —
# докопируем его отдельно.
RUN cp -r examples/oop-tasklist/dist /deploy/dist

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /deploy ./

EXPOSE 3001
CMD ["npx", "tsx", "server/index.ts"]
