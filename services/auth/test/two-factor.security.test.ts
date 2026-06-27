import { describe, expect, it } from 'bun:test'
import { twoFactorSecurity } from '../src/modules/two-factor/two-factor.security'

// Чистый адаптер — без БД/cfg. Опции инжектим прямо.
const sec = twoFactorSecurity({
  encKey: Buffer.alloc(32, 7).toString('base64'), // фиксированный 32-байтный ключ AES-256
  issuer: 'BookingApp',
  window: 1,
  recoveryCodesCount: 10,
})

// RFC 6238, секрет SHA-1 = ASCII "12345678901234567890" в base32.
const RFC_SEED_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('two-factor security: TOTP (RFC 6238)', () => {
  it('matches the SHA-1 reference vectors (6-digit truncation)', async () => {
    expect(await sec.totp(RFC_SEED_B32, 59_000)).toBe('287082')
    expect(await sec.totp(RFC_SEED_B32, 1_111_111_109_000)).toBe('081804')
  })

  it('verifies a code at its own timestamp and rejects a wrong one', async () => {
    expect(await sec.verifyTotp(RFC_SEED_B32, '287082', 59_000)).toBe(true)
    expect(await sec.verifyTotp(RFC_SEED_B32, '000000', 59_000)).toBe(false)
  })

  it('accepts an adjacent step within the window', async () => {
    // counter(59s)=1; код шага counter=0 (T=29s) должен приниматься при window=1.
    const prevStep = await sec.totp(RFC_SEED_B32, 29_000)
    expect(await sec.verifyTotp(RFC_SEED_B32, prevStep, 59_000)).toBe(true)
  })

  it('generate → verify round-trips for a fresh secret', async () => {
    const secret = sec.generateSecret()
    expect(secret).toMatch(/^[A-Z2-7]+$/)
    expect(await sec.verifyTotp(secret, await sec.totp(secret))).toBe(true)
  })
})

describe('two-factor security: secret encryption (AES-256-GCM)', () => {
  it('encrypt → decrypt round-trips and does not leak plaintext', async () => {
    const plain = 'JBSWY3DPEHPK3PXP'
    const enc = await sec.encryptSecret(plain)

    expect(enc).toContain('.') // формат iv.ciphertext
    expect(enc).not.toContain(plain)
    expect(await sec.decryptSecret(enc)).toBe(plain)
  })

  it('uses a fresh IV per call (ciphertext differs for same input)', async () => {
    const [a, b] = await Promise.all([sec.encryptSecret('x'), sec.encryptSecret('x')])
    expect(a).not.toBe(b)
  })
})

describe('two-factor security: recovery codes', () => {
  it('generates the configured count in xxxx-xxxx format', () => {
    const codes = sec.generateRecoveryCodes()
    expect(codes).toHaveLength(10)
    for (const c of codes) expect(c).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/)
  })

  it('hashes deterministically and case-insensitively (vs login input)', () => {
    expect(sec.hashRecoveryCode('ABCD-EFGH')).toBe(sec.hashRecoveryCode('abcd-efgh'))
    expect(sec.hashRecoveryCode('ABCD-EFGH')).not.toBe(sec.hashRecoveryCode('ABCD-EFGZ'))
  })
})

describe('two-factor security: otpauth URI', () => {
  it('embeds the base32 secret and issuer', () => {
    const uri = sec.otpauthUri('user@example.com', RFC_SEED_B32)
    expect(uri.startsWith('otpauth://totp/')).toBe(true)
    expect(uri).toContain(`secret=${RFC_SEED_B32}`)
    expect(uri).toContain('issuer=BookingApp')
    expect(uri).toContain('algorithm=SHA1')
  })
})
