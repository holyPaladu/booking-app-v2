import type { createConfigService } from '@booking/shared'
import { startOutboxWorker } from '@modules/outbox'
import type { Container } from '../core/container'

type Cfg = ReturnType<typeof createConfigService>

// Фоновые задачи. Пока одна: доставка outbox после коммита; topic → обработчик
// (см. outbox.worker — generic, про auth/notifier не знает).
export function startWorkers(container: Container, cfg: Cfg) {
  startOutboxWorker(
    {
      runTx: container.runTx,
      outbox: container.outboxRepo,
      handlers: {
        'email.verification': (p) =>
          container.notifier.sendVerification({
            email: p.email as string,
            otp: p.otp as string,
            expiresAt: p.expiresAt as string,
          }),
      },
    },
    { intervalMs: cfg.getNumber('outbox_poll_ms') },
  )
}
