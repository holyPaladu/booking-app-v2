import { beforeAll, describe, expect, it } from 'bun:test'
import { createConfigService, mapError, responseMapper } from '@booking/shared'
import { jwt } from '@elysiajs/jwt'
import { Elysia } from 'elysia'
import { bookingService } from '../src/modules/bookings/service'
import type { IBookingRepo } from '../src/modules/bookings/types/ports/repo.port'
import { bookingRouteV1 } from '../src/modules/bookings/v1.route'

const SECRET = 'test-secret'
const USER_ID = crypto.randomUUID()

function buildApp() {
  const rows: Array<{
    id: string
    user_id: string
    room_id: string
    starts_at: string
    ends_at: string
    status: 'pending'
  }> = []
  const repo: IBookingRepo = {
    create: async (input) => {
      const row = { id: crypto.randomUUID(), status: 'pending' as const, ...input }
      rows.push(row)
      return row
    },
    findByUser: async (userId) => rows.filter((r) => r.user_id === userId),
  }
  const cfg = createConfigService({
    jwt_secret: { key: 'JWT_SECRET', default: SECRET },
    port: { key: 'PORT', default: '3001' },
  })
  const response = responseMapper()
  const svc = bookingService(repo)
  return new Elysia()
    .onError(({ code, error, set }) => {
      const { status, body } = mapError(code, error, response)
      set.status = status
      return body
    })
    .group('/api', (api) =>
      api.group('/v1', (v1) => v1.use(bookingRouteV1(svc, { response, cfg }))),
    )
}

const app = buildApp()
let token = ''

beforeAll(async () => {
  const signer = new Elysia()
    .use(jwt({ name: 'jwt', secret: SECRET }))
    .get('/t', ({ jwt }) => jwt.sign({ sub: USER_ID, email: 'u@x.com' }))
  token = await (await signer.handle(new Request('http://localhost/t'))).text()
})

async function call(method: string, path: string, opts: { body?: unknown; auth?: boolean } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.auth) headers.authorization = `Bearer ${token}`
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }),
  )
  return { status: res.status, json: (await res.json().catch(() => null)) as any }
}

describe('bookings e2e (in-memory repo)', () => {
  it('rejects unauthenticated access with 401', async () => {
    const r = await call('GET', '/api/v1/bookings')
    expect(r.status).toBe(401)
  })

  it('creates a booking for the current user', async () => {
    const r = await call('POST', '/api/v1/bookings', {
      auth: true,
      body: {
        room_id: crypto.randomUUID(),
        starts_at: '2026-07-01T10:00:00Z',
        ends_at: '2026-07-01T11:00:00Z',
      },
    })
    expect(r.status).toBe(200)
    expect(r.json.data.user_id).toBe(USER_ID)
    expect(r.json.data.status).toBe('pending')
  })

  it('lists only the current user bookings', async () => {
    const r = await call('GET', '/api/v1/bookings', { auth: true })
    expect(r.status).toBe(200)
    expect(Array.isArray(r.json.data)).toBe(true)
    expect(r.json.data.length).toBe(1)
  })

  it('rejects invalid time range with 400', async () => {
    const r = await call('POST', '/api/v1/bookings', {
      auth: true,
      body: {
        room_id: crypto.randomUUID(),
        starts_at: '2026-07-01T11:00:00Z',
        ends_at: '2026-07-01T10:00:00Z',
      },
    })
    expect(r.status).toBe(400)
    expect(r.json.code).toBe('INVALID_RANGE')
  })
})
