import type { createConfigService, responseMapper } from '@booking/shared'
import { Elysia } from 'elysia'
import { userModels } from './user.model'
import type { IUserService } from './user.port'

type RouteDeps = {
  response: ReturnType<typeof responseMapper>
  cfg: ReturnType<typeof createConfigService>
}

export const userRouteV1 = (svc: IUserService, deps: RouteDeps) =>
  new Elysia({ prefix: 'users', tags: ['users'] }).model(userModels).get(
    '/:id',
    async ({ params }) => {
      const user = await svc.findById(params.id)
      return deps.response.success('OK', user)
    },
    { params: 'user.get-by-id' },
  )
