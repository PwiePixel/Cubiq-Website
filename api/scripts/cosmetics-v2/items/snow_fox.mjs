// Schneefuchs – ein Polarfuchs als Begleiter am Boden (slot pet): weißes Winterfell mit kühlen, eisblauen Schatten,
// eisblaue Augen, dunkle Nase, Söckchen und Ohrspitzen. Spitze, lange Schnauze und ein großer buschiger Schwanz mit
// schneeweißer Spitze – so bleibt er auch ganz in Weiß klar ein Fuchs. Körper, Animationen und Aktionen
// (Streicheln/Füttern) kommen aus dem gemeinsamen Fuchs-Bauplan (fox_rig.mjs), wie beim Füchschen.

import { hex, mix } from '../lib.mjs'
import { FOX_KIT_COLORS, makeFox } from './fox_rig.mjs'

const fur = hex('#eef3f8')
const furLo = hex('#c5d3e2')

export const SNOW_FOX_COLORS = Object.freeze({
  ...FOX_KIT_COLORS,
  fur,
  furHi: hex('#ffffff'),
  furLo,
  cream: hex('#ffffff'),
  creamShade: hex('#dfe7f0'),
  iris: hex('#6fb7e8'),
  // Schwanz einen Hauch kühler als das Fell: die schneeweiße Spitze hebt sich ab
  tail: mix(fur, furLo, 0.2),
  tailTop: mix(fur, furLo, 0.45),
  // feinere Körnung als beim Füchschen – weißes Fell wirkt sonst fleckig
  grain: 0.06,
})

export const item = makeFox({
  id: 'snow_fox',
  name: 'Schneefuchs',
  colors: SNOW_FOX_COLORS,
  shape: {
    // Großer Buschschwanz (so lang wie beim Füchschen, aber viel dicker): Ansatz, dicke Mitte, schmalere weiße Spitze
    tail: {
      base: [[-1.5, 4.5, -5.5], [1.5, 7.5, -3.25]],
      end: [[-1.875, 4.125, -7], [1.875, 7.875, -5.5]],
      tuft: [[-1.375, 4.625, -8], [1.375, 7.375, -7]],
      pivot: [0, 6, -5.5],
      tip: -7,
      sitUp: 12,
    },
    // Schmale, spitz zulaufende Schnauze (zwei Stufen) mit dunkler Nase vorn
    snout: {
      snout: [[-0.875, 6, 5.75], [0.875, 7.25, 7.25]],
      tip: [[-0.625, 6, 7.25], [0.625, 6.875, 7.75]],
      nose: [[-0.375, 6.5, 7.75], [0.375, 7, 8]],
      jaw: [[-0.75, 5.625, 5.75], [0.75, 6, 7.5]],
      dark: 6.75,
      mouth: [0, 6.25, 7.5],
      berry: [0, -1.5, 3.75],
    },
  },
})
