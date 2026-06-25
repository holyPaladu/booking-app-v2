# Базы данных

У каждого сервиса своя БД (микросервисы не делят схему). PostgreSQL, драйвер `postgres` (raw SQL). Миграции — `src/migrations/index.ts` каждого сервиса (`MIGRATIONS[]` + общий `applyMigrations` из `@booking/shared`), применяются на старте, трекинг в `schema_migrations`.

## auth (БД `auth`, миграции 001–006)
- **users** — `id` (uuid), `email` (+`email_verified`), `phone` (+`phone_verified`), `password_hash`, `status` (`user_status`: active/inactive/banned/pending_verification), бан (`banned_reason/at/by`), `token_version`, soft-delete (`deleted_at`/`deleted_by`), таймстампы. Check-констрейнты на формат email/phone.
- **RBAC** — `permissions`, `roles` (+`is_default`), `role_permissions`, `user_roles`. Сид: роли `user`/`moderator`/`admin` + права на bookings/rooms/users/roles.
- **sessions** — refresh-токены (`token_hash`, `token_version`), устройство (`user_agent`/`ip_address`/`device_name`), expiry. *(В коде пока не используется.)*
- **verification_tokens** — типы email_confirm/phone_confirm/password_reset/two_factor_setup, каналы email/sms, attempt-лимиты. *(Не используется.)*
- **audit_log** — события (login/logout/password_changed/role_granted/...), `ip`/`user_agent`, JSONB `metadata`.
- **triggers** — авто-обновление `updated_at`.

## booking (БД `booking`, миграция 001)
- **bookings** — `id` (uuid), `user_id` (uuid владельца; без cross-service FK), `room_id` (uuid), `starts_at`/`ends_at` (timestamptz), `status` (`booking_status`: pending/confirmed/cancelled), таймстампы. Check-констрейнт `ends_at > starts_at`, индекс по `user_id`.

## Правила миграций
- Каждая миграция — объект `{ version, up }` в массиве `MIGRATIONS`. `version` уникален и сортируется лексикографически (`001_...`, `002_...`).
- Только «вперёд» (down/rollback пока нет). Применяется в транзакции, затем запись в `schema_migrations`.
- **Имена колонок в коде** (`repo.ts`, `entity.ts`) обязаны совпадать с миграцией. Несовпадение → ошибка Postgres в рантайме (раньше так ломался login: `email_verificated` вместо `email_verified`).
- Новую схему добавляй новой миграцией; уже применённые не редактируй (они не переедут на существующих БД).
