# 0006. Модуль two-factor (TOTP) и завершение логина через challenge-токен

- Статус: принято
- Дата: 2026-06-27

## Контекст
В БД auth уже лежали таблицы `two_factor_secrets`/`two_factor_recovery_codes` (миграция 007), enum-события `two_factor_enabled/disabled` и `verification_type = two_factor_setup`, но кода не было. Логин при этом уже имел 2FA-гейт: `auth.service.startLogin` при включённой 2FA возвращал `two_factor_required` **без токенов**, а сам флаг читался временным `auth.repo.isTwoFactorEnabled` (с пометкой «перенести в полноценный 2FA-модуль»). Не хватало: (а) включения/выключения 2FA, (б) эндпоинта, который **завершает** логин после гейта — иначе пользователь с 2FA не мог войти вообще.

## Решение
1. **Отдельный модуль `services/auth/src/modules/two-factor`** по плоскому канону (см. [0005](0005-module-composition-ports.md)). Владеет таблицами `two_factor_secrets` и `two_factor_recovery_codes`. Гейт `isTwoFactorEnabled` убран из `auth.repo` и переехал в `ITwoFactorService.isEnabled`; `auth.service` зависит от 2FA только через service-порт (composition root связывает их в `container.ts`).
2. **TOTP руками, без зависимостей** (`two-factor.security.ts`): RFC 6238 (HMAC-SHA1 через Web Crypto `crypto.subtle`), base32 (RFC 4648), как продолжение «ручного» стиля `auth.security` (OTP/refresh на Bun-крипте, без node:crypto). Сервер отдаёт `otpauth://`-URI + base32-секрет; QR рисует клиент. Recovery-коды — случайные `xxxx-xxxx`, в БД только их SHA-256-хэш, списываются одноразово.
3. **Секрет шифруется в покое** (AES-256-GCM, ключ `TWO_FACTOR_ENC_KEY` из cfg) — колонка называется `secret_enc`. `twoFactorSecurity` принимает опции явно (не глобальный `cfg`), чтобы юнит-тестироваться без окружения.
4. **Завершение логина — короткий challenge-токен.** Шаг-1 (`/auth/login`) при 2FA подписывает отдельным JWT-инстансом (`challengeJwt`, свой короткий `exp`) токен со `scope=2fa_pending` и claims `sub/email/tv` вместо «голого» `user_id`. Шаг-2 (`/auth/login/2fa`) проверяет challenge, затем `auth.service.completeLogin` сверяет TOTP/recovery (`verifyForLogin`) и выпускает сессию + access-JWT. На шаг-2 распространён тот же троттлинг `login_attempts`.

Эндпоинты управления (`/auth/2fa/setup|confirm|disable|recovery-codes/regenerate`) — под `authMacro`. Setup/confirm/disable/regenerate пишут audit (`two_factor_enabled/disabled`) и работают через `runTx`.

## Последствия
- (+) Логин для 2FA-пользователей замкнут end-to-end; гейт читается из владельца данных, временный метод в `auth.repo` удалён.
- (+) Нет новых зависимостей; секрет не лежит в БД в открытом виде; recovery-коды одноразовые и хранятся хэшами.
- (+) Криптоадаптер чист и покрыт юнит-тестами (вектора RFC 6238, round-trip base32/AES-GCM).
- (−) Появился обязательный секрет окружения `TWO_FACTOR_ENC_KEY` (base64 32 байта) — без него сервис не стартует.
- (−) Свой TOTP/base32 — поддерживаем сами (компромисс ради нулевых зависимостей; покрыто тестами).
- (−) Challenge-токен бесстатусный: отозвать «на лету» нельзя, полагаемся на короткий TTL.
