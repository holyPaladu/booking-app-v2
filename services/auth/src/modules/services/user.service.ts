import { NotFoundError } from '@booking/shared'
import type { IUserRepo, IUserService } from '@modules/ports/user.port'

export const userService = (repo: IUserRepo): IUserService => {
  return {
    create: (input) => repo.create(input),

    getByEmail: (email) => repo.findByEmail(email),
    getById: (id) => repo.findById(id),
    
    findById: async (id) => {
      const user = await repo.findById(id)
      if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND')
      return user
    }
  }
}
