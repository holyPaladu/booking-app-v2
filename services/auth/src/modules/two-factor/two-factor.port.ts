import type { Executor } from '@lib/tx'

// Строка two_factor_secrets, нужная сервису: шифротекст секрета + статус.
export type TwoFactorSecretRow = {
  secret_enc: string
  enabled: boolean
  confirmed_at: Date | null
}

// Контракт SQL-слоя 2FA: владелец таблиц two_factor_secrets и
// two_factor_recovery_codes. Каждый метод принимает exec — для общей транзакции.
export type ITwoFactorRepo = {
  isEnabled: (userId: string, exec?: Executor) => Promise<boolean>
  getSecret: (userId: string, exec?: Executor) => Promise<TwoFactorSecretRow | undefined>
  upsertSecret: (userId: string, secretEnc: string, exec?: Executor) => Promise<void>
  enable: (userId: string, exec?: Executor) => Promise<void>
  deleteSecret: (userId: string, exec?: Executor) => Promise<void>
  insertRecoveryCodes: (userId: string, hashes: string[], exec?: Executor) => Promise<void>
  deleteRecoveryCodes: (userId: string, exec?: Executor) => Promise<void>
  findUnusedRecoveryCode: (
    userId: string,
    codeHash: string,
    exec?: Executor,
  ) => Promise<{ id: string } | undefined>
  markRecoveryCodeUsed: (id: string, exec?: Executor) => Promise<void>
}

// Публичная поверхность модуля — auth-модуль (гейт логина и его завершение)
// зависит ТОЛЬКО от неё.
export type ITwoFactorService = {
  // Гейт логина: включена ли 2FA (enabled + confirmed). Заменяет временный
  // auth.repo.isTwoFactorEnabled.
  isEnabled: (userId: string, exec?: Executor) => Promise<boolean>
  setup: (userId: string, email: string) => Promise<{ secret: string; otpauth_uri: string }>
  confirm: (userId: string, code: string) => Promise<{ recovery_codes: string[] }>
  disable: (userId: string, code: string) => Promise<void>
  regenerateRecoveryCodes: (userId: string, code: string) => Promise<{ recovery_codes: string[] }>
  // Завершение логина: TOTP ИЛИ списание одноразового recovery-кода. Бросает при провале.
  verifyForLogin: (userId: string, code: string, exec?: Executor) => Promise<void>
}
