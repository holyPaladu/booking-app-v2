import type { responseMapper } from '../response'
import { type DbConstraintMap, mapDbError } from './db-error'
import { AppError } from './error.lib'

type Mapper = ReturnType<typeof responseMapper>

/**
 * Единый маппер ошибок для Elysia `onError`. Возвращает HTTP-статус и тело ответа.
 * Обрабатывает наши AppError, ошибки БД (PostgresError) И встроенные ошибки Elysia
 * (валидация/parse/not found), чтобы они не превращались в 500.
 *
 *   app.onError(({ code, error, set }) => {
 *     const { status, body } = mapError(code, error, response, DB_CONSTRAINTS)
 *     set.status = status
 *     return body
 *   })
 *
 * `constraints` (опц.) — карта имён индексов сервиса в доменные ошибки (см. mapDbError).
 */
export function mapError(
  code: string | number,
  error: unknown,
  response: Mapper,
  constraints?: DbConstraintMap,
) {
  if (error instanceof AppError) {
    return { status: error.statusCode, body: response.error(error.code, error.message) }
  }

  const db = mapDbError(error, constraints)
  if (db) {
    return { status: db.status, body: response.error(db.code, db.message) }
  }

  switch (code) {
    case 'VALIDATION':
      return {
        status: 422,
        body: response.error('VALIDATION', (error as Error)?.message ?? 'Validation failed'),
      }
    case 'NOT_FOUND':
      return { status: 404, body: response.error('NOT_FOUND', 'Route not found') }
    case 'PARSE':
      return { status: 400, body: response.error('PARSE', 'Invalid request body') }
    default:
      return { status: 500, body: response.error('INTERNAL_SERVER_ERROR', 'Something went wrong') }
  }
}
