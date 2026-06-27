import type { Executor } from '@lib/tx'

// Вход создания сессии. refresh_token_hash — SHA-256 от непрозрачного токена
// (сам токен в БД не лежит); expires_at считает сервис из TTL.
export type CreateSessionInput = {
  user_id: string
  refresh_token_hash: string
  token_version: number
  ip_address: string | null
  user_agent: string | null
  expires_at: Date
}

export type ISessionRepo = {
  create: (input: CreateSessionInput, exec?: Executor) => Promise<{ id: string }>
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
  issue: (input: IssueSessionInput, exec?: Executor) => Promise<IssuedSession>
}
