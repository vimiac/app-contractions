// Parcours piloté (Chrome headless invisible, aucun vol de focus).
// Vérifie sur le NOUVEAU modèle { id, at } : migration depuis l'ancien format,
// anti double-appui 5 s, rendu de l'écran stats, export. Collecte les erreurs console.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = 'http://localhost:4788'
const SEED_PAGE = APP + '/manifest.webmanifest' // page same-origin SANS React : pas de flush pagehide
const PORT = 9322
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = '/Users/arnaudceyrac/HarnessAgents/hive/Livrables/BUR-46-app-contractions/screenshots'
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1 }
const ok = (m) => console.log('✔ ' + m)

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/bur49-chrome', '--no-first-run', '--no-default-browser-check',
  '--window-size=400,880', '--force-device-scale-factor=1', '--hide-scrollbars',
  'about:blank',
], { stdio: 'ignore' })

let ws, msgId = 0
const pending = new Map()
const consoleErrors = []

function send(method, params = {}) {
  const id = ++msgId
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((res, rej) => pending.set(id, { res, rej }))
}
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
  return r.result.value
}
async function waitFor(expr, label, timeout = 8000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await evalJs(expr)) return true
    await sleep(150)
  }
  throw new Error('timeout waiting: ' + label)
}
async function navigate(url) {
  await send('Page.navigate', { url })
  await sleep(500)
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  writeFileSync(`${OUT}/${name}`, Buffer.from(r.data, 'base64'))
  ok('screenshot ' + name)
}

async function main() {
  // Attendre l'endpoint CDP.
  let wsUrl
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://localhost:${PORT}/json`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; break }
    } catch {}
    await sleep(200)
  }
  if (!wsUrl) throw new Error('CDP endpoint introuvable')

  ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id)
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result)
      return
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map((a) => a.value || a.description).join(' '))
    }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text))
    }
  }
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true })

  // Désenregistrer tout SW + vider les caches (assets périmés = piège connu).
  await navigate(SEED_PAGE)
  await evalJs(`(async()=>{try{const rs=await navigator.serviceWorker.getRegistrations();for(const r of rs)await r.unregister();if(window.caches){for(const k of await caches.keys())await caches.delete(k)}}catch(e){}return true})()`)

  // ---------- 1) MIGRATION ancien format -> nouveau ----------
  const oldData = JSON.stringify([
    { id: 'o1', start: Date.now() - 40 * 60000, end: Date.now() - 40 * 60000 + 45000, note: 'lieu: maison' },
    { id: 'o2', start: Date.now() - 30 * 60000, end: null, note: '' },
    { id: 'o3', start: Date.now() - 20 * 60000, end: Date.now() - 20 * 60000 + 60000, note: 'position' },
    { id: 'bad', foo: 1 }, // illisible -> doit être ignoré
  ])
  await evalJs(`localStorage.setItem('suivi-contractions:v1', ${JSON.stringify(oldData)}); true`)
  await navigate(APP)
  await waitFor(`!!document.querySelector('.big-button')`, 'app montée')
  await sleep(400)
  const migrated = await evalJs(`JSON.parse(localStorage.getItem('suivi-contractions:v1'))`)
  if (Array.isArray(migrated) && migrated.length === 3) ok('migration : 3 entrées valides conservées, 1 illisible ignorée')
  else fail('migration count attendu 3, obtenu ' + (migrated?.length))
  const clean = migrated.every((c) => typeof c.at === 'number' && !('end' in c) && !('note' in c) && !('start' in c))
  clean ? ok('migration : chaque entrée = { id, at } (end/note/start jetés)') : fail('entrées non nettoyées: ' + JSON.stringify(migrated))
  const rows = await evalJs(`document.querySelectorAll('.recent-table tbody tr').length`)
  rows >= 3 ? ok('écran 1 : liste des dernières contractions rendue (' + rows + ' lignes)') : fail('liste dernières vide')
  await shot('01-bouton.png')

  // ---------- 2) ANTI DOUBLE-APPUI (fenêtre 5 s) ----------
  // Repartir propre via un seed same-origin sans React.
  await navigate(SEED_PAGE)
  await evalJs(`localStorage.setItem('suivi-contractions:v1','[]'); true`)
  await navigate(APP)
  await waitFor(`!!document.querySelector('.big-button')`, 'app remontée (vide)')
  await evalJs(`document.querySelector('.big-button').click(); true`)
  await sleep(200)
  await evalJs(`document.querySelector('.big-button').click(); true`) // 2e appui immédiat
  await sleep(300)
  const afterDouble = await evalJs(`JSON.parse(localStorage.getItem('suivi-contractions:v1')).length`)
  const toast = await evalJs(`(document.querySelector('.tap-toast')||{}).textContent||''`)
  afterDouble === 1 ? ok('anti double-appui : 2 appuis rapprochés = 1 seule contraction') : fail('double-appui: ' + afterDouble + ' entrées')
  const toastOk = /d[ée]j[àa] enregistr/i.test(toast)
  toastOk ? ok('anti double-appui : message discret affiché (« ' + toast + ' »)') : fail('toast anti-double absent: ' + toast)

  // ---------- 3) ÉCRAN STATS (heure + fréquence) ----------
  const now = Date.now()
  const MIN = 60000, HOUR = 3600000
  const seed = []
  // Jour J : rafale récente (dernière heure) + une pause.
  ;[2, 12, 22, 34, 47].forEach((m, i) => seed.push({ id: 'r' + i, at: now - m * MIN }))
  // Hier et avant-hier : quelques contractions pour l'histogramme par jour.
  ;[1, 2].forEach((d) => [8, 8.3, 9, 9.5].forEach((h, i) =>
    seed.push({ id: `d${d}-${i}`, at: now - d * 24 * HOUR + Math.round((h - 12) * HOUR) })))
  await navigate(SEED_PAGE)
  await evalJs(`localStorage.setItem('suivi-contractions:v1', ${JSON.stringify(JSON.stringify(seed))}); true`)
  await navigate(APP)
  await waitFor(`!!document.querySelector('.big-button')`, 'app (jeu stats)')
  // Aller sur l'onglet Statistiques.
  await evalJs(`[...document.querySelectorAll('.tab-bar button')].find(b=>/Statistiques/.test(b.textContent)).click(); true`)
  await waitFor(`document.querySelectorAll('.chart-block').length >= 3`, 'blocs stats')
  await sleep(700) // laisser Recharts rendre les SVG
  const svgBars = await evalJs(`document.querySelectorAll('.stats-screen svg .recharts-bar-rectangle, .stats-screen svg path.recharts-rectangle').length`)
  const surfaces = await evalJs(`document.querySelectorAll('.stats-screen svg').length`)
  surfaces >= 3 ? ok('stats : ' + surfaces + ' graphiques rendus') : fail('graphiques manquants: ' + surfaces)
  svgBars > 0 ? ok('stats : barres dessinées (' + svgBars + ')') : fail('aucune barre dessinée')
  const hasFreq = await evalJs(`/Fréquence par jour/.test(document.body.textContent)`)
  const hasDebut = await evalJs(`/début à début/.test(document.body.textContent)`)
  const noDuree = await evalJs(`!/dur[ée]e/i.test(document.querySelector('.stats-screen').textContent)`)
  const lastHourBlock = await evalJs(`/Dernière heure/.test(document.body.textContent)`)
  hasFreq ? ok('stats : graphe « Fréquence par jour » présent') : fail('graphe fréquence absent')
  hasDebut ? ok('stats : mention « début à début » à l’écran') : fail('mention début à début absente')
  noDuree ? ok('stats : plus aucune notion de durée') : fail('« durée » encore présent à l’écran stats')
  lastHourBlock ? ok('stats : bloc « Dernière heure » en tête') : fail('bloc dernière heure absent')
  // Tuiles.
  const tiles = await evalJs(`document.querySelectorAll('.tile').length`)
  tiles === 2 ? ok('stats : 2 tuiles (total, médiane globale — refonte design 01/10 ; 1h affiché dans la carte Dernière heure)') : fail('tuiles: ' + tiles)
  await shot('02-statistiques.png')

  // ---------- 4) NUMÉRO MATERNITÉ (tel:) ----------
  // Un numéro peut déjà être enregistré (profil Chrome réutilisé d'un run précédent) : dans ce cas
  // la carte affiche le bouton d'appel + « Modifier le numéro » au lieu du champ direct (refonte design 01/10).
  await evalJs(`(()=>{const l=[...document.querySelectorAll('.maternity-edit-link')].find(b=>/Modifier/.test(b.textContent));if(l)l.click();return true})()`)
  await sleep(100)
  await evalJs(`(()=>{const i=document.querySelector('.maternity-edit input');const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;set.call(i,'01 23 45 67 89');i.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
  await sleep(150)
  await evalJs(`[...document.querySelectorAll('.maternity-edit button')].find(b=>/Enregistrer/.test(b.textContent)).click(); true`)
  await sleep(200)
  const tel = await evalJs(`(document.querySelector('.maternity-call')||{}).getAttribute&&document.querySelector('.maternity-call').getAttribute('href')`)
  tel === 'tel:0123456789' ? ok('maternité : lien tel: généré (' + tel + ')') : fail('lien tel absent/mauvais: ' + tel)

  // ---------- 5) EXPORT ----------
  await evalJs(`[...document.querySelectorAll('.tab-bar button')].find(b=>/Export/.test(b.textContent)).click(); true`)
  await waitFor(`!!document.querySelector('.export-preview')`, 'écran export')
  const preview = await evalJs(`document.querySelector('.export-preview').value`)
  const hasFreqExport = /Fréquence \(intervalle médian/.test(preview)
  const hasDisc = /ne remplace pas un avis médical/.test(preview)
  const noDurExport = !/dur[ée]e/i.test(preview)
  hasFreqExport ? ok('export : fréquence médiane dans l’aperçu') : fail('export sans fréquence')
  hasDisc ? ok('export : disclaimer présent') : fail('export sans disclaimer')
  noDurExport ? ok('export : aucune colonne/notion durée') : fail('export contient encore « durée »')
  await shot('03-export.png')

  // ---------- 6) Compteur vivant recalculé (horodatage absolu) ----------
  await evalJs(`[...document.querySelectorAll('.tab-bar button')].find(b=>/Bouton/.test(b.textContent)).click(); true`)
  await waitFor(`!!document.querySelector('.status-chrono')`, 'chrono visible')
  const t1 = await evalJs(`document.querySelector('.status-chrono').textContent`)
  await sleep(2200)
  const t2 = await evalJs(`document.querySelector('.status-chrono').textContent`)
  t1 !== t2 ? ok(`écran 1 : temps écoulé vivant (${t1} -> ${t2})`) : fail('compteur figé: ' + t1)

  // ---------- Bilan console ----------
  if (consoleErrors.length === 0) ok('console : 0 erreur sur tout le parcours')
  else fail('erreurs console:\n  - ' + consoleErrors.join('\n  - '))
}

main()
  .catch((e) => fail('exception: ' + (e.stack || e.message)))
  .finally(async () => { try { chrome.kill('SIGKILL') } catch {} ; await sleep(200); process.exit(process.exitCode || 0) })
