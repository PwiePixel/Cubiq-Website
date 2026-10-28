import type { CosmeticModel } from '../app/utils/cosmetic-v2/format'

export type GeneratedUnlock = 'free' | 'code' | 'admin' | { type: 'event', event: string }

/** Ein per Code gebautes Format-2-Teil (scripts/cosmetics-v2/items/<id>.mjs). */
export interface GeneratedItem {
  id: string
  name: string
  unlock: GeneratedUnlock
  petScale?: number
  /** Begleiter am Boden, der absichtlich schwebt (Ruhepose berührt den Boden nicht). */
  hover?: boolean
  build(): unknown
}

export interface BuiltItem {
  model: CosmeticModel
  json: string
  texture: Buffer
  glow: Buffer | null
  size: { width: number, height: number }
}

export declare const ITEMS: GeneratedItem[]
export declare function buildItem(item: GeneratedItem): BuiltItem
export declare function catalogEntry(item: GeneratedItem, model: CosmeticModel): Record<string, unknown>
