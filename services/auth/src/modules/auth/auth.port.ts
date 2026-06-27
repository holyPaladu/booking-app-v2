import type { Executor } from '@lib/tx'
import type { AuthLoginRequest, AuthRegisterRequest } from './auth.model'

// Что login отдаёт роуту для подписи JWT.
export type AuthIdentity = { id: string; email: string }

// Контекст запроса логина — для записи в sessions/login_attempts/audit.
export type LoginContext = { ip: string | null; userAgent: string | null }

// Результат логина: либо требуется 2FA (токены не выдаём), либо аутентифицирован
// (identity для access-JWT + plain refresh-токен).
export type LoginResult =
  | { kind: 'two_factor_required'; userId: string }
  | { kind: 'authenticated'; identity: AuthIdentity; refreshToken: string; refreshExpiresAt: Date }

// Публичная поверхность auth-модуля (другие модули зависят только от неё).
export type IAuthService = {
  register: (dto: AuthRegisterRequest) => Promise<void>
  startLogin: (dto: AuthLoginRequest, ctx: LoginContext) => Promise<LoginResult>
}

// Вход создания токена верификации. token_hash — хэш OTP (сам OTP в БД не лежит).
export type CreateVerificationInput = {
  user_id: string
  type: string
  channel: string
  identifier: string
  token_hash: string
  expires_at: string // ISO timestamp
}

// Контракт SQL-слоя auth-флоу: побочные записи регистрации с одним писателем
// (роль, токен верификации). Пользователи — через IUserService, аудит — через
// IAuditService, письмо — через IOutboxService (каждая таблица — свой владелец).
export type IAuthRepo = {
  grantDefaultRole: (userId: string, exec?: Executor) => Promise<void>
  createVerificationToken: (input: CreateVerificationInput, exec?: Executor) => Promise<void>
  // Read 2FA-гейта. Временно живёт здесь; при появлении полноценного 2FA-модуля
  // перенести в него.
  isTwoFactorEnabled: (userId: string, exec?: Executor) => Promise<boolean>
}
