import { defineEventHandler, deleteCookie, getCookie, setCookie, setResponseHeader } from 'h3'
import { z } from 'zod'
import { audit } from '../../../../lib/audit'
import { useCtx } from '../../../../lib/context'
import { tooMany } from '../../../../lib/errors'
import { assertSameOrigin, clientIp, limit, readJson } from '../../../../lib/http'
import { consumeLoginLink, peekLoginLink } from '../../../../lib/loginlink'
import { RULES } from '../../../../lib/ratelimit'
import { isTeamMember } from '../../../../lib/team'
import { upsertOnLogin } from '../../../../lib/users'
import { LEGACY_WEB_SESSION_COOKIE, WEB_SESSION_COOKIE, WEB_SESSION_TTL_MS, createWebSession } from '../../../../lib/weblogin'

const body = z.strictObject({ token: z.string().max(64) })

/**
 * Einmal-Link einlösen (§41): nur per POST von der eigenen Website (Link-Vorschauen rufen nur die Seite ab). Danach eine
 * normale Website-Sitzung wie nach der Microsoft-Anmeldung (Sperre geprüft, altes Sitzungs-Cookie verworfen = Rotation).
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  limit(`login-link-use:${clientIp(event)}`, RULES.loginLinkUseIp)
  const { token } = await readJson(event, body)
  const ctx = useCtx()
  setResponseHeader(event, 'Cache-Control', 'no-store')
  // Grenze je Konto wie bei Microsoft – vor dem Einlösen, damit sie den Link nicht verbraucht.
  const target = peekLoginLink(ctx, token)
  const r = ctx.limiter.take(`login:${target.uuid}`, RULES.loginUuid)
  if (!r.ok) throw tooMany(r.retryAfter)
  const { uuid, name } = consumeLoginLink(ctx, token)
  upsertOnLogin(ctx, uuid, name)
  const session = createWebSession(ctx, uuid, getCookie(event, WEB_SESSION_COOKIE))
  audit(ctx, uuid, 'web.login', uuid, 'login_link')
  setCookie(event, WEB_SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: Math.floor(WEB_SESSION_TTL_MS / 1000),
  })
  deleteCookie(event, LEGACY_WEB_SESSION_COOKIE, { path: '/', secure: true, httpOnly: true, sameSite: 'strict' })
  return { name, returnTo: isTeamMember(ctx, uuid) ? '/admin' : '/' }
})
