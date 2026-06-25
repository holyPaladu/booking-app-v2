import type { SqlClient } from '@booking/shared'
import type { IAuthRepo } from './ports/repo.port'

export const authRepo = (sql: SqlClient): IAuthRepo => {
  return {
  }
}