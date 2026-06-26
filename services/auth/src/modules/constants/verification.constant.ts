export const VERIFICATION_TYPE = {
  EMAIL_CONFIRM: 'email_confirm',
  PHONE_CONFIRM: 'phone_confirm',
  PASSWORD_RESET: 'password_reset',
  TWO_FACTOR_SETUP: 'two_factor_setup',
} as const

export const VERIFICATION_CHANNEL = {
  EMAIL: 'email',
  SMS: 'sms',
} as const