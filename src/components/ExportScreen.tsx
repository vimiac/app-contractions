import { useMemo, useState } from 'react'
import type { UseContractions } from '../hooks/useContractions'
import { toCSV, toText } from '../lib/csv'

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function todayStamp(): string {
  const d = new Date()
  const p = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function ExportScreen({ ctrl, onExported }: { ctrl: UseContractions; onExported: () => void }) {
  const { list, clearAll } = ctrl
  const [copied, setCopied] = useState(false)
  const text = useMemo(() => toText(list), [list])

  const empty = list.length === 0

  // L'export EST la sauvegarde : on horodate chaque export réussi (CSV, texte, copie).
  const exportCsv = () => {
    downloadFile(toCSV(list), `contractions-${todayStamp()}.csv`, 'text/csv;charset=utf-8')
    onExported()
  }
  const exportText = () => {
    downloadFile(text, `contractions-${todayStamp()}.txt`, 'text/plain;charset=utf-8')
    onExported()
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      onExported()
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const onReset = () => {
    if (window.confirm('Effacer TOUTES les contractions enregistrées ? Cette action est définitive.')) {
      clearAll()
    }
  }

  return (
    <div className="export-screen">
      <section className="chart-block">
        <h2>Exporter mes données</h2>
        <p className="chart-sub">
          Pour montrer ces chiffres à votre sage-femme ou à la maternité. Les données restent sur votre téléphone ;
          l’export crée un fichier que vous choisissez de partager.
        </p>
        <div className="export-buttons">
          <button className="secondary-button" disabled={empty} onClick={exportCsv}>
            ⬇︎ Télécharger le CSV
          </button>
          <button className="secondary-button" disabled={empty} onClick={exportText}>
            ⬇︎ Télécharger le texte
          </button>
          <button className="secondary-button" disabled={empty} onClick={onCopy}>
            {copied ? '✓ Copié' : '⧉ Copier le texte'}
          </button>
        </div>
        {!empty && (
          <textarea className="export-preview" readOnly value={text}
            aria-label="Aperçu de l’export texte" />
        )}
        {empty && <p className="empty">Aucune donnée à exporter pour l’instant.</p>}
      </section>

      <section className="chart-block danger">
        <h2>Remise à zéro</h2>
        <p className="chart-sub">Efface toutes les contractions de ce téléphone. Pensez à exporter avant.</p>
        <button className="danger-button" disabled={empty} onClick={onReset}>
          Tout effacer
        </button>
      </section>
    </div>
  )
}
