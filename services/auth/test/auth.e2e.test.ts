import { describe, expect, it } from 'bun:test'
import { createConfigService, mapError, responseMapper } from '@booking/shared'
import { Elysia } from 'elysia'
import { authRouteV1 } from '../src/modules/routes/v1/auth.route'
import { authService } from '../src/modules/services/auth.service'
import type { IUserService } from '../src/modules/ports/user.port'

// E2E через app.handle() с in-memory user-модулем — без Postgres.
// auth не знает про БД: ему передаётся фейковый IUserService (та же подмена, что и в проде).
function buildApp() {
  const rows: { id: string; email: string; password_hash: string; status: 'active' }[] = []
  const users: IUserService = {
    create: async ({ email, password_hash }) => {
      const u = { id: crypto.randomUUID(), email, password_hash, status: 'active' as const }
      rows.push(u)
      return { id: u.id, email: u.email, status: u.status }
    },
    findByEmail: async (email) => rows.find((u) => u.email === email),
    getById: async (id) => {
      const u = rows.find((r) => r.id === id)
      return u && { id: u.id, email: u.email, status: u.status }
    },
  }
  const cfg = createConfigService({
    jwt_secret: { key: 'JWT_SECRET', default: 'test-secret' },
    jwt_expiry: { key: 'JWT_EXPIRY', default: '15m' },
  })
  const response = responseMapper()
  const svc = authService(users)
  return new Elysia()
    .onError(({ code, error, set }) => {
      const { status, body } = mapError(code, error, response)
      set.status = status
      return body
    })
    .group('/api', (api) => api.group('/v1', (v1) => v1.use(authRouteV1(svc, { response, cfg }))))
}

const app = buildApp()
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

describe('auth e2e (in-memory repo)', () => {
  it('registers a new user', async () => {
    const r = await call('POST', '/api/v1/auth/register', { email: 'a@b.com', password: 'secret1' })
    expect(r.status).toBe(200)
    expect(r.json.success).toBe(true)
    expect(r.json.data.email).toBe('a@b.com')
  })

  it('logs in and returns a real JWT', async () => {
    const r = await call('POST', '/api/v1/auth/login', { email: 'a@b.com', password: 'secret1' })
    expect(r.status).toBe(200)
    const token: string = r.json.data.token
    expect(typeof token).toBe('string')
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    expect(payload.email).toBe('a@b.com')
    expect(payload.sub).toBeTruthy()
    expect(payload.exp).toBeTruthy()
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
