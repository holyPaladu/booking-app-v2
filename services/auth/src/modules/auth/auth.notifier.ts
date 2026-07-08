// Доставка уведомлений auth-флоу. Сейчас — лог-заглушка; позже за этим портом
// реальный провайдер (SMTP/Resend) без изменений в вызывающем коде.

export type VerificationMessage = {
  email: string
  otp: string
  expiresAt: string
}

export type PasswordResetMessage = {
  email: string
  otp: string
  expiresAt: string
}

export type INotifier = {
  sendVerification: (msg: VerificationMessage) => Promise<void>
  sendPasswordReset: (msg: PasswordResetMessage) => Promise<void>
}

export const logNotifier = (): INotifier => ({
  sendVerification: async ({ email, otp, expiresAt }) => {
    console.log(`[mail] verification OTP for ${email}: ${otp} (expires ${expiresAt})`)
  },
  sendPasswordReset: async ({ email, otp, expiresAt }) => {
    console.log(`[mail] password-reset OTP for ${email}: ${otp} (expires ${expiresAt})`)
  },
})
