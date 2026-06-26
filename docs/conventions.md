# Конвенции кода («как писать правильно»)

Главный документ по стилю. Эталон канона модуля — `services/auth/src/modules/user` и `services/auth/src/modules/auth` (плоская раскладка `<module>.<role>.ts`). Новый модуль создаётся по образцу. Общий код берётся из `@booking/shared`, а не копируется.

> Модуль `services/booking/src/modules/bookings` пока на старой раскладке (`v1.route.ts`, `types/`, `models/`) — функционально эквивалентен, будет приведён к канону отдельно.

## Архитектурный стиль
Гибрид: **чистая архитектура в ядре + идиомы Elysia на крае** (см. [adr/0004-architecture-style-hybrid.md](adr/0004-architecture-style-hybrid.md)).

```
HTTP (Elysia)         <name>.route.ts    валидация, подпись токена, формат ответа
  └─ Service          <name>.service.ts  бизнес-логика, не зависит от Elysia
       └─ Repo (port) <name>.repo.ts     только SQL, реализует интерфейс из <name>.port.ts
            └─ DB     @booking/shared    postgres, пул, транзакции
```

- **Бизнес-логика — в service**, SQL — только в repo, HTTP-специфика (статусы, токены, формат) — только в route.
- service и repo — **чистые фабрики-замыкания**, не импортируют Elysia → тестируемость и портируемость.
- Зависимости передаются явно: через аргументы фабрик и **порты** (`<name>.port.ts`), а не через глобали.

### Раскладка модуля (плоский канон `<module>.<role>.ts`)
Каталог `services/<svc>/src/modules/<name>/`, файлы по ролям — без подпапок `models/`/`types/`/`ports/`:

| Файл | Роль | Ключевые экспорты |
|---|---|---|
| `<name>.model.ts`   | Elysia-модели `t.Object` + типы запросов | `XModels`, `XCreateRequest = (typeof XModels)['x.create']['static']` |
| `<name>.entity.ts`  | доменная сущность / типы строк БД        | `X` (= колонки миграции), `XView` |
| `<name>.port.ts`    | порты модуля                              | `IXRepo` **и** `IXService` |
| `<name>.repo.ts`    | SQL-слой                                  | `xRepo(sql): IXRepo` |
| `<name>.service.ts` | бизнес-логика                             | `xService(repo, ...deps): IXService` |
| `<name>.route.ts`   | HTTP (v1)                                 | `xRouteV1(svc, deps): Elysia` |

## Композиция модулей (модуль использует модуль)
Модули общаются **только через service-порты**, связываются в composition root (`src/index.ts`).

- Каждый модуль публикует свою поверхность как **`IXService`** в `<name>.port.ts`. Это единственное, на что смеют опираться другие модули.
- Потребляющий модуль принимает зависимость **интерфейсом** в аргумент фабрики — не импортирует чужой `*.service.ts`/`*.repo.ts`/`sql`:
  ```ts
  // auth.service.ts — auth пользуется user-модулем через его порт
  export const authService = (users: IUserService): IAuthService => ({
    register: async (dto) => {
      if (await users.findByEmail(dto.email)) throw new ConflictError('...', 'ALREADY_EXISTS')
      const password_hash = await Bun.password.hash(dto.password)
      return users.create({ email: dto.email, password_hash })
    },
    // ...
  })
  ```
- Связывание — **только в `index.ts`** (composition root):
  ```ts
  const users = userService(userRepo(sql))   // самодостаточный модуль
  const auth  = authService(users)            // auth → user через IUserService

  .group('/api', (api) => api.group('/v1', (v1) => v1
    .use(userRouteV1(users, { response, cfg }))
    .use(authRouteV1(auth,  { response, cfg }))))
  ```
- Это то же DI через фабрики-замыкания и порты, что и для repo (см. [adr/0005-module-composition-ports.md](adr/0005-module-composition-ports.md)), распространённое на связь модуль↔модуль. Циклические зависимости между модулями — запрещены.

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
- **Транзакция через несколько repo:** методы repo принимают `exec?: Executor` (`= sql`); service открывает `runTx` (`TxRunner` из `src/lib/tx.ts`) и прокидывает `tx` в каждый вызов. Тяжёлый CPU (argon2) — ДО транзакции, чтобы держать её короткой. Внешние side-effect'ы (письмо) — не в транзакции напрямую, а заданием в `outbox` (доставит воркер после коммита).
- **Миграции:** `MIGRATIONS[]` + `applyMigrations(sql, MIGRATIONS)` из shared.
- **`src/schema/`:** инертные `*.entity`/`*.constant`-зеркала колонок миграций под ещё не реализованные модули. Когда модуль пишется — тип переезжает в `src/modules/<name>/` по канону.

## Чек-лист: новый модуль
1. `<name>.model.ts` — `t.Object`-модели + экспорт типов через `['static']`.
2. `<name>.entity.ts` — доменные типы (имена полей = колонки миграции); `<name>.port.ts` — `IXRepo` + `IXService`.
3. `<name>.repo.ts` — реализация `IXRepo`, только SQL.
4. `<name>.service.ts` — бизнес-логика, реализует `IXService`, бросает `AppError`. Зависимости от других модулей — их портами (`IOtherService`) в аргументах фабрики.
5. `<name>.route.ts` — роуты, `.model(...)`, валидация `{ body: '<name>.<op>' }`, ответ через `responseMapper`. Принимает `IXService`.
6. Связать в `index.ts` (composition root) внутри `.group('/api').group('/v1')`; сюда же передаются зависимости между модулями.
7. Миграции (если нужны) — в `src/migrations/index.ts` новым `version` (см. [database.md](database.md)).

## Анти-паттерны (НЕ делать)
- Класс-контроллер с `(ctx: Context)`.
- Дублирующие `interface` вместо вывода типов из `t`-моделей.
- SQL вне repo; бизнес-логика в route; голые `throw new Error()` вместо `AppError`.
- Импорт чужого `*.service.ts`/`*.repo.ts`/`sql` напрямую между модулями — только через `IXService` в аргументе фабрики (связывание в `index.ts`).
- Конкатенация значений в SQL-строку (риск инъекций).
- Имена колонок в коде, расходящиеся со схемой миграций (инцидент `email_verificated` vs `email_verified`).
