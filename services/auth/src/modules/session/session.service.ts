import type { IRefreshTokenService } from '@modules/auth/auth.security'
import type { ISessionRepo, ISessionService } from './session.port'

const DAY_MS = 24 * 60 * 60 * 1000

export type SessionServiceOpts = { ttlDays: number }

export const sessionService = (
  tokens: IRefreshTokenService,
  repo: ISessionRepo,
  opts: SessionServiceOpts,
): ISessionService => ({
  issue: async (input, exec) => {
    const refreshToken = tokens.generate()
    const expiresAt = new Date(Date.now() + opts.ttlDays * DAY_MS)

    const { id } = await repo.create(
      {
        user_id: input.userId,
        refresh_token_hash: tokens.hash(refreshToken),
        token_version: input.tokenVersion,
        ip_address: input.ip,
        user_agent: input.userAgent,
        expires_at: expiresAt,
      },
      exec,
    )

    return { sessionId: id, refreshToken, expiresAt }
  },
})
