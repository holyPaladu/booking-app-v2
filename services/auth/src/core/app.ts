import { type createConfigService, mapError, responseMapper } from '@booking/shared'
import { DB_CONSTRAINTS } from '@lib/db-constraints'
import { authRouteV1 } from '@modules/auth'
import { twoFactorRouteV1 } from '@modules/two-factor'
import { userRouteV1 } from '@modules/user'
import { Elysia } from 'elysia'
import type { Container } from './container'

type Cfg = ReturnType<typeof createConfigService>

// HTTP-слой: глобальный onError (доменные ошибки + нарушения БД-констрейнтов → статусы),
// health и роуты v1. Сервисы берём из собранного контейнера.
  export function buildApp(container: Container, cfg: Cfg) {
    const response = responseMapper()
    const { users, auth, twoFactor } = container.services

    return new Elysia()
      .onError(({ code, error, set }) => {
        const { status, body } = mapError(code, error, response, DB_CONSTRAINTS)
        set.status = status
        return body
      })
      .get('/health', () => response.success<{ status: 'ok' }>('Service live!', { status: 'ok' }))
      .group('/api', (api) =>
        api.group('/v1', (v1) =>
          v1
            .use(userRouteV1(users, { response, cfg }))
            .use(authRouteV1(auth, { response, cfg }))
            .use(twoFactorRouteV1(twoFactor, { response, cfg })),
      ),
    )
}
