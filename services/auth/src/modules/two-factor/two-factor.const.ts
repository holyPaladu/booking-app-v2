// Живые константы 2FA-флоу. Значения audit-событий совпадают с enum audit_event
// (миграция 005). Держим локально, чтобы модуль не импортировал чужой auth.const.

export const TWO_FACTOR_AUDIT = {
  ENABLED: 'two_factor_enabled',
  DISABLED: 'two_factor_disabled',
} as const

// Scope короткоживущего challenge-токена между шагом-1 логина (пароль) и шагом-2 (2FA).
export const CHALLENGE_SCOPE = '2fa_pending'
