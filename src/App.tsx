import { useEffect, useState } from 'react'
import { useContractions } from './hooks/useContractions'
import { useNow } from './hooks/useNow'
import { TimerScreen } from './components/TimerScreen'
import { StatsScreen } from './components/StatsScreen'
import { ExportScreen } from './components/ExportScreen'
import { loadSettings, saveSettings, ensurePersistentStorage } from './lib/settings'
import { needsExportReminder, EXPORT_REMINDER_DAYS } from './lib/stats'

type Tab = 'timer' | 'stats' | 'export'

/** Vrai si l'app tourne installée (écran d'accueil / standalone), faux en onglet navigateur. */
function isStandalone(): boolean {
  try {
    return (
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches) ||
      // iOS Safari (mode « sur l'écran d'accueil »)
      (navigator as unknown as { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

export default function App() {
  const ctrl = useContractions()
  const [tab, setTab] = useState<Tab>('timer')
  const [settings, setSettings] = useState(() => loadSettings())
  const [standalone] = useState(() => isStandalone())
  const [reminderDismissed, setReminderDismissed] = useState(false)
  // Tick lent : réévalue périodiquement le rappel d'export (pas besoin de 250 ms ici).
  const now = useNow(30_000, true)

  // Stockage persistant best effort, une seule fois au premier lancement.
  useEffect(() => {
    ensurePersistentStorage()
  }, [])

  // Rappel discret « l'export = la sauvegarde ».
  const showReminder =
    !reminderDismissed && needsExportReminder(ctrl.list, settings.lastExportAt, now)

  // Met à jour la date du dernier export à chaque export (CSV, texte, copie).
  const markExported = () => {
    const s = { ...settings, lastExportAt: Date.now() }
    setSettings(s)
    saveSettings(s)
    setReminderDismissed(false)
  }

  // Numéro de la maternité (enregistrer / effacer).
  const setMaternityPhone = (phone: string) => {
    const s = { ...settings, maternityPhone: phone.trim() }
    setSettings(s)
    saveSettings(s)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Suivi des contractions</h1>
        <span className="disclaimer-badge" title="Outil de suivi personnel, pas un dispositif médical.">
          suivi personnel · pas un dispositif médical
        </span>
      </header>

      {/* Bandeau d'installation (uniquement hors mode standalone). */}
      {!standalone && (
        <div className="install-banner" role="note">
          <span className="install-banner-icon" aria-hidden="true">📲</span>
          <span>
            Installez l'app sur l'écran d'accueil, sinon vos données peuvent être effacées après 7 jours.
          </span>
        </div>
      )}

      {/* Rappel discret d'export (non bloquant). */}
      {showReminder && (
        <div className="export-reminder" role="note">
          <span>
            Des contractions n'ont pas été exportées depuis plus de {EXPORT_REMINDER_DAYS} jours.
            L'export est votre sauvegarde.
          </span>
          <div className="export-reminder-actions">
            <button className="link-button" onClick={() => setTab('export')}>Exporter</button>
            <button className="link-button muted" onClick={() => setReminderDismissed(true)} aria-label="Masquer le rappel">✕</button>
          </div>
        </div>
      )}

      <main className="app-main">
        {tab === 'timer' && <TimerScreen ctrl={ctrl} />}
        {tab === 'stats' && (
          <StatsScreen
            list={ctrl.list}
            maternityPhone={settings.maternityPhone}
            onSaveMaternity={setMaternityPhone}
          />
        )}
        {tab === 'export' && <ExportScreen ctrl={ctrl} onExported={markExported} />}
      </main>

      <nav className="tab-bar" role="tablist">
        <button role="tab" aria-selected={tab === 'timer'}
          className={tab === 'timer' ? 'active' : ''} onClick={() => setTab('timer')}>
          <span className="tab-icon">⏱</span><span className="tab-text">Bouton</span>
        </button>
        <button role="tab" aria-selected={tab === 'stats'}
          className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
          <span className="tab-icon">📊</span><span className="tab-text">Statistiques</span>
        </button>
        <button role="tab" aria-selected={tab === 'export'}
          className={tab === 'export' ? 'active' : ''} onClick={() => setTab('export')}>
          <span className="tab-icon">⬇︎</span><span className="tab-text">Export</span>
        </button>
      </nav>
    </div>
  )
}
