// Umhang an deinem eigenen Skin (Kosmetik-Seite, Startseite): Spielername → Skin über den Mojang-Proxy der API
// (`GET /v1/skins/by-name/{name}`, API.md §14 – zwischengespeichert, begrenzt, nur textures.minecraft.net). Ohne Namen,
// bei Standard-Skins und bei Fehlern zeigt die 3D-Vorschau die Schaufensterpuppe. Der zuletzt gewählte Name bleibt je
// Browser gespeichert (localStorage, abgesichert: privates Fenster, gesperrter Speicher); wer angemeldet ist und noch
// nichts gewählt hat, sieht seinen eigenen Skin.

/** Skin für die 3D-Vorschau (nur Mojang-Texturen). */
export interface PreviewSkin {
  /** Name, wie Mojang ihn schreibt. */
  name: string
  url: string
  model: 'classic' | 'slim'
}

export type CapeSkinState =
  | { kind: 'idle' }
  | { kind: 'loading', name: string }
  | { kind: 'shown', name: string }
  /** Konto gefunden, aber ohne eigenen Skin (Standard-Skin) – Vorschau bleibt bei der Puppe. */
  | { kind: 'default', name: string }
  | { kind: 'invalid' }
  | { kind: 'not_found', name: string }
  | { kind: 'rate_limited', seconds: number }
  | { kind: 'unavailable' }

interface SkinView {
  uuid: string
  name: string
  model: 'classic' | 'slim'
  textureUrl: string | null
}

const STORE_KEY = 'cubiq_cape_skin'
export const MC_NAME = /^[A-Za-z0-9_]{1,16}$/
const SKIN_URL = /^https:\/\/textures\.minecraft\.net\/texture\/[0-9a-f]{1,128}$/

/** Gespeicherte Wahl: Name, `''` = ausdrücklich die Puppe, `null` = nichts gespeichert (oder Speicher gesperrt). */
function readStored(): string | null {
  try {
    const v = localStorage.getItem(STORE_KEY)
    return v === null || v === '' || MC_NAME.test(v) ? v : null
  } catch {
    return null
  }
}

function writeStored(value: string): void {
  try {
    localStorage.setItem(STORE_KEY, value)
  } catch {
    // Ohne Speicher gilt die Wahl nur bis zum Neuladen.
  }
}

/** Lädt die Textur vorab – so meldet die Vorschau einen Fehler, bevor sie die Puppe ersetzt. */
function preload(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('skin texture failed to load'))
    img.src = url
  })
}

let seq = 0

export function useCapeSkin() {
  const skin = useState<PreviewSkin | null>('cape-skin', () => null)
  const state = useState<CapeSkinState>('cape-skin-state', () => ({ kind: 'idle' }))
  const restored = useState<boolean>('cape-skin-restored', () => false)
  const { load: loadAccount } = useAccount()

  /** Skin zu `input` laden. `remember` = als Wahl dieses Browsers speichern (Eingabe im Feld). */
  async function show(input: string, opts: { remember?: boolean } = {}): Promise<void> {
    const name = input.trim()
    if (!MC_NAME.test(name)) {
      state.value = { kind: 'invalid' }
      return
    }
    const mine = ++seq
    state.value = { kind: 'loading', name }
    if (opts.remember) writeStored(name)
    try {
      const v = await apiFetch<SkinView>(`/v1/skins/by-name/${encodeURIComponent(name)}`)
      if (mine !== seq) return
      if (!v.textureUrl || !SKIN_URL.test(v.textureUrl)) {
        skin.value = null
        state.value = { kind: 'default', name: v.name }
        return
      }
      await preload(v.textureUrl)
      if (mine !== seq) return
      skin.value = { name: v.name, url: v.textureUrl, model: v.model === 'slim' ? 'slim' : 'classic' }
      state.value = { kind: 'shown', name: v.name }
    } catch (e) {
      if (mine !== seq) return
      skin.value = null
      const err = e as { status?: number, data?: { error?: { code?: string, retryAfter?: number } } }
      const code = err.data?.error?.code
      if (code === 'player_not_found') state.value = { kind: 'not_found', name }
      else if (code === 'rate_limited' || err.status === 429) state.value = { kind: 'rate_limited', seconds: Math.max(1, Math.ceil(err.data?.error?.retryAfter ?? 30)) }
      else if (code === 'not_found') state.value = { kind: 'invalid' }
      else state.value = { kind: 'unavailable' }
    }
  }

  /** Zurück zur Puppe – auch für den nächsten Besuch gemerkt. */
  function reset(): void {
    seq++
    skin.value = null
    state.value = { kind: 'idle' }
    writeStored('')
  }

  /**
   * Einmal je Seitenaufruf (nur im Browser): gespeicherten Namen zeigen, sonst – angemeldet – den eigenen Skin.
   * Gibt den Namen zurück, mit dem das Feld vorbelegt wird.
   */
  async function restore(): Promise<string> {
    const stored = readStored()
    if (restored.value) return stored || skin.value?.name || ''
    restored.value = true
    if (stored) {
      await show(stored)
      return stored
    }
    if (stored === '') return ''
    const account = await loadAccount()
    if (account?.name && MC_NAME.test(account.name)) {
      await show(account.name)
      return account.name
    }
    return ''
  }

  return { skin, state, show, reset, restore }
}
