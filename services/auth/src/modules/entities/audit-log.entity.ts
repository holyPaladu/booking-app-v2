export interface AuditLogEntity {
  id: number

  userId: string | null

  event: string

  ipAddress: string | null
  userAgent: string | null

  metadata: Record<string, unknown> | null

  createdAt: Date
}