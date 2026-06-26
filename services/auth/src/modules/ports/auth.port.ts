import type { AuthLoginRequest, AuthRegisterRequest } from '@modules/dto/auth.dto'

// Что login отдаёт роуту для подписи JWT.
export type AuthIdentity = { id: string; email: string }

// Публичная поверхность auth-модуля.
export type IAuthService = {
  register: (dto: AuthRegisterRequest) => Promise<void>
  login: (dto: AuthLoginRequest) => Promise<AuthIdentity>
}
