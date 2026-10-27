<script setup lang="ts">
// Feld „Spielername“ unter der 3D-Vorschau: zeigt den gewählten Umhang an deinem eigenen Skin (useCapeSkin).
// Zustände (laden, unbekannter Name, zu viele Anfragen, Mojang nicht erreichbar) stehen in einer Live-Region.
const { m, fill } = useLang()
const { skin, state, show, reset, restore } = useCapeSkin()
const uid = useId()
const draft = ref('')

onMounted(async () => {
  const name = await restore()
  if (!draft.value) draft.value = name
})

const busy = computed(() => state.value.kind === 'loading')

function submit() {
  if (!draft.value.trim()) {
    reset()
    return
  }
  void show(draft.value, { remember: true })
}

function clear() {
  draft.value = ''
  reset()
}

const status = computed(() => {
  const t = m.value.capes.skin
  const s = state.value
  switch (s.kind) {
    case 'loading': return fill(t.loading, { name: s.name })
    case 'shown': return fill(t.shown, { name: s.name })
    case 'default': return fill(t.defaultSkin, { name: s.name })
    case 'invalid': return t.invalid
    case 'not_found': return fill(t.notFound, { name: s.name })
    case 'rate_limited': return fill(t.rateLimited, { s: String(s.seconds) })
    case 'unavailable': return t.unavailable
    default: return t.hint
  }
})
const problem = computed(() => ['invalid', 'not_found', 'rate_limited', 'unavailable'].includes(state.value.kind))
</script>

<template>
  <form class="skin-field" novalidate @submit.prevent="submit">
    <label :for="`${uid}-name`" class="label">{{ m.capes.skin.label }}</label>
    <div class="flex gap-2">
      <input
        :id="`${uid}-name`"
        v-model="draft"
        type="text"
        name="player"
        class="field min-w-0 flex-1 text-base sm:text-sm"
        maxlength="16"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        enterkeyhint="go"
        :placeholder="m.capes.skin.placeholder"
        :aria-invalid="problem"
        :aria-describedby="`${uid}-status`"
      >
      <button type="submit" class="btn btn-primary shrink-0" :disabled="busy">
        <SiteIcon :name="busy ? 'refresh' : 'user'" class="size-4" :class="{ 'animate-spin': busy }" />{{ m.capes.skin.show }}
      </button>
      <button v-if="skin || draft" type="button" class="btn-icon" :title="m.capes.skin.reset" :aria-label="m.capes.skin.reset" @click="clear">
        <SiteIcon name="close" class="size-4" />
      </button>
    </div>
    <p :id="`${uid}-status`" class="mt-2 min-h-5 text-xs" :class="problem ? 'text-caution-300' : 'text-base-400'" role="status" aria-live="polite">
      {{ status }}
    </p>
  </form>
</template>
