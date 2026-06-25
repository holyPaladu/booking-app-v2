import type { SqlClient } from '@booking/shared'
import type { BookingView } from './types/entity'
import type { IBookingRepo } from './types/ports/repo.port'

export const bookingRepo = (sql: SqlClient): IBookingRepo => ({
  create: async (input) => {
    const [row] = await sql<BookingView[]>`
      INSERT INTO bookings (user_id, room_id, starts_at, ends_at)
      VALUES (${input.user_id}, ${input.room_id}, ${input.starts_at}, ${input.ends_at})
      RETURNING id, user_id, room_id, starts_at, ends_at, status
    `
    return row
  },
  findByUser: async (userId) => {
    return sql<BookingView[]>`
      SELECT id, user_id, room_id, starts_at, ends_at, status
      FROM bookings
      WHERE user_id = ${userId}
      ORDER BY starts_at DESC
    `
  },
})
