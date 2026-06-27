import { t } from 'elysia'

export const twoFactorModels = {
  // Шестизначный TOTP ИЛИ recovery-код (xxxx-xxxx) — длина проверяется в сервисе.
  'two-factor.code': t.Object({
    code: t.String({ minLength: 6 }),
  }),
}

// Single source of truth: тип выводим из модели.
export type TwoFactorCodeRequest = (typeof twoFactorModels)['two-factor.code']['static']
