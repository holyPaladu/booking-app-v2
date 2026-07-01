import type { Db } from '@lib/tx'

// Задание на доставку внешнего side-effect (письмо). Пишется в ТУ ЖЕ транзакцию,
// что и регистрация, — воркер разбирает его после коммита.
export type OutboxJob = {
  topic: string
  payload: Record<string, unknown>
}

export type OutboxRow = {
  id: string
  topic: string
  payload: Record<string, unknown>
}

// Контракт SQL-слоя: enqueue + разбор (claim/mark) для воркера. Транзакционность —
// через ambient-контекст (@lib/tx): claim/mark воркер зовёт внутри runTx.
export type IOutboxRepo = {
  enqueue: (job: OutboxJob) => Promise<void>
  claimBatch: (limit: number) => Promise<OutboxRow[]>
  markSent: (id: string) => Promise<void>
  markFailed: (id: string, error: string) => Promise<void>
}

// Публичная поверхность модуля — потребители (auth) кладут задания только через неё.
export type IOutboxService = {
  enqueue: (job: OutboxJob) => Promise<void>
}

export const outboxRepo = (db: Db): IOutboxRepo => ({
  enqueue: async (job) => {
    const sql = db()
    await sql`
      INSERT INTO outbox (topic, payload)
      VALUES (${job.topic}, ${JSON.stringify(job.payload)}::jsonb)
    `
  },
  claimBatch: async (limit) => {
    const sql = db()
    return sql<OutboxRow[]>`
      SELECT id, topic, payload
      FROM outbox
      WHERE status = 'pending'
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    `
  },
  markSent: async (id) => {
    const sql = db()
    await sql`
      UPDATE outbox
      SET status = 'sent', sent_at = NOW(), payload = '{}'::jsonb
      WHERE id = ${id}
    `
  },
  markFailed: async (id, error) => {
    const sql = db()
    await sql`
      UPDATE outbox
      SET status = 'failed', attempts = attempts + 1, last_error = ${error}
      WHERE id = ${id}
    `
  },
})

// Публичная поверхность outbox для других модулей: только enqueue.
// claim/markSent/markFailed — внутренняя кухня воркера, наружу не торчат.
export const outboxService = (repo: IOutboxRepo): IOutboxService => ({
  enqueue: (job) => repo.enqueue(job),
})
