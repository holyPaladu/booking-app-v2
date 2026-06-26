// Перевод ошибок драйвера postgres (PostgresError) в HTTP-семантику. Без этого
// любая ошибка БД (unique/FK/check) падала бы в дефолтный 500 в mapError.

export type DbErrorResult = { status: number; code: string; message: string }

// Маппинг по конкретному constraint → доменная ошибка (nice code/message).
// Сервис передаёт свой набор (имена индексов он знает сам).
export type DbConstraintMap = Record<string, DbErrorResult>

type PgLike = { name?: unknown; code?: unknown; constraint_name?: unknown }

// Duck-type вместо instanceof: устойчиво к нескольким копиям пакета postgres.
export function isPostgresError(e: unknown): e is { code: string; constraint_name?: string } {
  if (typeof e !== 'object' || e === null) return false
  const pg = e as PgLike
  return pg.name === 'PostgresError' && typeof pg.code === 'string' && /^[0-9A-Z]{5}$/.test(pg.code)
}

// SQLSTATE → статус. Сообщение всегда обобщённое: НЕ протекаем detail/значения/SQL.
const BY_SQLSTATE: Record<string, DbErrorResult> = {
  '23505': { status: 409, code: 'CONFLICT', message: 'Resource already exists' },
  '23503': { status: 422, code: 'UNPROCESSABLE', message: 'Related resource not found' },
  '23502': { status: 400, code: 'BAD_REQUEST', message: 'Missing required field' },
  '23514': { status: 422, code: 'UNPROCESSABLE', message: 'Constraint violation' },
  '22P02': { status: 400, code: 'BAD_REQUEST', message: 'Invalid input format' },
  '22001': { status: 400, code: 'BAD_REQUEST', message: 'Value too long' },
}

const FALLBACK: DbErrorResult = { status: 500, code: 'DB_ERROR', message: 'Database error' }

// Возвращает HTTP-проекцию ошибки БД или null, если это не PostgresError.
export function mapDbError(error: unknown, constraints?: DbConstraintMap): DbErrorResult | null {
  if (!isPostgresError(error)) return null
  if (constraints && error.constraint_name && constraints[error.constraint_name])
    return constraints[error.constraint_name]
  return BY_SQLSTATE[error.code] ?? FALLBACK
}
