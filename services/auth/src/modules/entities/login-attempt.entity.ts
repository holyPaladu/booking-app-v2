export interface LoginAttemptEntity {
  id: number

  identifier: string

  ipAddress: string | null

  success: boolean

  createdAt: Date
}