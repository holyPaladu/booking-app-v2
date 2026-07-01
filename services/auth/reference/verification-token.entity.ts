export interface VerificationTokenEntity {
  id: string

  userId: string

  type: string
  channel: string

  identifier: string

  tokenHash: string

  attempts: number
  maxAttempts: number

  used: boolean
  usedAt: Date | null

  expiresAt: Date

  createdAt: Date
}
