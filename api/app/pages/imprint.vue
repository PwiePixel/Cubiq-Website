<script setup lang="ts">
import { operatorLines, type Operator } from '~/content/website-privacy'

// Impressum: Angaben zum Betreiber kommen aus der Server-Konfiguration (NUXT_PUBLIC_OPERATOR_*, siehe README.md),
// nicht aus dem Code – dieselben Werte nennt die Datenschutzerklärung als Verantwortlichen.
const TEXT = {
  en: {
    title: 'Imprint',
    legal: 'Information pursuant to § 5 DDG (German Digital Services Act)',
    contact: 'Contact',
    privacy: 'How we handle personal data is described in the [privacy policy](/privacy).',
    note: 'Cubiq Launcher is not an official Minecraft product. It is not approved by or associated with Mojang or Microsoft.',
  },
  de: {
    title: 'Impressum',
    legal: 'Angaben gemäß § 5 DDG',
    contact: 'Kontakt',
    privacy: 'Wie wir mit personenbezogenen Daten umgehen, steht in der [Datenschutzerklärung](/privacy).',
    note: 'Der Cubiq Launcher ist kein offizielles Minecraft-Produkt und weder von Mojang noch von Microsoft genehmigt oder mit ihnen verbunden.',
  },
  es: {
    title: 'Aviso legal',
    legal: 'Información según el § 5 DDG (Ley alemana de servicios digitales)',
    contact: 'Contacto',
    privacy: 'Cómo tratamos los datos personales se explica en la [política de privacidad](/privacy).',
    note: 'Cubiq Launcher no es un producto oficial de Minecraft. No está aprobado por Mojang o Microsoft ni asociado con ellos.',
  },
} as const

const { lang, m } = useLang()
const operator = useRuntimeConfig().public.operator as Operator
const text = computed(() => TEXT[lang.value])
const html = computed(() =>
  renderMarkdown(`## ${text.value.legal}\n\n${operatorLines(operator, lang.value)}\n\n${text.value.privacy}\n\n${text.value.note}`, { breaks: true }),
)
usePageSeo(() => ({
  path: '/imprint',
  title: `${m.value.footer.imprint} – Cubiq Launcher`,
  description: text.value.legal,
}))
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-14 sm:px-6">
    <h1 class="display text-5xl leading-tight text-base-50">{{ text.title }}</h1>
    <!-- eslint-disable-next-line vue/no-v-html -- eigene Texte, ohne rohes HTML gerendert (utils/markdown.ts) -->
    <div class="prose-md legal mt-10" v-html="html" />
  </div>
</template>

<style scoped>
.legal {
  font-size: 0.975rem;
  line-height: 1.7;
}
.legal :deep(h2) {
  font-family: var(--font-display);
  font-size: 1.5rem;
  color: var(--color-base-50);
}
</style>
