import { BadRequestError, ConflictError, UnauthorizedError } from '@booking/shared'
import type { Executor, TxRunner } from '@lib/tx'
import type { IAuditService } from '@modules/audit/audit.port'
import { TWO_FACTOR_AUDIT } from './two-factor.const'
import type { ITwoFactorRepo, ITwoFactorService } from './two-factor.port'
import type { ITwoFactorSecurity } from './two-factor.security'

export type TwoFactorServiceDeps = {
  repo: ITwoFactorRepo
  audit: IAuditService
  security: ITwoFactorSecurity
  runTx: TxRunner
}

export const twoFactorService = (deps: TwoFactorServiceDeps): ITwoFactorService => {
  const { repo, audit, security, runTx } = deps

  // Достаём активный (enabled) секрет либо бросаем — общий гард disable/regenerate.
  const requireEnabledSecret = async (userId: string) => {
    const row = await repo.getSecret(userId)
    if (!row || !row.enabled) throw new BadRequestError('Two-factor not enabled', '2FA_NOT_ENABLED')
    return row
  }

  // Генерим N recovery-кодов, кладём в БД только их хэши, возвращаем открытый текст
  // (показывается пользователю один раз).
  const issueRecoveryCodes = async (userId: string, tx: Executor) => {
    const recovery_codes = security.generateRecoveryCodes()
    await repo.insertRecoveryCodes(userId, recovery_codes.map(security.hashRecoveryCode), tx)
    return recovery_codes
  }

  return {
    isEnabled: (userId, exec) => repo.isEnabled(userId, exec),

    setup: async (userId, email) => {
      if (await repo.isEnabled(userId))
        throw new ConflictError('Two-factor already enabled', '2FA_ALREADY_ENABLED')

      const secret = security.generateSecret()
      await repo.upsertSecret(userId, await security.encryptSecret(secret))
      return { secret, otpauth_uri: security.otpauthUri(email, secret) }
    },

    confirm: async (userId, code) => {
      const row = await repo.getSecret(userId)
      if (!row) throw new BadRequestError('Two-factor setup not started', '2FA_NOT_STARTED')
      if (row.enabled)
        throw new BadRequestError('Two-factor already enabled', '2FA_ALREADY_ENABLED')

      const secret = await security.decryptSecret(row.secret_enc)
      if (!(await security.verifyTotp(secret, code)))
        throw new BadRequestError('Invalid code', 'INVALID_OTP')

      return await runTx(async (tx) => {
        await repo.enable(userId, tx)
        const recovery_codes = await issueRecoveryCodes(userId, tx)
        await audit.record({ user_id: userId, event: TWO_FACTOR_AUDIT.ENABLED }, tx)
        return { recovery_codes }
      })
    },

    disable: async (userId, code) => {
      const row = await requireEnabledSecret(userId)
      if (!(await security.verifyTotp(await security.decryptSecret(row.secret_enc), code)))
        throw new BadRequestError('Invalid code', 'INVALID_OTP')

      await runTx(async (tx) => {
        await repo.deleteRecoveryCodes(userId, tx)
        await repo.deleteSecret(userId, tx)
        await audit.record({ user_id: userId, event: TWO_FACTOR_AUDIT.DISABLED }, tx)
      })
    },

    regenerateRecoveryCodes: async (userId, code) => {
      const row = await requireEnabledSecret(userId)
      if (!(await security.verifyTotp(await security.decryptSecret(row.secret_enc), code)))
        throw new BadRequestError('Invalid code', 'INVALID_OTP')

      return await runTx(async (tx) => {
        await repo.deleteRecoveryCodes(userId, tx)
        return { recovery_codes: await issueRecoveryCodes(userId, tx) }
      })
    },

    verifyForLogin: async (userId, code, exec) => {
      const row = await repo.getSecret(userId, exec)
      if (!row || !row.enabled) throw new UnauthorizedError('Two-factor not enabled', 'INVALID_2FA')

      // Основной путь — TOTP.
      if (await security.verifyTotp(await security.decryptSecret(row.secret_enc), code)) return

      // Запасной путь — одноразовый recovery-код: списываем при совпадении.
      const found = await repo.findUnusedRecoveryCode(userId, security.hashRecoveryCode(code), exec)
      if (found) {
        await repo.markRecoveryCodeUsed(found.id, exec)
        return
      }
      throw new UnauthorizedError('Invalid 2FA code', 'INVALID_2FA')
    },
  }
}
