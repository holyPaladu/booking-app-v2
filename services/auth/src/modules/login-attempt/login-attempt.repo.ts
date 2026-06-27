import type { SqlClient } from '@booking/shared'
import type { ILoginAttemptRepo } from './login-attempt.port'

export const loginAttemptRepo = (sql: SqlClient): ILoginAttemptRepo => ({
  record: async (identifier, ipAddress, success, exec = sql) => {
    await exec`
      INSERT INTO login_attempts (identifier, ip_address, success)
      VALUES (${identifier}, ${ipAddress}, ${success})
    `
  },

  countRecent: async (identifier, windowMs, exec = sql) => {
    const since = new Date(Date.now() - windowMs)
    const [{ count }] = await exec<[{ count: number }]>`
      SELECT COUNT(*)::int AS count FROM login_attempts
      WHERE identifier = ${identifier}
        AND success = FALSE
        AND created_at > ${since}
    `
    return count
  },

  countRecentByIp: async (ipAddress, windowMs, exec = sql) => {
    const since = new Date(Date.now() - windowMs)
    const [{ count }] = await exec<[{ count: number }]>`
      SELECT COUNT(*)::int AS count FROM login_attempts
      WHERE ip_address = ${ipAddress}::inet
        AND success = FALSE
        AND created_at > ${since}
    `
    return count
  },
})
