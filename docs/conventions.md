# Конвенции кода («как писать правильно»)

Главный документ по стилю. Все новые модули пишутся по образцу `services/auth/src/modules/auth` или `services/booking/src/modules/bookings` (booking реализован как эталон канона). Общий код берётся из `@booking/shared`, а не копируется.

## Архитектурный стиль
Гибрид: **чистая архитектура в ядре + идиомы Elysia на крае** (см. [adr/0004-architecture-style-hybrid.md](adr/0004-architecture-style-hybrid.md)).

```
HTTP (Elysia)         v1.route.ts     валидация, подпись токена, формат ответа
  └─ Service          service.ts      бизнес-логика, не зависит от Elysia
       └─ Repo (port) repo.ts         только SQL, реализует интерфейс из types/ports
            └─ DB     @booking/shared postgres, пул, транзакции
```

- **Бизнес-логика — в service**, SQL — только в repo, HTTP-специфика (статусы, токены, формат) — только в route.
- service и repo — **чистые фабрики-замыкания**, не импортируют Elysia → тестируемость и портируемость.
- Зависимости передаются явно: через аргументы фабрик и **порты** (`types/ports/*.port.ts`), а не через глобали.

## Идиомы Elysia (канон)
1. **1 инстанс = 1 контроллер.** Роуты — прямо на `new Elysia()`. НЕ выноси в класс-контроллер, принимающий весь `Context`.
2. **Method chaining.** Всегда цепочкой (`.use().model().post()`) — иначе теряется вывод типов.
3. **Деструктуризация контекста:** `({ body, jwt }) => ...`, не передавай `ctx` целиком.
4. **`.model` для валидации**, типы выводи из модели (single source of truth):
   ```ts
   export const AuthModels = {
     'auth.login': t.Object({ email: t.String({ format: 'email' }), password: t.String({ minLength: 6 }) })
   }
   export type AuthLoginRequest = (typeof AuthModels)['auth.login']['static']
   ```
   НЕ дублируй интерфейсами (`interface AuthLoginRequest { ... }`).
5. **Request-зависимый сервис — через macro/resolve/guard.** Auth: `authMacro` из `@booking/shared`:
   ```ts
   app.use(authMacro(cfg.get('jwt_secret')))
      .get('/me', ({ currentUser }) => currentUser, { auth: true })
   ```
6. **Дедупликация плагинов** — задавай `name` (`new Elysia({ name: 'auth.macro' })`).
7. **JWT — через `@elysiajs/jwt`** на HTTP-крае: подпись токена в роуте, проверка кред — в service.
8. **Префиксы/версии:** `new Elysia({ prefix: 'auth' })`, версии — `.group('/v1', ...)`.

## Кросс-каттинг (всё из `@booking/shared`)
- **Ошибки:** только классы `AppError` (`ConflictError`, `UnauthorizedError`, `BadRequestError`, …), конструктор `(message, code)` — например `new ConflictError('User already exists', 'ALREADY_EXISTS')`. В service/repo не отдавай голые статусы.
- **`onError`:** маппинг через `mapError(code, error, response)` — он покрывает и `AppError`, и встроенные ошибки Elysia (валидация → `422`, parse → `400`, not found → `404`).
- **Ответы:** только `responseMapper().success(message, data)` / `.error(code, message)`.
- **Конфиг:** только `cfg.get('...')`; новые переменные добавляй в `src/config.ts` сервиса и `.env.example`.
- **SQL:** теговые шаблоны `postgres`, всегда параметризованно (`${value}`). Многошаговые операции — через `withTransaction`.
- **Миграции:** `MIGRATIONS[]` + `applyMigrations(sql, MIGRATIONS)` из shared.

## Чек-лист: новый модуль
1. `modules/<name>/models/index.ts` — `t.Object`-модели + экспорт типов через `['static']`.
2. `modules/<name>/types/entity.ts` — доменные типы; `types/ports/<name>.port.ts` — интерфейс repo.
3. `modules/<name>/repo.ts` — реализация порта, только SQL.
4. `modules/<name>/service.ts` — бизнес-логика, бросает `AppError`.
5. `modules/<name>/v1.route.ts` — роуты, `.model(...)`, валидация `{ body: '<name>.<op>' }`, ответ через `responseMapper`.
6. Подключить в `index.ts` внутри `.group('/api').group('/v1')`.
7. Миграции (если нужны) — в `src/migrations/index.ts` новым `version` (см. [database.md](database.md)).

## Анти-паттерны (НЕ делать)
- Класс-контроллер с `(ctx: Context)`.
- Дублирующие `interface` вместо вывода типов из `t`-моделей.
- SQL вне repo; бизнес-логика в route; голые `throw new Error()` вместо `AppError`.
- Конкатенация значений в SQL-строку (риск инъекций).
- Имена колонок в коде, расходящиеся со схемой миграций (инцидент `email_verificated` vs `email_verified`).
