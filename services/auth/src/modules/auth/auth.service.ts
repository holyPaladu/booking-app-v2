import { ConflictError, NotFoundError, UnauthorizedError } from '@booking/shared'
import type { Executor, TxRunner } from '@lib/tx'
import type { IAuditService } from '@modules/audit/audit.port'
import type { ILoginAttemptService } from '@modules/login-attempt/login-attempt.port'
import type { IOutboxService } from '@modules/outbox/outbox.port'
import type { ISessionService } from '@modules/session/session.port'
import type { IUserService } from '@modules/user/user.port'
import { AUDIT_EVENT, VERIFICATION_CHANNEL, VERIFICATION_TYPE } from './auth.const'
import type { IAuthRepo, IAuthService } from './auth.port'
import type { IHashService, IOtpService } from './auth.security'

const OTP_TTL_MS = 15 * 60 * 1000

export type AuthServiceDeps = {
  users: IUserService
  repo: IAuthRepo
  audit: IAuditService
  loginAttempts: ILoginAttemptService
  session: ISessionService
  outbox: IOutboxService
  hash: IHashService
  otp: IOtpService
  runTx: TxRunner
}

export const authService = (deps: AuthServiceDeps): IAuthService => {
  const { users, repo, audit, loginAttempts, session, outbox, hash, otp, runTx } = deps

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

    startLogin: async (dto, ctx) => {
      const { ip, userAgent } = ctx

      // 1. Throttle — до тяжёлого argon2.verify.
      await loginAttempts.checkLimit(dto.email, ip)

      // 2. Существование.
      const user = await users.getByEmail(dto.email)
      if (!user) {
        await loginAttempts.record(dto.email, ip, false)
        throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS')
      }

      // 3. Статус.
      if (user.status === 'deleted') {
        throw new NotFoundError('Not found user', 'NOT_FOUND')
      }
      if (user.status === 'banned') {
        const reason = user.banned_reason && user.banned_at ? user.banned_reason : 'User banned'
        throw new ConflictError(reason, 'USER_BANNED')
      }

      // 4. Пароль.
      const ok = await hash.verify(dto.password, user.password_hash)
      if (!ok) {
        await loginAttempts.record(dto.email, ip, false)
        throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS')
      }

      // 5. 2FA-гейт: пароль верный, но при включённой 2FA токены не выдаём.
      //    Попытку фиксируем как успешную (это не brute-force), аудит login_success
      //    отложен до завершения 2FA (отдельный эндпоинт).
      if (await repo.isTwoFactorEnabled(user.id)) {
        await loginAttempts.record(dto.email, ip, true)
        return { kind: 'two_factor_required', userId: user.id }
      }

      // 6. Полный логин атомарно: сессия (refresh) + login_attempt + audit.
      return await runTx(async (tx: Executor) => {
        const issued = await session.issue(
          { userId: user.id, tokenVersion: user.token_version, ip, userAgent },
          tx,
        )
        await loginAttempts.record(dto.email, ip, true, tx)
        await audit.record({ user_id: user.id, event: AUDIT_EVENT.LOGIN_SUCCESS }, tx)

        return {
          kind: 'authenticated',
          identity: { id: user.id, email: user.email },
          refreshToken: issued.refreshToken,
          refreshExpiresAt: issued.expiresAt,
        }
      })
    },
  }
}
