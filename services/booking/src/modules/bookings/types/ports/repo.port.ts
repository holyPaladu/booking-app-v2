import type { BookingView } from '../entity'

export type CreateBookingInput = {
  user_id: string
  room_id: string
  starts_at: string
  ends_at: string
}

export type IBookingRepo = {
  create: (input: CreateBookingInput) => Promise<BookingView>
  findByUser: (userId: string) => Promise<BookingView[]>
}
