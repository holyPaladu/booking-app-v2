import postgres from "postgres";

let sql
export const createSql = () => {
  sql = postgres(Bun.env.DATABASE_URL!, {
    max: 10,
    idle_timeout: 20,
  })
  return sql
}
export type SqlClient = postgres.Sql