# booking-service

Сервис бронирований. **Bun + Elysia + PostgreSQL**, общий код — из [`@booking/shared`](../../packages/shared). Защита роутов — через `authMacro` (проверка JWT, выпущенного auth-сервисом).

## Запуск
```bash
cp .env.example .env          # DB_URL, JWT_SECRET (тот же секрет, что у auth!)
bun run dev                   # watch; миграции применяются на старте
```
Команды: `bun run dev` | `bun run start` | `bun run typecheck` | `bun test`.

Env: `DB_URL`, `JWT_SECRET` (required, совпадает с auth), `PORT` (3001), `NODE_ENV`.

## Эндпоинты (все, кроме health, требуют `Authorization: Bearer <jwt>`)
| Метод | Путь | Описание |
|------|------|----------|
| GET  | `/health` | liveness |
| GET  | `/api/v1/bookings` | список бронирований текущего пользователя |
| POST | `/api/v1/bookings` | создать бронирование (`room_id`, `starts_at`, `ends_at`) |

Ошибки: `401 UNAUTHORIZED` (нет/невалидный токен), `400 INVALID_RANGE` / `INVALID_DATE`, `422 VALIDATION`.

## Структура
```
src/
├── index.ts                  bootstrap (как в auth)
├── config.ts                 схема env
├── migrations/index.ts       001_create_bookings (таблица + enum status + индекс)
└── modules/bookings/
    ├── v1.route.ts           HTTP + authMacro (защита, currentUser)
    ├── service.ts            бизнес-логика (валидация диапазона дат)
    ├── repo.ts               SQL
    ├── models/index.ts       валидация + типы
    └── types/                entity, ports
```

Написан по канону из [docs/conventions.md](../../docs/conventions.md) — образец того, как добавлять модули.
