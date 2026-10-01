import type { Contraction } from './types.ts'
import { sortByAt, overallMedianInterval } from './stats.ts'
import { formatInterval, formatDateTime } from './format.ts'

/** Mention non-médicale placée en tête du CSV (avant l'entête), comme à l'écran. */
const CSV_DISCLAIMER = 'Outil de suivi personnel — ne remplace pas un avis médical.'

/** Échappe un champ CSV (séparateur ';', compatible Excel FR). */
function csvField(v: string): string {
  if (/[";\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"'
  return v
}

/**
 * Export CSV (séparateur ';', BOM UTF-8 pour Excel FR).
 * Une ligne par contraction, dans l'ordre chronologique.
 * Colonnes : numéro, date et heure, intervalle début-à-début depuis la précédente.
 */
export function toCSV(list: Contraction[]): string {
  const s = sortByAt(list)
  const header = ['#', 'Date et heure', 'Intervalle depuis précédente (début à début)']
  const rows = s.map((c, i) => {
    const interval = i === 0 ? null : c.at - s[i - 1].at
    return [String(i + 1), formatDateTime(c.at), formatInterval(interval)]
  })
  // Ligne de mention non-médicale en tête (une seule colonne), puis entête + données.
  // BOM UTF-8 conservé en tout début pour Excel FR ; séparateur ';'.
  const lines = [[CSV_DISCLAIMER], header, ...rows].map((cols) => cols.map(csvField).join(';'))
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/** Export texte lisible (à copier/coller ou imprimer). */
export function toText(list: Contraction[]): string {
  const s = sortByAt(list)
  const lines: string[] = []
  lines.push('Suivi des contractions')
  lines.push(`Export du ${formatDateTime(Date.now())}`)
  lines.push('')
  lines.push(`Nombre total de contractions : ${s.length}`)
  const medI = overallMedianInterval(s)
  lines.push(`Fréquence (intervalle médian début à début) : ${formatInterval(medI)}`)
  lines.push('')
  s.forEach((c, i) => {
    const interval = i === 0 ? null : c.at - s[i - 1].at
    lines.push([`${i + 1}.`, formatDateTime(c.at), `intervalle ${formatInterval(interval)}`].join('  ·  '))
  })
  lines.push('')
  lines.push('Intervalle = début à début (temps entre le début de deux contractions).')
  lines.push('Outil de suivi personnel — ne remplace pas un avis médical.')
  return lines.join('\n')
}
