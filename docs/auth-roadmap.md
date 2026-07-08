# auth-service — что осталось сделать

Статус на 2026-07-07. Документ описывает **недостающие API и логику** сервиса `services/auth`
и то, **как их писать в существующем каноне** (route → service → repo, порты, ambient-tx,
outbox, audit). Источник правды по стилю — [conventions.md](conventions.md),
[architecture.md](architecture.md), решения — [adr/](adr/).

## Что уже реализовано (база)

| Поверхность | Эндпоинт | Статус |
|---|---|---|
| Health | `GET /health` | ✅ |
| Регистрация | `POST /api/v1/auth/register` | ✅ user + дефолт-роль + verification_token + audit + письмо в outbox |
| Логин | `POST /api/v1/auth/login` | ✅ пароль + троттлинг + 2FA-гейт + выпуск access/refresh |
| Логин 2FA (шаг-2) | `POST /api/v1/auth/login/2fa` | ✅ challenge-токен → TOTP/recovery → токены |
| 2FA setup/confirm/disable | `POST /api/v1/auth/2fa/*` | ✅ |
| 2FA recovery regenerate | `POST /api/v1/auth/2fa/recovery-codes/regenerate` | ✅ |
| Чтение пользователя | `GET /api/v1/users/:id` | ⚠️ работает, но **без auth-гарда** (см. P1.6) |

Инфраструктура готова и используется: `sessions` (запись), `login_attempts` (троттлинг),
`audit_log` (частично), `outbox` + воркер, RBAC-таблицы (только выдача дефолт-роли),
`verification_tokens` (только запись на регистрации), `two_factor_*`.

## Главный сигнал: «спящая» схема

Большинство недостающих фич **уже заложены в БД**, но не имеют кода. Это карта того, что
задумано, но не написано — доделка сводится к тому, чтобы оживить существующие артефакты,
а не проектировать заново.

| Артефакт в схеме | Задействован? | Какую фичу открывает |
|---|---|---|
| `sessions` (чтение/ротация/удаление) | ❌ только INSERT | refresh, logout, список устройств, revoke-all |
| `sessions.device_name`, `last_used_at` | ❌ | управление устройствами, «активные сессии» |
| `users.token_version` | ⚠️ пишется в токен, но **не проверяется и не растёт** | инвалидация всех сессий (logout-all, смена пароля, ban) |
| `users.email_verified` | ❌ всегда `false` | подтверждение email |
| `users.phone`, `phone_verified` | ⚠️ телефон пишется, не верифицируется | верификация телефона (SMS) |
| `users.banned_reason/at/by` | ❌ | бан/разбан (логин уже умеет отклонять `banned`) |
| `users.deleted_at/by` | ❌ | soft-delete аккаунта |
| `verification_tokens` (потребление) | ❌ только INSERT; `attempts/max_attempts/used` не читаются | confirm email/phone, сброс пароля |
| `verification_type`: `phone_confirm`, `password_reset` | ❌ | верификация телефона, сброс пароля |
| RBAC: `permissions`, `role_permissions`, чтение `user_roles` | ⚠️ сидинг есть, дефолт-роль выдаётся | авторизация (permission-гард), выдача/отзыв ролей |
| `audit_event`: `logout`, `token_refreshed`, `password_changed`, `password_reset_requested/completed`, `email_verified`, `phone_verified`, `account_banned/unbanned`, `account_deleted`, `role_granted/revoked`, `sessions_revoked_all` | ❌ 13 из 17 значений не пишутся | каждое значение = один недостающий флоу |

Правило чтения: **на каждое неиспользуемое enum-значение `audit_event` приходится один
недостающий эндпоинт.** Ниже — по приоритетам.

---

## P0 — критично: замкнуть базовый цикл сессий

`sessions` заполняется на логине, но **никогда не читается** — refresh-токен выдаётся
в никуда. Пока этого нет, весь механизм `token_version`/refresh мёртв.

### P0.1 — Refresh: `POST /api/v1/auth/refresh`

- **Что:** принять `refresh_token`, проверить сессию, выдать новый access (+ротировать refresh).
- **Логика:** `session.rotate(plainToken, ctx)`:
  1. `tokens.hash(token)` → `repo.findByHash(hash)`; нет / `expires_at < now()` / `used` → `401`.
  2. Сверить `session.token_version` с `users.token_version` (несовпадение → сессия отозвана → `401`).
  3. В `runTx`: удалить (или пометить) старую строку, `session.issue(...)` новую (rotation),
     `UPDATE users ... last_used_at`, `audit.record(token_refreshed)`.
  4. Вернуть новый access-JWT + новый refresh.
- **Канон:** дописать в `modules/session.ts` методы `ISessionRepo.findByHash/deleteById/touch`
  и `ISessionService.rotate`; порт `IRefreshTokenService` (hash) уже есть. Роут — в `auth.route.ts`
  (там уже висит `jwt`-инстанс для подписи access). Модель `auth.refresh` в `auth.port.ts`.
- **Решение по дизайну:** ротация refresh (одноразовый) vs. долгоживущий — рекомендую ротацию
  с детекцией повторного использования (reuse → revoke-all). Зафиксировать в ADR.

### P0.2 — Logout: `POST /api/v1/auth/logout`

- **Что:** отозвать текущую сессию (по refresh-токену или session_id).
- **Логика:** `session.revoke(hash)` → удалить строку; `audit.record(logout)`. Идемпотентно.
- **Канон:** `{ auth: true }` (нужен `currentUser`) + тело с `refresh_token`. Метод
  `ISessionService.revoke` в `session.ts`.

### P0.3 — Подтверждение email: `POST /api/v1/auth/verify-email`

Регистрация уже кладёт OTP в `verification_tokens` и письмо в `outbox` — **потребителя нет**
(явный TODO в CLAUDE.md).

- **Что:** принять `{ email, code }`, подтвердить и активировать аккаунт.
- **Логика** (в `runTx`): найти активный токен (`type='email_confirm'`, `used=false`,
  `expires_at>now()`); проверить `attempts < max_attempts` (иначе `429/410`);
  сверить `otp.hash(code)` с `token_hash`. Успех → `used=true, used_at=now()`,
  `UPDATE users SET email_verified=true, status='active'`, `audit.record(email_verified)`.
  Провал → `UPDATE ... attempts = attempts + 1`.
- **Ресенд:** `POST /api/v1/auth/verify-email/resend` — инвалидировать старый активный токен
  (частичный уникальный индекс `idx_vt_one_active_per_type` требует одного активного на тип),
  создать новый, положить письмо в outbox. Троттлить (тот же `login_attempts`-подход или отдельно).
- **Канон:** логика — в `auth.service` (владелец `verification_tokens` в `auth.repo`);
  дописать `IAuthRepo.consumeVerificationToken/incrementAttempts/invalidateActive`.
  `otp.hash` уже есть в `auth.security`.

---

## P1 — полнота учётной записи

### P1.4 — Сброс пароля (забыл пароль)

Enum `password_reset` (`verification_type`) и аудиты `password_reset_requested/completed` — спят.

- **`POST /api/v1/auth/password/forgot`** `{ email }`: **всегда `200`** (не раскрываем существование).
  Если юзер есть — создать `verification_token(type=password_reset)`, письмо в outbox
  (новый topic `email.password_reset` + хендлер в `workers/worker.ts` + метод нотифаера),
  `audit.record(password_reset_requested)`.
- **`POST /api/v1/auth/password/reset`** `{ email, code, new_password }`: сверить токен (как P0.3),
  в `runTx`: `hash.hash` нового пароля, `UPDATE users SET password_hash`, **`token_version + 1`**
  (глушит все живые сессии), пометить токен used, `audit.record(password_reset_completed)`.
  Тяжёлый argon2 — до транзакции (как в `register`).

### P1.5 — Смена пароля (в личном кабинете): `POST /api/v1/auth/password/change`

- **Что:** `{ current_password, new_password }` под `{ auth: true }`.
- **Логика:** `hash.verify(current)`; в `runTx` — `UPDATE password_hash`, `token_version + 1`,
  `audit.record(password_changed)`. Опционально сохранить текущую сессию (ротировать её refresh).

### P1.6 — Профиль + защита чтения пользователей

- **`GET /api/v1/auth/me`** `{ auth: true }` → профиль `currentUser` (расширить `UserView`
  полями `emailVerified`, `phone`, `phoneVerified`, `createdAt`; отдельный `repo.findMe`).
- **Защитить `GET /users/:id`:** сейчас **без auth-гарда** — любой аноним читает email любого
  пользователя (enumeration/PII). Минимум — `{ auth: true }`; корректно — RBAC-гард `read:users`
  (см. P2.8), а самого себя пусть читает через `/auth/me`.

### P1.7 — Управление сессиями (устройства)

Колонки `device_name`, `last_used_at`, `ip_address`, `user_agent` в `sessions` — под это.

- **`GET /api/v1/auth/sessions`** — список активных сессий текущего юзера (без хэшей токенов).
- **`DELETE /api/v1/auth/sessions/:id`** — отозвать конкретную (не свою — `404`).
- **`POST /api/v1/auth/sessions/revoke-all`** — `token_version + 1` + удалить строки сессий
  (кроме текущей опционально), `audit.record(sessions_revoked_all)`.
- **Канон:** методы `listByUser/deleteByIdForUser` в `session.ts`.

---

## P2 — авторизация (RBAC) и администрирование

RBAC-таблицы засеяны (`permissions`, `roles`, `role_permissions`), дефолт-роль выдаётся —
но **проверки прав нет нигде**: `authMacro` только аутентифицирует (`currentUser = {id,email}`),
не авторизует. Это блокирует и админ-эндпоинты, и авторизацию в booking.

### P2.8 — Permission-гард + роли в контексте

- **Что:** макрос `requirePermission('ban','users')` (или `{ permissions: ['ban:users'] }`),
  резолвящий права юзера и бросающий `403 FORBIDDEN`.
- **Как:** новый модуль `modules/rbac` (`rbac.repo` — `getPermissions(userId)` join
  `user_roles→role_permissions→permissions`, учитывая wildcard `*:*`, `read:*`).
  Расширить `authMacro` в `@booking/shared` **или** отдельный `rbacMacro` поверх него.
- **Сквозной вопрос — доставка прав в booking:** сейчас access-JWT несёт только `sub,email`.
  Варианты: (а) класть роли/права в JWT (быстро, но устаревают до истечения токена);
  (б) интроспекция `POST /api/v1/auth/introspect` для сервис-сервис. Зафиксировать в ADR.

### P2.9 — Инвалидация access-токенов (сквозной дизайн)

Сейчас access-JWT **не несёт `tv`**, а `authMacro` не сверяет `token_version` с БД → бан,
logout-all и смена пароля **не гасят живой access-токен** до истечения (15m). Решить:
- короткий TTL + опора на refresh (дёшево, окно 15m остаётся), **или**
- `tv` в access-claims + проверка в `authMacro` через lookup (точнее, +1 запрос на запрос).

Без явного решения P1.4/P1.5/P2.10 дают ложное чувство «сессии отозваны». Оформить ADR.

### P2.10 — Бан / разбан: `POST /api/v1/admin/users/:id/ban` | `/unban`

Логин **уже** отклоняет `status='banned'` — не хватает того, кто ставит статус.

- **Логика (гард `ban:users`):** `UPDATE users SET status='banned', banned_reason, banned_at=now(),
  banned_by=:admin`; `token_version + 1` (выкинуть живые сессии); `audit.record(account_banned)`.
  Разбан — обратно в `active`, очистить `banned_*`, `account_unbanned`.

### P2.11 — Удаление аккаунта (soft-delete): `DELETE /api/v1/auth/me` и/или админский

- **Логика:** `UPDATE users SET deleted_at=now(), deleted_by`; частичные индексы
  (`idx_users_email_active`) уже освобождают email/phone для повторной регистрации;
  `token_version + 1`, удалить сессии, `audit.record(account_deleted)`.

### P2.12 — Управление ролями (админ)

Права `manage:roles`, аудиты `role_granted/revoked`, `user_roles.granted_by` — под это.

- **`POST /api/v1/admin/users/:id/roles`** `{ role }` — грант (гард `manage:roles`),
  `granted_by=:admin`, `audit(role_granted)`.
- **`DELETE /api/v1/admin/users/:id/roles/:role`** — отзыв, `audit(role_revoked)`.
- **`GET /api/v1/users/:id/roles`** (или в `/me`) — чтение ролей/прав.

---

## P3 — второстепенное / инфраструктура

- **Реальный notifier.** `logNotifier` в `auth.notifier.ts` — заглушка (`console.log`).
  За портом `INotifier` подключить SMTP/Resend без изменений в вызывающем коде; расширить порт
  методами под новые письма (password_reset и т.п.). Хендлеры topic'ов — в `workers/worker.ts`.
- **Верификация телефона (SMS).** `verification_type='phone_confirm'`, `channel='sms'`,
  аудит `phone_verified` — спят. Нужен SMS-адаптер (новый topic outbox + хендлер), эндпоинты
  `request`/`confirm` по образцу email (P0.3). Приоритет низкий — нет провайдера.
- **Cleanup-воркеры.** Удалять протухшие `sessions` (`expires_at < now()`), использованные/
  просроченные `verification_tokens`, старые `login_attempts`. Добавить в `startWorkers`
  рядом с outbox-поллером (интервальная задача).
- **Outbox для медленного провайдера.** Сейчас доставка держит блокировку строки во время
  сетевого I/O (комментарий в `outbox.worker.ts`). Для реального SMTP — схема claim → commit →
  send → mark. Плюс retry с backoff по `attempts`/`last_error` (поля есть, не используются).
- **Eden Treaty** для типобезопасных вызовов auth↔booking (TODO из CLAUDE.md).
- **Согласовать README.** `services/auth/README.md` описывает старую раскладку (`v1.route.ts`,
  `types/`, ответ `{ token }`) и не содержит 2FA/refresh — обновить после доделок.

---

## Рекомендованный порядок

1. **P0** (refresh → logout → verify-email) — замыкает заявленный, но неработающий цикл сессий.
2. **P2.9 + P2.8** (дизайн инвалидации access + permission-гард) — фундамент, от которого
   зависят P1.4/P1.5 (смысл `token_version`) и все админские P2.10–P2.12.
3. **P1** (сброс/смена пароля, `/me`, защита `/users/:id`, управление сессиями).
4. **P2.10–P2.12** (админка: бан, delete, роли).
5. **P3** (реальный notifier, SMS, cleanup, Eden).

Каждый пункт ложится в существующий канон: логика — в `*.service`, SQL — в `*.repo`,
межмодульные связи — через `I*Service`-порты в `core/container.ts`, побочные записи и письма —
атомарно через `runTx` + `outbox`, факты — в `audit_log`.
