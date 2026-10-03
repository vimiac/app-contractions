import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useContractions } from './hooks/useContractions'
import { useNow } from './hooks/useNow'
import { TimerScreen } from './components/TimerScreen'
import { StatsScreen } from './components/StatsScreen'
import { ExportScreen } from './components/ExportScreen'
import { FeedbackScreen } from './components/FeedbackScreen'
import { loadSettings, saveSettings, ensurePersistentStorage, type Palette } from './lib/settings'
import { needsExportReminder, EXPORT_REMINDER_DAYS } from './lib/stats'

type Tab = 'timer' | 'stats' | 'export' | 'feedback'

/**
 * Vrai si l'app tourne installée (écran d'accueil / standalone), faux en onglet navigateur.
 * Dans le wrapper Capacitor (WKWebView native), `isStandalone()` renvoie faux — le bandeau
 * d'installation n'a pas de sens sur une app déjà installée via TestFlight/l'App Store.
 */
function isStandalone(): boolean {
  try {
    if (Capacitor.isNativePlatform()) return true
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

function TabIcon({ tab, active }: { tab: Tab; active: boolean }) {
  if (tab === 'timer') {
    return (
      <svg className="tab-icon" viewBox="0 0 24 24">
        {active
          ? <circle cx="12" cy="12" r="9" fill="currentColor" />
          : <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />}
      </svg>
    )
  }
  if (tab === 'stats') {
    return (
      <svg className="tab-icon" viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="12" width="4" height="8" rx="1" />
        <rect x="10" y="6" width="4" height="14" rx="1" />
        <rect x="16" y="9" width="4" height="11" rx="1" />
      </svg>
    )
  }
  if (tab === 'export') {
    return (
      <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
      </svg>
    )
  }
  return (
    <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 20l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
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

  // Feedback app-contractions#7 : changement de palette (accent + couleurs des graphes).
  const setPalette = (palette: Palette) => {
    const s = { ...settings, palette }
    setSettings(s)
    saveSettings(s)
  }

  return (
    <div className={`app palette-${settings.palette}`}>
      <header className="app-header">
        <h1>Contractions</h1>
        <div className="app-header-sub">
          <span className="app-header-dot" aria-hidden="true" />
          <span>Suivi personnel · pas un dispositif médical</span>
        </div>
      </header>

      {/* Bandeau d'installation (uniquement hors mode standalone / hors wrapper natif). */}
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
          <span className="export-reminder-text">
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
        {tab === 'stats' && <StatsScreen list={ctrl.list} />}
        {tab === 'export' && (
          <ExportScreen ctrl={ctrl} onExported={markExported}
            palette={settings.palette} onPaletteChange={setPalette} />
        )}
        {tab === 'feedback' && <FeedbackScreen />}
      </main>

      <nav className="tab-bar" role="tablist">
        <button role="tab" aria-selected={tab === 'timer'}
          className={tab === 'timer' ? 'active' : ''} onClick={() => setTab('timer')}>
          <TabIcon tab="timer" active={tab === 'timer'} /><span className="tab-text">Bouton</span>
        </button>
        <button role="tab" aria-selected={tab === 'stats'}
          className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
          <TabIcon tab="stats" active={tab === 'stats'} /><span className="tab-text">Statistiques</span>
        </button>
        <button role="tab" aria-selected={tab === 'export'}
          className={tab === 'export' ? 'active' : ''} onClick={() => setTab('export')}>
          <TabIcon tab="export" active={tab === 'export'} /><span className="tab-text">Export</span>
        </button>
        <button role="tab" aria-selected={tab === 'feedback'}
          className={tab === 'feedback' ? 'active' : ''} onClick={() => setTab('feedback')}>
          <TabIcon tab="feedback" active={tab === 'feedback'} /><span className="tab-text">Avis</span>
        </button>
      </nav>
    </div>
  )
}
