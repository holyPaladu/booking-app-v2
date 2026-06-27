// Адаптеры безопасности 2FA. Чистый модуль: без БД и Elysia, опции инжектятся (для
// юнит-тестов без глобального cfg). Bun-глобалы crypto/crypto.subtle/Buffer, без
// node:crypto — как auth.security.
//
//  • TOTP    — RFC 6238 (шаг 30с, 6 цифр, HMAC-SHA1 через Web Crypto).
//  • base32  — RFC 4648 (секрет хранится/показывается в base32; для otpauth-URI).
//  • secret  — AES-256-GCM шифрование секрета в покое (колонка secret_enc).
//  • recovery — одноразовые коды (показ один раз, в БД — только SHA-256-хэш).

export type TwoFactorSecurityOpts = {
  encKey: string // base64 от 32 байт (AES-256)
  issuer: string // имя в otpauth-URI (бренд в authenticator-приложении)
  window: number // допуск ± шагов TOTP при проверке (рассинхрон часов)
  recoveryCodesCount: number
}

export type ITwoFactorSecurity = {
  generateSecret: () => string
  totp: (secretB32: string, atMs?: number) => Promise<string>
  verifyTotp: (secretB32: string, code: string, atMs?: number) => Promise<boolean>
  encryptSecret: (plain: string) => Promise<string>
  decryptSecret: (enc: string) => Promise<string>
  otpauthUri: (email: string, secretB32: string) => string
  generateRecoveryCodes: () => string[]
  hashRecoveryCode: (code: string) => string
}

const STEP_SECONDS = 30
const DIGITS = 6

const sha256 = (value: string) => new Bun.CryptoHasher('sha256').update(value).digest('hex')

// WebCrypto (lib.dom) хочет BufferSource с ArrayBuffer-бэкингом; копируем вьюху в
// собственный ArrayBuffer (учитывая byteOffset пула Buffer).
const toArrayBuffer = (b: Uint8Array): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

// Сравнение в постоянном времени по равной длине (идиома из auth.security.otpService).
const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ─── base32 (RFC 4648) ────────────────────────────────────────────────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

const encodeBase32 = (bytes: Uint8Array): string => {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

const decodeBase32 = (str: string): Uint8Array => {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of str.replace(/=+$/, '').toUpperCase()) {
    const idx = B32.indexOf(ch)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Uint8Array.from(out)
}

// ─── TOTP (RFC 6238 / HOTP RFC 4226) ───────────────────────────────────────────
const importHmacKey = (keyBytes: Uint8Array) =>
  crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), { name: 'HMAC', hash: 'SHA-1' }, false, [
    'sign',
  ])

const hotp = async (key: CryptoKey, counter: number): Promise<string> => {
  const msg = new Uint8Array(8) // 64-битный счётчик big-endian (через деление — без 32-бит overflow)
  let c = counter
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff
    c = Math.floor(c / 256)
  }
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, toArrayBuffer(msg)))
  const offset = sig[19] & 0x0f // dynamic truncation (RFC 4226 §5.3)
  const bin =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff)
  return (bin % 10 ** DIGITS).toString().padStart(DIGITS, '0')
}

export const twoFactorSecurity = (opts: TwoFactorSecurityOpts): ITwoFactorSecurity => {
  // Ключ AES импортируем один раз (лениво), переиспользуем промис.
  let aesKey: Promise<CryptoKey> | undefined
  const getAesKey = () => {
    if (!aesKey) {
      const raw = Buffer.from(opts.encKey, 'base64')
      if (raw.length !== 32)
        throw new Error('TWO_FACTOR_ENC_KEY must be base64-encoded 32 bytes (AES-256)')
      aesKey = crypto.subtle.importKey('raw', toArrayBuffer(raw), { name: 'AES-GCM' }, false, [
        'encrypt',
        'decrypt',
      ])
    }
    return aesKey
  }

  const normalize = (code: string) => code.trim().toUpperCase()

  return {
    generateSecret: () => encodeBase32(crypto.getRandomValues(new Uint8Array(20))),

    totp: async (secretB32, atMs = Date.now()) => {
      const key = await importHmacKey(decodeBase32(secretB32))
      return hotp(key, Math.floor(atMs / 1000 / STEP_SECONDS))
    },

    verifyTotp: async (secretB32, code, atMs = Date.now()) => {
      if (code.length !== DIGITS) return false
      const key = await importHmacKey(decodeBase32(secretB32))
      const counter = Math.floor(atMs / 1000 / STEP_SECONDS)
      for (let w = -opts.window; w <= opts.window; w++) {
        if (timingSafeEqual(code, await hotp(key, counter + w))) return true
      }
      return false
    },

    encryptSecret: async (plain) => {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const ct = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: toArrayBuffer(iv) },
          await getAesKey(),
          toArrayBuffer(new TextEncoder().encode(plain)),
        ),
      )
      return `${Buffer.from(iv).toString('base64')}.${Buffer.from(ct).toString('base64')}`
    },

    decryptSecret: async (enc) => {
      const [ivB64, ctB64] = enc.split('.')
      if (!ivB64 || !ctB64) throw new Error('Malformed encrypted secret')
      const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(Buffer.from(ivB64, 'base64')) },
        await getAesKey(),
        toArrayBuffer(Buffer.from(ctB64, 'base64')),
      )
      return new TextDecoder().decode(pt)
    },

    otpauthUri: (email, secretB32) => {
      const label = `${encodeURIComponent(opts.issuer)}:${encodeURIComponent(email)}`
      const query = new URLSearchParams({
        secret: secretB32,
        issuer: opts.issuer,
        algorithm: 'SHA1',
        digits: String(DIGITS),
        period: String(STEP_SECONDS),
      })
      return `otpauth://totp/${label}?${query.toString()}`
    },

    generateRecoveryCodes: () =>
      Array.from({ length: opts.recoveryCodesCount }, () => {
        const b32 = encodeBase32(crypto.getRandomValues(new Uint8Array(5))) // ровно 8 символов
        return `${b32.slice(0, 4)}-${b32.slice(4, 8)}`
      }),

    hashRecoveryCode: (code) => sha256(normalize(code)),
  }
}
