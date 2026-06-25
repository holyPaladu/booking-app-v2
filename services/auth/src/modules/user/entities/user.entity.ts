export interface UserEntity {
  id: string

  email: string
  emailVerified: boolean

  phone: string | null
  phoneVerified: boolean

  passwordHash: string

  status: string

  bannedReason: string | null
  bannedAt: Date | null
  bannedBy: string | null

  tokenVersion: number

  deletedAt: Date | null
  deletedBy: string | null

  createdAt: Date
  updatedAt: Date
}