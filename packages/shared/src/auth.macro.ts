import { jwt } from '@elysiajs/jwt'
import { Elysia } from 'elysia'
import { UnauthorizedError } from './error/error.lib'

/**
 * Request-зависимый сервис по best practice Elysia: macro `auth`.
 * Верифицирует заголовок `Authorization: Bearer <token>` и резолвит `currentUser`
 * в контекст. Подключение к защищённому роуту:
 *
 *   app.use(authMacro(cfg.get('jwt_secret')))
 *      .get('/me', ({ currentUser }) => currentUser, { auth: true })
 *
 * Общий для всех сервисов (auth, booking). Дедупликация плагина — через `name`.
 */
export const authMacro = (secret: string) =>
  new Elysia({ name: 'auth.macro' }).use(jwt({ name: 'jwt', secret })).macro({
    auth: {
      async resolve({ jwt, headers: { authorization } }) {
        if (!authorization?.startsWith('Bearer '))
          throw new UnauthorizedError('Missing bearer token', 'UNAUTHORIZED')

        const payload = await jwt.verify(authorization.slice(7))
        if (!payload) throw new UnauthorizedError('Invalid or expired token', 'UNAUTHORIZED')

        return {
          currentUser: {
            id: payload.sub as string,
            email: payload.email as string,
          },
        }
      },
    },
  })
