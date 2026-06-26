import { describe, expect, it } from 'bun:test'
import type { DbConstraintMap } from '../src/error/db-error'
import { isPostgresError, mapDbError } from '../src/error/db-error'
import { mapError } from '../src/error/error-handler'
import { ConflictError } from '../src/error/error.lib'
import { responseMapper } from '../src/response'

// Имитация ошибки драйвера postgres (duck-typed по name+code).
const pgError = (code: string, constraint_name?: string) => ({
  name: 'PostgresError',
  code,
  constraint_name,
})

const CONSTRAINTS: DbConstraintMap = {
  idx_users_email_active: {
    status: 409,
    code: 'ALREADY_EXISTS',
    message: 'Email already registered',
  },
}

describe('isPostgresError', () => {
  it('распознаёт PostgresError и игнорирует обычные', () => {
    expect(isPostgresError(pgError('23505'))).toBe(true)
    expect(isPostgresError(new Error('boom'))).toBe(false)
    expect(isPostgresError({ name: 'PostgresError', code: 'nope' })).toBe(false)
    expect(isPostgresError(null)).toBe(false)
  })
})

describe('mapDbError', () => {
  it('constraint → доменная ошибка (точечный маппинг)', () => {
    expect(mapDbError(pgError('23505', 'idx_users_email_active'), CONSTRAINTS)).toEqual({
      status: 409,
      code: 'ALREADY_EXISTS',
      message: 'Email already registered',
    })
  })

  it('SQLSTATE → статус (без точечного маппинга)', () => {
    expect(mapDbError(pgError('23505'))?.status).toBe(409)
    expect(mapDbError(pgError('23502'))?.status).toBe(400)
    expect(mapDbError(pgError('23514'))?.status).toBe(422)
    expect(mapDbError(pgError('22P02'))?.status).toBe(400)
  })

  it('неизвестный SQLSTATE → 500 DB_ERROR без утечки деталей', () => {
    const r = mapDbError(pgError('XX999'))
    expect(r).toEqual({ status: 500, code: 'DB_ERROR', message: 'Database error' })
  })

  it('не-PostgresError → null', () => {
    expect(mapDbError(new Error('boom'))).toBeNull()
  })
})

describe('mapError integration', () => {
  const response = responseMapper()

  it('PostgresError маппится через constraints', () => {
    const { status, body } = mapError(
      'UNKNOWN',
      pgError('23505', 'idx_users_email_active'),
      response,
      CONSTRAINTS,
    )
    expect(status).toBe(409)
    expect(body).toMatchObject({ success: false, code: 'ALREADY_EXISTS' })
  })

  it('AppError всё ещё приоритетнее', () => {
    const { status, body } = mapError('UNKNOWN', new ConflictError('x', 'DUP'), response)
    expect(status).toBe(409)
    expect(body).toMatchObject({ code: 'DUP' })
  })

  it('обычная ошибка без кода → дефолтный 500', () => {
    const { status } = mapError('UNKNOWN', new Error('boom'), response)
    expect(status).toBe(500)
  })
})
