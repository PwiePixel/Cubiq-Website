// Füchschen – ein junger Fuchs als Begleiter am Boden (slot pet), eigenes Design: orangefarbenes Fell mit hellem
// Latz, Schnauze und Schwanzspitze, schwarze Söckchen und Ohrspitzen, bernsteinfarbene Augen. Körper, Animationen und
// Aktionen (Streicheln/Füttern) kommen aus dem gemeinsamen Fuchs-Bauplan (fox_rig.mjs), den auch der Schneefuchs nutzt.

import { FOX_KIT_COLORS, makeFox } from './fox_rig.mjs'

export const item = makeFox({ id: 'fox_kit', name: 'Füchschen', colors: FOX_KIT_COLORS })
