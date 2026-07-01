import type { Db } from '@lib/tx'
import type { IRefreshTokenService } from '@modules/auth'

// Вход создания сессии. refresh_token_hash — SHA-256 от непрозрачного токена
// (сам токен в БД не лежит); expires_at считает сервис из TTL.
export type CreateSessionInput = {
  userId: string
  refreshTokenHash: string
  tokenVersion: number
  ipAddress: string | null
  userAgent: string | null
  expiresAt: Date
}

export type ISessionRepo = {
  create: (input: CreateSessionInput) => Promise<{ id: string }>
}

// Что login получает после выпуска сессии: plain refresh-токен уходит клиенту.
export type IssuedSession = { sessionId: string; refreshToken: string; expiresAt: Date }

export type IssueSessionInput = {
  userId: string
  tokenVersion: number
  ip: string | null
  userAgent: string | null
}

// Публичная поверхность модуля — другие модули зависят только от неё.
export type ISessionService = {
  issue: (input: IssueSessionInput) => Promise<IssuedSession>
}

export const sessionRepo = (db: Db): ISessionRepo => ({
  create: async (input) => {
    const sql = db()
    const [row] = await sql<[{ id: string }]>`
      INSERT INTO sessions (user_id, refresh_token_hash, token_version, ip_address, user_agent, expires_at)
      VALUES (
        ${input.userId},
        ${input.refreshTokenHash},
        ${input.tokenVersion},
        ${input.ipAddress}::inet,
        ${input.userAgent},
        ${input.expiresAt}
      )
      RETURNING id
    `
    return row
  },
})

const DAY_MS = 24 * 60 * 60 * 1000

export type SessionServiceOpts = { ttlDays: number }

export const sessionService = (
  tokens: IRefreshTokenService,
  repo: ISessionRepo,
  opts: SessionServiceOpts,
): ISessionService => ({
  issue: async (input) => {
    const refreshToken = tokens.generate()
    const expiresAt = new Date(Date.now() + opts.ttlDays * DAY_MS)

    const { id } = await repo.create({
      userId: input.userId,
      refreshTokenHash: tokens.hash(refreshToken),
      tokenVersion: input.tokenVersion,
      ipAddress: input.ip,
      userAgent: input.userAgent,
      expiresAt,
    })

    return { sessionId: id, refreshToken, expiresAt }
  },
})
