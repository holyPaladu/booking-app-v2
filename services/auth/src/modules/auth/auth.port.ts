import type { Executor } from '@lib/tx'
import type { AuthLoginRequest, AuthRegisterRequest } from './auth.model'

// Что login отдаёт роуту для подписи JWT.
export type AuthIdentity = { id: string; email: string }

// Контекст запроса логина — для записи в sessions/login_attempts/audit.
export type LoginContext = { ip: string | null; userAgent: string | null }

// Аутентифицирован: identity для access-JWT + plain refresh-токен.
export type AuthenticatedResult = {
  identity: AuthIdentity
  refreshToken: string
  refreshExpiresAt: Date
}

// Результат шага-1 логина: либо требуется 2FA (токены не выдаём, отдаём claims для
// подписи короткого challenge-токена), либо сразу аутентифицирован.
export type LoginResult =
  | { kind: 'two_factor_required'; userId: string; email: string; tokenVersion: number }
  | ({ kind: 'authenticated' } & AuthenticatedResult)

// Claims из проверенного challenge-токена для завершения логина (шаг-2).
export type CompleteLoginInput = { userId: string; email: string; tokenVersion: number }

// Публичная поверхность auth-модуля (другие модули зависят только от неё).
export type IAuthService = {
  register: (dto: AuthRegisterRequest) => Promise<void>
  startLogin: (dto: AuthLoginRequest, ctx: LoginContext) => Promise<LoginResult>
  // Шаг-2: проверка 2FA-кода (TOTP/recovery) и выпуск токенов.
  completeLogin: (
    input: CompleteLoginInput,
    code: string,
    ctx: LoginContext,
  ) => Promise<AuthenticatedResult>
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
}
