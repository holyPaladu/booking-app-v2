import type { SqlClient } from '@booking/shared'
import type { IOutboxRepo, OutboxRow } from './outbox.port'

export const outboxRepo = (sql: SqlClient): IOutboxRepo => ({
  enqueue: async (job, exec = sql) => {
    await exec`
      INSERT INTO outbox (topic, payload)
      VALUES (${job.topic}, ${JSON.stringify(job.payload)}::jsonb)
    `
  },
  claimBatch: async (limit, exec = sql) => {
    return exec<OutboxRow[]>`
      SELECT id, topic, payload
      FROM outbox
      WHERE status = 'pending'
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    `
  },
  markSent: async (id, exec = sql) => {
    await exec`
      UPDATE outbox
      SET status = 'sent', sent_at = NOW(), payload = '{}'::jsonb
      WHERE id = ${id}
    `
  },
  markFailed: async (id, error, exec = sql) => {
    await exec`
      UPDATE outbox
      SET status = 'failed', attempts = attempts + 1, last_error = ${error}
      WHERE id = ${id}
    `
  },
})
