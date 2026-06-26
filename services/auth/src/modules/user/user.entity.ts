export type UserStatus = 'active' | 'banned' | 'deleted'

// Доменная сущность user. Имена полей совпадают с колонками миграции 001_create_users.
export interface UserEntity {
  id: string

  email: string
  emailVerified: boolean

  phone: string | null
  phone_verified: boolean

  password_hash: string

  status: UserStatus

  banned_reason: string | null
  banned_at: Date | null
  banned_by: string | null

  token_version: number

  deleted_at: Date | null
  deleted_by: string | null

  created_at: Date
  updated_at: Date
}

// То, что отдаём наружу (без чувствительных полей).
export type UserView = Pick<UserEntity, 'id' | 'email' | 'status'>

// Для auth-флоу (login) нужен хэш пароля — отдаём отдельным типом, не наружу.
export type UserCredentials = Pick<UserEntity, 'id' | 'email' | 'password_hash'>
