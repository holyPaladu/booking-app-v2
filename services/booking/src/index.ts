import { createDatabase, mapError, responseMapper } from '@booking/shared'
import { Elysia } from 'elysia'
import { cfg } from './config'
import { runMigrations } from './migrations'
import { bookingRepo } from './modules/bookings/repo'
import { bookingService } from './modules/bookings/service'
import { bookingRouteV1 } from './modules/bookings/v1.route'

async function bootstrap() {
  const response = responseMapper()
  const sql = createDatabase(cfg.get('db_url'))
  await runMigrations(sql)

  const repo = bookingRepo(sql)
  const svc = bookingService(repo)

  const app = new Elysia()
    .onError(({ code, error, set }) => {
      const { status, body } = mapError(code, error, response)
      set.status = status
      return body
    })
    .get('/health', () => response.success<{ status: 'ok' }>('Service live!', { status: 'ok' }))
    .group('/api', (api) =>
      api.group('/v1', (v1) => v1.use(bookingRouteV1(svc, { response, cfg }))),
    )
    .listen(cfg.getNumber('port'))

  console.log(`🦊 booking is running at ${app.server?.hostname}:${app.server?.port}`)
}

bootstrap().catch((err) => console.error(err))
