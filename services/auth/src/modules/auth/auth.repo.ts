import type { Db } from '@lib/tx'
import type { IAuthRepo } from './auth.port'

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
})
