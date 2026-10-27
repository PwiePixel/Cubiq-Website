import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ALTSTORE_SOURCE, MOBILE_CHANNEL, parseMobileManifest, verifyMinisign } from '../server/lib/mobile'

/** Schlüssel + Signatur im Minisign-Format von `tauri signer sign` (Prehash „ED“, Base64-Hülle). */
function testKey() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x!, 'base64url')
  const id = randomBytes(8)
  const pub = Buffer.from(`untrusted comment: minisign public key\n${Buffer.concat([Buffer.from('Ed'), id, raw]).toString('base64')}\n`).toString('base64')
  const signFile = (data: Buffer, file: string) => {
    const sig = sign(null, createHash('blake2b512').update(data).digest(), privateKey)
    const trusted = `timestamp:1759600000\tfile:${file}`
    const global = sign(null, Buffer.concat([sig, Buffer.from(trusted)]), privateKey)
    const text = `untrusted comment: signature\n${Buffer.concat([Buffer.from('ED'), id, sig]).toString('base64')}\ntrusted comment: ${trusted}\n${global.toString('base64')}\n`
    return Buffer.from(text).toString('base64')
  }
  return { pub, signFile }
}

const SHA = 'a'.repeat(64)
function manifest(extra: Record<string, unknown> = {}) {
  return Buffer.from(JSON.stringify({
    version: '0.18.1',
    notes: '<script>alert(1)</script>',
    pubDate: '2026-10-04T16:42:14.807Z',
    android: { url: `${MOBILE_CHANNEL}Cubiq-Launcher-0.18.1.apk`, sha256: SHA, size: 1000 },
    ios: { url: `${MOBILE_CHANNEL}Cubiq-Launcher-0.18.1.ipa`, sha256: SHA.toUpperCase(), size: 2000, altstore: ALTSTORE_SOURCE },
    ...extra,
  }))
}

describe('Handy-Kanal: mobile.json', () => {
  it('Manifest mit Signatur wie von tauri signer; ein geändertes Byte wird abgelehnt', () => {
    const { pub, signFile } = testKey()
    const data = manifest()
    const sig = signFile(data, 'mobile.json')
    const m = parseMobileManifest(data, sig, pub)
    expect(m?.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(m?.android?.url.startsWith(MOBILE_CHANNEL)).toBe(true)
    expect(m?.android?.name).toMatch(/\.apk$/)
    expect(m?.ios?.altstore).toBe(ALTSTORE_SOURCE)
    const tampered = Buffer.from(data)
    tampered[tampered.length - 3] ^= 1
    expect(parseMobileManifest(tampered, sig, pub)).toBeNull()
  })

  it('gibt nur geprüfte Felder weiter (keine Notizen), Hash klein', () => {
    const k = testKey()
    const data = manifest()
    const m = parseMobileManifest(data, k.signFile(data, 'mobile.json'), k.pub)
    expect(m).toEqual({
      version: '0.18.1',
      publishedAt: '2026-10-04T16:42:14.807Z',
      android: { url: `${MOBILE_CHANNEL}Cubiq-Launcher-0.18.1.apk`, name: 'Cubiq-Launcher-0.18.1.apk', sha256: SHA, size: 1000 },
      ios: { url: `${MOBILE_CHANNEL}Cubiq-Launcher-0.18.1.ipa`, name: 'Cubiq-Launcher-0.18.1.ipa', sha256: SHA, size: 2000, altstore: ALTSTORE_SOURCE },
    })
    expect(JSON.stringify(m)).not.toContain('script')
  })

  it('Signatur: anderer Schlüssel, andere Datei, Müll → abgelehnt', () => {
    const k = testKey()
    const other = testKey()
    const data = manifest()
    expect(parseMobileManifest(data, k.signFile(data, 'client-mod.json'), k.pub)).toBeNull()
    expect(parseMobileManifest(data, other.signFile(data, 'mobile.json'), k.pub)).toBeNull()
    expect(parseMobileManifest(data, 'kein base64 !!', k.pub)).toBeNull()
    expect(verifyMinisign(k.pub, data, '', 'mobile.json')).toBe(false)
  })

  it('fremde Hosts, Pfade und Dateinamen fallen weg – je Plattform', () => {
    const k = testKey()
    const check = (extra: Record<string, unknown>) => {
      const data = manifest(extra)
      return parseMobileManifest(data, k.signFile(data, 'mobile.json'), k.pub)
    }
    const evil = check({ android: { url: 'https://evil.example/Cubiq.apk', sha256: SHA, size: 1 } })
    expect(evil?.android).toBeNull()
    expect(evil?.ios?.name).toBe('Cubiq-Launcher-0.18.1.ipa')
    expect(check({ android: { url: `${MOBILE_CHANNEL}../x/a.apk`, sha256: SHA, size: 1 } })?.android).toBeNull()
    expect(check({ android: { url: `${MOBILE_CHANNEL}a.exe`, sha256: SHA, size: 1 } })?.android).toBeNull()
    expect(check({ android: { url: `${MOBILE_CHANNEL}a.apk`, sha256: 'xyz', size: 1 } })?.android).toBeNull()
    expect(check({ ios: { url: `${MOBILE_CHANNEL}a.ipa`, sha256: SHA, size: 1, altstore: 'https://evil.example/s.json' } })?.ios).toBeNull()
    // Ohne AltStore-Feld: die feste Quelle.
    expect(check({ ios: { url: `${MOBILE_CHANNEL}a.ipa`, sha256: SHA, size: 1 } })?.ios?.altstore).toBe(ALTSTORE_SOURCE)
    expect(check({ version: '1.0<b>' })).toBeNull()
    expect(check({ android: null, ios: null })).toBeNull()
    expect(check({ pubDate: 'gestern' })?.publishedAt).toBeNull()
  })
})
