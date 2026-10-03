import type { CapacitorConfig } from '@capacitor/cli'

// Wrapper natif iOS autour de la PWA « Suivi des contractions » (BUR-50).
// L'app reste 100 % locale/hors-ligne : aucun serveur, aucune permission spéciale.
const config: CapacitorConfig = {
  appId: 'com.vimiac.contractions',
  appName: 'Suivi contractions',
  webDir: 'dist',
  ios: {
    // Fond prune (charte "Aube", BUR-88) cohérent avec le splash screen et le thème
    // sombre pour éviter un flash au lancement pendant le chargement du WebView.
    backgroundColor: '#240d1bff',
    contentInset: 'always',
  },
}

export default config
