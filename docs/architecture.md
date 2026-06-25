# Архитектура

## Монорепо
**bun workspaces**: `packages/shared` (`@booking/shared`) + `services/*`. Общий код (config, db, `applyMigrations`, `error.lib`, `responseMapper`, `mapError`, `auth.macro`) живёт в shared и переиспользуется обоими сервисами (см. [adr/0003-monorepo-strategy.md](adr/0003-monorepo-strategy.md)).

## Сервисы
- **auth** (`services/auth`) — регистрация/логин, JWT; в БД заложены RBAC, сессии, верификация, аудит.
- **booking** (`services/booking`) — бронирования: CRUD текущего пользователя под защитой JWT (`authMacro`).

Каждый сервис — самостоятельное Bun/Elysia-приложение со своей БД и миграциями; общего рантайма нет, общий только код через `@booking/shared`.

## Слои (одинаково для обоих сервисов)
```
HTTP (Elysia)         v1.route.ts     валидация, подпись/проверка JWT, формат ответа
  └─ Service          service.ts      бизнес-логика, НЕ зависит от Elysia
       └─ Repo (port) repo.ts         только SQL, реализует интерфейс из types/ports
            └─ DB     @booking/shared postgres: пул, транзакции
```

## Потоки
**register** `POST /api/v1/auth/register`: валидация `auth.register` → `service.register` (проверка существования, argon2id-хеш) → `repo.create` (INSERT) → `responseMapper.success`.

**login** `POST /api/v1/auth/login`: валидация `auth.login` → `service.login` (`repo.find` + `Bun.password.verify`; при неуспехе → `401 INVALID_CREDENTIALS`) → роут подписывает JWT (`jwt.sign({ sub, email })`) → `success({ token })`.

**booking** `GET|POST /api/v1/bookings` (защищены `authMacro`): `app.use(authMacro(secret))` верифицирует Bearer-токен, резолвит `currentUser`; роут с `{ auth: true }` получает `currentUser.id` и работает только с бронированиями этого пользователя.

## Стиль
Гибрид: чистое ядро (service/repo без Elysia) + идиомы Elysia на крае. См. [adr/0004-architecture-style-hybrid.md](adr/0004-architecture-style-hybrid.md) и [conventions.md](conventions.md).

## Инфраструктура
`docker-compose.yml` (postgres + auth + booking), CI в `.github/workflows/ci.yml` (biome + typecheck + tests), форматтер/линтер biome.

## Бэклог архитектуры
Eden Treaty для типобезопасных auth↔booking; refresh-токены; email-верификация; полное использование RBAC/2FA/audit.
