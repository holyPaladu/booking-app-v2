import type { IOutboxRepo, IOutboxService } from './outbox.port'

// Публичная поверхность outbox для других модулей: только enqueue.
// claim/markSent/markFailed — внутренняя кухня воркера, наружу не торчат.
export const outboxService = (repo: IOutboxRepo): IOutboxService => ({
  enqueue: (job, exec) => repo.enqueue(job, exec),
})
