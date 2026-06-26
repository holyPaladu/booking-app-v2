import type { SqlClient } from '@booking/shared'
import type { UserCredentials, UserView } from '@modules/entities/user.entity'
import type { IUserRepo } from '@modules/ports/user.port'

export const userRepo = (sql: SqlClient): IUserRepo => ({
  create: async (input) => {
    const [row] = await sql<UserView[]>`
      INSERT INTO users (email, password_hash)
      VALUES (${input.email}, ${input.password_hash})
      RETURNING id, email, status
    `
    return row
  },
  findByEmail: async (email) => {
    const [row] = await sql<UserCredentials[]>`
      SELECT id, email, password_hash
      FROM users
      WHERE email = ${email} AND deleted_at IS NULL
    `
    return row
  },
  findById: async (id) => {
    const [row] = await sql<UserView[]>`
      SELECT id, email, status
      FROM users
      WHERE id = ${id} AND deleted_at IS NULL
    `
    return row
  },
})
