import type { Executor } from '@lib/tx'
import type { UserCredentials, UserView } from './user.entity'

// Внутренний вход repo.create — пароль уже захэширован сервисом-потребителем.
export type CreateUserInput = {
  email: string
  phone?: string | null
  password_hash: string
}

// Порт репозитория: контракт SQL-слоя (для моков в тестах).
// `exec` позволяет вызвать метод внутри общей транзакции (см. @lib/tx).
export type IUserRepo = {
  create: (input: CreateUserInput, exec?: Executor) => Promise<UserView>
  findByEmail: (email: string, exec?: Executor) => Promise<UserCredentials | undefined>
  findByPhone: (phone: string, exec?: Executor) => Promise<UserView | undefined>
  findById: (id: string, exec?: Executor) => Promise<UserView | undefined>
}

// Публичная поверхность модуля — другие модули (например auth) зависят ТОЛЬКО от неё.
export type IUserService = {
  create: (input: CreateUserInput, exec?: Executor) => Promise<UserView>
  getByEmail: (email: string) => Promise<UserCredentials | undefined>
  getByPhone: (phone: string) => Promise<UserView | undefined>
  getById: (id: string) => Promise<UserView | undefined>

  findById: (email: string) => Promise<UserView>
}
