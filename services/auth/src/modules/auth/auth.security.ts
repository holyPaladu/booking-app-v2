import { cfg } from 'src/config'

// Адаптеры безопасности auth-флоу: пароль (argon2id) и OTP (короткий SHA-256).

export type IHashService = {
  hash: (value: string) => Promise<string>
  verify: (value: string, hash: string) => Promise<boolean>
}

// OTP хэшируем быстрым SHA-256, НЕ argon2: код короткоживущий и сверяется по равенству.
export type IOtpService = {
  generate: () => string
  hash: (otp: string) => string
  verify: (otp: string, hash: string) => boolean
}

// Refresh-токен: непрозрачная случайная строка; в БД (sessions) хранится только её
// SHA-256-хэш. Сравнение при ротации — по равенству хэшей.
export type IRefreshTokenService = {
  generate: () => string
  hash: (token: string) => string
}

export const hashService = (): IHashService => {
  const hashConfig = {
    algorithm: 'argon2id',
    memoryCost: cfg.getNumber('argon_memory'),
    timeCost: cfg.getNumber('argon_time_cost'),
  } as const

  return {
    hash: (value) => Bun.password.hash(value, hashConfig),
    verify: (value, hash) => Bun.password.verify(value, hash),
  }
}

// SHA-256 → hex через Bun-native хэшер (как Bun.password выше, без node:crypto).
const sha256 = (value: string) => new Bun.CryptoHasher('sha256').update(value).digest('hex')

// Равномерный 6-значный код через Web Crypto (crypto — глобал в Bun). Хвост 32-бит
// диапазона отбрасываем (rejection sampling), чтобы не было перекоса по modulo.
const REJECT_AT = 4_294_000_000 // floor(2^32 / 1e6) * 1e6
const randomOtp = () => {
  const buf = new Uint32Array(1)
  let n: number
  do {
    crypto.getRandomValues(buf)
    n = buf[0]
  } while (n >= REJECT_AT)
  return (n % 1_000_000).toString().padStart(6, '0')
}

export const otpService = (): IOtpService => ({
  generate: randomOtp,
  hash: (otp) => sha256(otp),
  // Сравнение в постоянном времени по равной длине hex (без node:crypto.timingSafeEqual).
  verify: (otp, hash) => {
    const a = sha256(otp)
    if (a.length !== hash.length) return false
    let diff = 0
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ hash.charCodeAt(i)
    return diff === 0
  },
})

export const refreshTokenService = (): IRefreshTokenService => ({
  // 32 байта энтропии → hex. crypto.getRandomValues — Web Crypto глобал в Bun
  // (тот же, что и в randomOtp выше), НЕ node:crypto.
  generate: () => {
    const buf = new Uint8Array(32)
    crypto.getRandomValues(buf)
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
  },
  hash: (token) => sha256(token),
})
