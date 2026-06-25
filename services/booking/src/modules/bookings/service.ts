import { BadRequestError } from '@booking/shared'
import type { BookingCreateRequest } from './models'
import type { IBookingRepo } from './types/ports/repo.port'

export const bookingService = (repo: IBookingRepo) => ({
  create: async (userId: string, dto: BookingCreateRequest) => {
    const starts = new Date(dto.starts_at)
    const ends = new Date(dto.ends_at)

    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()))
      throw new BadRequestError('Invalid date format', 'INVALID_DATE')
    if (ends <= starts)
      throw new BadRequestError('ends_at must be after starts_at', 'INVALID_RANGE')

    return repo.create({
      user_id: userId,
      room_id: dto.room_id,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
    })
  },

  listByUser: (userId: string) => repo.findByUser(userId),
})
