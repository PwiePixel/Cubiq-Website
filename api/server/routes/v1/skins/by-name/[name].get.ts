import { defineEventHandler, getHeader } from 'h3'
import { useCtx } from '../../../../lib/context'
import { clientIp, limit, paramWith, requireUser } from '../../../../lib/http'
import { RULES } from '../../../../lib/ratelimit'
import { mcNameSchema } from '../../../../lib/schemas'

/**
 * Skin eines beliebigen Minecraft-Kontos per Name (über Mojang, zwischengespeichert). Launcher und Client fragen mit
 * Bearer-Token (Grenze je Konto); die Website (Umhang an deinem eigenen Skin, §14) ohne Konto – dann gilt eine Grenze
 * je IP und ein eigener, kleinerer Teil des Mojang-Budgets.
 */
export default defineEventHandler(async (event) => {
  if (getHeader(event, 'authorization') !== undefined) {
    const auth = requireUser(event)
    const name = paramWith(event, 'name', mcNameSchema)
    limit(`skins:${auth.uuid}`, RULES.skinLookupUser)
    return useCtx().skins.byName(name)
  }
  const name = paramWith(event, 'name', mcNameSchema)
  limit(`skins-ip:${clientIp(event)}`, RULES.skinLookupIp)
  return useCtx().skins.byName(name, { web: true })
})
