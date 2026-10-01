import { useEffect, useState } from 'react'

/**
 * Renvoie l'horodatage courant, rafraîchi périodiquement.
 * Sert UNIQUEMENT à déclencher le re-render du chrono : l'affichage recalcule
 * toujours (now - start), on n'accumule jamais de compteur.
 * Se resynchronise au retour au premier plan (visibilitychange).
 */
export function useNow(intervalMs = 250, active = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now())
    tick()
    const id = window.setInterval(tick, intervalMs)
    const onVis = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [intervalMs, active])
  return now
}
