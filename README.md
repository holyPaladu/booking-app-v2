# booking-app-v2

Мульти-сервисное приложение бронирования. Монорепо на **bun workspaces**: рантайм **Bun**, фреймворк **Elysia**, БД **PostgreSQL** (драйвер `postgres`, raw SQL).

## Структура

```
booking-app-v2/
├── packages/
│   └── shared/          @booking/shared — общий код: config, db, миграции,
│                        error.lib, responseMapper, mapError, auth.macro
├── services/
│   ├── auth/            аутентификация: register/login, JWT, RBAC-схема
│   └── booking/         бронирования: CRUD под защитой JWT (auth.macro)
├── docs/                источник правды по архитектуре/конвенциям/ADR
├── docker-compose.yml   postgres + auth + booking для локальной разработки
└── tsconfig.base.json   общий tsconfig (services/packages его extends)
```

## Быстрый старт (docker-compose)

```bash
docker compose up        # postgres (две БД: auth, booking) + оба сервиса
# auth    -> http://localhost:3000
# booking -> http://localhost:3001
```

## Локально (без docker)

```bash
bun install                       # ставит весь workspace разом
# поднять Postgres и создать БД auth/booking, затем в каждом сервисе:
cp services/auth/.env.example services/auth/.env       # заполнить DB_URL, JWT_SECRET
bun run --filter auth-service dev
cp services/booking/.env.example services/booking/.env  # JWT_SECRET = тот же, что у auth
bun run --filter booking-service dev
```

## Команды (из корня)

```bash
bun run typecheck   # tsc --noEmit во всех воркспейсах
bun test            # все тесты (bun:test)
bun run lint        # biome check .
bun run format      # biome format --write .
```

## Документация
- [docs/architecture.md](docs/architecture.md) — сервисы, слои, потоки.
- [docs/conventions.md](docs/conventions.md) — как писать (канон + идиомы Elysia).
- [docs/database.md](docs/database.md) — схемы БД и правила миграций.
- [docs/adr/](docs/adr/) — архитектурные решения.
