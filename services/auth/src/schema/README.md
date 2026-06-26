# schema/ — заготовки под бэклог

Типы-зеркала колонок миграций и enum-константы для **ещё не реализованных** модулей
(RBAC, 2FA, sessions, login-attempts, audit-log, verification-token). Схема этих таблиц
уже есть в [../migrations/index.ts](../migrations/index.ts); код модулей — нет.

Сейчас ничем не импортируются. Когда модуль будет реализован — соответствующий
`*.entity.ts` / `*.constant.ts` переезжает в `src/modules/<name>/` по канону
(см. [docs/conventions.md](../../../../docs/conventions.md)).
