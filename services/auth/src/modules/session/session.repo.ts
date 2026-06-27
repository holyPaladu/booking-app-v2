import type { SqlClient } from '@booking/shared'
import type { ISessionRepo } from './session.port'

export const sessionRepo = (sql: SqlClient): ISessionRepo => ({
  create: async (input, exec = sql) => {
    const [row] = await exec<[{ id: string }]>`
      INSERT INTO sessions (user_id, refresh_token_hash, token_version, ip_address, user_agent, expires_at)
      VALUES (
        ${input.user_id},
        ${input.refresh_token_hash},
        ${input.token_version},
        ${input.ip_address}::inet,
        ${input.user_agent},
        ${input.expires_at}
      )
      RETURNING id
    `
    return row
  },
})
