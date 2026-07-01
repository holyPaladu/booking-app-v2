export interface TwoFactorSecretEntity {
  userId: string

  secretEnc: string

  enabled: boolean

  confirmedAt: Date | null

  createdAt: Date
  updatedAt: Date
}
