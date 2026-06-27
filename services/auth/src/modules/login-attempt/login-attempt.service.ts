import { TooManyRequestsError } from '@booking/shared'
import type { ILoginAttemptRepo, ILoginAttemptService } from './login-attempt.port'

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS_BY_IDENTIFIER = 10
const MAX_ATTEMPTS_BY_IP = 50

export const loginAttemptService = (repo: ILoginAttemptRepo): ILoginAttemptService => ({
  record: (identifier, ipAddress, success, exec) =>
    repo.record(identifier, ipAddress, success, exec),

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
