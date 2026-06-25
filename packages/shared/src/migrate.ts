import type { SqlClient, TxClient } from './db'

export type Migration = {
  version: string
  up: (sql: SqlClient) => Promise<void>
}

/**
 * Простой forward-only раннер миграций. Каждый сервис передаёт свой список
 * MIGRATIONS; применённые версии трекаются в таблице `schema_migrations`.
 */
export async function applyMigrations(sql: SqlClient, migrations: Migration[]): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         SERIAL      PRIMARY KEY,
      version    VARCHAR(64) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  const applied = await sql<{ version: string }[]>`
    SELECT version FROM schema_migrations ORDER BY version
  `
  const appliedSet = new Set(applied.map((r) => r.version))

  for (const migration of migrations) {
    if (appliedSet.has(migration.version)) continue

    console.log(`[migration] applying ${migration.version}...`)

    await sql.begin(async (tx: TxClient) => {
      await migration.up(tx as unknown as SqlClient)
      await tx`INSERT INTO schema_migrations (version) VALUES (${migration.version})`
    })

    console.log(`[migration] ${migration.version} done`)
  }
}
