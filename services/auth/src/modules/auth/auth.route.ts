import type { createConfigService, responseMapper } from '@booking/shared'
import { jwt } from '@elysiajs/jwt'
import { Elysia } from 'elysia'
import { authModels } from './auth.model'
import type { IAuthService } from './auth.port'

type RouteDeps = {
  response: ReturnType<typeof responseMapper>
  cfg: ReturnType<typeof createConfigService>
}

export const authRouteV1 = (svc: IAuthService, deps: RouteDeps) =>
  new Elysia({ prefix: 'auth', tags: ['auth'] })
    .use(
      jwt({
        name: 'jwt',
        secret: deps.cfg.get('jwt_secret'),
        exp: deps.cfg.get('jwt_expiry'),
      }),
    )
    .model(authModels)

    .post(
      '/register',
      async ({ body }) => {
        await svc.register(body)
        return deps.response.success('Registered')
      },
      { body: 'auth.register' },
    )

    .post(
      '/login',
      async ({ body, jwt }) => {
        const identity = await svc.login(body)
        const token = await jwt.sign({ sub: identity.id, email: identity.email })
        return deps.response.success('Logged in', { token })
      },
      { body: 'auth.login' },
    )
