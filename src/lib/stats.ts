import type { Contraction } from './types.ts'
import { dayKey, dayLabel } from './format.ts'

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

// --- Règles ---
export const DUPLICATE_GUARD_MS = 5_000  // anti double-appui : 2e appui < 5 s ignoré
export const EXPORT_REMINDER_DAYS = 2    // N=2 jours : rappel « l'export = la sauvegarde »

/** Trie une copie de la liste par horodatage croissant. */
export function sortByAt(list: Contraction[]): Contraction[] {
  return [...list].sort((a, b) => a.at - b.at)
}

/**
 * Intervalles début-à-début entre contractions consécutives (convention obstétricale).
 * intervals[i] = at[i+1] - at[i]. Longueur = n-1.
 */
export function intervals(list: Contraction[]): number[] {
  const s = sortByAt(list)
  const out: number[] = []
  for (let i = 1; i < s.length; i++) out.push(s[i].at - s[i - 1].at)
  return out
}

/** Médiane d'une série (null si vide). Gère nombre pair (moyenne des 2 centraux) et impair. */
export function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

/**
 * Fréquence = intervalle médian début-à-début.
 * Médiane (pas moyenne) : une pause de sommeil ou un long calme fausserait une moyenne.
 */
export function medianInterval(list: Contraction[]): number | null {
  return median(intervals(list))
}

/** Contractions dont l'horodatage tombe dans la fenêtre [now - windowMs, now]. */
export function inWindow(list: Contraction[], windowMs: number, now: number = Date.now()): Contraction[] {
  return list.filter((c) => c.at >= now - windowMs && c.at <= now)
}

/** Nombre de contractions sur la dernière heure. `now` injectable pour les tests. */
export function countLastHour(list: Contraction[], now: number = Date.now()): number {
  return inWindow(list, HOUR_MS, now).length
}

/** Intervalle médian début-à-début sur la dernière heure (ms), ou null. */
export function medianIntervalLastHour(list: Contraction[], now: number = Date.now()): number | null {
  return medianInterval(inWindow(list, HOUR_MS, now))
}

/**
 * Vrai s'il existe des contractions non exportées (postérieures au dernier export, ou toutes si jamais exporté)
 * dont la plus ancienne date de N jours ou plus. Sert au rappel discret « l'export = la sauvegarde ».
 * `now` injectable pour les tests.
 */
export function needsExportReminder(
  list: Contraction[],
  lastExportAt: number | null,
  now: number = Date.now(),
  nDays: number = EXPORT_REMINDER_DAYS,
): boolean {
  const unexported = list.filter((c) => lastExportAt == null || c.at > lastExportAt)
  if (unexported.length === 0) return false
  const oldest = Math.min(...unexported.map((c) => c.at))
  return now - oldest >= nDays * DAY_MS
}

export interface DailyStat {
  dayKey: string
  label: string
  /** Timestamp de référence du jour (1re contraction du jour). */
  refMs: number
  count: number
  /** Fréquence du jour = intervalle médian début-à-début (ms), ou null si < 2 contractions ce jour-là. */
  medianIntervalMs: number | null
}

/**
 * Statistiques agrégées par jour local :
 *  - count : nombre de contractions (par jour de leur horodatage)
 *  - medianIntervalMs : intervalle MÉDIAN début-à-début, rattaché au jour de la 2e contraction de chaque paire
 * Résultat trié par jour croissant.
 */
export function dailyStats(list: Contraction[]): DailyStat[] {
  const s = sortByAt(list)
  const byDay = new Map<string, { refMs: number; intervals: number[]; count: number }>()

  const ensure = (ms: number) => {
    const k = dayKey(ms)
    let e = byDay.get(k)
    if (!e) {
      e = { refMs: ms, intervals: [], count: 0 }
      byDay.set(k, e)
    }
    return e
  }

  for (const c of s) ensure(c.at).count += 1

  // Intervalles rattachés au jour de la contraction la plus récente de la paire.
  for (let i = 1; i < s.length; i++) {
    ensure(s[i].at).intervals.push(s[i].at - s[i - 1].at)
  }

  return [...byDay.entries()]
    .map(([k, e]) => ({
      dayKey: k,
      label: dayLabel(e.refMs),
      refMs: e.refMs,
      count: e.count,
      medianIntervalMs: median(e.intervals),
    }))
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey))
}

export interface HourBucket {
  /** Début de la tranche horaire (ms epoch). */
  startMs: number
  /** Libellé court "HHh" (ex. "14h"). */
  label: string
  count: number
}

/**
 * Répartition par tranche horaire sur les dernières 24 h, alignée sur l'heure pleine.
 * Renvoie toujours 24 tranches consécutives se terminant à l'heure courante.
 * `now` est injectable pour les tests.
 */
export function last24hHourly(list: Contraction[], now: number = Date.now()): HourBucket[] {
  const currentHourStart = Math.floor(now / HOUR_MS) * HOUR_MS
  const firstBucketStart = currentHourStart - 23 * HOUR_MS
  const buckets: HourBucket[] = []
  for (let i = 0; i < 24; i++) {
    const startMs = firstBucketStart + i * HOUR_MS
    const h = new Date(startMs).getHours()
    buckets.push({ startMs, label: `${h}h`, count: 0 })
  }
  const rangeEnd = currentHourStart + HOUR_MS
  for (const c of list) {
    if (c.at < firstBucketStart || c.at >= rangeEnd) continue
    const idx = Math.floor((c.at - firstBucketStart) / HOUR_MS)
    if (idx >= 0 && idx < 24) buckets[idx].count += 1
  }
  return buckets
}

/** Intervalle médian (ms) début-à-début sur toute la série. Alias explicite pour l'export. */
export function overallMedianInterval(list: Contraction[]): number | null {
  return medianInterval(list)
}
