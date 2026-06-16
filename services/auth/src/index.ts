import { Elysia } from "elysia"
import { createSql } from "./shared/db"
import { AppError } from "./shared/lib/error.lib"
import { responseMapper } from './shared/mapper/response.mapper'
import { AuthRepo } from "./modules/auth/repo"
import { AuthService } from "./modules/auth/service"
import { AuthRouteV1 } from "./modules/auth/v1.route"

async function bootstrap() {
  const response = responseMapper()

  const sql = createSql()
  const repo = AuthRepo(sql)
  const svc = AuthService(repo)

  const app = new Elysia()
    .onError(({ error, set }) => {
      if (error instanceof AppError) {
        set.status = error.status
        return response.error(error.code, error.message)
      }
      set.status = 500
      return response.error("INTERNAL_SERVER_ERROR", "Something went wrong")
    })
    .get("/health", () => response.success<{ status: "ok" }>("Service live!", { status: "ok" }))
    .group("/api", api => api
      .group("/v1", v1 => v1
        .use(AuthRouteV1(svc, response))
      )
    )
    .listen(3000)

  console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`)
}

bootstrap().catch(err => console.error(err))