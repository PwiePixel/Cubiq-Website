<script setup lang="ts">
import type { SkinViewer } from 'skinview3d'
import type { ActionDriver, Driver } from '~/utils/cosmetic-v2/format'
import type { LoadedCosmetic, MountedCosmetic, Three } from '~/utils/cosmetic-v2/view'

// 3D-Vorschau einer Kosmetik (Format v2) an Cubi – derselbe Renderer wie die Studio-Werkbank
// und der Launcher (utils/cosmetic-v2). skinview3d + three.js sind mitgebündelt, Modell und Bilder kommen von der
// eigenen API (gleiche Herkunft, strenge CSP bleibt). Kamera wie die Werkbank („three“, fov 32), Ziehen dreht.
// Anhängepunkt aus dem Modell: Kopf, Rumpf (Flügel, ganzer Spieler) oder Boden (Begleiter neben dem Spieler).
const props = withDefaults(defineProps<{
  hat: SiteHat | null
  night?: boolean
  animate?: boolean
  height?: number
  /** Wahl der Optionen (z. B. `{ beard: false }`), `null` = Standardwerte. */
  options?: Record<string, boolean> | null
  /** Begleiter am Boden: gespielter Zustand (`walk`, `grab`, …), `null` = idle. */
  state?: Driver | null
  /** Zähler der Zustands-Klicks: ein neuer Wert startet den Zustand von vorn (zweiter Klick auf `grab` = noch einmal). */
  stateTick?: number
  /**
   * Begleiter am Boden: Aktion Streicheln/Füttern ab `startedAt` (`Date.now()`) – ein neues Objekt spielt sie neu ab,
   * auch bei ausgeschalteter Animation. Ohne passende Aktion im Modell passiert nichts.
   */
  action?: { driver: ActionDriver, startedAt: number } | null
}>(), {
  night: false,
  animate: true,
  height: 400,
  options: null,
  state: null,
  stateTick: 0,
  action: null,
})
const emit = defineEmits<{ loading: [boolean] }>()

const canvas = shallowRef<HTMLCanvasElement | null>(null)
const box = shallowRef<HTMLElement | null>(null)
const failed = ref(false)
let viewer: SkinViewer | null = null
let three: Three | null = null
let view: typeof import('~/utils/cosmetic-v2/view') | null = null
let mounted: MountedCosmetic | null = null
let observer: ResizeObserver | null = null
let token = 0
/** Geladene Modelle je Hash (Wechsel zwischen Karten lädt nichts doppelt). */
const cache = new Map<string, Promise<LoadedCosmetic>>()

function load(hat: SiteHat): Promise<LoadedCosmetic> {
  let p = cache.get(hat.hash)
  if (!p) {
    p = view!.loadCosmetic({ model: hat.model, texture: hat.texture, glow: hat.glow })
    p.catch(() => cache.delete(hat.hash))
    cache.set(hat.hash, p)
  }
  return p
}

/**
 * Abstand wie die Studio-Karten (quadratische Bühne): bei schmaler Bühne weiter weg, damit die Breite passt,
 * dazu etwas Luft, damit hohe/breite Teile (Heiligenschein, Kronen-Zacken) nicht am Rand kleben.
 */
function zoom(): number {
  const w = box.value?.clientWidth ?? props.height
  return 1.1 * Math.max(1, props.height / Math.max(1, w))
}

async function apply() {
  if (!viewer || !three || !view) return
  const mine = ++token
  const hat = props.hat
  if (!hat) {
    mounted?.dispose()
    mounted = null
    view.applyDayNight(viewer, null, props.night)
    return
  }
  emit('loading', true)
  try {
    const loaded = await load(hat)
    if (mine !== token || !viewer) return
    mounted?.dispose()
    mounted = view.mountOnSkinViewer(three, viewer, loaded, {
      animate: props.animate,
      night: props.night,
      options: props.options,
      drivers: props.state ? [props.state] : null,
      stateTick: props.stateTick,
      action: props.action,
    })
    view.frameModel(three, viewer, loaded.model, 'three', zoom())
  } catch (e) {
    console.error('cosmetic preview failed', e)
  } finally {
    if (mine === token) emit('loading', false)
  }
}

onMounted(async () => {
  if (!canvas.value) return
  try {
    const [sv, t, v] = await Promise.all([import('skinview3d'), import('three'), import('~/utils/cosmetic-v2/view')])
    three = t
    view = v
    viewer = new sv.SkinViewer({
      canvas: canvas.value,
      width: box.value?.clientWidth ?? 320,
      height: props.height,
      fov: 32,
    })
    viewer.controls.enablePan = false
    viewer.controls.enableZoom = false
    await viewer.loadSkin(cubiSkin(), { model: 'default' })
    view.frameHead(three, viewer, null, 'three', zoom())
    await apply()
    observer = new ResizeObserver(() => {
      if (viewer && box.value) viewer.width = box.value.clientWidth
    })
    if (box.value) observer.observe(box.value)
  } catch (e) {
    console.error('3D preview unavailable', e)
    failed.value = true
  }
})

onBeforeUnmount(() => {
  token++
  observer?.disconnect()
  mounted?.dispose()
  mounted = null
  viewer?.dispose()
  viewer = null
})

watch(() => props.hat?.hash, () => void apply())
watch(() => props.night, (night) => {
  if (mounted) mounted.set({ night })
  else if (viewer && view) view.applyDayNight(viewer, null, night)
})
watch(() => props.animate, (animate) => mounted?.set({ animate }))
watch(() => props.options, (options) => mounted?.set({ options }), { deep: true })
watch(() => [props.state, props.stateTick] as const, ([state, stateTick]) => mounted?.set({ drivers: state ? [state] : null, stateTick }))
watch(() => props.action, (action) => mounted?.set({ action }))
</script>

<template>
  <div ref="box" class="relative w-full" :style="{ height: `${height}px` }">
    <canvas ref="canvas" class="size-full cursor-grab active:cursor-grabbing" aria-hidden="true" />
    <div v-if="failed" class="absolute inset-0 grid place-items-center px-4 text-center text-sm text-base-400">
      WebGL?
    </div>
  </div>
</template>
