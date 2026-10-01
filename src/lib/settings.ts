// Réglages locaux (100% localStorage, synchrone) : date du dernier export et
// numéro de la maternité. Stockés séparément des contractions pour ne pas
// alourdir la clé principale. Aucun réseau, aucune donnée sortante.

const SETTINGS_KEY = 'suivi-contractions:settings:v1'
const PERSIST_KEY = 'suivi-contractions:persist-requested:v1'

export interface AppSettings {
  /** Horodatage (ms epoch) du dernier export (CSV, texte ou copie), ou null. */
  lastExportAt: number | null
  /** Numéro de la maternité saisi par l'utilisatrice (optionnel). */
  maternityPhone: string
}

const DEFAULTS: AppSettings = { lastExportAt: null, maternityPhone: '' }

/** Charge les réglages. Tolérant : renvoie les valeurs par défaut si vide/corrompu. */
export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULTS }
    const p = JSON.parse(raw)
    if (typeof p !== 'object' || p === null) return { ...DEFAULTS }
    return {
      lastExportAt: typeof p.lastExportAt === 'number' ? p.lastExportAt : null,
      maternityPhone: typeof p.maternityPhone === 'string' ? p.maternityPhone : '',
    }
  } catch {
    return { ...DEFAULTS }
  }
}

/** Sauvegarde synchrone des réglages. */
export function saveSettings(s: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // Quota/indisponible : on ne fait pas planter l'UI.
  }
}

/**
 * Demande au navigateur de rendre le stockage persistant (best effort), UNE seule fois.
 * Réduit le risque de purge automatique du stockage local. Aucun crash si l'API est absente.
 */
export async function ensurePersistentStorage(): Promise<void> {
  try {
    if (localStorage.getItem(PERSIST_KEY)) return
    localStorage.setItem(PERSIST_KEY, '1')
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      await navigator.storage.persist()
    }
  } catch {
    // API indisponible ou refusée : sans effet, jamais bloquant.
  }
}
