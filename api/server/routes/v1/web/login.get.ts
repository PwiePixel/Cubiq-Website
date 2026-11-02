import { defineEventHandler } from 'h3'

/**
 * Website: Welche Anmeldungen gibt es? Nur die Anmeldung per Cubiq Launcher (§29) – eine Anmeldung mit Microsoft bietet
 * die Website nicht an (Mojang hat die App nicht freigegeben). Der Einmal-Link des Betreibers (§41) steht nicht hier.
 */
export default defineEventHandler(() => ({ launcher: true }))
