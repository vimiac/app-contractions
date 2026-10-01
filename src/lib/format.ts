// Formatage des durées et heures. Unités explicites, jamais de jargon.

/**
 * Formate un temps écoulé / un intervalle en ms.
 * - < 1 h : "m:ss" (ex. 0:48, 7:30)
 * - ≥ 1 h : "h:mm:ss" (ex. 1:05:03) — un intervalle peut dépasser l'heure (pause de sommeil).
 */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const ss = s.toString().padStart(2, '0')
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${ss}`
  return `${m}:${ss}`
}

/** Formate un intervalle (temps entre deux contractions) en m:ss / h:mm:ss, ou "—" si absent. */
export function formatInterval(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—'
  return formatElapsed(ms)
}

/** Heure locale HH:MM d'un horodatage. */
export function formatClock(epochMs: number): string {
  const d = new Date(epochMs)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** Heure locale HH:MM:SS d'un horodatage (pour l'export). */
export function formatClockSec(epochMs: number): string {
  const d = new Date(epochMs)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Date+heure locales lisibles (pour l'export). */
export function formatDateTime(epochMs: number): string {
  const d = new Date(epochMs)
  return d.toLocaleString('fr-FR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

/** Clé de jour local AAAA-MM-JJ (fuseau local, pas UTC). */
export function dayKey(epochMs: number): string {
  const d = new Date(epochMs)
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Libellé de jour court et lisible (ex. "lun. 27/09"). */
export function dayLabel(epochMs: number): string {
  const d = new Date(epochMs)
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}
