import { createDatabase, mapError, responseMapper, withTransaction } from '@booking/shared'
import { Elysia } from 'elysia'
import { cfg } from './config'
import { runMigrations } from './migrations'

import { DB_CONSTRAINTS } from '@lib/db-constraints'
import type { Executor, TxRunner } from '@lib/tx'
import { auditRepo } from '@modules/audit/audit.repo'
import { auditService } from '@modules/audit/audit.service'
import { logNotifier } from '@modules/auth/auth.notifier'
import { authRepo } from '@modules/auth/auth.repo'
import { authRouteV1 } from '@modules/auth/auth.route'
import { hashService, otpService } from '@modules/auth/auth.security'
import { authService } from '@modules/auth/auth.service'
import { outboxRepo } from '@modules/outbox/outbox.repo'
import { outboxService } from '@modules/outbox/outbox.service'
import { startOutboxWorker } from '@modules/outbox/outbox.worker'
import { userRepo } from '@modules/user/user.repo'
import { userRouteV1 } from '@modules/user/user.route'
import { userService } from '@modules/user/user.service'

async function bootstrap() {
  const response = responseMapper()
  const sql = createDatabase(cfg.get('db_url'))
  await runMigrations(sql)

  // Модули
  const users = userService(userRepo(sql))
  const audit = auditService(auditRepo(sql))
  const outbox = outboxRepo(sql) // repo: enqueue + claim/mark (для воркера)
  const notifier = logNotifier()
  const runTx: TxRunner = <T>(work: (tx: Executor) => Promise<T>) =>
    withTransaction(sql, work) as Promise<T>

  const auth = authService({
    users,
    repo: authRepo(sql),
    audit,
    outbox: outboxService(outbox), // наружу — только enqueue (service-порт)
    hash: hashService(),
    otp: otpService(),
    runTx,
  })

  // Доставка outbox после коммита; topic → обработчик (см. outbox.worker — generic).
  startOutboxWorker(
    {
      sql,
      outbox,
      handlers: {
        'email.verification': (p) =>
          notifier.sendVerification({
            email: p.email as string,
            otp: p.otp as string,
            expiresAt: p.expires_at as string,
          }),
      },
    },
    { intervalMs: cfg.getNumber('outbox_poll_ms') },
  )

  const app = new Elysia()
    .onError(({ code, error, set }) => {
      const { status, body } = mapError(code, error, response, DB_CONSTRAINTS)
      set.status = status
      return body
    })
    .get('/health', () => response.success<{ status: 'ok' }>('Service live!', { status: 'ok' }))
    .group('/api', (api) =>
      api.group('/v1', (v1) =>
        v1.use(userRouteV1(users, { response, cfg })).use(authRouteV1(auth, { response, cfg })),
      ),
    )
    .listen(cfg.getNumber('port'))

  console.log(`🦊 auth is running at ${app.server?.hostname}:${app.server?.port}`)
}

bootstrap().catch((err) => console.error(err))
