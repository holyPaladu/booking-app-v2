export interface TwoFactorRecoveryCodeEntity {
  id: string

  userId: string

  codeHash: string

  usedAt: Date | null

  createdAt: Date
}