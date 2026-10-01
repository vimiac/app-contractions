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
      <div className="medical-notice" role="note">
        <strong>Pas un dispositif médical.</strong> Ces données sont un relevé à montrer à votre sage-femme ou à
        la maternité, pas un diagnostic.
      </div>

      <section className="chart-block export-card">
        <h2>Exporter</h2>
        <p className="export-card-text">
          Les données restent sur ce téléphone. L’export crée un fichier que vous choisissez de partager.
        </p>
        <button className="export-primary-button" disabled={empty} onClick={onCopy}>
          {copied ? '✓ Copié' : 'Copier le texte'}
        </button>
        <div className="export-secondary-row">
          <button className="secondary-button" disabled={empty} onClick={exportCsv}>Fichier CSV</button>
          <button className="secondary-button" disabled={empty} onClick={exportText}>Fichier texte</button>
        </div>
        {!empty && (
          <>
            <div className="export-preview-label">Aperçu du texte</div>
            <textarea className="export-preview" readOnly value={text}
              aria-label="Aperçu de l’export texte" />
          </>
        )}
        {empty && <p className="empty">Aucune donnée à exporter pour l’instant.</p>}
      </section>

      <section className="chart-block danger-card">
        <h2>Remise à zéro</h2>
        <p className="export-card-text">Efface toutes les contractions de ce téléphone. Exportez avant.</p>
        <button className="danger-button" disabled={empty} onClick={onReset}>
          Tout effacer…
        </button>
      </section>
    </div>
  )
}
