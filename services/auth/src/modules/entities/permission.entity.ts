export interface PermissionEntity {
  id: number

  action: string
  resource: string

  description: string | null
}