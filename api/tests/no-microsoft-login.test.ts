import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../server/lib/config'
import loginMethods from '../server/routes/v1/web/login.get'
import { loginTexts } from '../app/utils/login-i18n'
import { teamTexts } from '../app/utils/team-i18n'
import { makeEnv } from './helpers'

// Mojang hat die App „Cubiq Launcher“ nicht für die Minecraft-Anmeldung freigegeben. Die Website bietet deshalb keine
// Anmeldung mit Microsoft mehr an: keine Routen, keine Einstellungen, kein Knopf. Es bleiben die Anmeldung per Cubiq
// Launcher (§29) und der Einmal-Link des Betreibers (§41).
const root = join(__dirname, '..')

describe('website without Microsoft sign-in', () => {
  it('has no /auth/microsoft routes and no Microsoft client code', () => {
    expect(existsSync(join(root, 'server/routes/auth'))).toBe(false)
    expect(existsSync(join(root, 'server/lib/microsoft.ts'))).toBe(false)
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]))
    const server = files(join(root, 'server')).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(f, 'utf8')).join('\n')
    expect(server).not.toMatch(/login\.microsoftonline\.com|client_secret|xsts\.auth\.xboxlive\.com|login_with_xbox/)
  })

  it('ignores MS_CLIENT_ID and MS_CLIENT_SECRET', () => {
    const env = makeEnv({ env: { MS_CLIENT_ID: '5cc8876f-8fe1-4c27-bc28-9355a79db635', MS_CLIENT_SECRET: 'secret' } })
    expect(env.ctx.config).not.toHaveProperty('microsoft')
    expect(loadConfig({ SECRET_KEY: 'x'.repeat(48), MS_CLIENT_SECRET: 'secret' })).not.toHaveProperty('microsoft')
  })

  it('offers only the sign-in with the Cubiq Launcher', () => {
    makeEnv()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- h3-Handler ohne echtes Event
    expect(loginMethods({} as any)).toEqual({ launcher: true })
  })

  it('no text offers a sign-in with Microsoft, the old error code explains why', () => {
    for (const lang of ['en', 'de', 'es'] as const) {
      const all = JSON.stringify([loginTexts[lang], teamTexts[lang]])
      expect(all, lang).not.toMatch(/Sign in with Microsoft|Mit Microsoft anmelden|Iniciar sesión con Microsoft|microsoft-konto anmelden|cuenta de Microsoft/i)
      expect(teamTexts[lang].login.errors.ms_not_approved, lang).toMatch(/Mojang/)
    }
  })
})
