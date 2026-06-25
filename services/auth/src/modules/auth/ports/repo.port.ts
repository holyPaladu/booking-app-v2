import type { User, UserCreated, UserFind } from '../entity'

export type IAuthRepo = {
  find: (email: string) => Promise<UserFind | undefined>
  create: (email: string, password: string) => Promise<UserCreated>
  put: (dto: User) => Promise<UserCreated>
}
