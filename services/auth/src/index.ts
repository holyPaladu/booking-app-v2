import { createDatabase, mapError, responseMapper } from '@booking/shared'
import { Elysia } from 'elysia'
import { cfg } from './config'
import { runMigrations } from './migrations'

import { authRouteV1, userRouteV1 } from '@modules/routes/v1'
import { userRepo } from './modules/repositories/user.repo'
import { authService } from './modules/services/auth.service'
import { userService } from './modules/services/user.service'
import { hashService } from '@modules/services/hash.service'

async function bootstrap() {
  const response = responseMapper()
  const sql = createDatabase(cfg.get('db_url'))
  await runMigrations(sql)

  const hash = hashService()
  const users = userService(userRepo(sql))
  const auth = authService(users, hash)

  const app = new Elysia()
    .onError(({ code, error, set }) => {
      const { status, body } = mapError(code, error, response)
      set.status = status
      return body
    })
    .get('/health', () => response.success<{ status: 'ok' }>('Service live!', { status: 'ok' }))
    .group('/api', (api) => api
      .group('/v1', (v1) => v1
        .use(userRouteV1(users, { response, cfg }))
        .use(authRouteV1(auth, { response, cfg }))
      )
    )
    .listen(cfg.getNumber('port'))

  console.log(`🦊 auth is running at ${app.server?.hostname}:${app.server?.port}`)
}

bootstrap().catch((err) => console.error(err))
