import { t } from 'elysia'
import { VERIFICATION_TYPE } from '@modules/auth/auth.const'

// Контракт входа HTTP-слоя: Elysia-модели валидации + выводимые из них типы запросов
// (single source of truth — типы не дублируем интерфейсами). Живут рядом с портом.
export const authModels = {
  'auth.register': t.Object({
    email: t.String({ format: 'email' }),
    password: t.String({ minLength: 6 }),
    phone: t.Optional(t.String({ pattern: '^\\+[1-9]\\d{6,14}$' })),
  }),
  'auth.login': t.Object({
    email: t.String({ format: 'email' }),
    password: t.String({ minLength: 6 }),
  }),
  // Шаг-2 логина: challenge-токен из шага-1 + TOTP/recovery-код.
  'auth.login-2fa': t.Object({
    challenge_token: t.String(),
    code: t.String({ minLength: 6 }),
  }),

  // HTTP-контракт снаружи — snake_case (как refresh_token в ответе /login).
  'auth.refresh': t.Object({
    refresh_token: t.String(),
  }),
  'auth.logout': t.Object({
    refresh_token: t.String()
  }),
  'auth.verify-email': t.Object({
    email: t.String({ format: 'email' }),
    code: t.String({ maxLength: 6, minLength: 6 })
  }),
  'auth.verify-email.resend': t.Object({
    email: t.String({ format: 'email' })
  })
}

export type AuthRegisterRequest = (typeof authModels)['auth.register']['static']
export type AuthLoginRequest = (typeof authModels)['auth.login']['static']
export type AuthLogin2faRequest = (typeof authModels)['auth.login-2fa']['static']

// ================== PORTS ================
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
export type RevokeTokenInput = { refreshToken: string, userId: string, email: string }

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

  // Ротация refresh: отдаёт identity + новый refresh (access-JWT подписывает роут,
  // как в /login). ctx — для записи ip/user-agent в новую сессию.
  rotateToken: (refreshToken: string, ctx: LoginContext) => Promise<AuthenticatedResult>
  revokeToken: (dto: RevokeTokenInput) => Promise<void>

  // verify email
  verifyEmail: (email: string, code: string) => Promise<void>
  verifyEmailResend: (email: string) => Promise<void>
}

// Вход создания токена верификации. token_hash — хэш OTP (сам OTP в БД не лежит).
export type CreateVerificationInput = {
  userId: string
  type: string
  channel: string
  identifier: string
  tokenHash: string
  expiresAt: string // ISO timestamp
}
export type VerificationToken = {
  id: string
  userId: string
  tokenHash: string
  attempts: number
  maxAttempts: number
  used: boolean
  usedAt: string
  expiresAt: string
}
type VerificationType = (typeof VERIFICATION_TYPE)[keyof typeof VERIFICATION_TYPE]

// Контракт SQL-слоя auth-флоу: побочные записи регистрации с одним писателем
// (роль, токен верификации). Пользователи — через IUserService, аудит — через
// IAuditService, письмо — через IOutboxService (каждая таблица — свой владелец).
export type IAuthRepo = {
  grantDefaultRole: (userId: string) => Promise<void>

  createVerificationToken: (input: CreateVerificationInput) => Promise<void>
  findAvailableVerificationToken: (email: string, verificationType: VerificationType) => Promise<VerificationToken>
  changeAttemptVerificationToken: (id: string) => Promise<{ attempts: number }>
  markVerificationTokenAsUsed: (id: string) => Promise<void>
}
