# Suivi des contractions — PWA

Application web installable (PWA) de suivi des contractions. **100 % locale, hors ligne, sans compte ni serveur.**

> ⚠️ Outil de **suivi personnel**, **pas un dispositif médical**. Il ne remplace pas un avis médical et n'affiche aucun seuil d'alerte (type « partez à la maternité »).

> **Modèle (BUR-49)** : **un appui = un horodatage**. Ce qui compte, c'est l'**heure** de la contraction et la **fréquence** (intervalle médian début-à-début). Ni durée, ni lieu, ni note.

> **Design (BUR-53)** : refonte visuelle intégrée à partir d'un dossier de design produit par Claude Design (palette chaude sombre, accent `#a8473a`, chrono 80 px). Présentation uniquement — modèle de données et calculs inchangés.

> **Feedback (BUR-54)** : seule exception volontaire au « zéro réseau » — un onglet **Avis**, action explicite de l'utilisateur, envoie un message libre à un relais (`VITE_FEEDBACK_RELAY_URL`) qui crée une issue GitHub. Aucune contraction ni donnée personnelle enregistrée dans l'app n'est transmise. Dégradation propre (message « indisponible ») si le relais n'est pas configuré au build.

---

## Ce que fait l'app

**Écran « Bouton »**
- Un gros bouton central. **Un appui enregistre une contraction à l'instant présent.** Il n'y a pas de fin à marquer, pas de contraction « en cours ».
- Autour du bouton : **heure de la dernière contraction**, **temps écoulé depuis** (compteur vivant), **intervalle avec l'avant-dernière**.
- **Anti double-appui (fenêtre 5 s)** : un 2e appui à moins de 5 s du précédent est ignoré et un message discret l'indique (« déjà enregistré il y a 3 s »). Visible, jamais silencieux.
- Sous le titre « Dernières » : les 3 dernières contractions (heure, intervalle). **« Annuler la dernière »** est juste au-dessus de la liste, loin du bouton, pour éviter l'appui accidentel.
- Retour visuel après un appui réussi : le bouton passe en vert sauge, « ✓ Enregistrée à HH:MM » pendant 1,6 s.

**Écran « Statistiques »** — heure et fréquence, rien d'autre
- **Bloc « Dernière heure » en tête** : nombre et intervalle médian de la dernière heure en gros chiffres, puis la liste brute (heure, intervalle depuis la précédente), la plus récente en haut. C'est ce qu'une sage-femme demande au téléphone.
- 2 tuiles : **total**, **intervalle médian global**.
- Mention en clair : **intervalle = début à début**.
- **Contractions par jour** (histogramme).
- **Fréquence par jour** : intervalle **médian** début-à-début chaque jour (médiane, pas moyenne : une pause de sommeil ne la fausse pas).
- **Dernières 24 h — contractions par heure** (l'horizon utile quand le travail commence).
- **Numéro de la maternité** (optionnel) en pied d'écran : lien `tel:` toujours présent si un numéro est saisi (modifiable / effaçable). Ce n'est **pas** un seuil d'alerte, aucun déclenchement automatique.

**Écran « Export »**
- Télécharger un **CSV** (séparateur `;`, compatible Excel FR, **mention non-médicale en 1re ligne** avant l'entête) ou un **fichier texte**, ou **copier le texte** — à montrer à la sage-femme / à la maternité. Colonnes : numéro, date et heure, **intervalle début-à-début** (pas de durée).
- **L'export est la sauvegarde** : chaque export (CSV, texte, copie) horodate le dernier export.
- Remise à zéro (avec confirmation).

**Écran « Avis »**
- Un message libre (3 à 4000 caractères) + un contact optionnel, envoyés au relais partagé
  `factory/services/feedback-relay` (Cloudflare Worker) qui crée une issue GitHub dans ce
  repo (labels `feedback` + `app:contractions`). Scooter lit ces issues à intervalles
  réguliers pour qualifier et alimenter la roadmap.
- **Image jointe optionnelle (BUR-58)** : jpeg/png/webp, redimensionnée et recompressée côté
  client (canvas, 1600 px max, JPEG q0.8) avant envoi. Le relais la commit dans le repo
  GitHub (`feedback-images/contractions/...`) et la référence dans l'issue ; si l'upload
  échoue côté relais (ex. permission token manquante), le message texte part quand même.
- Champ honeypot invisible (anti-bot), validation côté client ET côté relais.
- Sans `VITE_FEEDBACK_RELAY_URL` au build, l'onglet affiche un message « indisponible » et
  n'émet aucune requête réseau.

## Points techniques importants

- **Compteur juste même écran verrouillé / app en arrière-plan** : on ne compte jamais avec un compteur qui s'incrémente. On stocke un **horodatage absolu** (`at`, epoch ms) et on **recalcule** le temps écoulé / les intervalles à chaque affichage. (`src/lib/types.ts`, `src/hooks/useNow.ts`)
- **Écriture au moment de l'appui**, **persistance locale synchrone** via `localStorage`, écrite à chaque changement (+ flush au masquage/fermeture de l'onglet, + écriture au montage pour verrouiller la migration) → **aucune perte de données** même si l'app est fermée brutalement. (`src/lib/store.ts`, `src/hooks/useContractions.ts`)
- **Migration transparente** de l'ancien format `{ id, start, end, note }` → `{ id, at }` : `start` devient `at`, `end`/`note` sont jetés, une entrée illisible est ignorée. (`normalizeContraction`, `src/lib/store.ts`)
- **Hors ligne** : service worker (Workbox via `vite-plugin-pwa`) qui pré-cache tout le shell → l'app fonctionne sans réseau dès la 1re visite.
- **Zéro réseau, zéro compte, zéro analytics.** Aucune requête sortante, aucune géolocalisation GPS, aucun seuil d'alerte.

## Parades contre la perte de données (priorité 1)

- **Bandeau d'installation** : si l'app tourne en **onglet navigateur** (et non installée sur l'écran d'accueil), un bandeau persistant rappelle que Safari (ITP) peut purger le stockage après **7 jours** sans visite → « Installez l'app sur l'écran d'accueil… ». En mode installé (`display-mode: standalone`), le bandeau ne s'affiche pas.
- **Stockage persistant** : `navigator.storage.persist()` est demandé une fois au 1er lancement (best effort, sans crash si indisponible). (`src/lib/settings.ts`)
- **L'export = la sauvegarde** : la date du dernier export est stockée localement et mise à jour à chaque export (CSV, texte, copie). Un **rappel discret** (non bloquant) apparaît dès qu'il existe des contractions non exportées depuis **N = 2 jours** (`EXPORT_REMINDER_DAYS` dans `src/lib/stats.ts`).
- **Numéro de la maternité** : champ optionnel stocké localement (`src/lib/settings.ts`), affiché en pied de l'écran stats en lien `tel:`. Aucune condition, aucun seuil, aucun déclenchement.

---

## Lancer l'app

Pré-requis : Node ≥ 18 (testé sur Node 24).

```bash
cd app
npm install
npm run dev        # développement (http://localhost:5173)
```

Build de production + prévisualisation locale :

```bash
npm run build      # génère dist/ (tsc --noEmit puis vite build)
npm run preview    # sert dist/ (http://localhost:4173)
```

Tests unitaires de la logique (migration, intervalles, médiane, stats, export) :

```bash
npm test           # node --test (19 tests)
```

Parcours réel piloté (Chrome headless invisible — migration, anti double-appui, rendu stats, maternité, export, compteur vivant) :

```bash
npm run preview &                 # sert dist/ sur :4173 (adapter le port du script si besoin)
node test/drive.mjs               # écrit les captures dans ../screenshots/
```

> Le script `test/drive.mjs` attend le serveur de preview sur `http://localhost:4788` (modifiable en tête du fichier). Il lance Chrome en `--headless=new` : **aucune fenêtre, aucun vol de focus**.

### Tester le build sans réinstaller

`dist/` est déjà buildé dans le livrable. Pour le servir tel quel :

```bash
cd dist
python3 -m http.server 8080   # puis ouvrir http://localhost:8080
```

---

## Installer sur l'écran d'accueil d'un iPhone

1. Ouvrir l'URL de l'app dans **Safari** (l'installation « écran d'accueil » ne marche que depuis Safari sur iOS).
2. Toucher le bouton **Partager** (le carré avec une flèche vers le haut).
3. Choisir **« Sur l'écran d'accueil »**.
4. Valider avec **« Ajouter »**.

L'app s'ouvre en plein écran, sans barre Safari, et fonctionne hors ligne.

> Pour un usage réel sur l'iPhone, il faut une URL en **HTTPS** (le service worker l'exige). Pour un test rapide sur le même Mac, `npm run preview` en `http://localhost` suffit.

---

## Structure

```
app/
├── src/
│   ├── lib/          # logique pure, testée : types, format, stats, csv, store, settings
│   ├── hooks/        # useContractions (état+persistance), useNow (tick du compteur)
│   ├── components/   # TimerScreen, StatsScreen, ExportScreen
│   ├── App.tsx       # navigation par onglets
│   └── styles.css    # thème sombre, gros contraste, une seule main
├── public/           # favicon.svg + icônes PWA (192/512/maskable/apple-touch)
├── test/             # logic.test.ts (node:test) + drive.mjs (parcours piloté)
└── dist/             # build de production (généré)
```
