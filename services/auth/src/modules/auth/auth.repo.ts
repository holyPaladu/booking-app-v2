import type { SqlClient } from '@booking/shared'
import type { IAuthRepo } from './auth.port'

// SQL побочных записей регистрации. Каждый метод принимает exec — чтобы выполниться
// внутри общей транзакции auth.service (см. @lib/tx).
export const authRepo = (sql: SqlClient): IAuthRepo => ({
  grantDefaultRole: async (userId, exec = sql) => {
    await exec`
      INSERT INTO user_roles (user_id, role_id)
      SELECT ${userId}, id FROM roles WHERE is_default = TRUE
      ON CONFLICT (user_id, role_id) DO NOTHING
    `
  },

  createVerificationToken: async (input, exec = sql) => {
    await exec`
      INSERT INTO verification_tokens (user_id, type, channel, identifier, token_hash, expires_at)
      VALUES (
        ${input.user_id},
        ${input.type}::verification_type,
        ${input.channel}::verification_channel,
        ${input.identifier},
        ${input.token_hash},
        ${input.expires_at}
      )
    `
  },
})
