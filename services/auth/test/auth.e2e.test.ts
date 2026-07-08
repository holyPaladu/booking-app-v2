import { describe, expect, it } from 'bun:test'
import { UnauthorizedError, createConfigService, mapError, responseMapper } from '@booking/shared'
import { Elysia } from 'elysia'
import type { TxRunner } from '../src/lib/tx'
import type { IAuditService } from '../src/modules/audit'
import type { IAuthRepo } from '../src/modules/auth/auth.port'
import { authRouteV1 } from '../src/modules/auth/auth.route'
import type { IHashService, IOtpService } from '../src/modules/auth/auth.security'
import { authService } from '../src/modules/auth/auth.service'
import type { ILoginAttemptService } from '../src/modules/login-attempt'
import type { IOutboxService, OutboxJob } from '../src/modules/outbox'
import type { ISessionService } from '../src/modules/session'
import type { ITwoFactorService } from '../src/modules/two-factor/two-factor.port'
import type { IUserService } from '../src/modules/user/user.port'

// E2E через app.handle() с in-memory фейками всех портов — без Postgres.
// runTx — pass-through: транзакция фиктивна, фейки просто исполняют work().
function buildApp() {
  const rows: {
    id: string
    email: string
    emailVerified: boolean
    phone: string | null
    passwordHash: string
    status: 'active'
    bannedReason: string | null
    bannedAt: Date | null
    bannedBy: string | null
    tokenVersion: number
  }[] = []
  const granted: string[] = []
  const verifications: {
    id: string
    userId: string
    type: string
    identifier: string
    tokenHash: string
    attempts: number
    maxAttempts: number
    used: boolean
    expiresAt: string
  }[] = []
  const enqueued: OutboxJob[] = []
  const audited: string[] = []
  const sessionsCreated: { userId: string; refreshToken: string }[] = []
  const twoFaUsers = new Set<string>() // user_id с включённой 2FA

  const users: IUserService = {
    create: async ({ email, phone, passwordHash }) => {
      const u = {
        id: crypto.randomUUID(),
        email,
        emailVerified: false,
        phone: phone ?? null,
        passwordHash,
        status: 'active' as const,
        bannedReason: null,
        bannedAt: null,
        bannedBy: null,
        tokenVersion: 0,
      }
      rows.push(u)
      return { id: u.id, email: u.email, status: u.status }
    },
    getByEmail: async (email) => rows.find((u) => u.email === email),
    getByPhone: async (phone) => {
      const u = rows.find((r) => r.phone === phone)
      return u && { id: u.id, email: u.email, status: u.status }
    },
    getById: async (id) => {
      const u = rows.find((r) => r.id === id)
      return u && { id: u.id, email: u.email, status: u.status }
    },
    getCredentialsById: async (id) => rows.find((r) => r.id === id),
    findById: async (id) => {
      const u = rows.find((r) => r.id === id)
      if (!u) throw new Error('not found')
      return { id: u.id, email: u.email, status: u.status }
    },
    patchEmailVerified: async (id) => {
      const u = rows.find((r) => r.id === id)
      if (u) u.emailVerified = true
    },
    patchPassword: async (id, newPassword) => {
      const u = rows.find((r) => r.id === id)
      if (u) {
        u.passwordHash = newPassword
        u.tokenVersion += 1
      }
      return { tokenVersion: u?.tokenVersion ?? 0 }
    },
  }

  // Побочные записи auth с одним писателем — порт IAuthRepo.
  const repo: IAuthRepo = {
    grantDefaultRole: async (userId) => void granted.push(userId),
    createVerificationToken: async (input) =>
      void verifications.push({
        id: crypto.randomUUID(),
        userId: input.userId,
        type: input.type,
        identifier: input.identifier,
        tokenHash: input.tokenHash,
        attempts: 0,
        maxAttempts: 5,
        used: false,
        expiresAt: input.expiresAt,
      }),
    // Единственный активный (used=FALSE, не протухший) токен по identifier+type —
    // зеркало idx_vt_one_active_per_type.
    findAvailableVerificationToken: async (email, verificationType) => {
      const v = verifications.find(
        (t) =>
          t.identifier === email &&
          t.type === verificationType &&
          !t.used &&
          new Date(t.expiresAt).getTime() > Date.now(),
      )
      return (
        v && {
          id: v.id,
          userId: v.userId,
          tokenHash: v.tokenHash,
          attempts: v.attempts,
          maxAttempts: v.maxAttempts,
          used: v.used,
          usedAt: '',
          expiresAt: v.expiresAt,
        }
      )
    },
    changeAttemptVerificationToken: async (id) => {
      const v = verifications.find((t) => t.id === id)
      if (v) v.attempts += 1
      return { attempts: v?.attempts ?? 0 }
    },
    markVerificationTokenAsUsed: async (id) => {
      const v = verifications.find((t) => t.id === id)
      if (v) v.used = true
    },
    invalidateActiveVerificationTokens: async (userId, verificationType) => {
      for (const t of verifications) {
        if (t.userId === userId && t.type === verificationType && !t.used) t.used = true
      }
    },
  }
  // 2FA-модуль через service-порт: гейт по twoFaUsers, фиктивный код '654321'.
  const twoFactor: ITwoFactorService = {
    isEnabled: async (userId) => twoFaUsers.has(userId),
    setup: async () => ({ secret: 'SECRET', otpauth_uri: 'otpauth://totp/x' }),
    confirm: async () => ({ recovery_codes: ['aaaa-bbbb'] }),
    disable: async () => {},
    regenerateRecoveryCodes: async () => ({ recovery_codes: ['cccc-dddd'] }),
    verifyForLogin: async (_userId, code) => {
      if (code !== '654321') throw new UnauthorizedError('Invalid 2FA code', 'INVALID_2FA')
    },
  }
  const audit: IAuditService = { record: async (entry) => void audited.push(entry.event) }
  const loginAttempts: ILoginAttemptService = {
    record: async () => {},
    checkLimit: async () => {},
  }
  const session: ISessionService = {
    issue: async (input) => {
      const refreshToken = `rt:${crypto.randomUUID()}`
      sessionsCreated.push({ userId: input.userId, refreshToken })
      return {
        sessionId: crypto.randomUUID(),
        refreshToken,
        expiresAt: new Date(Date.now() + 1000),
      }
    },
    findSession: async () => undefined,
    markUsed: async () => {},
    revokeById: async () => {},
    revokeAllByUserIdAndTokenVersion: async () => {},
  }
  const outbox: IOutboxService = { enqueue: async (job) => void enqueued.push(job) }
  const hash: IHashService = {
    hash: async (v) => `h:${v}`,
    verify: async (v, h) => h === `h:${v}`,
  }
  const otp: IOtpService = {
    generate: () => '123456',
    hash: (code) => `oh:${code}`,
    verify: (code, h) => h === `oh:${code}`,
  }
  const runTx: TxRunner = (work) => work()

  const svc = authService({
    users,
    repo,
    audit,
    loginAttempts,
    session,
    outbox,
    hash,
    otp,
    twoFactor,
    runTx,
  })

  const cfg = createConfigService({
    jwt_secret: { key: 'JWT_SECRET', default: 'test-secret' },
    jwt_expiry: { key: 'JWT_EXPIRY', default: '15m' },
    two_factor_challenge_ttl: { key: 'TWO_FACTOR_CHALLENGE_TTL', default: '5m' },
  })
  const response = responseMapper()
  const app = new Elysia()
    .onError(({ code, error, set }) => {
      const { status, body } = mapError(code, error, response)
      set.status = status
      return body
    })
    .group('/api', (api) => api.group('/v1', (v1) => v1.use(authRouteV1(svc, { response, cfg }))))

  return {
    app,
    state: { rows, granted, verifications, enqueued, audited, sessionsCreated, twoFaUsers },
  }
}

const { app, state } = buildApp()
async function call(method: string, path: string, body?: unknown) {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }),
  )
  return { status: res.status, json: (await res.json().catch(() => null)) as any }
}

let challengeToken = '' // переносим challenge между шагом-1 и шагом-2 логина

describe('auth e2e (in-memory ports)', () => {
  it('registers a new user and runs the full critical path', async () => {
    const r = await call('POST', '/api/v1/auth/register', { email: 'a@b.com', password: 'secret1' })
    expect(r.status).toBe(200)
    expect(r.json.success).toBe(true)

    // user создан, роль выдана, токен записан (только хэш), audit и outbox заполнены
    expect(state.rows).toHaveLength(1)
    expect(state.granted).toEqual([state.rows[0].id])
    expect(state.verifications).toHaveLength(1)
    expect(state.verifications[0].tokenHash).toBe('oh:123456')
    expect(state.audited).toContain('account_created')
    expect(state.enqueued).toHaveLength(1)
    expect(state.enqueued[0].topic).toBe('email.verification')
    expect(state.enqueued[0].payload).toMatchObject({ email: 'a@b.com', otp: '123456' })
  })

  it('logs in and returns access + refresh tokens', async () => {
    const r = await call('POST', '/api/v1/auth/login', { email: 'a@b.com', password: 'secret1' })
    expect(r.status).toBe(200)

    const access: string = r.json.data.access_token
    expect(typeof access).toBe('string')
    const payload = JSON.parse(Buffer.from(access.split('.')[1], 'base64url').toString())
    expect(payload.email).toBe('a@b.com')
    expect(payload.sub).toBeTruthy()
    expect(payload.exp).toBeTruthy()

    // refresh-токен выдан и создана сессия с привязкой к пользователю
    expect(typeof r.json.data.refresh_token).toBe('string')
    expect(r.json.data.token_type).toBe('Bearer')
    expect(state.sessionsCreated).toHaveLength(1)
    expect(state.sessionsCreated[0].userId).toBe(state.rows[0].id)
    expect(state.audited).toContain('login_success')
  })

  it('short-circuits with two_factor_required (challenge token, no tokens, no session)', async () => {
    state.twoFaUsers.add(state.rows[0].id)
    const before = state.sessionsCreated.length

    const r = await call('POST', '/api/v1/auth/login', { email: 'a@b.com', password: 'secret1' })
    expect(r.status).toBe(200)
    expect(r.json.data.two_factor_required).toBe(true)
    expect(typeof r.json.data.challenge_token).toBe('string')
    expect(r.json.data.access_token).toBeUndefined()
    expect(r.json.data.refresh_token).toBeUndefined()
    expect(state.sessionsCreated).toHaveLength(before) // сессия не создана

    challengeToken = r.json.data.challenge_token
  })

  it('completes 2FA login with a valid code and returns access + refresh tokens', async () => {
    const before = state.sessionsCreated.length

    const r = await call('POST', '/api/v1/auth/login/2fa', {
      challenge_token: challengeToken,
      code: '654321',
    })
    expect(r.status).toBe(200)
    expect(typeof r.json.data.access_token).toBe('string')
    expect(typeof r.json.data.refresh_token).toBe('string')
    expect(r.json.data.token_type).toBe('Bearer')
    expect(state.sessionsCreated).toHaveLength(before + 1)
  })

  it('rejects an invalid 2FA code with 401', async () => {
    const login = await call('POST', '/api/v1/auth/login', {
      email: 'a@b.com',
      password: 'secret1',
    })
    const r = await call('POST', '/api/v1/auth/login/2fa', {
      challenge_token: login.json.data.challenge_token,
      code: '000000',
    })
    expect(r.status).toBe(401)
    expect(r.json.code).toBe('INVALID_2FA')

    state.twoFaUsers.delete(state.rows[0].id)
  })

  it('rejects wrong password with 401', async () => {
    const r = await call('POST', '/api/v1/auth/login', { email: 'a@b.com', password: 'wrongpass' })
    expect(r.status).toBe(401)
    expect(r.json.code).toBe('INVALID_CREDENTIALS')
  })

  it('rejects too-short password with 422 (validation)', async () => {
    const r = await call('POST', '/api/v1/auth/register', { email: 'x@y.com', password: 'no' })
    expect(r.status).toBe(422)
    expect(r.json.code).toBe('VALIDATION')
  })

  it('rejects duplicate registration with 409', async () => {
    const r = await call('POST', '/api/v1/auth/register', { email: 'a@b.com', password: 'secret1' })
    expect(r.status).toBe(409)
    expect(r.json.code).toBe('ALREADY_EXISTS')
  })
})
