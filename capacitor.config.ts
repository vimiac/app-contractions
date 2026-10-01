import type { CapacitorConfig } from '@capacitor/cli'

// Wrapper natif iOS autour de la PWA « Suivi des contractions » (BUR-50).
// L'app reste 100 % locale/hors-ligne : aucun serveur, aucune permission spéciale.
const config: CapacitorConfig = {
  appId: 'com.vimiac.contractions',
  appName: 'Suivi contractions',
  webDir: 'dist',
  ios: {
    // Fond sombre cohérent avec le thème de l'app (#0b0d12) pour éviter
    // le flash blanc au lancement pendant le chargement du WebView.
    backgroundColor: '#0b0d12ff',
    contentInset: 'always',
  },
}

export default config
