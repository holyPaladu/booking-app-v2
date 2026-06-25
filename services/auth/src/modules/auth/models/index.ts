import { t } from 'elysia'

export const AuthModels = {
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
export type AuthRegisterRequest = (typeof AuthModels)['auth.register']['static']
export type AuthLoginRequest = (typeof AuthModels)['auth.login']['static']
