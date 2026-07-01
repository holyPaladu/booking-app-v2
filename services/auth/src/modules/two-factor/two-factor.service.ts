import { BadRequestError, ConflictError, UnauthorizedError } from '@booking/shared'
import type { TxRunner } from '@lib/tx'
import type { IAuditService } from '@modules/audit'
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
  // (показывается пользователю один раз). Вызывается внутри runTx — tx ambient.
  const issueRecoveryCodes = async (userId: string) => {
    const recovery_codes = security.generateRecoveryCodes()
    await repo.insertRecoveryCodes(userId, recovery_codes.map(security.hashRecoveryCode))
    return recovery_codes
  }

  return {
    isEnabled: (userId) => repo.isEnabled(userId),

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

      const secret = await security.decryptSecret(row.secretEnc)
      if (!(await security.verifyTotp(secret, code)))
        throw new BadRequestError('Invalid code', 'INVALID_OTP')

      return await runTx(async () => {
        await repo.enable(userId)
        const recovery_codes = await issueRecoveryCodes(userId)
        await audit.record({ userId, event: TWO_FACTOR_AUDIT.ENABLED })
        return { recovery_codes }
      })
    },

    disable: async (userId, code) => {
      const row = await requireEnabledSecret(userId)
      if (!(await security.verifyTotp(await security.decryptSecret(row.secretEnc), code)))
        throw new BadRequestError('Invalid code', 'INVALID_OTP')

      await runTx(async () => {
        await repo.deleteRecoveryCodes(userId)
        await repo.deleteSecret(userId)
        await audit.record({ userId, event: TWO_FACTOR_AUDIT.DISABLED })
      })
    },

    regenerateRecoveryCodes: async (userId, code) => {
      const row = await requireEnabledSecret(userId)
      if (!(await security.verifyTotp(await security.decryptSecret(row.secretEnc), code)))
        throw new BadRequestError('Invalid code', 'INVALID_OTP')

      return await runTx(async () => {
        await repo.deleteRecoveryCodes(userId)
        return { recovery_codes: await issueRecoveryCodes(userId) }
      })
    },

    verifyForLogin: async (userId, code) => {
      const row = await repo.getSecret(userId)
      if (!row || !row.enabled) throw new UnauthorizedError('Two-factor not enabled', 'INVALID_2FA')

      // Основной путь — TOTP.
      if (await security.verifyTotp(await security.decryptSecret(row.secretEnc), code)) return

      // Запасной путь — одноразовый recovery-код: списываем при совпадении.
      const found = await repo.findUnusedRecoveryCode(userId, security.hashRecoveryCode(code))
      if (found) {
        await repo.markRecoveryCodeUsed(found.id)
        return
      }
      throw new UnauthorizedError('Invalid 2FA code', 'INVALID_2FA')
    },
  }
}
