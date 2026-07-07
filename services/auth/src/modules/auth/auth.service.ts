import { ConflictError, NotFoundError, UnauthorizedError, TooManyRequestsError } from '@booking/shared'
import type { TxRunner } from '@lib/tx'
import type { IAuditService } from '@modules/audit'
import type { ILoginAttemptService } from '@modules/login-attempt'
import type { IOutboxService } from '@modules/outbox'
import type { ISessionService } from '@modules/session'
import type { ITwoFactorService } from '@modules/two-factor'
import type { IUserService } from '@modules/user'
import { AUDIT_EVENT, VERIFICATION_CHANNEL, VERIFICATION_TYPE } from './auth.const'
import type { IAuthRepo, IAuthService } from './auth.port'
import type { IHashService, IOtpService } from './auth.security'

const OTP_TTL_MS = 15 * 60 * 1000 // 15min

export type AuthServiceDeps = {
  users: IUserService
  repo: IAuthRepo
  audit: IAuditService
  loginAttempts: ILoginAttemptService
  session: ISessionService
  outbox: IOutboxService
  hash: IHashService
  otp: IOtpService
  twoFactor: ITwoFactorService
  runTx: TxRunner
}

export const authService = (deps: AuthServiceDeps): IAuthService => {
  const { users, repo, audit, loginAttempts, session, outbox, hash, otp, twoFactor, runTx } = deps

  return {
    register: async (dto) => {
      // 1. email занят? (мягкая проверка; реальный гард — idx_users_email_active)
      if (await users.getByEmail(dto.email))
        throw new ConflictError('Email already registered', 'ALREADY_EXISTS')

      // 2. телефон занят? (если передан)
      if (dto.phone && (await users.getByPhone(dto.phone)))
        throw new ConflictError('Phone already registered', 'ALREADY_EXISTS')

      // 3. тяжёлый argon2 — ДО транзакции, чтобы держать tx коротким.
      const passwordHash = await hash.hash(dto.password)

      // 4. OTP: наружу уйдёт код, в БД — только его хэш.
      const code = otp.generate()
      const tokenHash = otp.hash(code)
      const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()

      // 5. Критический путь атомарно: user + роль + verification_token + audit + outbox.
      //    Любой сбой → rollback, наружу честная ошибка, полусоздания нет.
      await runTx(async () => {
        const user = await users.create({
          email: dto.email,
          phone: dto.phone ?? null,
          passwordHash,
        })

        await repo.grantDefaultRole(user.id)

        await repo.createVerificationToken({
          userId: user.id,
          type: VERIFICATION_TYPE.EMAIL_CONFIRM,
          channel: VERIFICATION_CHANNEL.EMAIL,
          identifier: dto.email,
          tokenHash,
          expiresAt,
        })
        // Письмо — внешний side-effect: кладём задание в ТУ ЖЕ транзакцию,
        // отправит воркер уже после коммита (см. outbox.worker).
        await outbox.enqueue({
          topic: 'email.verification',
          payload: { email: dto.email, otp: code, expiresAt },
        })

        await audit.record({ userId: user.id, event: AUDIT_EVENT.ACCOUNT_CREATED })
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
        const reason = user.bannedReason && user.bannedAt ? user.bannedReason : 'User banned'
        throw new ConflictError(reason, 'USER_BANNED')
      }

      // 4. Пароль.
      const ok = await hash.verify(dto.password, user.passwordHash)
      if (!ok) {
        await loginAttempts.record(dto.email, ip, false)
        throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS')
      }

      // 5. 2FA-гейт: пароль верный, но при включённой 2FA токены не выдаём.
      //    Попытку фиксируем как успешную (это не brute-force), аудит login_success
      //    отложен до completeLogin. email/token_version уйдут в challenge-токен.
      if (await twoFactor.isEnabled(user.id)) {
        await loginAttempts.record(dto.email, ip, true)
        return {
          kind: 'two_factor_required',
          userId: user.id,
          email: user.email,
          tokenVersion: user.tokenVersion,
        }
      }

      // 6. Полный логин атомарно: сессия (refresh) + login_attempt + audit.
      return await runTx(async () => {
        const issued = await session.issue({
          userId: user.id,
          tokenVersion: user.tokenVersion,
          ip,
          userAgent,
        })
        await loginAttempts.record(dto.email, ip, true)
        await audit.record({ userId: user.id, event: AUDIT_EVENT.LOGIN_SUCCESS })

        return {
          kind: 'authenticated',
          identity: { id: user.id, email: user.email },
          refreshToken: issued.refreshToken,
          refreshExpiresAt: issued.expiresAt,
        }
      })
    },

    completeLogin: async (input, code, ctx) => {
      const { ip, userAgent } = ctx

      // Тот же троттлинг, что и в startLogin: /login/2fa — отдельный эндпоинт, поэтому
      // защищаем его от перебора TOTP/recovery независимо.
      await loginAttempts.checkLimit(input.email, ip)

      try {
        // Проверка 2FA-кода и выпуск сессии — атомарно (списание recovery-кода
        // откатится вместе с сессией при сбое).
        return await runTx(async () => {
          await twoFactor.verifyForLogin(input.userId, code)
          const issued = await session.issue({
            userId: input.userId,
            tokenVersion: input.tokenVersion,
            ip,
            userAgent,
          })
          await loginAttempts.record(input.email, ip, true)
          await audit.record({ userId: input.userId, event: AUDIT_EVENT.LOGIN_SUCCESS })

          return {
            identity: { id: input.userId, email: input.email },
            refreshToken: issued.refreshToken,
            refreshExpiresAt: issued.expiresAt,
          }
        })
      } catch (err) {
        // Неверный код — фиксируем неудачную попытку (вне откаченной транзакции).
        if (err instanceof UnauthorizedError) await loginAttempts.record(input.email, ip, false)
        throw err
      }
    },

    rotateToken: async (refreshToken, ctx) => {
      const current = await session.findSession(refreshToken)
      if (!current) throw new UnauthorizedError('Invalid refresh token', 'INVALID_TOKEN')

      // Повторное предъявление уже ротированного (used) токена — признак кражи:
      // гасим всю «семью» сессий этого юзера с этой версией и отклоняем. Делаем это
      // ВНЕ runTx ниже, чтобы отзыв сохранился несмотря на брошенную ошибку.
      if (current.used) {
        await session.revokeAllByUserIdAndTokenVersion(current.userId, current.tokenVersion)
        throw new UnauthorizedError('Refresh token reuse detected', 'TOKEN_REUSED')
      }

      if (current.expiresAt.getTime() <= Date.now())
        throw new UnauthorizedError('Refresh token expired', 'TOKEN_EXPIRED')

      // token_version юзера вырос (logout-all / ban / смена пароля) → сессия отозвана.
      const user = await users.getCredentialsById(current.userId)
      if (!user || user.tokenVersion !== current.tokenVersion)
        throw new UnauthorizedError('Session revoked', 'SESSION_REVOKED')

      // Ротация атомарно: старый токен → tombstone (used, для reuse-детекции),
      // выпуск новой сессии, аудит. Access-JWT подпишет роут из вернувшегося identity.
      return await runTx(async () => {
        await session.markUsed(current.id)
        const issued = await session.issue({
          userId: user.id,
          tokenVersion: user.tokenVersion,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        })
        await audit.record({ userId: user.id, event: AUDIT_EVENT.TOKEN_REFRESHED })

        return {
          identity: { id: user.id, email: user.email },
          refreshToken: issued.refreshToken,
          refreshExpiresAt: issued.expiresAt,
        }
      })
    },

    revokeToken: async (dto) => {
      // Идемпотентный logout: находим сессию по предъявленному refresh-токену.
      // Нет такой (уже отозвана/ротирована) — считаем разлогин состоявшимся, тихо выходим.
      const current = await session.findSession(dto.refreshToken)
      if (!current) return

      // Access-токен подтвердил личность (auth: true), но refresh должен принадлежать
      // тому же юзеру — чужую сессию по чужому токену не гасим.
      if (current.userId !== dto.userId)
        throw new UnauthorizedError('Invalid refresh token', 'INVALID_TOKEN')

      // Отзыв атомарно: удаляем сессию (DELETE, как revokeAll) + аудит logout.
      await runTx(async () => {
        await session.revokeById(current.id)
        await audit.record({ userId: dto.userId, event: AUDIT_EVENT.LOGOUT })
      })
    },

    /**
     * Verify Email
     */
    verifyEmail: async (email, code) => {
      const findToken = await repo.findAvailableVerificationToken(email, VERIFICATION_TYPE.EMAIL_CONFIRM)
      if (!findToken) throw new NotFoundError("Verification token")

      if (findToken.attempts >= findToken.maxAttempts)
        throw new TooManyRequestsError("Verification attempt limit exceeded")

      if (!otp.verify(code, findToken.tokenHash)) {
        const { attempts } = await repo.changeAttemptVerificationToken(findToken.id)
        if (attempts >= findToken.maxAttempts)
          throw new TooManyRequestsError("Verification attempt limit exceeded")
        else
          throw new ConflictError("Invalid verification code")
      }

      await deps.runTx(async () => {
        await repo.markVerificationTokenAsUsed(findToken.id)
        await deps.users.patchEmailVerified(findToken.userId)
      })
    },
    verifyEmailResend: async () => {
      return
    }
  }
}
