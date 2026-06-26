import type { Executor } from '@lib/tx'

// Запись аудита. Кросс-каттинг: писать будут register, login, баны, смена пароля…
export type AuditEntry = {
  user_id?: string | null
  event: string
  metadata?: Record<string, unknown> | null
}

// Контракт SQL-слоя.
export type IAuditRepo = {
  write: (entry: AuditEntry, exec?: Executor) => Promise<void>
}

// Публичная поверхность модуля — другие модули зависят только от неё.
export type IAuditService = {
  record: (entry: AuditEntry, exec?: Executor) => Promise<void>
}
