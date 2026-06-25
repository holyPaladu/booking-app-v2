import { t } from 'elysia'

export const BookingModels = {
  'booking.create': t.Object({
    room_id: t.String({ minLength: 1 }),
    starts_at: t.String({ minLength: 1 }),
    ends_at: t.String({ minLength: 1 }),
  }),
}

// Single source of truth: тип запроса выводим из модели.
export type BookingCreateRequest = (typeof BookingModels)['booking.create']['static']
