import { AuthRegisterRequest, AuthLoginRequest } from "./types/dto/auth.dto"
import { IAuthRepo } from "./types/ports/repo.port"
import { AppError } from "../../shared/lib/error.lib"

export const AuthService = (repo: IAuthRepo) => {
  const findUser = async (email: string) => repo.find(email)
  const createUser = async (email: string, hash: string) => repo.create(email, hash)

  return {
    register: async (dto: AuthRegisterRequest) => {
      const existUser = await findUser(dto.email)
      if (existUser) throw new AppError("ALREADY_EXISTS", "User already exist", 409)

      const hash = await Bun.password.hash(dto.password, 'argon2id')
      const user = await createUser(dto.email, hash)

      return { message: 'User successfully created.', user }
    },
    login: async (dto: AuthLoginRequest) => {
      const existUser = await findUser(dto.email)
      if (!existUser) throw new AppError("NOT_FOUND", "User not found", 404)

      const match = await Bun.password.verify(dto.password, existUser.password_hash)
      if (!match) throw new AppError("CONFLICT", "Creditional don't match", 409)

      const token = '1234' 
      const hash = Bun.password.hash(token)
      return { token }
    }
  }
}
