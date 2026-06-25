# 0003. Стратегия монорепо

- Статус: принято (реализовано)
- Дата: 2026-06-24

## Контекст
Сервисы `auth` и `booking` дублировали `tsconfig`/`.gitignore` и общий код (`error.lib`, `config`, `db`, `responseMapper`, `auth.macro`). Монорепо-инструмента не было.

## Решение
Введены **bun workspaces** (`packages/*`, `services/*`) и пакет **`@booking/shared`**, куда вынесены config, db, `applyMigrations`, `error.lib`, `responseMapper`, `mapError`, `auth.macro`. Сервисы импортируют их единым барелем `@booking/shared` (`workspace:*`). Общий `tsconfig.base.json`. Межсервисные типобезопасные вызовы (Eden Treaty) — остаются в бэклоге.

## Последствия
- (+) Один источник общих утилит, ноль копипасты между сервисами, единый `bun install`/`typecheck`/`test`.
- (−) `@booking/shared` указывает на исходники (`src/index.ts`) без сборки — ок для Bun/tsc, но для публикации наружу понадобится билд d.ts.
