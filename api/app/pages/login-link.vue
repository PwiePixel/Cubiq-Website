<script setup lang="ts">
// Einmal-Anmeldelink vom Server (§41, `cubiq-server.sh login`): Der Token steht im Fragment (#…) und erreicht so nie ein
// Server- oder Proxy-Log. Die Seite zeigt zuerst, als wer der Link anmeldet; erst „Anmelden“ löst ihn per POST ein –
// Link-Vorschauen rufen nur die Seite ab (ohne Skript) und verbrauchen ihn nicht.
const { l, fill, lang } = useLoginText()
const lp = useLocalePath()

usePageSeo(() => ({ path: '/login-link', title: l.value.link.kicker, description: l.value.link.warn, noindex: true }))

type State = 'checking' | 'ready' | 'busy' | 'done' | 'invalid' | 'error'
const state = ref<State>('checking')
const target = ref<{ uuid: string, name: string, skin: string | null, expiresAt: string } | null>(null)
const errorText = ref('')
let token = ''

const until = computed(() => {
  if (!target.value) return ''
  const time = new Intl.DateTimeFormat(lang.value === 'en' ? 'en-GB' : lang.value, { hour: '2-digit', minute: '2-digit' }).format(new Date(target.value.expiresAt))
  return fill(l.value.link.expires, { time })
})

function fail(e: unknown) {
  const err = e as { data?: { error?: { code?: string } } }
  const code = err.data?.error?.code ?? ''
  if (code === 'login_link_invalid' || code === 'not_found' || code === 'invalid_request') {
    state.value = 'invalid'
    return
  }
  errorText.value = code === 'banned' ? l.value.link.banned : code === 'rate_limited' ? l.value.link.rateLimited : l.value.link.failed
  state.value = 'error'
}

onMounted(async () => {
  token = window.location.hash.slice(1)
  // Token aus der Adresszeile nehmen (Verlauf, geteilter Bildschirm) – er bleibt nur in dieser Seite.
  if (window.location.hash) history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}`)
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    state.value = 'invalid'
    return
  }
  try {
    target.value = await apiFetch('/v1/web/login-link/peek', { method: 'POST', body: { token }, credentials: 'same-origin' })
    state.value = 'ready'
  } catch (e) {
    fail(e)
  }
})

async function confirm() {
  state.value = 'busy'
  try {
    const r = await apiFetch<{ name: string, returnTo: string }>('/v1/web/login-link', { method: 'POST', body: { token }, credentials: 'same-origin' })
    token = ''
    state.value = 'done'
    window.location.assign(r.returnTo)
  } catch (e) {
    fail(e)
  }
}
</script>

<template>
  <div class="mx-auto max-w-xl px-4 pt-14 pb-16 sm:px-6">
    <p class="text-xs tracking-[0.18em] text-primary-300 uppercase">{{ l.link.kicker }}</p>

    <div v-if="state === 'checking'" class="card mt-6 flex items-center gap-3 p-6 text-sm text-base-400" role="status">
      <span class="spinner" aria-hidden="true" />{{ l.link.checking }}
    </div>

    <section v-else-if="state === 'invalid'" class="card mt-6 p-6" role="alert">
      <h1 class="display flex items-center gap-2 text-2xl text-base-50"><SiteIcon name="warn" class="size-5 text-caution-300" />{{ l.link.invalidTitle }}</h1>
      <p class="mt-3 text-sm text-base-400">{{ l.link.invalidText }}</p>
      <NuxtLink :to="lp('/login')" class="btn btn-ghost mt-5">{{ l.title }}</NuxtLink>
    </section>

    <section v-else-if="target" class="card link-card mt-6 p-6" aria-labelledby="link-title">
      <div class="flex items-center gap-4">
        <PlayerHead :uuid="target.uuid" :name="target.name" :skin="target.skin" :size="56" />
        <h1 id="link-title" class="display min-w-0 text-3xl break-words text-base-50">{{ fill(l.link.title, { name: target.name }) }}</h1>
      </div>
      <p class="mt-4 text-base-300">{{ fill(l.link.lead, { name: target.name }) }}</p>
      <p class="warn mt-4"><SiteIcon name="shield" class="mt-0.5 size-4 shrink-0" />{{ l.link.warn }}</p>
      <p class="mt-3 text-xs text-base-400">{{ until }}</p>
      <p v-if="state === 'error'" role="alert" class="alert mt-4"><SiteIcon name="warn" class="mt-0.5 size-4 shrink-0" />{{ errorText }}</p>
      <p v-if="state === 'done'" role="status" class="mt-4 text-sm text-ok">{{ l.link.done }}</p>
      <div class="mt-6 flex flex-wrap gap-3">
        <button type="button" class="btn btn-primary" data-testid="login-link-confirm" :disabled="state === 'busy' || state === 'done'" @click="confirm">
          <SiteIcon name="user" class="size-4" />{{ state === 'busy' ? l.link.confirming : l.link.confirm }}
        </button>
        <NuxtLink :to="lp('/')" class="btn btn-ghost">{{ l.link.cancel }}</NuxtLink>
      </div>
    </section>

    <p v-else-if="state === 'error'" role="alert" class="alert mt-6"><SiteIcon name="warn" class="mt-0.5 size-4 shrink-0" />{{ errorText }}</p>
  </div>
</template>

<style scoped>
.link-card {
  background-image: var(--cube-grid);
  background-size: 34px 20px;
}
.warn {
  display: flex;
  gap: 0.5rem;
  border-radius: 0.375rem;
  border: 1px solid color-mix(in srgb, var(--color-caution-500) 55%, transparent);
  background: color-mix(in srgb, var(--color-caution-900) 40%, transparent);
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: var(--color-base-200);
}
.alert {
  display: flex;
  gap: 0.5rem;
  border-radius: 0.375rem;
  border: 1px solid color-mix(in srgb, var(--color-danger-600) 60%, transparent);
  background: color-mix(in srgb, var(--color-danger-900) 45%, transparent);
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: var(--color-base-200);
}
.spinner {
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 9999px;
  border: 2px solid var(--color-base-700);
  border-top-color: var(--color-primary-400);
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
