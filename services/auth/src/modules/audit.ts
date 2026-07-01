import type { Db } from '@lib/tx'

// Запись аудита. Кросс-каттинг: писать будут register, login, баны, смена пароля…
export type AuditEntry = {
  userId?: string | null
  event: string
  metadata?: Record<string, unknown> | null
}

// Контракт SQL-слоя.
export type IAuditRepo = {
  write: (entry: AuditEntry) => Promise<void>
}

// Публичная поверхность модуля — другие модули зависят только от неё.
export type IAuditService = {
  record: (entry: AuditEntry) => Promise<void>
}

export const auditRepo = (db: Db): IAuditRepo => ({
  write: async (entry) => {
    const sql = db()
    await sql`
      INSERT INTO audit_log (user_id, event, metadata)
      VALUES (
        ${entry.userId ?? null},
        ${entry.event}::audit_event,
        ${entry.metadata ? JSON.stringify(entry.metadata) : null}::jsonb
      )
    `
  },
})

// Тонкий сервис: пока проксирует в repo. Здесь же место для обогащения записи
// (ip, user-agent, нормализация metadata), когда появится request-контекст.
export const auditService = (repo: IAuditRepo): IAuditService => ({
  record: (entry) => repo.write(entry),
})
