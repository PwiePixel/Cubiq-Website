import { loginTexts, type LoginTexts } from '~/utils/login-i18n'

/** Texte der Anmeldeseite (Cubiq Launcher + Microsoft), EN/DE/ES. */
export function useLoginText() {
  const { lang, fill } = useLang()
  const l = computed<LoginTexts>(() => loginTexts[lang.value])
  return { l, lang, fill }
}
