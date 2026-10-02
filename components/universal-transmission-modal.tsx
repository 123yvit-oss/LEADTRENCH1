'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { X, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type FeedbackCategory = 'question' | 'bug' | 'feedback'

const categories: { value: FeedbackCategory; label: string }[] = [
  { value: 'question', label: 'Question' },
  { value: 'bug', label: 'Bug report' },
  { value: 'feedback', label: 'Feedback' },
]

const successMessage = 'Transmission received. The Trench welcomes you.'

export function UniversalTransmissionModal({ onSuccess }: { onSuccess: (message: string) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [category, setCategory] = useState<FeedbackCategory>('feedback')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return
    textareaRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        setIsOpen(false)
        setError('')
        window.requestAnimationFrame(() => triggerRef.current?.focus())
      }
      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), textarea:not(:disabled)')
        if (!focusable?.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, isSubmitting]
)

  function closeModal() {
    setIsOpen(false)
    setError('')
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  async function submitTransmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanMessage = message.trim()
    if (!cleanMessage || cleanMessage.length > 4000) {
      setError('Enter a message between 1 and 4,000 characters.')
      return
    }

    setIsSubmitting(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        setError('Please sign in again before transmitting your message.')
        return
      }

      const { error: submitError } = await supabase.from('user_feedback').insert({
        user_id: user.id,
        category,
        message: cleanMessage,
      })
      if (submitError) throw submitError

      setMessage('')
      setCategory('feedback')
      setIsOpen(false)
      onSuccess(successMessage)
      window.requestAnimationFrame(() => triggerRef.current?.focus())
    } catch {
      setError('Your message could not be transmitted. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <button ref={triggerRef} className="transmission-trigger" type="button" onClick={() => setIsOpen(true)}>
        <Zap size={15} aria-hidden="true" /> [ ⚡ TRANSMIT SIGNAL ]
      </button>
      {isOpen && (
        <div className="transmission-layer">
          <button className="transmission-scrim" type="button" aria-label="Close transmission form" onClick={closeModal} disabled={isSubmitting} />
          <section ref={dialogRef} className="transmission-dialog" role="dialog" aria-modal="true" aria-labelledby="transmission-title" aria-describedby="transmission-description">
            <div className="transmission-dialog-head">
              <div>
                <span className="transmission-eyebrow"><span className="live-dot" /> UNIVERSAL TRANSMISSION</span>
                <h2 id="transmission-title">Send a signal</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close transmission form" onClick={closeModal} disabled={isSubmitting}><X size={18} /></button>
            </div>
            <p className="transmission-description" id="transmission-description">Share a question, report an issue, or send feedback directly to the Trench.</p>
            <form className="transmission-form" onSubmit={submitTransmission}>
              <label className="transmission-field-label" htmlFor="transmission-category">SIGNAL TYPE</label>
              <select id="transmission-category" className="transmission-select" value={category} onChange={(event) => setCategory(event.target.value as FeedbackCategory)}>
                {categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <label className="transmission-field-label" htmlFor="transmission-message">MESSAGE</label>
              <textarea
                ref={textareaRef}
                id="transmission-message"
                className="transmission-textarea"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="What would you like us to know?"
                maxLength={4000}
                required
                rows={5}
              />
              <div className="transmission-form-foot"><span>{message.length} / 4,000</span><span>PRIVATE WORKSPACE TRANSMISSION</span></div>
              {error && <p className="transmission-error" role="alert">{error}</p>}
              <button className="primary-button transmission-submit" type="submit" disabled={isSubmitting || !message.trim()} aria-busy={isSubmitting}>
                {isSubmitting ? 'TRANSMITTING…' : <><Zap size={15} /> [ ⚡ TRANSMIT SIGNAL ]</>}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  )
}

