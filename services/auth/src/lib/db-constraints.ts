import type { DbConstraintMap } from '@booking/shared'

// Известные индексы/ограничения auth → доменные ошибки. Покрывает гонку
// (pre-check прошёл, но конкурентный insert упал в unique) и прочие нарушения,
// чтобы наружу шёл осмысленный статус, а не 500. Имена — из migrations/index.ts.
export const DB_CONSTRAINTS: DbConstraintMap = {
  idx_users_email_active: {
    status: 409,
    code: 'ALREADY_EXISTS',
    message: 'Email already registered',
  },
  idx_users_phone_active: {
    status: 409,
    code: 'ALREADY_EXISTS',
    message: 'Phone already registered',
  },
  idx_vt_one_active_per_type: {
    status: 409,
    code: 'VERIFICATION_PENDING',
    message: 'Verification already pending',
  },
}
