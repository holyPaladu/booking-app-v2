import { t } from 'elysia'

export const authModels = {
  'auth.register': t.Object({
    email: t.String({ format: 'email' }),
    password: t.String({ minLength: 6 }),
  }),
  'auth.login': t.Object({
    email: t.String({ format: 'email' }),
    password: t.String({ minLength: 6 }),
  }),
}

// Single source of truth: типы выводим из моделей, а не дублируем интерфейсами.
export type AuthRegisterRequest = (typeof authModels)['auth.register']['static']
export type AuthLoginRequest = (typeof authModels)['auth.login']['static']
