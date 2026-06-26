export interface UserRoleEntity {
  userId: string
  roleId: number

  grantedAt: Date
  grantedBy: string | null
}
