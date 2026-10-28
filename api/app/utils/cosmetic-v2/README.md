# Kosmetik v2 – gemeinsamer TS-Renderer

TypeScript-Port der Cubiq-Studio-Referenz (`cubiq-studio/public/cosmetic-format.mjs` + `cosmetic-view.mjs`, Ansicht/Licht
aus `workbench.js`). Website (`/cosmetics`) und Launcher (Skins-Seite) nutzen **dieselben Dateien** – bitte nur
gemeinsam ändern. Format-Beschreibung: `api/API.md` §11.9 bzw. `cubiq-studio/cosmetic-format.md`.

Tests (`api/tests/cosmetic-v2-format.test.ts`) prüfen Mathematik, Animation, Prüfung und den three.js-Aufbau; liegt die
Studio-Referenz unter `E:/ai/cubiq-studio/public/`, vergleichen sie Posen, Matrizen, Geometrie, UVs, Höfe und
Sichtbarkeit aller mitgelieferten Modelle **1:1 mit der Werkbank** (pixelgleiche Optik).

## Dateien

| Datei | Inhalt | Abhängigkeiten |
|---|---|---|
| `format.ts` | Typen, `validateModel`/`parseModel`, 4×4-Mathematik, Flächen/UVs, Knochen, Animation, Frames, Höfe | keine (läuft auch auf dem Server) |
| `view.ts` | three.js-Aufbau + skinview3d-Hilfen, Laden | `three` (nur Typen, das Modul wird hineingereicht), `skinview3d` (nur Typen), DOM (`document`, `Image`, `fetch`) |

Kein Nuxt, keine Auto-Imports, keine Vue-Abhängigkeit. Übernahme in den Launcher: beide Dateien nach
`app/utils/cosmetic-v2/` kopieren (dort ggf. `three@0.156.1` + `@types/three@0.156.0` ergänzen – gleiche Version wie in
skinview3d 3.4.2). Import immer mit Pfad (`~/utils/cosmetic-v2/view`), **keine** `index.ts` anlegen (sonst importiert
Nuxt alle Namen automatisch).

## API (`view.ts`)

```ts
import * as THREE from 'three'               // oder: const THREE = await import('three')
import { SkinViewer } from 'skinview3d'
import { loadCosmetic, mountOnSkinViewer, frameHead } from '~/utils/cosmetic-v2/view'

const viewer = new SkinViewer({ canvas, width, height, fov: 32 })            // fov 32 wie die Werkbank
const loaded = await loadCosmetic({ model: item.model, texture: textureUrl, glow: item.glow }) // textureUrl = texture.url (Katalog) bzw. texture (Website)
const mounted = mountOnSkinViewer(THREE, viewer, loaded, { animate: true, glow: true, night: false })
frameHead(THREE, viewer, loaded.model, 'three')                             // Kamera wie die Werkbank (optional)
mounted.set({ night: true })                                               // Tag/Nacht, Animation, Leuchten
mounted.dispose()                                                          // abnehmen (Viewer bleibt)
```

| Export | Zweck |
|---|---|
| `loadCosmetic({ model, texture, glow? }, deps?)` | Lädt `model.json` + Bilder, prüft Modell **und Bildmaße** (`parseModel`), wirft bei Fehlern. `deps.fetchJson` / `deps.loadImg` ersetzbar (z. B. Tauri-Kern, Data-URLs). |
| `createCosmetic(THREE, model, images)` | Baut die Szene (Knochen-Gruppen, Meshes je Knochen mit Material-Gruppen cutout/emissive/translucent, Glow-Overlay additiv, Höfe als Sprites). Gibt `{ root, model, update(t, opts), setLight(f), highlight(id), dispose() }`. `root` an den Kopf hängen (Ursprung = Nacken). |
| `update(timeMs, { animate, glow, camera, drivers, poseMs, action, fadeClock })` | Vor jedem Bild: Pose zur **Wanduhr**, Glow-/Textur-Frame, Höfe (zur Kamera schieben, Puls, Blickrichtung). `poseMs` = eigene Zeit der Zustands-Animationen (z. B. `grab` seit Zustandsbeginn); `action: { driver, localMs }` spielt eine Aktion (Streicheln/Füttern) allein und auch ohne Animation; mit `fadeClock` (monotone ms) blenden Wechsel 250 ms über (auch ein Neustart: `localMs` bzw. `poseMs` springt zurück) – ohne bleibt alles wie bisher. Bilder und Höfe bleiben immer auf `timeMs`. |
| `mountOnSkinViewer(THREE, viewer, loaded, opts)` | Hängt an `viewer.playerObject.skin.head`, eigene rAF-Schleife wie die Werkbank. `set({ animate, glow, night, fixedTime, options, drivers, stateTick, action })`, `dispose()`. Animation aus = Ruhepose, Leuchten steht. Zustandswechsel blenden über; `grab` läuft einmal ab dem Wechsel – ein neuer `stateTick` (Zähler der Zustands-Klicks, wie `petStateTick` im Launcher) startet auch denselben Zustand neu; `action: { driver, startedAt }` (`Date.now()`, neues Objekt = neu starten) läuft einmal und endet von selbst. |
| `applyDayNight(viewer, cos, night)` | Werkbank-Licht: Nacht = Umgebungslicht 3 × 0,18, Kameralicht 0,6 × 0,2, Modell-Licht 0,2 (emissive + Leuchten bleiben voll). |
| `frameHead(THREE, viewer, model, view = 'three', zoom = 1)` | Kamera auf den Kopf (Ziel Nacken + 8 + Anhebung nach Modellhöhe, Abstand 34 · (1 + Anhebung/9)); `VIEWS` = front/three/side/back/top. |
| `attachAnchor(THREE, viewer, attach)` | Anker je Anhängepunkt wie die Werkbank: `head` = `skin.head`; `body` = Gruppe in `skin.body` bei y + 6 (Nacken); `ground` = Gruppe in `playerObject` bei (13, −16, 7) = Höhe der Füße wie im Spiel und im Launcher, Drehung y 0,35 (neben dem Fuß). `mountOnSkinViewer` nutzt ihn automatisch nach `model.attach`. |
| `frameModel(THREE, viewer, model, view, zoom)` | Kamera nach Anhängepunkt: `head` = `frameHead`; `body` (Flügel) = ganzer Spieler, „three“ schräg von hinten; `ground` = Spieler + Begleiter. |
| `setOptions(choices)` / `mount.set({ options })` | Optionen (Anhang D, z. B. `{ beard: false }`): abgeschaltete Optionen blenden ihre Knochen samt Kind-Knochen aus (Gruppe unsichtbar). `format.ts`: `resolveOptions`, `hiddenBones`, `SLOT_ATTACH`, `PET_STATES`. `mount.set({ drivers })` spielt z. B. `['walk']`. |

`format.ts` exportiert u. a. `validateModel`, `parseModel`, `samplePoses`, `boneLocal`, `boneMatrices`, `faceCorners`,
`faceUvCorners`, `frameAt`, `haloIntensity`, `haloFacing`, `haloFalloff`, `rotationZYX`, `LIMITS` und alle Modell-Typen
(`CosmeticModel`, `Bone`, `Cube`, `Face`, `Animation`, `Halo`, …), für Aktionen (API.md §11.9, Liste `actions` neben
`animations`) `ACTION_DRIVERS` (`pet`, `eat`), `actionOf`, `actionLength`, `sampleAction` (exklusiv, eigene Zeit, begrenzt)
und `blendPoses` (die Überblendung, mit `isFxBone`). Probleme in `actions` sind nur Warnungen – der Eintrag fällt weg, das
Modell bleibt gültig. Je Treiber zählt der erste **gültige** Eintrag: ein weiterer Eintrag für einen Treiber, der schon
einen gültigen hat, gibt eine Warnung; ein ungültiger Eintrag sperrt einen späteren gültigen nicht (`[ungültig, gültig]`
→ eine Warnung, die Aktion kommt aus dem zweiten). id und Knochen der Spuren müssen Texte sein (`true`, `["pet"]` zählen
nicht).

## Regeln, die gleich bleiben müssen

- Flächen beidseitig; `cutout` = `alphaTest 0.5`; `emissive` = gleiches Material ohne Licht-Faktor; `translucent` =
  transparent ohne Tiefe schreiben. Texturen `NearestFilter`, **keine Mipmaps**, `SRGBColorSpace`.
- Glow: `AdditiveBlending`, `depthWrite: false`, `polygonOffset -1/-2`, `toneMapped: false`, `renderOrder 2`.
- Höfe: Sprite 64×64-Verlauf `(1 − r)^2.5`, additiv, `renderOrder 3`, um `size/2` zur Kamera geschoben.
- Zeit = `Date.now()` (Wanduhr), damit Website, Launcher und Spiel dieselbe Phase zeigen. Ausnahmen: einmalige Zustände
  (`grab`) und Aktionen laufen ab ihrem eigenen Beginn; Bilder und Höfe bleiben trotzdem auf der Wanduhr.
- Überblendungen (250 ms, smoothstep, wie Launcher und Cubiq Client): Drehung (Euler-Grad), Position und Skalierung je
  Komponente linear, `a + (b − a) · w` – wie die veröffentlichten Launcher und Clients, Hüte und Flügel blenden also
  unverändert. Drehungen bewusst nicht auf den kürzesten Weg (gegen ein bewegtes Ziel wie Cubis Rolle spränge das Bild,
  sobald der Unterschied 180° überschreitet). Bekannt wie bei den veröffentlichten Clients: nach mehreren Umdrehungen
  dreht der Begleiter kurz schnell zurück, und beim Wechsel in eine Bewegung mit mehreren Umdrehungen (`slide`,
  `handsup`) kann das Bild einmal um bis zu etwa 180° springen, wenn deren Schleife während der 250 ms neu beginnt. Effekt-Knochen `fx_*` werden
  nie übergeblendet, sie stehen sofort in der Zielpose (unterbrochene Herzen/Krümel verschwinden im Versteck).
- CSP: alles same-origin (Bilder/JSON von der eigenen API), keine Blob-/Daten-URLs nötig.
