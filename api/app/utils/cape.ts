// Umhang-Hilfen der Website (wie im Launcher, app/utils/cubiq.ts).

export interface SiteCape {
  id: string
  name: string
  /** Belohnung für einen Erfolg (Titel je Sprache), sonst `null`. */
  achievement?: { en: string, de: string, es: string } | null
  unlock: 'free' | 'code' | 'admin' | 'event' | 'reward'
  /** Nur bei Event-Umhängen: das Event (z. B. `halloween`). */
  event?: string | null
  /** Nur bei Belohnungen (Halloween 2026: Süßes oder Saures, Kürbis-Suche), z. B. `halloween2026`. */
  rewardOf?: string | null
  url: string
  scale: number
  frames: number
  frameTimeMs: number | null
}

/** Was die Vorschauen von einem Umhang brauchen (Katalog-Umhang oder Upload in der Admin-Prüfung). */
export interface CapeTexture {
  id: string
  url: string
  frames: number
  frameTimeMs: number | null
}

/** Hochgeladener Umhang in der Admin-Prüfung (`GET /v1/admin/capes`). */
export interface AdminCape extends CapeTexture {
  name: string
  status: 'approved' | 'pending' | 'rejected'
  /** Maße EINES Frames (64·scale × 32·scale). */
  width: number
  height: number
  scale: number
  animated: boolean
  owner: { uuid: string, name: string } | null
  createdAt: string
  reviewedAt: string | null
  reviewedBy: string | null
  rejectReason: string | null
  reports: { count: number, reasons: Record<string, number> }
  /** Größe der gespeicherten PNG-Datei. */
  bytes: number
  ownerStats: { uploads: number, approved: number, pending: number, rejected: number } | null
}

/** Dateigröße lesbar: B, KB oder MB (Basis 1024) in der Seitensprache. */
export function formatBytes(bytes: number, locale: string): string {
  const num = (v: number, digits: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v)
  if (bytes < 1024) return `${num(bytes, 0)} B`
  if (bytes < 1024 * 1024) return `${num(bytes / 1024, 1)} KB`
  return `${num(bytes / (1024 * 1024), 2)} MB`
}

/** Animierte Umhänge: senkrechter Streifen, Frame = floor(jetzt / frameTimeMs) % frames. */
export function cubiqFrameIndex(now: number, frames: number, frameTimeMs: number | null): number {
  if (frames <= 1 || !frameTimeMs || frameTimeMs <= 0) return 0
  return Math.floor(now / frameTimeMs) % frames
}

/**
 * Schlichte Schaufensterpuppe als Skin (64×64): grau mit Cubiq-grünem Hemd und hellen Augen – damit der
 * Umhang im Mittelpunkt steht und kein fremder Skin gezeigt wird.
 */
export function mannequinSkin(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')!
  const box = (x: number, y: number, w: number, h: number, color: string) => {
    g.fillStyle = color
    g.fillRect(x, y, w, h)
  }
  // Kopf (Grundschicht) mit etwas dunklerer Ober- und Unterseite.
  box(0, 8, 32, 8, '#869489')
  box(8, 0, 16, 8, '#5f6d63')
  // Gesicht: zwei helle Augen.
  box(9, 12, 2, 1, '#d0f29b')
  box(13, 12, 2, 1, '#d0f29b')
  // Rechtes Bein, Körper, rechter Arm (Zeile 16–32).
  box(0, 16, 16, 16, '#3d4a41')
  box(16, 16, 24, 16, '#71a330')
  box(20, 16, 16, 4, '#5c8726')
  box(40, 16, 16, 16, '#869489')
  // Linkes Bein und linker Arm (Zeile 48–64).
  box(16, 48, 16, 16, '#3d4a41')
  box(32, 48, 16, 16, '#869489')
  return c
}

/** Höchstens so viele Farben gelten als Palette bzw. Pixel-Art (wie im Cubiq Client). */
const MAX_PIXEL_ART_COLORS = 256

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function isPrime(n: number): boolean {
  if (n < 2) return false
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false
  return true
}

/** Farbe eines Pixels als Zahl; ganz durchsichtige Pixel zählen unabhängig von ihrer Farbe als gleich. */
function pixelKey(d: Uint8ClampedArray, i: number): number {
  const a = d[i * 4 + 3]!
  return a === 0 ? -1 : ((d[i * 4]! << 24) | (d[i * 4 + 1]! << 16) | (d[i * 4 + 2]! << 8) | a) >>> 0
}

/** Besteht das Bild aus einfarbigen `b × b`-Blöcken (pixelgenau hochskalierte Pixel-Art)? */
function blockUniform(img: { width: number, height: number, data: Uint8ClampedArray }, b: number): boolean {
  const { width, height, data } = img
  for (let y = 0; y < height; y++) {
    const top = (y - (y % b)) * width
    for (let x = 0; x < width; x++) {
      if (pixelKey(data, y * width + x) !== pixelKey(data, top + x - (x % b))) return false
    }
  }
  return true
}

/**
 * Soll ein Umhang-Bild (ein Frame) weich gefiltert werden? Regel wie im Cubiq Client (CapeFilter.looksSmooth): Pixel-Art
 * ist höchstens 64 breit, hat höchstens 256 Farben oder besteht aus einfarbigen Blöcken (≥ 2) – alles andere (Logos,
 * Fotos, gemalte Bilder) ist HD und flimmert verkleinert ohne Mipmaps.
 */
export function capeLooksSmooth(img: { width: number, height: number, data: Uint8ClampedArray }): boolean {
  const { width, height, data } = img
  if (width <= 64) return false
  if (width % 64 !== 0) return true
  const colors = new Set<number>()
  for (let i = 0; i < width * height && colors.size <= MAX_PIXEL_ART_COLORS; i++) colors.add(pixelKey(data, i))
  if (colors.size <= MAX_PIXEL_ART_COLORS) return false
  const g = gcd(width, height)
  for (let p = 2; p <= g; p++) {
    if (g % p === 0 && isPrime(p) && blockUniform(img, p)) return false
  }
  return true
}
