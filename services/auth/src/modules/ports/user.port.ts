import type { UserCredentials, UserView } from '@modules/entities/user.entity'

// Внутренний вход repo.create — пароль уже захэширован сервисом-потребителем.
export type CreateUserInput = {
  email: string
  password_hash: string
}

// Порт репозитория: контракт SQL-слоя (для моков в тестах).
export type IUserRepo = {
  create: (input: CreateUserInput) => Promise<UserView>
  findByEmail: (email: string) => Promise<UserCredentials | undefined>
  findById: (id: string) => Promise<UserView | undefined>
}

// Публичная поверхность модуля — другие модули (например auth) зависят ТОЛЬКО от неё.
export type IUserService = {
  create: (input: CreateUserInput) => Promise<UserView>
  getByEmail: (email: string) => Promise<UserCredentials | undefined>
  getById: (id: string) => Promise<UserView | undefined>

  findById: (email: string) => Promise<UserView> 
}
