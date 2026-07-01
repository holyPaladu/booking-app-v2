# booking-app-v2

Мульти-сервисное приложение бронирования. Монорепо на **bun workspaces**. Рантайм **Bun**, фреймворк **Elysia**, БД **PostgreSQL** (драйвер `postgres`, raw SQL).

## Структура монорепо
- `packages/shared` — **`@booking/shared`**: общий код (config, db, `applyMigrations`, `error.lib`, `responseMapper`, `mapError`, `auth.macro`). Импорт единым барелем: `import { ... } from '@booking/shared'`.
- `services/auth` — аутентификация: register/login, JWT, в БД RBAC/сессии/верификация/аудит. **Реализован.**
- `services/booking` — бронирования: CRUD под защитой JWT через `authMacro`. **Реализован** (образец канона).
- `docs/` — источник правды (архитектура, конвенции, ADR). `tsconfig.base.json` — общий, остальные `extends` его.

## Запуск
```bash
docker compose up          # postgres (БД auth+booking) + оба сервиса (3000/3001)
# либо локально:
bun install                # ставит весь workspace
bun run --filter auth-service dev       # после cp .env.example .env
bun run --filter booking-service dev
```
Команды из корня: `bun run typecheck` (все воркспейсы) | `bun test` | `bun run lint` (biome) | `bun run format`.
В сервисе: `bun run dev` | `start` | `typecheck` | `test`. Env — в `services/*/.env.example`. JWT_SECRET у auth и booking **должен совпадать** (booking только проверяет токены).

## Карта сервиса (эталон — auth; booking местами отстаёт)
- Bootstrap разнесён на 4 файла: `src/index.ts` (точка входа: config → db → migrations → контейнер → воркеры → HTTP), `src/app.ts` (Elysia-приложение + глобальный `onError` через `mapError` + роуты v1), `src/container.ts` (**composition root** — сборка repo→service и межмодульных связей), `src/workers.ts` (фоновые задачи, напр. outbox-воркер). (booking может быть ещё на едином `index.ts`.)
- `src/config.ts` — схема env (`ConfigService` из shared).
- `src/migrations/index.ts` — `MIGRATIONS[]` + `applyMigrations` из shared; трекинг в `schema_migrations`, гоняются на старте.
- `src/modules/<name>/` — плоский канон `<name>.{entity,port,repo,service,route}.ts`: route (HTTP) → service (логика) → repo (SQL). `port.ts` держит `IXRepo` + `IXService` **и** Elysia-модели входа (`xModels`). Тонкие модули без своей логики (`audit`, `session`, `login-attempt`) — один файл `src/modules/<name>.ts` со всеми ролями. Образец — `services/auth/src/modules/{user,auth}`. (booking ещё на старой раскладке `v1.route.ts`/`types/`/`models/`.)
- auth-модули: `user` (самодостаточный), `auth` (register/login + завершение 2FA-логина `completeLogin`; владеет SQL побочных записей — роль/верификация/аудит — в `auth.repo`; адаптеры `auth.security` = hash+otp, `auth.notifier`), `two-factor` (TOTP setup/confirm/disable/recovery + гейт `isEnabled` для логина; владеет `two_factor_secrets`/`two_factor_recovery_codes`; адаптер `two-factor.security` = TOTP/base32/AES-GCM/recovery — см. [docs/adr/0006-two-factor-module.md](docs/adr/0006-two-factor-module.md)), `outbox` (транзакционная доставка писем + воркер-поллер).
- `src/lib/tx.ts` — `createTx(sql)` → `{ db, runTx }`. Транзакция **ambient** (через `AsyncLocalStorage`): repo зовёт `const sql = db()` и получает текущий executor (внутри `runTx` — активный tx, вне — пул). `exec`/`tx` по слоям не протаскивается — сигнатуры repo/service о транзакции не знают.
- **Модуль использует модуль** только через `IXService` (порт), переданный в фабрику; связывается в `src/container.ts` (composition root). Пример: `authService({ users, ... })`. См. [docs/adr/0005-module-composition-ports.md](docs/adr/0005-module-composition-ports.md).

## Конвенции (кратко; подробно — [docs/conventions.md](docs/conventions.md))
- Слои: **route → service → repo → db**. Бизнес-логика — в service, SQL — только в repo.
- DI через фабрики-замыкания и порты (`<name>.port.ts`); чистые service/repo не зависят от Elysia. Межмодульные связи — через `IXService` в composition root.
- Идиомы Elysia: «1 инстанс = 1 контроллер», method chaining, `.model` для валидации, **типы из моделей** (`Model.static`) — не дублировать интерфейсами.
- Ошибки — классы `AppError` из shared; в `onError` маппятся через `mapError` (включая валидацию Elysia → 422).
- Ответы — только `responseMapper` (`success`/`error`). Конфиг — только `cfg.get(...)`. SQL — теговые шаблоны `postgres`, параметризованно.
- **Именование: TS-идентификаторы — `camelCase`, `snake_case` живёт только внутри SQL-строк.** Граница — repo: на выходе `SELECT col AS "camelCase"`, на входе `${input.camelCase}` (список колонок в INSERT — snake). Выше repo (entity/service/route) snake-полей нет. Исключение — HTTP-контракт ответов (`access_token`, `refresh_token`, `recovery_codes` и т.п.): это внешний API (OAuth), остаётся snake.
- Request-зависимая auth — через `authMacro` (`{ auth: true }` на роуте → `currentUser`).
- Общий код добавляй в `@booking/shared`, а не копируй между сервисами.

## Источник правды и память
- **`docs/` в репозитории — источник правды** (ревьюится с кодом). Старт: [docs/architecture.md](docs/architecture.md), [docs/conventions.md](docs/conventions.md); решения — [docs/adr/](docs/adr/).
- Персональная память Claude (`~/.claude`) — для кросс-сессионных заметок ассистента, **не** для проектной документации.

## Известные TODO / бэклог
- Refresh-токены + таблица `sessions` (схема есть, код — нет).
- Email-верификация: на регистрации уже создаётся OTP + `verification_tokens` и письмо ставится в `outbox` (доставляет воркер); **эндпоинта подтверждения кода ещё нет**.
- Eden Treaty для типобезопасных вызовов auth↔booking.
- 2FA (TOTP) реализована модулем `two-factor`: setup/confirm/disable/recovery + завершение логина `/auth/login/2fa` через challenge-токен. Требует env `TWO_FACTOR_ENC_KEY` (base64 32 байта).
- В БД auth заложены RBAC/audit, но используются не полностью.
