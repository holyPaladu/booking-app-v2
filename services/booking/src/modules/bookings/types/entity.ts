export type BookingStatus = 'pending' | 'confirmed' | 'cancelled'

export interface Booking {
  id: string
  user_id: string
  room_id: string
  starts_at: string
  ends_at: string
  status: BookingStatus
  created_at: string
  updated_at: string
}

// То, что возвращаем наружу (без служебных таймстампов).
export type BookingView = Pick<
  Booking,
  'id' | 'user_id' | 'room_id' | 'starts_at' | 'ends_at' | 'status'
>
