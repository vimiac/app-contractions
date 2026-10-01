import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateFeedbackMessage,
  feedbackAvailable,
  FEEDBACK_MESSAGE_MAX,
} from '../src/lib/feedback.ts'

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
