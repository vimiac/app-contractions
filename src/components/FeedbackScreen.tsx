import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  FEEDBACK_MESSAGE_MAX,
  feedbackAvailable,
  submitFeedback,
  validateFeedbackMessage,
} from '../lib/feedback'

type Status = 'idle' | 'sending' | 'sent' | 'error'

export function FeedbackScreen() {
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [website, setWebsite] = useState('') // honeypot : reste vide pour un humain
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  const available = feedbackAvailable()

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const validationError = validateFeedbackMessage(message)
    if (validationError) {
      setError(validationError)
      return
    }
    setStatus('sending')
    setError(null)
    const result = await submitFeedback({ message, contact, website })
    if (result.ok) {
      setStatus('sent')
      setMessage('')
      setContact('')
    } else {
      setStatus('error')
      setError(result.error)
    }
  }

  return (
    <div className="feedback-screen">
      <div className="medical-notice" role="note">
        Une remarque, un bug, une idée ? Ce message part dans notre suivi de développement, avec la version de
        l'app. Aucune contraction ni aucune donnée personnelle enregistrée dans l'app n'est envoyée.
      </div>

      <section className="chart-block feedback-card">
        <h2>Donner un avis</h2>

        {!available && (
          <p className="empty">Le service de feedback n'est pas encore disponible dans cette version.</p>
        )}

        {available && status === 'sent' && (
          <div className="feedback-status success" role="status">
            <span>✓ Merci, c'est envoyé.</span>
            <button className="link-button" onClick={() => setStatus('idle')}>Envoyer un autre message</button>
          </div>
        )}

        {available && status !== 'sent' && (
          <form className="feedback-form" onSubmit={onSubmit}>
            <label className="feedback-label" htmlFor="feedback-message">Votre message</label>
            <textarea
              id="feedback-message"
              className="feedback-textarea"
              value={message}
              maxLength={FEEDBACK_MESSAGE_MAX}
              placeholder="Un bug, une suggestion, un ressenti…"
              onChange={(e) => setMessage(e.target.value)}
              disabled={status === 'sending'}
            />

            {/* Honeypot anti-bot : invisible et inatteignable au clavier pour un humain. */}
            <input
              type="text"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="feedback-honeypot"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />

            <label className="feedback-label" htmlFor="feedback-contact">Contact (optionnel)</label>
            <input
              id="feedback-contact"
              className="feedback-contact-input"
              type="text"
              value={contact}
              maxLength={200}
              placeholder="E-mail si tu veux une réponse"
              onChange={(e) => setContact(e.target.value)}
              disabled={status === 'sending'}
            />

            {error && <p className="feedback-status error" role="alert">{error}</p>}

            <button className="export-primary-button" type="submit" disabled={status === 'sending'}>
              {status === 'sending' ? 'Envoi…' : 'Envoyer'}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
