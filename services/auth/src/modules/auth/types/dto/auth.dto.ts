export interface AuthRegisterRequest { email: string, password: string }
export interface AuthLoginRequest extends AuthRegisterRequest {}