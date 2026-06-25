import type { createConfigService, responseMapper } from '@booking/shared'
import { jwt } from '@elysiajs/jwt'
import { Elysia } from 'elysia'
import { AuthModels } from './models'
import type { authService } from './service'

type routeDepends = {
  response: ReturnType<typeof responseMapper>
  cfg: ReturnType<typeof createConfigService>
}

export const authRouteV1 = (svc: ReturnType<typeof authService>, deps: routeDepends) => {
  return new Elysia({ prefix: 'auth', tags: ['auth'] })
    .use(
      jwt({
        name: 'jwt',
        secret: deps.cfg.get('jwt_secret'),
        exp: deps.cfg.get('jwt_expiry'),
      }),
    )
    .model(AuthModels)
}
