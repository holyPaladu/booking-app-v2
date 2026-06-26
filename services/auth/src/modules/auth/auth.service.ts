import { ConflictError, UnauthorizedError } from '@booking/shared'
import type { Executor, TxRunner } from '@lib/tx'
import type { IAuditService } from '@modules/audit/audit.port'
import type { IOutboxService } from '@modules/outbox/outbox.port'
import type { IUserService } from '@modules/user/user.port'
import { AUDIT_EVENT, VERIFICATION_CHANNEL, VERIFICATION_TYPE } from './auth.const'
import type { IAuthRepo, IAuthService } from './auth.port'
import type { IHashService, IOtpService } from './auth.security'

const OTP_TTL_MS = 15 * 60 * 1000

export type AuthServiceDeps = {
  users: IUserService
  repo: IAuthRepo
  audit: IAuditService
  outbox: IOutboxService
  hash: IHashService
  otp: IOtpService
  runTx: TxRunner
}

export const authService = (deps: AuthServiceDeps): IAuthService => {
  const { users, repo, audit, outbox, hash, otp, runTx } = deps

  return {
    register: async (dto) => {
      // 1. email занят? (мягкая проверка; реальный гард — idx_users_email_active)
      if (await users.getByEmail(dto.email))
        throw new ConflictError('Email already registered', 'ALREADY_EXISTS')

      // 2. телефон занят? (если передан)
      if (dto.phone && (await users.getByPhone(dto.phone)))
        throw new ConflictError('Phone already registered', 'ALREADY_EXISTS')

      // 3. тяжёлый argon2 — ДО транзакции, чтобы держать tx коротким.
      const password_hash = await hash.hash(dto.password)

      // 4. OTP: наружу уйдёт код, в БД — только его хэш.
      const code = otp.generate()
      const token_hash = otp.hash(code)
      const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()

      // 5. Критический путь атомарно: user + роль + verification_token + audit + outbox.
      //    Любой сбой → rollback, наружу честная ошибка, полусоздания нет.
      await runTx(async (tx: Executor) => {
        const user = await users.create(
          { email: dto.email, phone: dto.phone ?? null, password_hash },
          tx,
        )

        await repo.grantDefaultRole(user.id, tx)

        await repo.createVerificationToken(
          {
            user_id: user.id,
            type: VERIFICATION_TYPE.EMAIL_CONFIRM,
            channel: VERIFICATION_CHANNEL.EMAIL,
            identifier: dto.email,
            token_hash,
            expires_at: expiresAt,
          },
          tx,
        )

        await audit.record({ user_id: user.id, event: AUDIT_EVENT.ACCOUNT_CREATED }, tx)

        // Письмо — внешний side-effect: кладём задание в ТУ ЖЕ транзакцию,
        // отправит воркер уже после коммита (см. outbox.worker).
        await outbox.enqueue(
          {
            topic: 'email.verification',
            payload: { email: dto.email, otp: code, expires_at: expiresAt },
          },
          tx,
        )
      })
    },

    login: async (dto) => {
      const user = await users.getByEmail(dto.email)
      if (!user) throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS')

      const ok = await hash.verify(dto.password, user.password_hash)
      if (!ok) throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS')

      return { id: user.id, email: user.email }
    },
  }
}
