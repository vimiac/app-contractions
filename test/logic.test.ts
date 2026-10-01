import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Contraction } from '../src/lib/types.ts'
import { formatElapsed, formatInterval, dayKey } from '../src/lib/format.ts'
import {
  intervals, dailyStats, last24hHourly, median, medianInterval,
  countLastHour, medianIntervalLastHour, inWindow, sortByAt,
  needsExportReminder, DUPLICATE_GUARD_MS,
} from '../src/lib/stats.ts'
import { normalizeContraction } from '../src/lib/store.ts'
import { toCSV, toText } from '../src/lib/csv.ts'

const MIN = 60_000
const HOUR = 3_600_000

/** Fabrique une contraction du nouveau modèle { id, at }. */
function c(id: string, atMs: number): Contraction {
  return { id, at: atMs }
}

test('formatElapsed : m:ss et h:mm:ss', () => {
  assert.equal(formatElapsed(0), '0:00')
  assert.equal(formatElapsed(5_000), '0:05')
  assert.equal(formatElapsed(65_000), '1:05')
  assert.equal(formatElapsed(600_000), '10:00')
  assert.equal(formatElapsed(3_600_000 + 5 * MIN + 3_000), '1:05:03') // ≥ 1 h
  assert.equal(formatElapsed(-100), '0:00') // borné à 0
})

test('formatInterval gère null', () => {
  assert.equal(formatInterval(null), '—')
  assert.equal(formatInterval(90_000), '1:30')
})

// ---------- Migration ancien -> nouveau format ----------

test('normalizeContraction : nouveau format conservé', () => {
  assert.deepEqual(normalizeContraction({ id: 'x', at: 1234 }), { id: 'x', at: 1234 })
})

test('normalizeContraction : ancien format { id, start, end, note } -> { id, at }', () => {
  // start conservé -> at ; end et note jetés.
  assert.deepEqual(
    normalizeContraction({ id: 'old', start: 5000, end: 9000, note: 'lieu: maison' }),
    { id: 'old', at: 5000 },
  )
  // end null (ancienne contraction « en cours ») : on garde quand même le début.
  assert.deepEqual(
    normalizeContraction({ id: 'ongoing', start: 7000, end: null, note: '' }),
    { id: 'ongoing', at: 7000 },
  )
})

test('normalizeContraction : entrée illisible -> null (ignorée, jamais d’écran blanc)', () => {
  assert.equal(normalizeContraction(null), null)
  assert.equal(normalizeContraction(42), null)
  assert.equal(normalizeContraction({ at: 1000 }), null)            // pas d'id
  assert.equal(normalizeContraction({ id: 'z' }), null)             // ni at ni start
  assert.equal(normalizeContraction({ id: 'z', at: 'nope' }), null) // at non numérique
  assert.equal(normalizeContraction({ id: 'z', at: NaN }), null)    // NaN rejeté
})

// ---------- Intervalles début-à-début ----------

test('intervals = différences début à début, triées', () => {
  const base = 1_000_000
  const list = [c('2', base + 10 * MIN), c('1', base), c('3', base + 25 * MIN)]
  assert.deepEqual(intervals(list), [10 * MIN, 15 * MIN])
})

test('median : impair, pair, vide', () => {
  assert.equal(median([]), null)
  assert.equal(median([5]), 5)
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([1, 2, 3, 4]), 2.5)
  assert.equal(median([10, 2, 8, 4]), 6)
})

test('medianInterval : médiane des intervalles début-à-début, pair et impair', () => {
  const base = 7_000_000
  const three = [c('a', base), c('b', base + 10 * MIN), c('c', base + 30 * MIN), c('d', base + 60 * MIN)]
  assert.deepEqual(intervals(three), [10 * MIN, 20 * MIN, 30 * MIN])
  assert.equal(medianInterval(three), 20 * MIN)
  const four = [...three, c('e', base + 100 * MIN)]
  assert.deepEqual(intervals(four), [10 * MIN, 20 * MIN, 30 * MIN, 40 * MIN])
  assert.equal(medianInterval(four), 25 * MIN)
})

test('medianInterval : médiane robuste à une longue pause (vs moyenne)', () => {
  const base = 8_000_000
  // 3 intervalles serrés puis une pause de sommeil de 4 h : la médiane reste ~5 min.
  const list = [
    c('a', base),
    c('b', base + 5 * MIN),
    c('c', base + 10 * MIN),
    c('d', base + 15 * MIN),
    c('e', base + 15 * MIN + 4 * HOUR),
  ]
  assert.deepEqual(intervals(list), [5 * MIN, 5 * MIN, 5 * MIN, 4 * HOUR])
  assert.equal(medianInterval(list), 5 * MIN) // la pause ne la fausse pas
})

// ---------- Dernière heure ----------

test('countLastHour / inWindow : fenêtre glissante d’une heure', () => {
  const now = 10_000_000
  const list = [
    c('r1', now - 5 * MIN),
    c('r2', now - 40 * MIN),
    c('old', now - 90 * MIN), // hors dernière heure
  ]
  assert.equal(countLastHour(list, now), 2)
  assert.equal(inWindow(list, HOUR, now).length, 2)
})

test('medianIntervalLastHour : intervalle médian sur la dernière heure', () => {
  const now = 11_000_000
  const list = [
    c('old', now - 120 * MIN),  // exclu (hors 1 h)
    c('a', now - 30 * MIN),
    c('b', now - 20 * MIN),     // intervalle 10 min
    c('c', now - 5 * MIN),      // intervalle 15 min
  ]
  // intervalles dans la fenêtre : [10 min, 15 min] -> médiane 12,5 min
  assert.equal(medianIntervalLastHour(list, now), 12.5 * MIN)
})

// ---------- Agrégats par jour / 24 h ----------

test('dailyStats : compte + fréquence (intervalle médian) par jour', () => {
  const d27 = new Date(2026, 8, 27, 8, 0, 0).getTime()
  const list = [
    c('a', d27),
    c('b', d27 + 10 * MIN),
    c('c', d27 + 22 * MIN),
    c('d', new Date(2026, 8, 28, 9, 0, 0).getTime()),
  ]
  const ds = dailyStats(list)
  assert.equal(ds.length, 2)
  const day27 = ds.find((x) => x.dayKey === dayKey(d27))!
  assert.equal(day27.count, 3)
  // Intervalles du 27 rattachés au jour de la 2e contraction : 10 min, 12 min -> médiane 11 min.
  assert.equal(day27.medianIntervalMs, 11 * MIN)
  const day28 = ds.find((x) => x.dayKey !== day27.dayKey)!
  assert.equal(day28.count, 1)
  // Une seule contraction ce jour-là -> l'intervalle traversant minuit lui est rattaché (médiane d'un élément).
  assert.ok(day28.medianIntervalMs != null)
})

test('last24hHourly : 24 tranches, bucketing correct, ignore hors fenêtre', () => {
  const now = new Date(2026, 8, 27, 14, 30, 0).getTime()
  const list = [
    c('recent1', now - 5 * MIN),
    c('recent2', now - 20 * MIN),
    c('h1', now - 1 * HOUR),
    c('old', now - 30 * HOUR),
  ]
  const buckets = last24hHourly(list, now)
  assert.equal(buckets.length, 24)
  assert.equal(buckets.reduce((a, b) => a + b.count, 0), 3) // le vieux est exclu
  assert.equal(buckets[buckets.length - 1].count, 2)        // dernière tranche = 14h
})

test('sortByAt ne mute pas la liste d’entrée', () => {
  const list = [c('b', 200), c('a', 100)]
  const copy = [...list]
  sortByAt(list)
  assert.deepEqual(list, copy)
})

// ---------- Anti double-appui ----------

test('DUPLICATE_GUARD_MS = 5 s (règle anti double-appui)', () => {
  assert.equal(DUPLICATE_GUARD_MS, 5_000)
})

test('anti double-appui : logique de fenêtre 5 s', () => {
  // Reproduit la décision du hook : appui ignoré si < 5 s après la dernière contraction.
  const lastAt = 1_000_000
  const guarded = (now: number) => now - lastAt < DUPLICATE_GUARD_MS
  assert.equal(guarded(lastAt + 3_000), true)   // 3 s -> ignoré
  assert.equal(guarded(lastAt + 4_999), true)   // 4,999 s -> ignoré
  assert.equal(guarded(lastAt + 5_000), false)  // 5 s -> accepté
  assert.equal(guarded(lastAt + 20_000), false) // bien après -> accepté
})

// ---------- Export ----------

test('CSV : entête sans durée ni note, séparateur ;, échappement, BOM', () => {
  const base = new Date(2026, 8, 27, 8, 0, 0).getTime()
  const list = [c('a', base), c('b', base + 8 * MIN)]
  const csv = toCSV(list)
  assert.ok(csv.startsWith('﻿'), 'BOM présent')
  const lines = csv.trim().split('\r\n')
  assert.equal(lines.length, 4) // disclaimer + entête + 2
  assert.ok(lines[0].includes('ne remplace pas un avis médical'), 'mention non-médicale en tête')
  assert.ok(!lines[0].includes(';'), 'la ligne de mention ne casse pas les colonnes')
  assert.ok(lines[1].includes('Date et heure'))
  assert.ok(lines[1].includes('Intervalle depuis précédente (début à début)'))
  assert.ok(!lines[1].toLowerCase().includes('durée'), 'aucune colonne durée')
  assert.ok(!lines[1].toLowerCase().includes('note'), 'aucune colonne note')
  assert.ok(lines[3].includes('8:00'), 'intervalle 8 min de la 2e ligne') // 8 min = 8:00
})

test('export texte : total, fréquence médiane, mention non-médicale, aucune durée', () => {
  const base = 3_000_000
  const txt = toText([c('a', base), c('b', base + 5 * MIN), c('c', base + 12 * MIN)])
  assert.ok(txt.includes('Nombre total de contractions : 3'))
  assert.ok(txt.includes('Fréquence (intervalle médian début à début)'))
  assert.ok(txt.includes('début à début'))
  assert.ok(txt.includes('ne remplace pas un avis médical'))
  assert.ok(!txt.toLowerCase().includes('durée'), 'aucune notion de durée')
})

test('needsExportReminder : contractions non exportées depuis N jours (modèle at)', () => {
  const now = 20_000_000_000
  const DAY = 86_400_000
  assert.equal(needsExportReminder([c('a', now - 3 * DAY)], null, now), true)
  assert.equal(needsExportReminder([c('b', now - 1 * DAY)], null, now), false)
  assert.equal(needsExportReminder([c('c', now - 30 * MIN)], now - 60 * MIN, now), false)
  assert.equal(needsExportReminder([c('d', now - 6 * DAY)], now - 5 * DAY, now), false)
  assert.equal(needsExportReminder([c('e', now - 3 * DAY)], now - 5 * DAY, now), true)
  assert.equal(needsExportReminder([], null, now), false)
})
