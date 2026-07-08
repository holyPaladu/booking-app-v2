import { NotFoundError } from '@booking/shared'
import type { IUserRepo, IUserService } from './user.port'

export const userService = (repo: IUserRepo): IUserService => {
  return {
    create: (input) => repo.create(input),

    getByEmail: (email) => repo.findByEmail(email),
    getByPhone: (phone) => repo.findByPhone(phone),
    getById: (id) => repo.findById(id),
    getCredentialsById: (id) => repo.findCredentialsById(id),

    patchEmailVerified: (id) => repo.updateEmailVerified(id),
    patchPassword: (id, newPassword) => repo.updatePassword(id, newPassword),

    findById: async (id) => {
      const user = await repo.findById(id)
      if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND')
      return user
    },
  }
}
