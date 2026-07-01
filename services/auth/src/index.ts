import { createDatabase } from '@booking/shared'
import { buildApp } from './app'
import { cfg } from './config'
import { buildContainer } from './container'
import { runMigrations } from './migrations'
import { startWorkers } from './workers'

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
