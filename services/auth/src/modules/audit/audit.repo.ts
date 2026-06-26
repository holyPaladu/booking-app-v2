import type { SqlClient } from '@booking/shared'
import type { IAuditRepo } from './audit.port'

export const auditRepo = (sql: SqlClient): IAuditRepo => ({
  write: async (entry, exec = sql) => {
    await exec`
      INSERT INTO audit_log (user_id, event, metadata)
      VALUES (
        ${entry.user_id ?? null},
        ${entry.event}::audit_event,
        ${entry.metadata ? JSON.stringify(entry.metadata) : null}::jsonb
      )
    `
  },
})
