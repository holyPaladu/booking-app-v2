import { SqlClient } from '../../shared/db'
import { UserCreated, UserFind } from './types/entity'
import { IAuthRepo } from "./types/ports/repo.port"

export const AuthRepo = (sql: SqlClient): IAuthRepo => {
  return {
    find: async (email) => {
      const [row] = await sql<UserFind[]>`
        SELECT id, email, email_verificated, deleted_at FROM users
        WHERE email = ${email}
        LIMIT 1
      `
      return row
    },
    create: async (email, hash) => {
      const [row] = await sql<UserCreated[]>`
        INSERT INTO users (email, password_hash)
        VALUES (${email}, ${hash})
        RETURNING id, email
      `
      return row
    },
    put: async (dto) => {
      const [row] = await sql<UserCreated[]>`
        UPDATE users
        SET
          email = COALESCE(${dto.email}, email),
          email_verificated = COALESCE(${dto.email_verificated}, email_verificated),
          password_hash = COALESCE(${dto.password_hash}, password_hash)
          updated_at = NOW()
        WHERE id = ${dto.id}
        RETURNING id, email
      `
      return row
    }
  }
}