import { Elysia, t } from 'elysia'
import { type createConfigService, type responseMapper } from '@booking/shared'
import type { IUserService } from '@modules/ports/user.port'
import { userModels } from '@modules/dto/user.dto'

type RouteDeps = {
  response: ReturnType<typeof responseMapper>
  cfg: ReturnType<typeof createConfigService>
}

export const userRouteV1 = (svc: IUserService, deps: RouteDeps) =>
  new Elysia({ prefix: 'users', tags: ['users'] })
    .model(userModels)

    .get('/:id', async ({ params }) => {
      const user = await svc.findById(params.id)
      return deps.response.success('OK', user)
    }, { params: 'user.get-by-id' })
