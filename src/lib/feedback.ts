import { Capacitor } from '@capacitor/core'
import pkg from '../../package.json' with { type: 'json' }

export const FEEDBACK_MESSAGE_MIN = 3
export const FEEDBACK_MESSAGE_MAX = 4000
export const FEEDBACK_APP_ID = 'contractions'

const RELAY_URL = (import.meta.env?.VITE_FEEDBACK_RELAY_URL ?? '').trim()

export function feedbackAvailable(): boolean {
  return RELAY_URL.length > 0
}

// Même règle que côté relais (factory/services/feedback-relay/src/feedback.mjs) : garde une
// validation client cohérente, le serveur reste la source de vérité.
export function validateFeedbackMessage(message: string): string | null {
  const trimmed = message.trim()
  if (trimmed.length < FEEDBACK_MESSAGE_MIN) return 'Écris au moins quelques mots.'
  if (trimmed.length > FEEDBACK_MESSAGE_MAX) return `Message trop long (max ${FEEDBACK_MESSAGE_MAX} caractères).`
  return null
}

export type FeedbackInput = {
  message: string
  contact?: string
  website?: string // honeypot anti-bot : toujours vide dans le formulaire réel
}

export type FeedbackResult = { ok: true } | { ok: false; error: string }

export async function submitFeedback(input: FeedbackInput): Promise<FeedbackResult> {
  if (!feedbackAvailable()) {
    return { ok: false, error: "Le service de feedback n'est pas disponible dans cette version." }
  }
  const validationError = validateFeedbackMessage(input.message)
  if (validationError) return { ok: false, error: validationError }

  try {
    const res = await fetch(`${RELAY_URL}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app: FEEDBACK_APP_ID,
        message: input.message.trim(),
        contact: input.contact?.trim() || undefined,
        website: input.website ?? '',
        meta: { appVersion: pkg.version, platform: Capacitor.getPlatform() },
      }),
    })
    if (!res.ok) return { ok: false, error: 'Envoi impossible, réessaie plus tard.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Pas de connexion, réessaie plus tard.' }
  }
}
