import type { Db } from '@lib/tx'
import type { IAuthRepo, VerificationToken } from './auth.port'

// SQL побочных записей регистрации. Executor берётся из ambient-контекста (@lib/tx):
// внутри runTx это активный tx, вне — базовый пул.
export const authRepo = (db: Db): IAuthRepo => ({
  grantDefaultRole: async (userId) => {
    const sql = db()
    await sql`
      INSERT INTO user_roles (user_id, role_id)
      SELECT ${userId}, id FROM roles WHERE is_default = TRUE
      ON CONFLICT (user_id, role_id) DO NOTHING
    `
  },

  createVerificationToken: async (input) => {
    const sql = db()
    await sql`
      INSERT INTO verification_tokens (user_id, type, channel, identifier, token_hash, expires_at)
      VALUES (
        ${input.userId},
        ${input.type}::verification_type,
        ${input.channel}::verification_channel,
        ${input.identifier},
        ${input.tokenHash},
        ${input.expiresAt}
      )
    `
  },

  findAvailableVerificationToken: async (email, verificationType) => {
    const sql = db()
    const [row] = await sql<VerificationToken[]>`
        SELECT
          id,
          user_id      AS "userId",
          token_hash   AS "tokenHash",
          attempts,
          max_attempts AS "maxAttempts",
          used,
          used_at      AS "usedAt",
          expires_at   AS "expiresAt"
        FROM verification_tokens
        WHERE
          identifier = ${email}
          AND type = ${verificationType}
          AND used = FALSE
          AND expires_at > NOW()
        LIMIT 1
    `

    return row
  },

  changeAttemptVerificationToken: async (id) => {
    const sql = db()
    const [row] = await sql<{ attempts: number }[]>`
      UPDATE verification_tokens
      SET attempts = attempts + 1
      WHERE id = ${id}
      RETURNING attempts
    `
    return row
  },

  markVerificationTokenAsUsed: async (id) => {
    const sql = db()
    await sql`
      UPDATE verification_tokens
      SET used = TRUE, used_at = NOW()
      WHERE id = ${id}
    `
  }
})
