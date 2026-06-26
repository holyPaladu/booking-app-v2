import type { IAuditRepo, IAuditService } from './audit.port'

// Тонкий сервис: пока проксирует в repo. Здесь же место для обогащения записи
// (ip, user-agent, нормализация metadata), когда появится request-контекст.
export const auditService = (repo: IAuditRepo): IAuditService => ({
  record: (entry, exec) => repo.write(entry, exec),
})
