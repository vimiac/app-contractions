// Vérification manuelle (non committée au test runner) de l'image jointe sur l'écran « Avis »
// (BUR-58) : sélection fichier → aperçu → compression côté client → envoi → le relais factice
// reçoit bien un champ image { data, mime }. Chrome headless invisible (aucun vol de focus).
import { spawn, execSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const PREVIEW_PORT = 4789
const CDP_PORT = 9324
const MOCK_PORT = 8800
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = '/Users/arnaudceyrac/HarnessAgents/hive/Livrables/BUR-58-feedback-image/screenshots'
const TMP = '/tmp/bur58-test-image.png'
mkdirSync(OUT, { recursive: true })

// 1x1 pixel rouge, PNG valide minimal (échantillon de test, pas une vraie capture).
const PNG_1PX_RED_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
writeFileSync(TMP, Buffer.from(PNG_1PX_RED_BASE64, 'base64'))

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
  async function setFileInput(selector, filePath) {
    const { root } = await send('DOM.getDocument')
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector })
    if (!nodeId) throw new Error('input introuvable: ' + selector)
    await send('DOM.setFileInputFiles', { files: [filePath], nodeId })
  }
  return { send, evalJs, waitFor, navigate, shot, setFileInput, setWs: (w) => (ws = w), pending }
}

async function withChrome(fn, profile) {
  const userDataDir = `/tmp/bur58-chrome-${profile}`
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
    await c.send('DOM.enable')
    await fn(c)
  } finally {
    chrome.kill()
  }
}

async function buildWithRelay(relayUrl) {
  execSync('npx vite build', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, VITE_FEEDBACK_RELAY_URL: relayUrl ?? '' },
  })
}

async function main() {
  await new Promise((res) => mock.listen(MOCK_PORT, res))
  ok('relais factice en écoute sur :' + MOCK_PORT)

  await buildWithRelay(`http://localhost:${MOCK_PORT}`)
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], { stdio: 'ignore' })
  await sleep(1200)

  await withChrome(async (c) => {
    await c.navigate(`http://localhost:${PREVIEW_PORT}`)
    await c.waitFor(`!!document.querySelector('.tab-bar')`, 'app chargée')
    await c.evalJs(`document.querySelectorAll('[role=tab]')[3].click()`)
    await sleep(200)

    const fileInputPresent = await c.evalJs(`!!document.querySelector('#feedback-image')`)
    if (fileInputPresent) ok('champ de sélection d’image présent')
    else fail('champ de sélection d’image absent')

    await c.setFileInput('#feedback-image', TMP)
    // Déclenche React (onChange) : setFileInputFiles ne dispatch pas toujours l'event lui-même.
    await c.evalJs(`document.querySelector('#feedback-image').dispatchEvent(new Event('change', { bubbles: true }))`)
    await c.waitFor(`!!document.querySelector('.feedback-image-preview img')`, 'aperçu image affiché')
    ok('aperçu de l’image affiché après sélection')
    await c.shot('feedback-image-apercu.png')

    await c.evalJs(`
      (() => {
        const ta = document.querySelector('.feedback-textarea')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
        setter.call(ta, 'Vérification pilotée : capture d’écran jointe pour illustrer le bug.')
        ta.dispatchEvent(new Event('input', { bubbles: true }))
      })()
    `)
    await c.evalJs(`document.querySelector('.feedback-card form').requestSubmit()`)
    await c.waitFor(`!!document.querySelector('.feedback-status.success')`, 'statut envoyé', 6000)
    ok('statut "envoyé" affiché après soumission avec image')
    await c.shot('feedback-image-envoye.png')
  }, 'phase1')
  preview.kill()

  if (!receivedBody) {
    fail('le relais factice n’a reçu aucune requête')
  } else {
    if (receivedBody.image && typeof receivedBody.image.data === 'string' && receivedBody.image.data.length > 0) {
      ok('payload.image.data présent (base64 non vide)')
    } else {
      fail('payload.image manquant ou vide : ' + JSON.stringify(receivedBody.image))
    }
    if (receivedBody.image?.mime === 'image/jpeg') {
      ok('payload.image.mime = image/jpeg (recompression client en JPEG)')
    } else {
      fail('payload.image.mime inattendu: ' + receivedBody.image?.mime)
    }
  }

  mock.close()
  await buildWithRelay('')
  ok('dist/ reconstruit SANS relai local (évite de livrer une URL localhost)')
}

main().catch((e) => { fail(e.stack || String(e)); process.exit(1) })
