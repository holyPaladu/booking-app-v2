import type { SqlClient } from '@booking/shared'
import type { UserCredentials, UserView } from './user.entity'
import type { IUserRepo } from './user.port'

export const userRepo = (sql: SqlClient): IUserRepo => ({
  create: async (input, exec = sql) => {
    const [row] = await exec<UserView[]>`
      INSERT INTO users (email, phone, password_hash)
      VALUES (${input.email}, ${input.phone ?? null}, ${input.password_hash})
      RETURNING id, email, status
    `
    return row
  },
  findByEmail: async (email, exec = sql) => {
    const [row] = await exec<UserCredentials[]>`
      SELECT id, email, password_hash
      FROM users
      WHERE email = ${email} AND deleted_at IS NULL
    `
    return row
  },
  findByPhone: async (phone, exec = sql) => {
    const [row] = await exec<UserView[]>`
      SELECT id, email, status
      FROM users
      WHERE phone = ${phone} AND deleted_at IS NULL
    `
    return row
  },
  findById: async (id, exec = sql) => {
    const [row] = await exec<UserView[]>`
      SELECT id, email, status
      FROM users
      WHERE id = ${id} AND deleted_at IS NULL
    `
    return row
  },
})
