import type { SqlClient, createConfigService } from '@booking/shared'
import { type TxRunner, createTx } from '@lib/tx'
import { type IAuditService, auditRepo, auditService } from '@modules/audit'
import {
  type IAuthService,
  type INotifier,
  authRepo,
  authService,
  hashService,
  logNotifier,
  otpService,
  refreshTokenService,
} from '@modules/auth'
import {
  type ILoginAttemptService,
  loginAttemptRepo,
  loginAttemptService,
} from '@modules/login-attempt'
import { type IOutboxRepo, type IOutboxService, outboxRepo, outboxService } from '@modules/outbox'
import { type ISessionService, sessionRepo, sessionService } from '@modules/session'
import {
  type ITwoFactorService,
  twoFactorRepo,
  twoFactorSecurity,
  twoFactorService,
} from '@modules/two-factor'
import { type IUserService, userRepo, userService } from '@modules/user'

type Cfg = ReturnType<typeof createConfigService>

// Собранный граф зависимостей auth-сервиса: сервисы для HTTP-слоя + то, что нужно воркерам.
export type Container = {
  services: {
    users: IUserService
    audit: IAuditService
    loginAttempts: ILoginAttemptService
    sessions: ISessionService
    outbox: IOutboxService
    twoFactor: ITwoFactorService
    auth: IAuthService
  }
  outboxRepo: IOutboxRepo // воркеру нужны claim/mark, наружу сервиса не торчат
  notifier: INotifier
  runTx: TxRunner
}

// Composition root: только проводка (репо → сервисы, межмодульные связи через порты).
// Транзакционность — через ambient-контекст createTx: репо/сервисы `exec` не протаскивают.
export function buildContainer(sql: SqlClient, cfg: Cfg): Container {
  const { db, runTx } = createTx(sql)

  const users = userService(userRepo(db))
  const audit = auditService(auditRepo(db))
  const loginAttempts = loginAttemptService(loginAttemptRepo(db))
  const sessions = sessionService(
    refreshTokenService(),
    sessionRepo(db),
    {
      ttlDays: cfg.getNumber('refresh_ttl_days'),
    }
  )
  const outboxRepository = outboxRepo(db)
  const outbox = outboxService(outboxRepository)
  const notifier = logNotifier()

  const twoFactor = twoFactorService({
    repo: twoFactorRepo(db),
    audit,
    security: twoFactorSecurity({
      encKey: cfg.get('two_factor_enc_key'),
      issuer: cfg.get('two_factor_issuer'),
      window: cfg.getNumber('two_factor_window'),
      recoveryCodesCount: cfg.getNumber('recovery_codes_count'),
    }),
    runTx,
  })

  const auth = authService({
    users,
    repo: authRepo(db),
    audit,
    loginAttempts,
    session: sessions,
    outbox,
    hash: hashService(),
    otp: otpService(),
    twoFactor,
    runTx,
  })

  return {
    services: { users, audit, loginAttempts, sessions, outbox, twoFactor, auth },
    outboxRepo: outboxRepository,
    notifier,
    runTx,
  }
}
