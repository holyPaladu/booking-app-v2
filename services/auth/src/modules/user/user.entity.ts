export type UserStatus = 'active' | 'banned' | 'deleted'

// Доменная сущность user. Поля — camelCase; маппинг в колонки БД (snake_case)
// делает user.repo (алиасы `AS "camelCase"` в SELECT). Выше repo snake_case нет.
export interface UserEntity {
  id: string

  email: string
  emailVerified: boolean

  phone: string | null
  phoneVerified: boolean

  passwordHash: string

  status: UserStatus

  bannedReason: string | null
  bannedAt: Date | null
  bannedBy: string | null

  tokenVersion: number

  deletedAt: Date | null
  deletedBy: string | null

  createdAt: Date
  updatedAt: Date
}

// То, что отдаём наружу (без чувствительных полей).
export type UserView = Pick<UserEntity, 'id' | 'email' | 'status'>

// Для auth-флоу (login) нужен хэш пароля и tokenVersion (для refresh-сессии) —
// отдаём отдельным типом, не наружу.
export type UserCredentials = Pick<
  UserEntity,
  | 'id'
  | 'email'
  | 'passwordHash'
  | 'emailVerified'
  | 'status'
  | 'bannedAt'
  | 'bannedBy'
  | 'bannedReason'
  | 'tokenVersion'
>
