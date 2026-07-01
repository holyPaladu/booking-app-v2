import type { Db } from '@lib/tx'
import type { ITwoFactorRepo, TwoFactorSecretRow } from './two-factor.port'

// SQL 2FA. Executor берётся из ambient-контекста (@lib/tx): вне транзакции — пул,
// внутри runTx — активный tx. Владелец таблиц two_factor_secrets / recovery_codes.
export const twoFactorRepo = (db: Db): ITwoFactorRepo => ({
  isEnabled: async (userId) => {
    const sql = db()
    const [{ enabled }] = await sql<[{ enabled: boolean }]>`
      SELECT EXISTS(
        SELECT 1 FROM two_factor_secrets
        WHERE user_id = ${userId} AND enabled = TRUE AND confirmed_at IS NOT NULL
      ) AS enabled
    `
    return enabled
  },

  getSecret: async (userId) => {
    const sql = db()
    const [row] = await sql<TwoFactorSecretRow[]>`
      SELECT secret_enc AS "secretEnc", enabled, confirmed_at AS "confirmedAt"
      FROM two_factor_secrets
      WHERE user_id = ${userId}
    `
    return row
  },

  // Повторный setup до подтверждения перезаписывает секрет и сбрасывает статус.
  upsertSecret: async (userId, secretEnc) => {
    const sql = db()
    await sql`
      INSERT INTO two_factor_secrets (user_id, secret_enc)
      VALUES (${userId}, ${secretEnc})
      ON CONFLICT (user_id) DO UPDATE
        SET secret_enc   = EXCLUDED.secret_enc,
            enabled      = FALSE,
            confirmed_at = NULL
    `
  },

  enable: async (userId) => {
    const sql = db()
    await sql`
      UPDATE two_factor_secrets
      SET enabled = TRUE, confirmed_at = NOW()
      WHERE user_id = ${userId}
    `
  },

  deleteSecret: async (userId) => {
    const sql = db()
    await sql`DELETE FROM two_factor_secrets WHERE user_id = ${userId}`
  },

  insertRecoveryCodes: async (userId, hashes) => {
    if (hashes.length === 0) return
    const sql = db()
    await sql`
      INSERT INTO two_factor_recovery_codes (user_id, code_hash)
      SELECT ${userId}, h FROM UNNEST(${hashes}::text[]) AS h
    `
  },

  deleteRecoveryCodes: async (userId) => {
    const sql = db()
    await sql`DELETE FROM two_factor_recovery_codes WHERE user_id = ${userId}`
  },

  findUnusedRecoveryCode: async (userId, codeHash) => {
    const sql = db()
    const [row] = await sql<{ id: string }[]>`
      SELECT id FROM two_factor_recovery_codes
      WHERE user_id = ${userId} AND code_hash = ${codeHash} AND used_at IS NULL
    `
    return row
  },

  markRecoveryCodeUsed: async (id) => {
    const sql = db()
    await sql`UPDATE two_factor_recovery_codes SET used_at = NOW() WHERE id = ${id}`
  },
})
