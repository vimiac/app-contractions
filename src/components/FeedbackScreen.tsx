import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  FEEDBACK_IMAGE_ACCEPTED_TYPES,
  FEEDBACK_MESSAGE_MAX,
  compressFeedbackImage,
  feedbackAvailable,
  submitFeedback,
  validateFeedbackImageFile,
  validateFeedbackMessage,
} from '../lib/feedback'

type Status = 'idle' | 'sending' | 'sent' | 'error'

export function FeedbackScreen() {
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [website, setWebsite] = useState('') // honeypot : reste vide pour un humain
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const available = feedbackAvailable()

  const clearImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setImageFile(null)
    setImagePreviewUrl(null)
    setImageError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onPickImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const validationError = validateFeedbackImageFile(file)
    if (validationError) {
      setImageError(validationError)
      setImageFile(null)
      setImagePreviewUrl(null)
      return
    }
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setImageError(null)
    setImageFile(file)
    setImagePreviewUrl(URL.createObjectURL(file))
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const validationError = validateFeedbackMessage(message)
    if (validationError) {
      setError(validationError)
      return
    }
    setStatus('sending')
    setError(null)
    try {
      const image = imageFile ? await compressFeedbackImage(imageFile) : undefined
      const result = await submitFeedback({ message, contact, website, image })
      if (result.ok) {
        setStatus('sent')
        setMessage('')
        setContact('')
        clearImage()
      } else {
        setStatus('error')
        setError(result.error)
      }
    } catch {
      setStatus('error')
      setError("Impossible de préparer l'image, réessaie sans ou avec une autre photo.")
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

            <span className="feedback-label">Image (optionnelle)</span>
            <input
              ref={fileInputRef}
              id="feedback-image"
              type="file"
              accept={FEEDBACK_IMAGE_ACCEPTED_TYPES.join(',')}
              onChange={onPickImage}
              className="feedback-image-input"
              disabled={status === 'sending'}
            />
            {imagePreviewUrl && (
              <div className="feedback-image-preview">
                <img src={imagePreviewUrl} alt="Aperçu de l'image jointe" />
                <button
                  type="button"
                  className="link-button"
                  onClick={clearImage}
                  disabled={status === 'sending'}
                >
                  Retirer l'image
                </button>
              </div>
            )}
            {imageError && <p className="feedback-status error" role="alert">{imageError}</p>}

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
