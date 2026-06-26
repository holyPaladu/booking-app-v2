import { t } from 'elysia'

export const authModels = {
  'auth.register': t.Object({
    email: t.String({ format: 'email' }),
    password: t.String({ minLength: 6 }),
    phone: t.Optional(t.String({ pattern: '^\\+[1-9]\\d{6,14}$' })),
  }),
  'auth.login': t.Object({
    email: t.String({ format: 'email' }),
    password: t.String({ minLength: 6 }),
  }),
}

// Single source of truth: типы выводим из моделей, а не дублируем интерфейсами.
export type AuthRegisterRequest = (typeof authModels)['auth.register']['static']
export type AuthLoginRequest = (typeof authModels)['auth.login']['static']
