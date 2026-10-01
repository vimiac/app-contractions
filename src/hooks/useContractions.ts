import { useCallback, useEffect, useRef, useState } from 'react'
import type { Contraction } from '../lib/types'
import { loadContractions, saveContractions, newId } from '../lib/store'
import { sortByAt, DUPLICATE_GUARD_MS } from '../lib/stats'

/** Résultat d'un appui : contraction créée, ou ignorée (anti double-appui) avec le délai écoulé. */
export interface RecordResult {
  created: boolean
  /** Si created=false : ms écoulées depuis la contraction précédente (pour le message discret). */
  sinceMs?: number
}

export interface UseContractions {
  list: Contraction[]
  /** Enregistre une contraction à l'instant présent (un appui = un horodatage). */
  record: () => RecordResult
  /** Supprime la dernière saisie (rattrape un faux appui) — en un geste. */
  deleteLast: () => void
  /** Supprime une contraction précise. */
  remove: (id: string) => void
  /** Efface tout (remise à zéro, avec confirmation côté UI). */
  clearAll: () => void
}

export function useContractions(): UseContractions {
  const [list, setList] = useState<Contraction[]>(() => loadContractions())

  // Persistance synchrone à chaque changement.
  // On écrit AUSSI dès le montage pour verrouiller la migration ancien -> nouveau format.
  useEffect(() => {
    saveContractions(list)
  }, [list])

  // Sécurité supplémentaire : flush aussi juste avant fermeture/masquage de l'onglet.
  useEffect(() => {
    const flush = () => saveContractions(list)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
    }
  }, [list])

  // Référence toujours à jour de la liste (pour lire la dernière contraction sans stale closure).
  const listRef = useRef(list)
  listRef.current = list

  const record = useCallback((): RecordResult => {
    const now = Date.now()
    const cur = listRef.current
    // Anti double-appui : un appui < 5 s après la contraction précédente n'en crée pas une seconde.
    let lastAt = -Infinity
    for (const c of cur) if (c.at > lastAt) lastAt = c.at
    const sinceMs = now - lastAt
    if (cur.length > 0 && sinceMs < DUPLICATE_GUARD_MS) {
      return { created: false, sinceMs }
    }
    setList((prev) => [...prev, { id: newId(), at: now }])
    return { created: true }
  }, [])

  const deleteLast = useCallback(() => {
    setList((prev) => {
      if (prev.length === 0) return prev
      const sorted = sortByAt(prev)
      const lastId = sorted[sorted.length - 1].id
      return prev.filter((c) => c.id !== lastId)
    })
  }, [])

  const remove = useCallback((id: string) => {
    setList((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const clearAll = useCallback(() => setList([]), [])

  return { list, record, deleteLast, remove, clearAll }
}
