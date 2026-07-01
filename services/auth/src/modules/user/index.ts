// Публичная поверхность модуля user (@modules/user).
export { userRepo } from './user.repo'
export { userService } from './user.service'
export { userRouteV1 } from './user.route'
export type { CreateUserInput, IUserRepo, IUserService } from './user.port'
export type { UserCredentials, UserEntity, UserStatus, UserView } from './user.entity'
