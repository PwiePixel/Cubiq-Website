<script setup lang="ts">
// Vorderseite eines Umhangs als Bild (wie im Launcher). Animierte Umhänge laufen mit. Pixel-Art bleibt pixelgenau;
// echte HD-Umhänge (Logos, gemalte Bilder – capeLooksSmooth) werden sauber verkleinert statt grob abgetastet.
const props = withDefaults(
  defineProps<{
    texture: string
    scale?: number
    frames?: number
    frameTimeMs?: number | null
    /** Breite in CSS-Pixeln (Höhe ergibt sich aus 10:16). */
    width?: number
  }>(),
  { scale: 1, frames: 1, frameTimeMs: null, width: 60 },
)

const canvas = shallowRef<HTMLCanvasElement | null>(null)
let image: HTMLImageElement | null = null
let timer: ReturnType<typeof setInterval> | null = null
let shown = -1
/** HD-Umhang (weich filtern, sobald er verkleinert gezeigt wird)? */
let smooth = false
/** Wird ein HD-Umhang verkleinert (mehr Pixel als Platz auf dem Bildschirm)? Dann weich statt pixelgenau. */
const down = ref(false)

const height = computed(() => Math.round((props.width * 16) / 10))

function draw() {
  const el = canvas.value
  if (!el || !image) return
  const f = cubiqFrameIndex(Date.now(), props.frames, props.frameTimeMs)
  if (f === shown) return
  shown = f
  const s = props.scale
  const dpr = window.devicePixelRatio || 1
  const outW = Math.round(props.width * dpr)
  down.value = smooth && 10 * s > outW
  el.width = down.value ? outW : 10 * s
  el.height = down.value ? Math.round(height.value * dpr) : 16 * s
  const ctx = el.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = down.value
  if (down.value) ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, el.width, el.height)
  // Außenseite: (1, 1, 10, 16) im 64×32-Raster, je Frame 32·scale tiefer.
  ctx.drawImage(image, s, f * 32 * s + s, 10 * s, 16 * s, 0, 0, el.width, el.height)
}

/** Erster Frame (64·scale × 32·scale) als HD-Bild erkennen; ohne Zugriff auf die Pixel bleibt es Pixel-Art. */
function frameLooksSmooth(img: HTMLImageElement, scale: number): boolean {
  try {
    const c = document.createElement('canvas')
    c.width = 64 * scale
    c.height = 32 * scale
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(img, 0, 0, c.width, c.height, 0, 0, c.width, c.height)
    return capeLooksSmooth(ctx.getImageData(0, 0, c.width, c.height))
  } catch {
    return false
  }
}

function stop() {
  if (timer) clearInterval(timer)
  timer = null
}

function load() {
  stop()
  shown = -1
  image = null
  const img = new Image()
  img.onload = () => {
    image = img
    smooth = frameLooksSmooth(img, props.scale)
    draw()
    if (props.frames > 1 && props.frameTimeMs) {
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') draw()
      }, Math.max(40, Math.min(props.frameTimeMs / 2, 250)))
    }
  }
  img.src = props.texture
}

onMounted(load)
onBeforeUnmount(stop)
watch(() => [props.texture, props.scale, props.frames, props.frameTimeMs], load)
</script>

<template>
  <canvas
    ref="canvas"
    class="rounded-sm"
    :class="{ '[image-rendering:pixelated]': !down }"
    :style="{ width: `${width}px`, height: `${height}px` }"
    aria-hidden="true"
  />
</template>
