import { ConflictError, UnauthorizedError } from '@booking/shared'
import type { IUserService } from '@modules/ports/user.port'
import type { IAuthService } from '@modules/ports/auth.port'
import { IHashService } from '@modules/ports/hash.port'

export const authService = (users: IUserService, hashSvc: IHashService): IAuthService => {
  const findUserByEmail = (email: string) => users.getByEmail(email)

  return {
    register: async (dto) => {
      const existing = await findUserByEmail(dto.email)
      if (existing) throw new ConflictError('Email already registered', 'ALREADY_EXISTS')

      const password_hash = await hashSvc.hash(dto.password)
      await users.create({ email: dto.email, password_hash })
    },

    login: async (dto) => {
      const user = await findUserByEmail(dto.email)
      if (!user) throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS')  

      const ok = await hashSvc.verify(dto.password, user.password_hash)
      if (!ok) throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS')

      return { id: user.id, email: user.email }
    },
  }
}
