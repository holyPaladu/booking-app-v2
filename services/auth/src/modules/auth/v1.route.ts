import { Elysia } from 'elysia'
import { UserCreated } from './types/entity'
import { AuthModels } from './models'
import { AuthService } from './service'
import { responseMapper } from '../../shared/mapper/response.mapper'

export const AuthRouteV1 = (svc: ReturnType<typeof AuthService>, response: ReturnType<typeof responseMapper>) => {
  return new Elysia({ prefix: "auth", tags: ['auth'] })
    .model(AuthModels)

    .post("/register", async ({ body }) => {
      const data = await svc.register(body)
      return response.success<UserCreated>(data.message, data.user)
    }, { body: 'auth.register' })

    .post("/login", async ({ body }) => {
      const data = await svc.login(body)
      return response.success<{ token: string }>(`Verify your email -> ${body.email}`, data)
    }, { body: "auth.login" })
}