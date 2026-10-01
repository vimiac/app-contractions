import { useMemo, useRef, useState } from 'react'
import type { UseContractions } from '../hooks/useContractions'
import { useNow } from '../hooks/useNow'
import { sortByAt } from '../lib/stats'
import { formatElapsed, formatInterval, formatClock } from '../lib/format'

export function TimerScreen({ ctrl }: { ctrl: UseContractions }) {
  const { list, record, deleteLast } = ctrl
  // Le temps écoulé depuis la dernière contraction est l'information vivante : re-render à la seconde.
  const now = useNow(1000, true)

  const sorted = useMemo(() => sortByAt(list), [list])
  const last = sorted.length ? sorted[sorted.length - 1] : null
  const prevOfLast = sorted.length >= 2 ? sorted[sorted.length - 2] : null

  const sinceLast = last ? now - last.at : 0
  const lastInterval = last && prevOfLast ? last.at - prevOfLast.at : null

  // Message discret « déjà enregistré il y a X s » (anti double-appui), auto-effacé.
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const onPress = () => {
    const res = record()
    if (!res.created) {
      const secs = Math.max(0, Math.round((res.sinceMs ?? 0) / 1000))
      setToast(`Déjà enregistré il y a ${secs} s`)
      window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => setToast(null), 3000)
    }
  }

  return (
    <div className="timer-screen">
      <div className="status" aria-live="polite">
        {last ? (
          <>
            <div className="status-label">Dernière contraction à {formatClock(last.at)}</div>
            <div className="status-chrono" role="timer" aria-label="Temps écoulé depuis la dernière contraction">
              {formatElapsed(sinceLast)}
            </div>
            <div className="status-sub">
              temps écoulé depuis la dernière
              {lastInterval != null && <> · intervalle avec l’avant-dernière : {formatInterval(lastInterval)}</>}
            </div>
          </>
        ) : (
          <>
            <div className="status-label">Prête</div>
            <div className="status-sub">Appuyez sur le bouton au début d’une contraction.</div>
          </>
        )}
      </div>

      <button
        className="big-button"
        onClick={onPress}
        aria-label="Enregistrer une contraction"
      >
        <span className="big-button-verb">Contraction</span>
        <span className="big-button-hint">appuyez au début</span>
      </button>

      {toast && <div className="tap-toast" role="status">{toast}</div>}

      <div className="actions-row">
        <button
          className="secondary-button"
          onClick={deleteLast}
          disabled={sorted.length === 0}
        >
          ↩︎ Annuler la dernière
        </button>
      </div>

      <div className="recent">
        <h2>Dernières contractions</h2>
        {sorted.length === 0 ? (
          <p className="empty">Aucune contraction enregistrée pour l’instant.</p>
        ) : (
          <table className="recent-table">
            <thead>
              <tr>
                <th>Heure</th>
                <th>Intervalle</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(-10).reverse().map((c) => {
                // Intervalle = début de CETTE contraction - début de la précédente (chronologique).
                const globalIdx = sorted.findIndex((x) => x.id === c.id)
                const prev = globalIdx > 0 ? sorted[globalIdx - 1] : null
                const interval = prev ? c.at - prev.at : null
                return (
                  <tr key={c.id}>
                    <td>{formatClock(c.at)}</td>
                    <td>{formatInterval(interval)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
