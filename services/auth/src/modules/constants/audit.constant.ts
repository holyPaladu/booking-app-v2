export const AUDIT_EVENT = {
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',

  LOGOUT: 'logout',
  TOKEN_REFRESHED: 'token_refreshed',

  PASSWORD_CHANGED: 'password_changed',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  PASSWORD_RESET_COMPLETED: 'password_reset_completed',

  EMAIL_VERIFIED: 'email_verified',
  PHONE_VERIFIED: 'phone_verified',

  TWO_FACTOR_ENABLED: 'two_factor_enabled',
  TWO_FACTOR_DISABLED: 'two_factor_disabled',

  ACCOUNT_BANNED: 'account_banned',
  ACCOUNT_UNBANNED: 'account_unbanned',

  ACCOUNT_DELETED: 'account_deleted',

  ROLE_GRANTED: 'role_granted',
  ROLE_REVOKED: 'role_revoked',

  SESSIONS_REVOKED_ALL: 'sessions_revoked_all',
} as const