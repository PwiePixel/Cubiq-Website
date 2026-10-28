<script setup lang="ts">
import type { SkinViewer } from 'skinview3d'
import type { MagnificationTextureFilter, MinificationTextureFilter } from 'three'

// 3D-Vorschau eines Umhangs (skinview3d, mitgebündelt – kein CDN): an einem Spieler-Skin (`skin`, nur Mojang-Texturen,
// z. B. per Spielername geladen) oder an der Schaufensterpuppe. `frame` gesetzt = fester Frame (z. B. in der
// Admin-Prüfung), sonst läuft die Animation nach der Uhr. HD-Umhänge (Logos, gemalte Bilder) werden weich gefiltert,
// Pixel-Art bleibt scharf – wie im Cubiq Client.
const props = withDefaults(defineProps<{
  cape: CapeTexture | null
  height?: number
  frame?: number | null
  skin?: { url: string, model: 'classic' | 'slim' } | null
}>(), {
  height: 380,
  frame: null,
  skin: null,
})

const SKIN_URL = /^https:\/\/textures\.minecraft\.net\/texture\/[0-9a-f]{1,128}$/
const canvas = shallowRef<HTMLCanvasElement | null>(null)
const box = shallowRef<HTMLElement | null>(null)
const failed = ref(false)
let viewer: SkinViewer | null = null
let filters: { linear: MagnificationTextureFilter, mipmap: MinificationTextureFilter } | null = null
let observer: ResizeObserver | null = null
let capeTimer: ReturnType<typeof setInterval> | null = null
let redraw: (() => void) | null = null
let token = 0
let skinToken = 0

function stopAnimation() {
  if (capeTimer) clearInterval(capeTimer)
  capeTimer = null
  redraw = null
}

function loadImage(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (cors) {
      img.crossOrigin = 'anonymous'
      img.referrerPolicy = 'no-referrer'
    }
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('texture failed to load'))
    img.src = src
  })
}

/** Umhang-Textur auf den Spieler legen; HD-Bilder weich (linear + Mipmaps), Pixel-Art scharf. */
function setCape(source: HTMLImageElement | HTMLCanvasElement, smooth: boolean) {
  if (!viewer) return
  void viewer.loadCape(source)
  const tex = viewer.playerObject.cape.map
  if (tex && smooth && filters) {
    tex.magFilter = filters.linear
    tex.minFilter = filters.mipmap
    tex.generateMipmaps = true
    tex.anisotropy = Math.min(8, viewer.renderer.capabilities.getMaxAnisotropy())
    tex.needsUpdate = true
  }
}

async function applyCape() {
  if (!viewer) return
  stopAnimation()
  const mine = ++token
  const cape = props.cape
  if (!cape) {
    viewer.resetCape()
    return
  }
  const img = await loadImage(cape.url)
  if (mine !== token || !viewer) return
  // Ein Frame: 64·scale × 32·scale (Streifen bei animierten Umhängen).
  const width = img.naturalWidth
  const frameHeight = cape.frames > 1 && cape.frameTimeMs ? Math.floor(img.naturalHeight / cape.frames) : img.naturalHeight
  const frame = document.createElement('canvas')
  frame.width = width
  frame.height = frameHeight
  const ctx = frame.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.drawImage(img, 0, 0, width, frameHeight, 0, 0, width, frameHeight)
  let smooth = false
  try {
    smooth = capeLooksSmooth(ctx.getImageData(0, 0, width, frameHeight))
  } catch {
    // Fremde Herkunft ohne CORS: wie bisher scharf.
  }
  if (cape.frames <= 1 || !cape.frameTimeMs) {
    setCape(img, smooth)
    return
  }
  // Streifen: aktuellen Frame auf eine eigene Leinwand kopieren.
  let shown = -1
  const draw = () => {
    if (!viewer || mine !== token) return
    const f = props.frame !== null
      ? Math.min(Math.max(0, props.frame), cape.frames - 1)
      : cubiqFrameIndex(Date.now(), cape.frames, cape.frameTimeMs)
    if (f === shown) return
    shown = f
    ctx.clearRect(0, 0, width, frameHeight)
    ctx.drawImage(img, 0, f * frameHeight, width, frameHeight, 0, 0, width, frameHeight)
    setCape(frame, smooth)
  }
  draw()
  redraw = draw
  if (props.frame === null) capeTimer = setInterval(draw, Math.max(20, Math.min(cape.frameTimeMs / 2, 250)))
}

/** Spieler-Skin (nur textures.minecraft.net) oder – ohne bzw. bei Fehlern – die Schaufensterpuppe. */
async function applySkin() {
  if (!viewer) return
  const mine = ++skinToken
  const skin = props.skin
  if (skin && SKIN_URL.test(skin.url)) {
    try {
      const img = await loadImage(skin.url, true)
      if (mine !== skinToken || !viewer) return
      await viewer.loadSkin(img, { model: skin.model === 'slim' ? 'slim' : 'default' })
      return
    } catch {
      // Textur nicht ladbar – Puppe statt leerer Figur.
    }
  }
  if (mine === skinToken && viewer) await viewer.loadSkin(mannequinSkin(), { model: 'default' })
}

onMounted(async () => {
  if (!canvas.value) return
  try {
    const [{ SkinViewer, WalkingAnimation }, three] = await Promise.all([import('skinview3d'), import('three')])
    filters = { linear: three.LinearFilter, mipmap: three.LinearMipmapLinearFilter }
    viewer = new SkinViewer({
      canvas: canvas.value,
      width: box.value?.clientWidth ?? 320,
      height: props.height,
      zoom: 0.62,
    })
    viewer.controls.enablePan = false
    viewer.controls.enableZoom = false
    viewer.globalLight.intensity = 2.6
    viewer.cameraLight.intensity = 0.7
    // Von schräg hinten – der Umhang ist die Hauptsache.
    viewer.playerWrapper.rotation.y = Math.PI * 0.8
    await applySkin()
    const walk = new WalkingAnimation()
    walk.speed = 0.55
    viewer.animation = walk
    await applyCape()
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
  stopAnimation()
  token++
  skinToken++
  observer?.disconnect()
  viewer?.dispose()
  viewer = null
})

watch(() => props.cape?.id, () => void applyCape().catch(() => viewer?.resetCape()))
watch(() => [props.skin?.url, props.skin?.model], () => void applySkin())
// Fester Frame gewechselt → neu zeichnen; Wechsel zwischen fest und Uhr → Animation neu aufsetzen.
watch(() => props.frame, (now, before) => {
  if ((now === null) !== (before === null)) void applyCape().catch(() => viewer?.resetCape())
  else redraw?.()
})
</script>

<template>
  <div ref="box" class="relative w-full" :style="{ height: `${height}px` }">
    <canvas ref="canvas" class="size-full cursor-grab active:cursor-grabbing" aria-hidden="true" />
    <div v-if="failed" class="absolute inset-0 grid place-items-center px-4 text-center text-sm text-base-400">
      WebGL?
    </div>
  </div>
</template>
