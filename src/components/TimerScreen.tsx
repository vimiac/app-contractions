import { useMemo, useRef, useState } from 'react'
import type { UseContractions } from '../hooks/useContractions'
import { useNow } from '../hooks/useNow'
import { sortByAt } from '../lib/stats'
import { formatElapsed, formatInterval, formatClock } from '../lib/format'

// Durée d'affichage du retour visuel « Enregistrée » après un appui réussi.
const SUCCESS_FLASH_MS = 1600
// Durée d'affichage du message discret après une annulation.
const UNDO_TOAST_MS = 2500

export function TimerScreen({ ctrl }: { ctrl: UseContractions }) {
  const { list, record, deleteLast } = ctrl
  // Le temps écoulé depuis la dernière contraction est l'information vivante : re-render à la seconde.
  const now = useNow(1000, true)

  const sorted = useMemo(() => sortByAt(list), [list])
  const last = sorted.length ? sorted[sorted.length - 1] : null
  const prevOfLast = sorted.length >= 2 ? sorted[sorted.length - 2] : null

  const sinceLast = last ? now - last.at : 0
  const lastInterval = last && prevOfLast ? last.at - prevOfLast.at : null

  // Message discret (anti double-appui / annulation), auto-effacé.
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  // Retour visuel « Enregistrée à HH:MM » après un appui qui crée vraiment une contraction.
  const [flashAt, setFlashAt] = useState<number | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)

  const onPress = () => {
    const res = record()
    if (res.created) {
      const at = Date.now()
      setFlashAt(at)
      window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => setFlashAt(null), SUCCESS_FLASH_MS)
    } else {
      const secs = Math.max(0, Math.round((res.sinceMs ?? 0) / 1000))
      setToast(`Déjà enregistrée il y a ${secs} s`)
      window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => setToast(null), 3000)
    }
  }

  const onUndo = () => {
    deleteLast()
    setFlashAt(null)
    setToast('Dernière contraction annulée')
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), UNDO_TOAST_MS)
  }

  return (
    <div className="timer-screen">
      <div className="status" aria-live="polite">
        {last ? (
          <>
            <div className="status-label">Depuis la dernière contraction</div>
            <div className="status-chrono" role="timer" aria-label="Temps écoulé depuis la dernière contraction">
              {formatElapsed(sinceLast)}
            </div>
            <div className="status-grid">
              <div className="status-grid-item">
                <span className="status-grid-label">Dernière à</span>
                <span className="status-grid-value">{formatClock(last.at)}</span>
              </div>
              <div className="status-grid-item">
                <span className="status-grid-label">Intervalle précédent</span>
                <span className="status-grid-value">{formatInterval(lastInterval)}</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="status-empty-label">Aucune contraction enregistrée</div>
            <div className="status-empty-title">Prête.</div>
            <div className="status-empty-sub">
              Touchez le bouton au <strong>début</strong> de chaque contraction. L’app calcule le reste.
            </div>
          </>
        )}
      </div>

      <div className="recent">
        <div className="recent-header">
          <h2>Dernières</h2>
          <button className="undo-button" onClick={onUndo} disabled={sorted.length === 0}>
            Annuler la dernière
          </button>
        </div>
        {sorted.length === 0 ? (
          <p className="empty">Rien pour l’instant.</p>
        ) : (
          <table className="recent-table">
            <thead>
              <tr>
                <th>Heure</th>
                <th>Intervalle</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(-2).reverse().map((c) => {
                // Intervalle = début de CETTE contraction - début de la précédente (chronologique).
                const globalIdx = sorted.findIndex((x) => x.id === c.id)
                const prev = globalIdx > 0 ? sorted[globalIdx - 1] : null
                const interval = prev ? c.at - prev.at : null
                return (
                  <tr key={c.id}>
                    <td>{formatClock(c.at)}</td>
                    <td>intervalle <strong>{formatInterval(interval)}</strong></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="button-zone">
        <div className={`button-ring${flashAt ? ' success' : ''}`}>
          <button
            className={`big-button${flashAt ? ' success' : ''}`}
            onClick={onPress}
            aria-label="Enregistrer une contraction"
          >
            {flashAt ? (
              <>
                <span className="big-button-check">✓</span>
                <span className="big-button-done">Enregistrée</span>
                <span className="big-button-at">à {formatClock(flashAt)}</span>
              </>
            ) : (
              <>
                <span className="big-button-verb">Contraction</span>
                <span className="big-button-hint">Touchez au début</span>
              </>
            )}
          </button>
        </div>
        {toast && <div className="tap-toast" role="status">{toast}</div>}
      </div>
    </div>
  )
}
