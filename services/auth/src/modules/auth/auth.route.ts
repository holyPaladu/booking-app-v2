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
      async ({ body, jwt, server, request }) => {
        const ip = server?.requestIP(request)?.address ?? null
        const userAgent = request.headers.get('user-agent') ?? null

        const result = await svc.startLogin(body, { ip, userAgent })

        if (result.kind === 'two_factor_required')
          return deps.response.success('Two-factor required', {
            two_factor_required: true,
            user_id: result.userId,
          })

        const access_token = await jwt.sign({
          sub: result.identity.id,
          email: result.identity.email,
        })
        return deps.response.success('Logged in', {
          access_token,
          refresh_token: result.refreshToken,
          token_type: 'Bearer',
        })
      },
      { body: 'auth.login' },
    )
