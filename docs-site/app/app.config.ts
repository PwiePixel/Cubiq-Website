// Aussehen und Verhalten der Doku (Docus + Nuxt UI). Farben: siehe app.css (Paletten cubiq, live, moss).
export default defineAppConfig({
  docus: {
    locale: 'en',
    // Standard dunkel wie die Website; Hell-Modus bleibt über den Umschalter erreichbar.
    colorMode: '',
  },
  seo: {
    titleTemplate: '%s · Cubiq Launcher Docs',
    title: 'Cubiq Launcher Docs',
    description: 'Documentation for Cubiq Launcher, the free Minecraft launcher by PwiePixel, and the Cubiq Client mod.',
  },
  header: {
    title: 'Cubiq Launcher Docs',
  },
  // Keine „Edit this page“-/„Report an issue“-Links und kein GitHub-Knopf von Docus (eigene Links im Kopf).
  github: false,
  socials: {},
  search: {
    // Suche über die Abschnitte der Seiten (Nuxt Content, clientseitig aus der statischen Datenbank).
    fts: false,
  },
  toc: {
    bottom: {
      links: [],
    },
  },
  assistant: {
    floatingInput: false,
    explainWithAi: false,
  },
  ui: {
    colors: {
      primary: 'cubiq',
      secondary: 'live',
      neutral: 'moss',
    },
  },
})
