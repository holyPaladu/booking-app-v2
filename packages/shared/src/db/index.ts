import postgres, { type Sql, type TransactionSql } from 'postgres'

// ─── Connection factory ────────────────────────────────────────
export function createDatabase(connectionString: string): Sql<Record<string, never>> {
  return postgres(connectionString, {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
    transform: {
      column: (col) => col,
    },
    debug: Bun.env.NODE_ENV === 'development',
    onnotice: () => {},
  })
}

export type SqlClient = Sql<Record<string, never>>
export type TxClient = TransactionSql<Record<string, never>>

// ─── Transaction helper ────────────────────────────────────────
export function withTransaction<T>(sql: SqlClient, fn: (tx: TxClient) => Promise<T>) {
  return sql.begin(async (tx: TxClient) => {
    return fn(tx)
  })
}

// ─── Health check ──────────────────────────────────────────────
export async function checkDatabaseHealth(sql: SqlClient): Promise<boolean> {
  try {
    await sql`SELECT 1`
    return true
  } catch {
    return false
  }
}
