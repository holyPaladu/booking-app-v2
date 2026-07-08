import { t } from 'elysia'
import type { UserCredentials, UserView } from './user.entity'

// Контракт входа HTTP-слоя: Elysia-модели валидации живут рядом с портом модуля.
export const userModels = {
  'user.get-by-id': t.Object({
    id: t.String({ format: 'uuid' }),
  }),
}

// Внутренний вход repo.create — пароль уже захэширован сервисом-потребителем.
export type CreateUserInput = {
  email: string
  phone?: string | null
  passwordHash: string
}

// Порт репозитория: контракт SQL-слоя (для моков в тестах). Транзакционность —
// через ambient-контекст (@lib/tx), в сигнатурах не отражается.
export type IUserRepo = {
  create: (input: CreateUserInput) => Promise<UserView>
  findByEmail: (email: string) => Promise<UserCredentials | undefined>
  findByPhone: (phone: string) => Promise<UserView | undefined>
  findById: (id: string) => Promise<UserView | undefined>
  findCredentialsById: (id: string) => Promise<UserCredentials | undefined>

  updateEmailVerified: (id: string) => Promise<void>
  updatePassword: (id: string, newPassword: string) => Promise<{ tokenVersion: number }>
}

// Публичная поверхность модуля — другие модули (например auth) зависят ТОЛЬКО от неё.
export type IUserService = {
  create: (input: CreateUserInput) => Promise<UserView>
  getByEmail: (email: string) => Promise<UserCredentials | undefined>
  getByPhone: (phone: string) => Promise<UserView | undefined>
  getById: (id: string) => Promise<UserView | undefined>
  getCredentialsById: (id: string) => Promise<UserCredentials | undefined>

  patchEmailVerified: (id: string) => Promise<void>
  patchPassword: (id: string, newPassword: string) => Promise<{ tokenVersion: number }>

  findById: (id: string) => Promise<UserView>
}
