import { TooManyRequestsError } from '@booking/shared'
import type { Db } from '@lib/tx'

export type ILoginAttemptRepo = {
  record(identifier: string, ipAddress: string | null, success: boolean): Promise<void>
  countRecent(identifier: string, windowMs: number): Promise<number>
  countRecentByIp(ipAddress: string, windowMs: number): Promise<number>
}

export type ILoginAttemptService = {
  record(identifier: string, ipAddress: string | null, success: boolean): Promise<void>
  checkLimit(identifier: string, ipAddress: string | null): Promise<void>
}

export const loginAttemptRepo = (db: Db): ILoginAttemptRepo => ({
  record: async (identifier, ipAddress, success) => {
    const sql = db()
    await sql`
      INSERT INTO login_attempts (identifier, ip_address, success)
      VALUES (${identifier}, ${ipAddress}, ${success})
    `
  },

  countRecent: async (identifier, windowMs) => {
    const sql = db()
    const since = new Date(Date.now() - windowMs)
    const [{ count }] = await sql<[{ count: number }]>`
      SELECT COUNT(*)::int AS count FROM login_attempts
      WHERE identifier = ${identifier}
        AND success = FALSE
        AND created_at > ${since}
    `
    return count
  },

  countRecentByIp: async (ipAddress, windowMs) => {
    const sql = db()
    const since = new Date(Date.now() - windowMs)
    const [{ count }] = await sql<[{ count: number }]>`
      SELECT COUNT(*)::int AS count FROM login_attempts
      WHERE ip_address = ${ipAddress}::inet
        AND success = FALSE
        AND created_at > ${since}
    `
    return count
  },
})

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS_BY_IDENTIFIER = 10
const MAX_ATTEMPTS_BY_IP = 50

export const loginAttemptService = (repo: ILoginAttemptRepo): ILoginAttemptService => ({
  record: (identifier, ipAddress, success) => repo.record(identifier, ipAddress, success),

  checkLimit: async (identifier, ipAddress) => {
    const byId = await repo.countRecent(identifier, WINDOW_MS)
    if (byId >= MAX_ATTEMPTS_BY_IDENTIFIER)
      throw new TooManyRequestsError('Too many login attempts', 'RATE_LIMITED')

    if (ipAddress) {
      const byIp = await repo.countRecentByIp(ipAddress, WINDOW_MS)
      if (byIp >= MAX_ATTEMPTS_BY_IP)
        throw new TooManyRequestsError('Too many login attempts', 'RATE_LIMITED')
    }
  },
})
