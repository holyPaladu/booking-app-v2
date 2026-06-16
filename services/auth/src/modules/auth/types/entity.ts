export interface User {
  id: string
  email: string
  email_verificated: boolean
  password_hash: string
  created_at: Date
  updated_at: Date
  deleted_at?: Date
}
export type UserFind = Pick<User, 'id' | 'email' | 'email_verificated' | 'password_hash' | 'deleted_at'>
export type UserCreated = Pick<User, 'id' | 'email'>