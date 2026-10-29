import { describe, expect, it } from 'vitest'
import { cosmeticCatalog, ownedEmotes } from '../server/lib/cosmetics'
import { playEmote } from '../server/lib/emote-play'
import { EMOTES } from '../server/lib/emotes'
import type { PlayerEvent } from '../server/lib/watch'
import { login, makeEnv } from './helpers'

// Winter-Emotes 2026 (0.3.5): hinten angehängt (nie umsortieren – Cubiq Client und Launcher kennen dieselbe Reihenfolge),
// für alle frei, spielbar, im Katalog und als Ereignis bei Beobachtern. Ids, Dauer und Schleife wie core/emote/Emotes.java.
const WINTER = [
  ['snowball_throw', 2400, false], ['shiver', 4800, true], ['warm_hands', 5000, true], ['happy_jump', 2000, false], ['mitten_wave', 2500, false],
] as const

describe('winter emotes', () => {
  it('are appended after the Halloween emotes, free for everyone and playable', async () => {
    const env = makeEnv()
    const u = (await login(env, 'Steve')).user.uuid
    const v = (await login(env, 'Alex')).user.uuid
    expect(EMOTES.slice(-WINTER.length).map((e) => e.id)).toEqual(WINTER.map((w) => w[0]))
    expect(ownedEmotes(env.ctx, u).slice(-WINTER.length)).toEqual(WINTER.map((w) => w[0]))
    const cat = cosmeticCatalog(env.ctx, u).filter((c) => c.slot === 'emote')
    for (const [id, durationMs, loop] of WINTER) {
      expect(cat.find((c) => c.id === id)).toMatchObject({ unlock: 'free', owned: true, texture: null, template: null, emote: { durationMs, loop } })
    }
    const got: PlayerEvent[] = []
    env.ctx.watch.subscribe(v, [u], (e) => got.push(e), () => {})
    for (const [id, durationMs] of WINTER) {
      expect(playEmote(env.ctx, u, id)).toMatchObject({ emote: id, durationMs })
      env.clock.advance(2000)
    }
    expect(got.filter((e) => e.type === 'emote').map((e) => (e as { emote: string }).emote)).toEqual(WINTER.map((w) => w[0]))
  })
})
