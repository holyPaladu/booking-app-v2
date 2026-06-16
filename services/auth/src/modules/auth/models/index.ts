import { t } from 'elysia'

export const AuthModels = {
  'auth.register': t.Object({
    email: t.String({ format: 'email' }),
    password: t.String({ minLength: 6 })
  }),
  'auth.login': t.Object({
    email: t.String({ format: 'email' }),
    password: t.String({ minLength: 6 })
  })
}