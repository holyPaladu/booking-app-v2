# @booking/shared

Общий код для сервисов монорепо. Импортируется как единый барель: `import { ... } from '@booking/shared'`.

## Что внутри
- **config** — `ConfigService` / `createConfigService`: типобезопасный доступ к env с валидацией обязательных на старте.
- **db** — `createDatabase` (пул `postgres`), `withTransaction`, `checkDatabaseHealth`, типы `SqlClient` / `TxClient`.
- **migrate** — `applyMigrations(sql, migrations)`: forward-only раннер с трекингом в `schema_migrations`; тип `Migration`.
- **error.lib** — иерархия `AppError` (`BadRequestError`, `UnauthorizedError`, `ConflictError`, …).
- **error-handler** — `mapError(code, error, response)`: маппит AppError И встроенные ошибки Elysia (валидация/parse/not-found) в корректный HTTP-статус. Используется в `onError`.
- **response** — `responseMapper` (`success`/`error`) + типы `SuccessResponse` / `ErrorResponse`.
- **auth.macro** — `authMacro(secret)`: Elysia-плагин с macro `auth` для защиты роутов (`{ auth: true }` → `currentUser` в контексте).

## Использование
```ts
import {
  createDatabase, createConfigService, applyMigrations,
  responseMapper, mapError, authMacro, ConflictError,
} from '@booking/shared'
```

Чистый код (config/db/migrate/error/response) не зависит от Elysia; `auth.macro` зависит от `elysia` + `@elysiajs/jwt`.
