import type { Executor } from '@lib/tx'
import type { OutboxJob, OutboxRow } from './outbox.entity'

export type { OutboxJob, OutboxRow } from './outbox.entity'

// Контракт SQL-слоя: enqueue + разбор (claim/mark) для воркера.
export type IOutboxRepo = {
  enqueue: (job: OutboxJob, exec?: Executor) => Promise<void>
  // Захватывает пачку pending-строк с FOR UPDATE SKIP LOCKED — звать внутри транзакции.
  claimBatch: (limit: number, exec?: Executor) => Promise<OutboxRow[]>
  markSent: (id: string, exec?: Executor) => Promise<void>
  markFailed: (id: string, error: string, exec?: Executor) => Promise<void>
}

// Публичная поверхность модуля — потребители (auth) кладут задания только через неё.
export type IOutboxService = {
  enqueue: (job: OutboxJob, exec?: Executor) => Promise<void>
}
