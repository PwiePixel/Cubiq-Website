import { joinURL } from 'ufo'

// Links zur Website (eigene Domain; die Doku liegt auf docs.<Domain der Website>) und nach außen – für Kopf- und Fußzeile.

/** Vorgabe ohne SITE_URL beim Bauen; sonst gilt die Adresse aus der Runtime-Config (nuxt.config.ts). */
export const WEBSITE_URL = 'https://cubiq-launcher.invalid'
export const REPO_URL = 'https://github.com/PwiePixel/Cubiq-launcher'
/** Einladung zum eigenen Discord-Server – leer lassen, solange es keinen gibt (dann kein Discord-Link). */
export const DISCORD_URL = ''

type Lang = 'en' | 'de' | 'es'

const TEXT: Record<Lang, { website: string, download: string, privacy: string, imprint: string, tagline: string, notAffiliated: string, backToWebsite: string }> = {
  en: {
    website: 'Website',
    download: 'Download',
    privacy: 'Privacy',
    imprint: 'Imprint',
    tagline: 'Cubiq Launcher – the Minecraft launcher by PwiePixel',
    notAffiliated: 'Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.',
    backToWebsite: 'Back to the website',
  },
  de: {
    website: 'Website',
    download: 'Download',
    privacy: 'Datenschutz',
    imprint: 'Impressum',
    tagline: 'Cubiq Launcher – der Minecraft-Launcher von PwiePixel',
    notAffiliated: 'Kein offizielles Minecraft-Produkt. Nicht von Mojang oder Microsoft genehmigt oder mit ihnen verbunden.',
    backToWebsite: 'Zurück zur Website',
  },
  es: {
    website: 'Sitio web',
    download: 'Descargar',
    privacy: 'Privacidad',
    imprint: 'Aviso legal',
    tagline: 'Cubiq Launcher – el launcher de Minecraft de PwiePixel',
    notAffiliated: 'No es un producto oficial de Minecraft. No está aprobado por Mojang o Microsoft ni asociado con ellos.',
    backToWebsite: 'Volver al sitio web',
  },
}

/** Adresse einer Website-Seite in der Sprache der Doku (Englisch ohne `?lang=`, wie auf der Website). */
export function websiteUrl(path: string, lang: string, base: string = WEBSITE_URL): string {
  const url = joinURL(base, path)
  return lang === 'de' || lang === 'es' ? `${url}?lang=${lang}` : url
}

export function useCubiqLinks() {
  const { locale } = useDocusI18n()
  const lang = computed<Lang>(() => (locale.value === 'de' || locale.value === 'es' ? locale.value : 'en'))
  const text = computed(() => TEXT[lang.value])
  const base = (useRuntimeConfig().public.websiteUrl as string | undefined) || WEBSITE_URL
  return {
    text,
    website: computed(() => websiteUrl('/', lang.value, base)),
    download: computed(() => websiteUrl('/download', lang.value, base)),
    privacy: computed(() => websiteUrl('/privacy', lang.value, base)),
    imprint: computed(() => websiteUrl('/imprint', lang.value, base)),
  }
}

/** Datei aus public/ mit Basis-Pfad der App (an der Wurzel der Doku-Domain). */
export function useBaseUrl(path: string): string {
  return joinURL(useRuntimeConfig().app.baseURL, path)
}
