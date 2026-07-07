import type { Db } from '@lib/tx'
import type { UserCredentials, UserView } from './user.entity'
import type { IUserRepo } from './user.port'

export const userRepo = (db: Db): IUserRepo => ({
  create: async (input) => {
    const sql = db()
    const [row] = await sql<UserView[]>`
      INSERT INTO users (email, phone, password_hash)
      VALUES (${input.email}, ${input.phone ?? null}, ${input.passwordHash})
      RETURNING id, email, status
    `
    return row
  },
  findByEmail: async (email) => {
    const sql = db()
    const [row] = await sql<UserCredentials[]>`
      SELECT id, email,
             password_hash  AS "passwordHash",
             email_verified AS "emailVerified",
             status,
             banned_at      AS "bannedAt",
             banned_by      AS "bannedBy",
             banned_reason  AS "bannedReason",
             token_version  AS "tokenVersion"
      FROM users
      WHERE email = ${email} AND deleted_at IS NULL
    `
    return row
  },
  findByPhone: async (phone) => {
    const sql = db()
    const [row] = await sql<UserView[]>`
      SELECT id, email, status
      FROM users
      WHERE phone = ${phone} AND deleted_at IS NULL
    `
    return row
  },
  findById: async (id) => {
    const sql = db()
    const [row] = await sql<UserView[]>`
      SELECT id, email, status
      FROM users
      WHERE id = ${id} AND deleted_at IS NULL
    `
    return row
  },
  // Кредненшелы по id для auth-флоу (ротация refresh — нужна token_version). Зеркало
  // findByEmail; наружу не отдаётся (в отличие от findById → UserView).
  findCredentialsById: async (id) => {
    const sql = db()
    const [row] = await sql<UserCredentials[]>`
      SELECT id, email,
             password_hash  AS "passwordHash",
             email_verified AS "emailVerified",
             status,
             banned_at      AS "bannedAt",
             banned_by      AS "bannedBy",
             banned_reason  AS "bannedReason",
             token_version  AS "tokenVersion"
      FROM users
      WHERE id = ${id} AND deleted_at IS NULL
    `
    return row
  },
})
