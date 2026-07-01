# reference/ — сущности-ориентиры (не компилируются)

Типы-зеркала колонок миграций и enum-константы. Лежат **вне `src`**: не импортируются,
не компилируются и не линтуются — это спека-ориентир, а не рабочий код. Схема всех
таблиц — в [../src/migrations/index.ts](../src/migrations/index.ts).

Актуальность по модулям:
- **RBAC** (`role`, `permission`, `role-permission`, `user-role`, `roles`/`permissions`
  константы) — модуль ещё не реализован; это основной ориентир на будущее.
- **2FA, sessions, login-attempts, audit-log, verification-token** — уже реализованы в
  `src/modules/*`; там каждый модуль держит свои контракты в `*.port.ts`. Здешние копии —
  историческая справка (могут расходиться, источник правды — код модуля и миграции).

Когда реализуешь RBAC — соответствующий `*.entity.ts` / `*.constant.ts` переезжает в
`src/modules/<name>/` по канону (см. [docs/conventions.md](../../../docs/conventions.md)).
