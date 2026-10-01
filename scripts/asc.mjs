// Helper App Store Connect API : génère un JWT ES256 depuis la config locale
// (~/.appstoreconnect/config.json + .p8) et expose `ascFetch(path, opts)`.
// Le .p8 est le SECRET : jamais logué, jamais commité (hors dépôt).
import { readFileSync } from 'node:fs'
import { createSign } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

const cfg = JSON.parse(readFileSync(join(homedir(), '.appstoreconnect/config.json'), 'utf8'))
const privateKey = readFileSync(cfg.private_key, 'utf8')

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function makeJWT() {
  const header = { alg: 'ES256', kid: cfg.key_id, typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: cfg.issuer_id, iat: now, exp: now + 20 * 60, aud: 'appstoreconnect-v1' }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const signer = createSign('SHA256')
  signer.update(signingInput)
  signer.end()
  const der = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })
  return `${signingInput}.${b64url(der)}`
}

const BASE = 'https://api.appstoreconnect.apple.com'

export async function ascFetch(path, opts = {}) {
  const token = makeJWT()
  const res = await fetch(path.startsWith('http') ? path : BASE + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : null } catch { json = { raw: text } }
  return { status: res.status, ok: res.ok, json }
}

// CLI direct : `node asc.mjs GET /v1/bundleIds` etc.
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , method = 'GET', path = '/v1/apps'] = process.argv
  const body = process.argv[4]
  const r = await ascFetch(path, { method, ...(body ? { body } : {}) })
  console.log(r.status)
  console.log(JSON.stringify(r.json, null, 2))
}
