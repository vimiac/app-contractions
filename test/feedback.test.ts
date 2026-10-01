import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateFeedbackMessage,
  feedbackAvailable,
  validateFeedbackImageFile,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_IMAGE_MAX_SOURCE_BYTES,
} from '../src/lib/feedback.ts'

// Node n'a pas de File global avant d'y être poussé par un test runtime ; un objet minimal
// avec { type, size } suffit, validateFeedbackImageFile ne lit que ces deux champs.
function fakeFile(type: string, size: number) {
  return { type, size } as File
}

test('validateFeedbackMessage rejette un message vide ou trop court', () => {
  assert.equal(typeof validateFeedbackMessage(''), 'string')
  assert.equal(typeof validateFeedbackMessage('ok'), 'string')
})

test('validateFeedbackMessage rejette un message trop long', () => {
  assert.equal(typeof validateFeedbackMessage('a'.repeat(FEEDBACK_MESSAGE_MAX + 1)), 'string')
})

test('validateFeedbackMessage accepte un message normal', () => {
  assert.equal(validateFeedbackMessage('super appli, merci'), null)
})

test('feedbackAvailable reflète VITE_FEEDBACK_RELAY_URL (vide en environnement de test Node)', () => {
  // En exécution Node directe (hors build Vite), import.meta.env n'est pas injecté : le relais
  // est donc considéré indisponible — comportement attendu tant que l'URL n'est pas configurée au build.
  assert.equal(feedbackAvailable(), false)
})

test('validateFeedbackImageFile accepte jpeg/png/webp sous la limite de poids', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.equal(validateFeedbackImageFile(fakeFile(type, 1024)), null, type)
  }
})

test('validateFeedbackImageFile rejette un format non supporté', () => {
  assert.equal(typeof validateFeedbackImageFile(fakeFile('image/gif', 1024)), 'string')
  assert.equal(typeof validateFeedbackImageFile(fakeFile('application/pdf', 1024)), 'string')
})

test('validateFeedbackImageFile rejette un fichier trop lourd', () => {
  assert.equal(
    typeof validateFeedbackImageFile(fakeFile('image/jpeg', FEEDBACK_IMAGE_MAX_SOURCE_BYTES + 1)),
    'string'
  )
})
