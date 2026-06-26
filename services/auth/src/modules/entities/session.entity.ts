export interface SessionEntity {
  id: string

  userId: string

  refreshTokenHash: string
  tokenVersion: number

  userAgent: string | null
  ipAddress: string | null
  deviceName: string | null

  expiresAt: Date
  lastUsedAt: Date

  createdAt: Date
}