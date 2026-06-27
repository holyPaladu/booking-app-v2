import { authMacro, type createConfigService, type responseMapper } from '@booking/shared'
import { Elysia } from 'elysia'
import { twoFactorModels } from './two-factor.model'
import type { ITwoFactorService } from './two-factor.port'

type RouteDeps = {
  response: ReturnType<typeof responseMapper>
  cfg: ReturnType<typeof createConfigService>
}

// Управление 2FA. Все роуты под JWT (authMacro → currentUser). Завершение логина
// (/auth/login/2fa) живёт в auth.route — там выпускается access-токен.
export const twoFactorRouteV1 = (svc: ITwoFactorService, deps: RouteDeps) =>
  new Elysia({ prefix: 'auth/2fa', tags: ['auth'] })
    .use(authMacro(deps.cfg.get('jwt_secret')))
    .model(twoFactorModels)

    .post(
      '/setup',
      async ({ currentUser }) => {
        const data = await svc.setup(currentUser.id, currentUser.email)
        return deps.response.success('Two-factor setup initiated', data)
      },
      { auth: true },
    )

    .post(
      '/confirm',
      async ({ currentUser, body }) => {
        const data = await svc.confirm(currentUser.id, body.code)
        return deps.response.success('Two-factor enabled', data)
      },
      { auth: true, body: 'two-factor.code' },
    )

    .post(
      '/disable',
      async ({ currentUser, body }) => {
        await svc.disable(currentUser.id, body.code)
        return deps.response.success('Two-factor disabled')
      },
      { auth: true, body: 'two-factor.code' },
    )

    .post(
      '/recovery-codes/regenerate',
      async ({ currentUser, body }) => {
        const data = await svc.regenerateRecoveryCodes(currentUser.id, body.code)
        return deps.response.success('Recovery codes regenerated', data)
      },
      { auth: true, body: 'two-factor.code' },
    )
