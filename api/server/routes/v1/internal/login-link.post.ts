import { defineEventHandler, getHeader, setResponseHeader } from 'h3'
import { z } from 'zod'
import { useCtx } from '../../../lib/context'
import { forbidden, notFound } from '../../../lib/errors'
import { limit, readJson } from '../../../lib/http'
import { safeEqual } from '../../../lib/ids'
import { INTERNAL_SECRET_HEADER, createLoginLink, fromLoopback, readInternalSecret } from '../../../lib/loginlink'
import { RULES } from '../../../lib/ratelimit'
import { mcNameSchema } from '../../../lib/schemas'

const body = z.strictObject({ name: mcNameSchema.optional() })

/**
 * Einmal-Anmeldelink erzeugen (§41) – nur für `cubiq-server.sh login` im Container: Verbindung über Loopback (Adressen
 * des Sockets) UND das Geheimnis aus `<DATA_DIR>/internal.secret` (Vergleich in konstanter Zeit). Von außen (Tunnel)
 * sieht die Route aus wie jede unbekannte Adresse.
 */
export default defineEventHandler(async (event) => {
  if (!fromLoopback(event)) throw notFound()
  const ctx = useCtx()
  const secret = readInternalSecret(ctx.config.dataDir)
  const given = getHeader(event, INTERNAL_SECRET_HEADER)
  if (!secret || !given || !safeEqual(given, secret)) throw forbidden('forbidden', 'Missing or wrong internal secret')
  limit('internal:login-link', RULES.loginLinkCreate)
  const { name } = await readJson(event, body)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return createLoginLink(ctx, name)
})
