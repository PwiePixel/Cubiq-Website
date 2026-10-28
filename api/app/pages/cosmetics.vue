<script setup lang="ts">
import { breadcrumbLd } from '#shared/seo'

// Kosmetik: oben die Cubiq-Umhänge (wie früher /capes) – auf Wunsch am eigenen Skin (Spielername) –, darunter
// Kosmetik im Format v2 mit 3D-Vorschau (derselbe Renderer wie Studio-Werkbank und Launcher). Leere Abschnitte
// (z. B. Kopf-Kosmetik seit Oktober 2026) bleiben ausgeblendet. /capes leitet per 301 hierher (server/middleware).
const { lang, m, fill } = useLang()
const { skin } = useCapeSkin()
const [{ data, error }, { data: hatData, error: hatError }] = await Promise.all([useCapes(), useHats()])
const capes = computed(() => data.value?.capes ?? [])
const hats = computed(() => hatData.value?.hats ?? [])
const companions = computed(() => hatData.value?.companions ?? [])
const wings = computed(() => hatData.value?.wings ?? [])
const pets = computed(() => hatData.value?.pets ?? [])
const selected = ref<SiteCape | null>(null)
watchEffect(() => {
  if (!selected.value && capes.value.length) selected.value = capes.value[0]!
})

const siteUrl = useSiteUrl()
usePageSeo(() => ({
  path: '/cosmetics',
  title: m.value.seo.cosmetics.title,
  description: m.value.seo.cosmetics.description,
  image: { url: '/og.png', width: 1260, height: 660, alt: m.value.seo.cosmetics.title },
  jsonLd: [
    breadcrumbLd(siteUrl, lang.value, [
      { name: m.value.nav.home, path: '/' },
      { name: m.value.cosmetics.title, path: '/cosmetics' },
    ]),
  ],
}))

type Unlockable = { unlock: 'free' | 'code' | 'admin' | 'event' | 'reward', achievement?: { en: string, de: string, es: string } | null }
const unlockLabel = (c: Unlockable) =>
  c.unlock === 'reward' ? m.value.cosmetics.halloweenReward : c.unlock === 'event' ? m.value.cosmetics.halloween : c.achievement ? fill(m.value.capes.achievement, { name: c.achievement[lang.value] ?? c.achievement.en }) : c.unlock === 'free' ? m.value.capes.free : c.unlock === 'code' ? m.value.capes.code : m.value.capes.admin
const unlockClass = (c: Unlockable) =>
  c.unlock === 'event' || c.unlock === 'reward' ? 'badge-hw' : c.achievement ? 'bg-[#2a1f4a] text-[#c4a5ff]' : c.unlock === 'free' ? 'bg-ok/15 text-ok' : c.unlock === 'code' ? 'bg-caution-900 text-caution-300' : 'bg-primary-900 text-primary-300'

// Tag/Nacht und Animation gelten für alle 3D-Abschnitte (CosmeticSection).
const night = ref(false)
const animate = ref(true)
onMounted(() => {
  // Weniger Bewegung gewünscht → Animation startet aus (Schalter bleibt da).
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) animate.value = false
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6">
    <header class="max-w-2xl">
      <h1 class="display text-5xl leading-tight text-base-50">{{ m.cosmetics.title }}</h1>
      <p class="mt-3 text-lg text-base-400">{{ m.cosmetics.lead }}</p>
    </header>

    <!-- Umhänge -->
    <section id="capes" class="mt-12 scroll-mt-24" aria-labelledby="capes-title">
      <h2 id="capes-title" class="display text-3xl text-base-50">{{ m.cosmetics.capesTitle }}</h2>
      <p class="mt-2 max-w-2xl text-base-400">{{ m.capes.lead }}</p>

      <p v-if="error" class="mt-8 text-caution-300">{{ m.common.error }}</p>
      <p v-else-if="!capes.length" class="mt-8 text-base-400">{{ m.capes.empty }}</p>
      <div v-else class="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <ul class="grid grid-cols-2 content-start gap-3 sm:grid-cols-3 md:grid-cols-4">
          <li v-for="c in capes" :key="c.id">
            <button
              type="button"
              class="cos-card card"
              :class="{ 'cos-card-on': selected?.id === c.id }"
              :aria-pressed="selected?.id === c.id"
              @click="selected = c"
            >
              <span class="grid h-32 place-items-center">
                <ClientOnly>
                  <CapeThumb :texture="c.url" :scale="c.scale" :frames="c.frames" :frame-time-ms="c.frameTimeMs" :width="60" />
                  <template #fallback><span class="block h-24 w-15 rounded-sm bg-base-800" /></template>
                </ClientOnly>
              </span>
              <span class="block truncate text-sm font-semibold text-base-50">{{ c.name }}</span>
              <span class="mt-1.5 flex flex-wrap justify-center gap-1">
                <span class="badge" :class="unlockClass(c)">{{ unlockLabel(c) }}</span>
                <span v-if="c.scale > 1" class="badge bg-base-800 text-base-200">{{ c.scale >= 16 ? 'Ultra HD' : 'HD' }}</span>
                <span v-if="c.frames > 1" class="badge bg-primary-900 text-primary-300">{{ m.capes.animated }}</span>
              </span>
            </button>
          </li>
        </ul>

        <aside class="lg:sticky lg:top-24 lg:self-start">
          <div class="card overflow-hidden">
            <div class="stage relative">
              <ClientOnly><CapeViewer :cape="selected" :skin="skin" :height="400" /></ClientOnly>
              <p class="absolute top-3 left-4 text-xs tracking-[0.18em] text-base-400 uppercase">{{ m.capes.preview }}</p>
              <p class="absolute right-4 bottom-3 text-xs text-base-600">{{ m.capes.dragHint }}</p>
            </div>
            <div v-if="selected" class="border-t border-base-800 p-5">
              <p class="display text-2xl text-base-50">{{ selected.name }}</p>
              <span class="badge mt-2" :class="unlockClass(selected)">{{ unlockLabel(selected) }}</span>
            </div>
            <div class="border-t border-base-800 p-5">
              <h3 class="mb-3 font-semibold text-base-50">{{ m.capes.skin.title }}</h3>
              <ClientOnly><CapeSkinField /></ClientOnly>
            </div>
          </div>
          <div class="mt-5 p-1">
            <h3 class="font-semibold text-base-50">{{ m.capes.howTitle }}</h3>
            <p class="mt-1.5 text-sm text-base-400">{{ m.capes.howText }}</p>
          </div>
        </aside>
      </div>
    </section>

    <!-- Trennlinie: Redstone-Leitung mit Lampe in der Mitte (nur vor Abschnitten mit Teilen) -->
    <div v-if="hats.length || hatError" class="divider my-16" role="separator" aria-hidden="true"><span /></div>

    <!-- Kopf-Kosmetik -->
    <CosmeticSection
      v-if="hats.length || hatError"
      id="hats"
      v-model:night="night"
      v-model:animate="animate"
      :items="hats"
      :error="hatError"
      :title="m.cosmetics.hatsTitle"
      :lead="m.cosmetics.hatsLead"
      :empty="m.cosmetics.hatsEmpty"
      :how-title="m.cosmetics.howTitle"
      :how-text="m.cosmetics.howText"
    />

    <div v-if="companions.length || hatError" class="divider my-16" role="separator" aria-hidden="true"><span /></div>

    <!-- Begleiter am Kopf (slot companion) -->
    <CosmeticSection
      v-if="companions.length || hatError"
      id="companions"
      v-model:night="night"
      v-model:animate="animate"
      :items="companions"
      :error="hatError"
      :title="m.cosmetics.companionsTitle"
      :lead="m.cosmetics.companionsLead"
      :empty="m.cosmetics.companionsEmpty"
      :how-title="m.cosmetics.companionsHowTitle"
      :how-text="m.cosmetics.companionsHowText"
    />

    <div v-if="wings.length || hatError" class="divider my-16" role="separator" aria-hidden="true"><span /></div>

    <!-- Flügel (slot wings, am Rumpf) -->
    <CosmeticSection
      v-if="wings.length || hatError"
      id="wings"
      v-model:night="night"
      v-model:animate="animate"
      :items="wings"
      :error="hatError"
      :title="m.cosmetics.wingsTitle"
      :lead="m.cosmetics.wingsLead"
      :empty="m.cosmetics.wingsEmpty"
      :how-title="m.cosmetics.wingsHowTitle"
      :how-text="m.cosmetics.wingsHowText"
    />

    <div v-if="pets.length || hatError" class="divider my-16" role="separator" aria-hidden="true"><span /></div>

    <!-- Begleiter am Boden (slot pet, z. B. der Pinguin) -->
    <CosmeticSection
      v-if="pets.length || hatError"
      id="pets"
      v-model:night="night"
      v-model:animate="animate"
      :items="pets"
      :error="hatError"
      :title="m.cosmetics.petsTitle"
      :lead="m.cosmetics.petsLead"
      :empty="m.cosmetics.petsEmpty"
      :how-title="m.cosmetics.petsHowTitle"
      :how-text="m.cosmetics.petsHowText"
    />
  </div>
</template>

<style scoped>
.badge-hw {
  background: #2a1840;
  color: #ffb06a;
}
.cos-card {
  display: block;
  width: 100%;
  padding: 0.75rem 0.75rem 1rem;
  text-align: center;
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.cos-card:hover {
  transform: translateY(-2px);
  border-color: var(--color-base-700);
}
.cos-card-on {
  border-color: var(--color-primary-400);
  box-shadow: 0 0 22px -8px var(--color-primary-400);
}
.stage {
  background-color: var(--color-base-950);
  background-image: var(--cube-grid);
  background-size: 34px 20px;
  transition: background-color 0.3s;
}
.stage-night {
  background-color: #050508;
  background-image: none;
}
.divider {
  position: relative;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--color-primary-900) 12%, var(--color-primary-600) 50%, var(--color-primary-900) 88%, transparent);
}
.divider span {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 14px;
  height: 14px;
  transform: translate(-50%, -50%) rotate(45deg);
  background: var(--color-primary-400);
  box-shadow: 0 0 18px 2px var(--color-primary-400);
  border: 2px solid var(--color-base-950);
}
</style>
