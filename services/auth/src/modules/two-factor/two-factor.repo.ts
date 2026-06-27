import type { SqlClient } from '@booking/shared'
import type { ITwoFactorRepo, TwoFactorSecretRow } from './two-factor.port'

// SQL 2FA. exec по умолчанию — закрытый sql; в транзакции передаётся tx (@lib/tx).
export const twoFactorRepo = (sql: SqlClient): ITwoFactorRepo => ({
  isEnabled: async (userId, exec = sql) => {
    const [{ enabled }] = await exec<[{ enabled: boolean }]>`
      SELECT EXISTS(
        SELECT 1 FROM two_factor_secrets
        WHERE user_id = ${userId} AND enabled = TRUE AND confirmed_at IS NOT NULL
      ) AS enabled
    `
    return enabled
  },

  getSecret: async (userId, exec = sql) => {
    const [row] = await exec<TwoFactorSecretRow[]>`
      SELECT secret_enc, enabled, confirmed_at
      FROM two_factor_secrets
      WHERE user_id = ${userId}
    `
    return row
  },

  // Повторный setup до подтверждения перезаписывает секрет и сбрасывает статус.
  upsertSecret: async (userId, secretEnc, exec = sql) => {
    await exec`
      INSERT INTO two_factor_secrets (user_id, secret_enc)
      VALUES (${userId}, ${secretEnc})
      ON CONFLICT (user_id) DO UPDATE
        SET secret_enc   = EXCLUDED.secret_enc,
            enabled      = FALSE,
            confirmed_at = NULL
    `
  },

  enable: async (userId, exec = sql) => {
    await exec`
      UPDATE two_factor_secrets
      SET enabled = TRUE, confirmed_at = NOW()
      WHERE user_id = ${userId}
    `
  },

  deleteSecret: async (userId, exec = sql) => {
    await exec`DELETE FROM two_factor_secrets WHERE user_id = ${userId}`
  },

  insertRecoveryCodes: async (userId, hashes, exec = sql) => {
    if (hashes.length === 0) return
    await exec`
      INSERT INTO two_factor_recovery_codes (user_id, code_hash)
      SELECT ${userId}, h FROM UNNEST(${hashes}::text[]) AS h
    `
  },

  deleteRecoveryCodes: async (userId, exec = sql) => {
    await exec`DELETE FROM two_factor_recovery_codes WHERE user_id = ${userId}`
  },

  findUnusedRecoveryCode: async (userId, codeHash, exec = sql) => {
    const [row] = await exec<{ id: string }[]>`
      SELECT id FROM two_factor_recovery_codes
      WHERE user_id = ${userId} AND code_hash = ${codeHash} AND used_at IS NULL
    `
    return row
  },

  markRecoveryCodeUsed: async (id, exec = sql) => {
    await exec`UPDATE two_factor_recovery_codes SET used_at = NOW() WHERE id = ${id}`
  },
})
