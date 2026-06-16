import { UserFind, User, UserCreated } from "../entity"

export type IAuthRepo = {
  find: (email: string) => Promise<UserFind>
  create: (email: string, password: string) => Promise<UserCreated>
  put: (dto: User) => Promise<UserCreated>
}