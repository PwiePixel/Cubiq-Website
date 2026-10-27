import { joinURL } from 'ufo'

// Links zur Website (eigene Domain, die Doku liegt auf docs.cubiq-launcher.invalid) und nach außen – für Kopf- und Fußzeile.

export const WEBSITE_URL = 'https://cubiq-launcher.invalid'
export const REPO_URL = 'https://github.com/PwiePixel/Cubiq-launcher'
export const DISCORD_URL = 'https://cubiq-launcher.invalid/discord'
export const IMPRINT_URL = 'https://cubiq-launcher.invalid/imprint/'

type Lang = 'en' | 'de' | 'es'

const TEXT: Record<Lang, { website: string, download: string, privacy: string, imprint: string, tagline: string, notAffiliated: string, backToWebsite: string }> = {
  en: {
    website: 'Website',
    download: 'Download',
    privacy: 'Privacy',
    imprint: 'Imprint',
    tagline: 'Cubiq Launcher – The Redstone Launcher by PwiePixel',
    notAffiliated: 'Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.',
    backToWebsite: 'Back to the website',
  },
  de: {
    website: 'Website',
    download: 'Download',
    privacy: 'Datenschutz',
    imprint: 'Impressum',
    tagline: 'Cubiq Launcher – The Redstone Launcher by PwiePixel',
    notAffiliated: 'Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.',
    backToWebsite: 'Zurück zur Website',
  },
  es: {
    website: 'Sitio web',
    download: 'Descargar',
    privacy: 'Privacidad',
    imprint: 'Aviso legal',
    tagline: 'Cubiq Launcher – The Redstone Launcher by PwiePixel',
    notAffiliated: 'Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.',
    backToWebsite: 'Volver al sitio web',
  },
}

/** Adresse einer Website-Seite in der Sprache der Doku (Englisch ohne `?lang=`, wie auf der Website). */
export function websiteUrl(path: string, lang: string): string {
  const url = joinURL(WEBSITE_URL, path)
  return lang === 'de' || lang === 'es' ? `${url}?lang=${lang}` : url
}

export function useCubiqLinks() {
  const { locale } = useDocusI18n()
  const lang = computed<Lang>(() => (locale.value === 'de' || locale.value === 'es' ? locale.value : 'en'))
  const text = computed(() => TEXT[lang.value])
  return {
    text,
    website: computed(() => websiteUrl('/', lang.value)),
    download: computed(() => websiteUrl('/download', lang.value)),
    privacy: computed(() => websiteUrl('/privacy', lang.value)),
  }
}

/** Datei aus public/ mit Basis-Pfad der App (an der Wurzel der Doku-Domain). */
export function useBaseUrl(path: string): string {
  return joinURL(useRuntimeConfig().app.baseURL, path)
}
