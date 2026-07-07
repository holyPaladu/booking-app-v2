import { createDatabase } from '@booking/shared'
import { buildApp } from './core/app'
import { cfg } from './core/config'
import { buildContainer } from './core/container'
import { startWorkers } from './workers/worker'
import { runMigrations } from './migrations'

// Bootstrap: config → db → migrations → composition root (container) → workers → HTTP.
async function bootstrap() {
  const sql = createDatabase(cfg.get('db_url'))
  await runMigrations(sql)

  const container = buildContainer(sql, cfg)
  // startWorkers(container, cfg)

  const app = buildApp(container, cfg).listen(cfg.getNumber('port'))

  console.log(`🦊 auth is running at ${app.server?.hostname}:${app.server?.port}`)
}

bootstrap().catch((err) => console.error(err))
