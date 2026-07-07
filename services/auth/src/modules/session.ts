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
// Строка сессии для ротации: возвращается по хэшу токена без фильтров по used/expiry —
// проверки (истёк / повторно использован / версия) делает сервис, чтобы отличить
// «нет такого токена» от «токен уже ротирован» (reuse-детекция).
export type FindSession = {
  id: string
  userId: string
  refreshTokenHash: string
  tokenVersion: number
  used: boolean
  expiresAt: Date
}

export type ISessionRepo = {
  create: (input: CreateSessionInput) => Promise<{ id: string }>
  findByHash: (hash: string) => Promise<FindSession | undefined>
  markUsed: (id: string) => Promise<void>
  revokeById: (id: string) => Promise<void>
  revokeAllByUserIdAndTokenVersion: (userId: string, tokenVersion: number) => Promise<void>
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

  findByHash: async (hash) => {
    const sql = db()
    const [row] = await sql<FindSession[]>`
      SELECT id,
             user_id            AS "userId",
             refresh_token_hash AS "refreshTokenHash",
             token_version      AS "tokenVersion",
             used,
             expires_at         AS "expiresAt"
      FROM sessions
      WHERE refresh_token_hash = ${hash}
    `

    return row
  },

  markUsed: async (id) => {
    const sql = db()
    await sql`UPDATE sessions SET used = TRUE WHERE id = ${id}`
  },

  // Отзыв одной сессии (logout): DELETE, как и revokeAll — записи не тянем в tombstone.
  revokeById: async (id) => {
    const sql = db()
    await sql`DELETE FROM sessions WHERE id = ${id}`
  },

  // Гасим всю «семью» сессий юзера с данной версией токена (reuse-детекция ротации).
  revokeAllByUserIdAndTokenVersion: async (userId, tokenVersion) => {
    const sql = db()
    await sql`
      DELETE FROM sessions
      WHERE user_id = ${userId} AND token_version = ${tokenVersion}
    `
  },
})

const DAY_MS = 24 * 60 * 60 * 1000
export type SessionServiceOpts = { ttlDays: number }
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
  findSession: (refreshToken: string) => Promise<FindSession | undefined>
  markUsed: (sessionId: string) => Promise<void>
  revokeById: (sessionId: string) => Promise<void>
  revokeAllByUserIdAndTokenVersion: (userId: string, tokenVersion: number) => Promise<void>
}

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

  findSession: async (refreshToken) => {
    const refreshTokenHash = tokens.hash(refreshToken)
    return await repo.findByHash(refreshTokenHash)
  },

  markUsed: (sessionId) => repo.markUsed(sessionId),

  revokeById: (sessionId) => repo.revokeById(sessionId),

  revokeAllByUserIdAndTokenVersion: (userId, tokenVersion) =>
    repo.revokeAllByUserIdAndTokenVersion(userId, tokenVersion),
})
