// Une contraction = UN horodatage absolu (epoch ms). Un appui du bouton en crée une.
// Il n'existe pas d'état « contraction en cours » : le bouton n'est plus start/stop.
// On ne stocke ni durée, ni fin, ni note : seuls l'heure de la contraction et,
// par différence, les intervalles début-à-début comptent (décision d'Arnaud, BUR-49).
// Tout ce qui « bouge » à l'écran (temps écoulé depuis la dernière, intervalles) est
// RECALCULÉ à l'affichage à partir de `at`, jamais accumulé — juste même après
// verrouillage de l'écran, mise en arrière-plan ou suspension de l'onglet.
export interface Contraction {
  id: string
  /** Instant de la contraction, en millisecondes epoch. */
  at: number
}

export const STORAGE_KEY = 'suivi-contractions:v1'
