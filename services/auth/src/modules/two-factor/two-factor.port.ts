import { t } from 'elysia'

// Контракт входа HTTP-слоя: Elysia-модель валидации живёт рядом с портом модуля.
export const twoFactorModels = {
  // Шестизначный TOTP ИЛИ recovery-код (xxxx-xxxx) — длина проверяется в сервисе.
  'two-factor.code': t.Object({
    code: t.String({ minLength: 6 }),
  }),
}

// Строка two_factor_secrets, нужная сервису: шифротекст секрета + статус.
export type TwoFactorSecretRow = {
  secretEnc: string
  enabled: boolean
  confirmedAt: Date | null
}

// Контракт SQL-слоя 2FA: владелец таблиц two_factor_secrets и
// two_factor_recovery_codes. Транзакционность — через ambient-контекст (@lib/tx).
export type ITwoFactorRepo = {
  isEnabled: (userId: string) => Promise<boolean>
  getSecret: (userId: string) => Promise<TwoFactorSecretRow | undefined>
  upsertSecret: (userId: string, secretEnc: string) => Promise<void>
  enable: (userId: string) => Promise<void>
  deleteSecret: (userId: string) => Promise<void>
  insertRecoveryCodes: (userId: string, hashes: string[]) => Promise<void>
  deleteRecoveryCodes: (userId: string) => Promise<void>
  findUnusedRecoveryCode: (userId: string, codeHash: string) => Promise<{ id: string } | undefined>
  markRecoveryCodeUsed: (id: string) => Promise<void>
}

// Публичная поверхность модуля — auth-модуль (гейт логина и его завершение)
// зависит ТОЛЬКО от неё.
export type ITwoFactorService = {
  // Гейт логина: включена ли 2FA (enabled + confirmed). Заменяет временный
  // auth.repo.isTwoFactorEnabled.
  isEnabled: (userId: string) => Promise<boolean>
  setup: (userId: string, email: string) => Promise<{ secret: string; otpauth_uri: string }>
  confirm: (userId: string, code: string) => Promise<{ recovery_codes: string[] }>
  disable: (userId: string, code: string) => Promise<void>
  regenerateRecoveryCodes: (userId: string, code: string) => Promise<{ recovery_codes: string[] }>
  // Завершение логина: TOTP ИЛИ списание одноразового recovery-кода. Бросает при провале.
  verifyForLogin: (userId: string, code: string) => Promise<void>
}
