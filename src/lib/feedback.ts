import { Capacitor } from '@capacitor/core'
import pkg from '../../package.json' with { type: 'json' }

export const FEEDBACK_MESSAGE_MIN = 3
export const FEEDBACK_MESSAGE_MAX = 4000
export const FEEDBACK_APP_ID = 'contractions'

// Image jointe (optionnelle) : mêmes garde-fous que côté relais (feedback-relay/src/feedback.mjs).
export const FEEDBACK_IMAGE_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const FEEDBACK_IMAGE_MAX_SOURCE_BYTES = 15 * 1024 * 1024 // avant compression
export const FEEDBACK_IMAGE_MAX_DIMENSION = 1600 // px, plus grand côté
export const FEEDBACK_IMAGE_OUTPUT_MIME = 'image/jpeg'
export const FEEDBACK_IMAGE_OUTPUT_QUALITY = 0.8

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

export type FeedbackImage = { dataBase64: string; mime: string }

export type FeedbackInput = {
  message: string
  contact?: string
  website?: string // honeypot anti-bot : toujours vide dans le formulaire réel
  image?: FeedbackImage
}

export type FeedbackResult = { ok: true } | { ok: false; error: string }

// Validation du fichier choisi par l'utilisateur, AVANT compression (type + poids brut).
// Le serveur reste la source de vérité (re-valide mime + taille après compression).
export function validateFeedbackImageFile(file: File): string | null {
  if (!FEEDBACK_IMAGE_ACCEPTED_TYPES.includes(file.type)) {
    return 'Format non supporté (JPEG, PNG ou WebP uniquement).'
  }
  if (file.size > FEEDBACK_IMAGE_MAX_SOURCE_BYTES) {
    return 'Image trop lourde (15 Mo max avant envoi).'
  }
  return null
}

// Redimensionne et recompresse l'image choisie côté client (canvas) pour rester léger sur le
// réseau et sur le relais. Dépend du DOM (canvas/Image) : jamais appelée depuis les tests Node,
// uniquement depuis l'écran Avis (navigateur / WebView).
export async function compressFeedbackImage(file: File): Promise<FeedbackImage> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, FEEDBACK_IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas indisponible')
    ctx.drawImage(bitmap, 0, 0, width, height)

    const dataUrl = canvas.toDataURL(FEEDBACK_IMAGE_OUTPUT_MIME, FEEDBACK_IMAGE_OUTPUT_QUALITY)
    const comma = dataUrl.indexOf(',')
    return { dataBase64: dataUrl.slice(comma + 1), mime: FEEDBACK_IMAGE_OUTPUT_MIME }
  } finally {
    bitmap.close()
  }
}

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
        image: input.image ? { data: input.image.dataBase64, mime: input.image.mime } : undefined,
        meta: { appVersion: pkg.version, platform: Capacitor.getPlatform() },
      }),
    })
    if (!res.ok) return { ok: false, error: 'Envoi impossible, réessaie plus tard.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Pas de connexion, réessaie plus tard.' }
  }
}
