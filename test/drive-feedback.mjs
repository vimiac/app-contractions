// Vérification manuelle (non committée au test runner) de l'écran « Avis » :
// 1) sans VITE_FEEDBACK_RELAY_URL -> message « indisponible », pas d'appel réseau.
// 2) avec VITE_FEEDBACK_RELAY_URL pointant un relais local factice -> formulaire,
//    honeypot invisible, envoi -> statut « envoyé » + payload reçu conforme.
// Chrome headless invisible (aucun vol de focus), cf. drive.mjs.
import { spawn, execSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const PREVIEW_PORT = 4788
const CDP_PORT = 9323
const MOCK_PORT = 8799
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = '/Users/arnaudceyrac/HarnessAgents/hive/Livrables/BUR-54-feedback-apps/screenshots'
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ok = (m) => console.log('✔ ' + m)
const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1 }

let receivedBody = null
const mock = createServer((req, res) => {
  let data = ''
  req.on('data', (c) => (data += c))
  req.on('end', () => {
    if (req.method === 'POST' && req.url === '/submit') {
      receivedBody = JSON.parse(data)
      res.writeHead(201, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify({ ok: true }))
    } else if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      res.end()
    } else {
      res.writeHead(404)
      res.end()
    }
  })
})

function cdp() {
  let ws, msgId = 0
  const pending = new Map()
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
  return { send, evalJs, waitFor, navigate, shot, setWs: (w) => (ws = w), pending }
}

async function withChrome(fn, profile) {
  // Profil dédié + jetable par phase : le service worker (precache Workbox) d'un build
  // précédent survivrait sinon dans un profil partagé et servirait des assets périmés
  // (piège déjà rencontré sur BUR-47/BUR-49).
  const userDataDir = `/tmp/bur54-chrome-${profile}`
  rmSync(userDataDir, { recursive: true, force: true })
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=400,880', '--force-device-scale-factor=1', '--hide-scrollbars',
    'about:blank',
  ], { stdio: 'ignore' })

  const c = cdp()
  try {
    let wsUrl
    for (let i = 0; i < 40; i++) {
      try {
        const list = await (await fetch(`http://localhost:${CDP_PORT}/json`)).json()
        const page = list.find((t) => t.type === 'page')
        if (page?.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; break }
      } catch {}
      await sleep(200)
    }
    if (!wsUrl) throw new Error('CDP endpoint introuvable')
    const ws = new WebSocket(wsUrl)
    c.setWs(ws)
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && c.pending.has(msg.id)) {
        const { res } = c.pending.get(msg.id)
        c.pending.delete(msg.id)
        res(msg.result)
      }
    }
    await new Promise((res) => (ws.onopen = res))
    await c.send('Runtime.enable')
    await c.send('Page.enable')
    await fn(c)
  } finally {
    chrome.kill()
  }
}

async function buildWithRelay(relayUrl) {
  execSync('npx tsc --noEmit', { cwd: process.cwd(), stdio: 'inherit' })
  execSync('npx vite build', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, VITE_FEEDBACK_RELAY_URL: relayUrl ?? '' },
  })
}

async function main() {
  await new Promise((res) => mock.listen(MOCK_PORT, res))
  ok('relais factice en écoute sur :' + MOCK_PORT)

  // --- 1) build SANS relai configuré : état "indisponible" ---
  await buildWithRelay('')
  let preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], { stdio: 'ignore' })
  await sleep(1200)

  await withChrome(async (c) => {
    await c.navigate(`http://localhost:${PREVIEW_PORT}`)
    await c.waitFor(`!!document.querySelector('.tab-bar')`, 'app chargée')
    await c.evalJs(`document.querySelectorAll('[role=tab]')[3].click()`)
    await sleep(200)
    const unavailableText = await c.evalJs(`document.querySelector('.feedback-card .empty')?.textContent || ''`)
    if (/pas encore disponible/.test(unavailableText)) ok('état indisponible affiché sans VITE_FEEDBACK_RELAY_URL')
    else fail('état indisponible NON affiché : ' + unavailableText)
    await c.shot('feedback-indisponible.png')
  }, 'phase1')
  preview.kill()
  await sleep(300)

  // --- 2) build AVEC relai configuré (mock local) : formulaire + envoi réel ---
  await buildWithRelay(`http://localhost:${MOCK_PORT}`)
  preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], { stdio: 'ignore' })
  await sleep(1200)

  await withChrome(async (c) => {
    await c.navigate(`http://localhost:${PREVIEW_PORT}`)
    await c.waitFor(`!!document.querySelector('.tab-bar')`, 'app chargée')
    await c.evalJs(`document.querySelectorAll('[role=tab]')[3].click()`)
    await sleep(200)

    const formVisible = await c.evalJs(`!!document.querySelector('.feedback-textarea')`)
    if (formVisible) ok('formulaire affiché quand le relais est configuré')
    else fail('formulaire absent alors que VITE_FEEDBACK_RELAY_URL est défini')

    const honeypotHidden = await c.evalJs(`
      (() => {
        const el = document.querySelector('.feedback-honeypot')
        if (!el) return false
        const r = el.getBoundingClientRect()
        return r.width <= 1 && r.height <= 1
      })()
    `)
    if (honeypotHidden) ok('champ honeypot bien invisible (1px, hors flux visuel)')
    else fail('champ honeypot VISIBLE — risque UX/anti-bot')

    await c.shot('feedback-formulaire.png')

    // Remplit et envoie.
    await c.evalJs(`
      (() => {
        const ta = document.querySelector('.feedback-textarea')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
        setter.call(ta, 'Vérification pilotée : le bouton + réagit mal en veille prolongée.')
        ta.dispatchEvent(new Event('input', { bubbles: true }))
      })()
    `)
    await c.evalJs(`document.querySelector('.feedback-card form').requestSubmit()`)
    await c.waitFor(`!!document.querySelector('.feedback-status.success')`, 'statut envoyé', 4000)
    ok('statut "envoyé" affiché après soumission')
    await c.shot('feedback-envoye.png')
  }, 'phase2')
  preview.kill()

  if (!receivedBody) {
    fail('le relais factice n’a reçu aucune requête')
  } else {
    if (receivedBody.app === 'contractions') ok('payload.app = contractions')
    else fail('payload.app inattendu: ' + receivedBody.app)
    if (/veille prolongée/.test(receivedBody.message)) ok('payload.message conforme à la saisie')
    else fail('payload.message inattendu: ' + receivedBody.message)
    if (receivedBody.website === '') ok('payload.website (honeypot) vide comme attendu')
    else fail('payload.website non vide: ' + receivedBody.website)
    if (receivedBody.meta?.platform) ok('payload.meta.platform présent: ' + receivedBody.meta.platform)
    else fail('payload.meta.platform manquant')
  }

  mock.close()
  // Rebuild propre (sans relai) pour ne pas laisser un dist/ pointant vers localhost.
  await buildWithRelay('')
  ok('dist/ reconstruit SANS relai local (évite de livrer une URL localhost)')
}

main().catch((e) => { fail(e.stack || String(e)); process.exit(1) })
