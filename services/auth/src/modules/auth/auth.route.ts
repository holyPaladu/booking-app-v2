import { authMacro, UnauthorizedError, type createConfigService, type responseMapper } from '@booking/shared'
import { jwt } from '@elysiajs/jwt'
import { CHALLENGE_SCOPE } from '@modules/two-factor/two-factor.const'
import { Elysia } from 'elysia'
import { type IAuthService, authModels } from './auth.port'

type RouteDeps = {
  response: ReturnType<typeof responseMapper>
  cfg: ReturnType<typeof createConfigService>
}

export const authRouteV1 = (svc: IAuthService, deps: RouteDeps) =>
  new Elysia({ prefix: 'auth', tags: ['auth'] })
    .use(
      authMacro(
        deps.cfg.get('jwt_secret'),
        deps.cfg.get('jwt_expiry'),
      )
    )
    // Отдельный инстанс для короткого 2FA-challenge: тот же секрет, свой exp.
    .use(
      jwt({
        name: 'challengeJwt',
        secret: deps.cfg.get('jwt_secret'),
        exp: deps.cfg.get('two_factor_challenge_ttl'),
      }),
    )
    .model(authModels)

    .post(
      '/register',
      async ({ body }) => {
        await svc.register(body)
        return deps.response.success('Registration successful! Please confirm your email.')
      },
      { body: 'auth.register' },
    )

    .post(
      '/login',
      async ({ body, jwt, challengeJwt, server, request }) => {
        const ip = server?.requestIP(request)?.address ?? null
        const userAgent = request.headers.get('user-agent') ?? null

        const result = await svc.startLogin(body, { ip, userAgent })

        // 2FA включена: токены не выдаём, отдаём короткий challenge-токен для шага-2.
        if (result.kind === 'two_factor_required') {
          const challenge_token = await challengeJwt.sign({
            sub: result.userId,
            email: result.email,
            tv: result.tokenVersion,
            scope: CHALLENGE_SCOPE,
          })
          return deps.response.success('Two-factor required', {
            two_factor_required: true,
            challenge_token,
          })
        }

        const access_token = await jwt.sign({
          sub: result.identity.id,
          email: result.identity.email,
        })
        return deps.response.success('Logged in', {
          access_token,
          refresh_token: result.refreshToken,
          token_type: 'Bearer',
        })
      },
      { body: 'auth.login' },
    )

    .post(
      '/login/2fa',
      async ({ body, jwt, challengeJwt, server, request }) => {
        const payload = await challengeJwt.verify(body.challenge_token)
        if (!payload || payload.scope !== CHALLENGE_SCOPE)
          throw new UnauthorizedError('Invalid or expired challenge', 'INVALID_CHALLENGE')

        const ip = server?.requestIP(request)?.address ?? null
        const userAgent = request.headers.get('user-agent') ?? null

        const result = await svc.completeLogin(
          {
            userId: payload.sub as string,
            email: payload.email as string,
            tokenVersion: Number(payload.tv),
          },
          body.code,
          { ip, userAgent },
        )

        const access_token = await jwt.sign({
          sub: result.identity.id,
          email: result.identity.email,
        })
        return deps.response.success('Logged in', {
          access_token,
          refresh_token: result.refreshToken,
          token_type: 'Bearer',
        })
      },
      { body: 'auth.login-2fa' },
    )

    .post(
      '/refresh',
      async ({ body, jwt, server, request }) => {
        const ip = server?.requestIP(request)?.address ?? null
        const userAgent = request.headers.get('user-agent') ?? null

        const result = await svc.rotateToken(body.refresh_token, { ip, userAgent })

        const access_token = await jwt.sign({
          sub: result.identity.id,
          email: result.identity.email,
        })
        return deps.response.success('Token rotated', {
          access_token,
          refresh_token: result.refreshToken,
          token_type: 'Bearer',
        })
      },
      { body: 'auth.refresh' },
    )

    .post(
      '/logout',
      async ({ body, currentUser }) => {
        await svc.revokeToken({
          refreshToken: body.refresh_token,
          userId: currentUser.id,
          email: currentUser.email,
        })
        return deps.response.success('Logged out')
      },
      { body: 'auth.logout', auth: true }
    )

    .post(
      '/verify-email',
      async ({ body }) => {
        await svc.verifyEmail(body.email, body.code)
        return deps.response.success(`Successfully email verified`, { email: body.email })
      },
      { body: 'auth.verify-email' }
    )

    .post(
      '/verify-email/resend',
      async ({ body }) => {
        await svc.verifyEmailResend(body.email)
        return deps.response.success(`Successfully resend code for this ${body.email}.`)
      },
      { body: 'auth.verify-email.resend' }
    )

    .group('/password', pass => pass
      .post(
        '/forgot',
        async ({ body }) => {
          await svc.passwordForgot(body.email)
          return deps.response.success("Password forgot started, wait code in your email")
        },
        { body: 'auth.password.forgot' }
      )
      .post(
        '/reset',
        async ({ body }) => {
          await svc.passwordReset(body.email, body.code, body.new_password)
          return deps.response.success("Password changed.")
        },
        { body: 'auth.password.reset' }
      )
    )
