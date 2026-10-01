import type { Contraction } from './types.ts'
import { STORAGE_KEY } from './types.ts'

// Persistance 100% LOCALE via localStorage.
// Choix localStorage plutôt qu'IndexedDB : écriture SYNCHRONE à chaque mutation
// -> aucune perte de données même si l'app est fermée brutalement juste après un appui.
// Le volume (quelques centaines de contractions max) tient très largement.

/**
 * Migre/valide une entrée stockée vers le nouveau modèle { id, at }.
 * - Ancien format { id, start, end, note } : on garde `start` -> `at`, on jette `end` et `note`.
 * - Nouveau format { id, at } : conservé tel quel.
 * - Entrée illisible : renvoie null (ignorée, jamais d'écran blanc).
 */
export function normalizeContraction(x: unknown): Contraction | null {
  if (typeof x !== 'object' || x === null) return null
  const c = x as Record<string, unknown>
  if (typeof c.id !== 'string') return null
  // `at` prioritaire (nouveau format) ; sinon `start` (ancien format) -> migration.
  const at =
    typeof c.at === 'number' ? c.at : typeof c.start === 'number' ? c.start : null
  if (at === null || !Number.isFinite(at)) return null
  return { id: c.id, at }
}

/** Charge la liste depuis le stockage local. Tolérant : renvoie [] si vide/corrompu. */
export function loadContractions(): Contraction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeContraction)
      .filter((c): c is Contraction => c !== null)
  } catch {
    return []
  }
}

/** Sauvegarde synchrone. */
export function saveContractions(list: Contraction[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Quota/localStorage indisponible : on ne fait pas planter l'UI.
    // (Cas extrême ; l'app reste utilisable pour la session en cours.)
  }
}

/** Identifiant unique simple (pas de dépendance externe). */
export function newId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}
