import type { TxRunner } from '@lib/tx'
import type { IOutboxRepo } from './outbox'

// Обработчик одного topic: получает payload, выполняет доставку. Карта обработчиков
// передаётся из composition root — outbox остаётся generic и не знает про auth/notifier.
export type OutboxHandlers = Record<string, (payload: Record<string, unknown>) => Promise<void>>

type WorkerDeps = {
  runTx: TxRunner
  outbox: IOutboxRepo
  handlers: OutboxHandlers
}

type WorkerOptions = {
  intervalMs: number
  batchSize?: number
}

// Простой in-process поллер. Захватывает пачку pending-строк (FOR UPDATE SKIP
// LOCKED), доставляет и помечает sent/failed в той же транзакции (через runTx —
// claim/mark берут ambient-tx из @lib/tx).
// NB: для реального медленного провайдера лучше claim → commit → send → mark,
// чтобы не держать блокировку строки во время сетевого I/O.
export function startOutboxWorker(deps: WorkerDeps, opts: WorkerOptions): { stop: () => void } {
  const batchSize = opts.batchSize ?? 20
  let running = false

  const tick = async () => {
    if (running) return
    running = true
    try {
      await deps.runTx(async () => {
        const rows = await deps.outbox.claimBatch(batchSize)
        for (const row of rows) {
          const handler = deps.handlers[row.topic]
          try {
            if (!handler) throw new Error(`no handler for outbox topic: ${row.topic}`)
            await handler(row.payload)
            await deps.outbox.markSent(row.id)
          } catch (err) {
            await deps.outbox.markFailed(row.id, String(err))
          }
        }
      })
    } catch (err) {
      console.error('[outbox] poll failed:', err)
    } finally {
      running = false
    }
  }

  const timer = setInterval(tick, opts.intervalMs)
  return { stop: () => clearInterval(timer) }
}
