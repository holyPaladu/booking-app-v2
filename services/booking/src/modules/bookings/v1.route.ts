import { authMacro, type createConfigService, type responseMapper } from '@booking/shared'
import { Elysia } from 'elysia'
import { BookingModels } from './models'
import type { bookingService } from './service'
import type { BookingView } from './types/entity'

type RouteDeps = {
  response: ReturnType<typeof responseMapper>
  cfg: ReturnType<typeof createConfigService>
}

export const bookingRouteV1 = (svc: ReturnType<typeof bookingService>, deps: RouteDeps) =>
  new Elysia({ prefix: 'bookings', tags: ['bookings'] })
    .use(authMacro(deps.cfg.get('jwt_secret')))
    .model(BookingModels)

    .get(
      '/',
      async ({ currentUser }) => {
        const items = await svc.listByUser(currentUser.id)
        return deps.response.success<BookingView[]>('OK', items)
      },
      { auth: true },
    )

    .post(
      '/',
      async ({ currentUser, body }) => {
        const booking = await svc.create(currentUser.id, body)
        return deps.response.success<BookingView>('Booking created', booking)
      },
      { auth: true, body: 'booking.create' },
    )
