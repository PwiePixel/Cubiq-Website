import { defineEventHandler, setResponseHeader } from 'h3'
import { z } from 'zod'
import { useCtx } from '../../../../lib/context'
import { assertSameOrigin, clientIp, limit, readJson } from '../../../../lib/http'
import { peekLoginLink } from '../../../../lib/loginlink'
import { RULES } from '../../../../lib/ratelimit'

const body = z.strictObject({ token: z.string().max(64) })

/** Bestätigungsseite eines Einmal-Links (§41): als wer meldet er an? Verbraucht den Link nicht. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  limit(`login-link-peek:${clientIp(event)}`, RULES.loginLinkPeekIp)
  const { token } = await readJson(event, body)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return peekLoginLink(useCtx(), token)
})
