# auth-service

Сервис аутентификации. **Bun + Elysia + PostgreSQL**, общий код — из [`@booking/shared`](../../packages/shared).

## Запуск
```bash
cp .env.example .env          # DB_URL, JWT_SECRET (обязательны)
bun run dev                   # watch; миграции применяются на старте
```
Команды: `bun run dev` | `bun run start` | `bun run typecheck` | `bun test`.

Env: `DB_URL`, `JWT_SECRET` (required), `JWT_EXPIRY` (15m), `PORT` (3000), `NODE_ENV`, `ARGON_MEMORY`, `ARGON_TIME_COST`.

## Эндпоинты
| Метод | Путь | Описание |
|------|------|----------|
| GET  | `/health` | liveness |
| POST | `/api/v1/auth/register` | регистрация (email + password ≥ 6) → создаёт пользователя |
| POST | `/api/v1/auth/login` | логин → `{ token }` (подписанный JWT с `sub`, `email`) |

Ошибки: `409 ALREADY_EXISTS` (дубль email), `401 INVALID_CREDENTIALS` (неверные креды), `422 VALIDATION` (тело не прошло схему).

## Структура
```
src/
├── index.ts              bootstrap: config → db → migrations → repo → service → routes
├── config.ts             схема env (ConfigService из @booking/shared)
├── migrations/index.ts   MIGRATIONS[] + applyMigrations (001..006: users, RBAC, sessions, …)
└── modules/auth/
    ├── v1.route.ts       HTTP + @elysiajs/jwt (подпись токена)
    ├── service.ts        бизнес-логика (argon2id, проверка кред)
    ├── repo.ts           SQL
    ├── models/index.ts   валидация + типы (из Model.static)
    └── types/            entity, ports
```

Канон и идиомы — [docs/conventions.md](../../docs/conventions.md).
