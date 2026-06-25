import type { SqlClient } from '@booking/shared'
import { type Migration, applyMigrations } from '@booking/shared'

export function runMigrations(sql: SqlClient): Promise<void> {
  return applyMigrations(sql, MIGRATIONS)
}

const MIGRATIONS: Migration[] = [
  {
    version: '001_create_bookings',
    up: async (sql) => {
      await sql`
        CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled')
      `
      await sql`
        CREATE TABLE bookings (
          id         UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id    UUID           NOT NULL,
          room_id    UUID           NOT NULL,
          starts_at  TIMESTAMPTZ    NOT NULL,
          ends_at    TIMESTAMPTZ    NOT NULL,
          status     booking_status NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

          CONSTRAINT bookings_time_range CHECK (ends_at > starts_at)
        )
      `
      await sql`CREATE INDEX idx_bookings_user_id ON bookings (user_id)`
    },
  },
]
