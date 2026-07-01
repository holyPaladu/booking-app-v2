// Публичная поверхность модуля outbox (@modules/outbox).
export { outboxRepo, outboxService } from './outbox'
export { startOutboxWorker } from './outbox.worker'
export type { OutboxHandlers } from './outbox.worker'
export type { IOutboxRepo, IOutboxService, OutboxJob, OutboxRow } from './outbox'
