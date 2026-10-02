'use client'

import { useMemo, useState } from 'react'
import { Inbox, MessageSquareText, Search, ShieldCheck, UsersRound, X } from 'lucide-react'
import useSWR from 'swr'

type AdminFeedback = {
  id: string
  user_id: string
  user_email: string | null
  category: string
  message: string
  created_at: string
}

type AdminFeedbackResponse = { items: AdminFeedback[]; error?: string }

async function fetchFeedback(url: string): Promise<AdminFeedbackResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  const data = (await response.json()) as AdminFeedbackResponse
  if (!response.ok) throw new Error(data.error || 'Feedback could not be loaded.')
  return data
}

type AdminUser = {
  user_id: string
  user_email: string
  searches_used: number
  daily_limit: number | null
  is_admin: boolean
}

type AdminUsersResponse = { users: AdminUser[]; error?: string }

async function fetchUsers(url: string): Promise<AdminUsersResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  const data = (await response.json()) as AdminUsersResponse
  if (!response.ok) throw new Error(data.error || 'Users could not be loaded.')
  return data
}

type AdminPageViewsResponse = { pageviews: Array<{ view_date: string; page_views: number }>; totalViews: number; dailyAverage: number; error?: string }

async function fetchPageViews(url: string): Promise<AdminPageViewsResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  const data = (await response.json()) as AdminPageViewsResponse
  if (!response.ok) throw new Error(data.error || 'Page view analytics could not be loaded.')
  return data
}

function AdminFeedbackInbox() {
  const { data, error, isLoading, mutate } = useSWR<AdminFeedbackResponse>('/api/admin/feedback', fetchFeedback, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  return (
    <section className="admin-feedback-inbox" aria-labelledby="admin-feedback-heading">
      <div className="admin-feedback-heading">
        <h3 id="admin-feedback-heading">User feedback</h3>
        <span>NEWEST 100 MESSAGES</span>
      </div>
      {isLoading ? (
        <p className="admin-feedback-state" role="status">Loading feedback…</p>
      ) : error ? (
        <div className="admin-feedback-state" role="alert">
          <span>{error.message}</span>
          <button className="admin-limit-save" type="button" onClick={() => void mutate()}>TRY AGAIN</button>
        </div>
      ) : data?.items.length ? (
        <div className="admin-feedback-list">
          {data.items.map((item) => (
            <article className="admin-feedback-card" key={item.id}>
              <div className="admin-feedback-meta">
                <span className="admin-feedback-author"><MessageSquareText size={13} />{item.user_email ?? `Account ${item.user_id.slice(0, 8)}`}</span>
                <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>
              </div>
              <div className="admin-feedback-category">{item.category}</div>
              <p className="admin-feedback-message">{item.message}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-feedback-state"><Inbox size={19} /><span>No feedback messages have been submitted yet.</span></div>
      )}
    </section>
  )
}

export function AdminUserManagement({ onClose, initialView = 'users' }: { onClose: () => void; initialView?: 'users' | 'feedback' }) {
  const [view, setView] = useState<'users' | 'feedback'>(initialView)
  const [query, setQuery] = useState('')
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({})
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')
  const [saveNotice, setSaveNotice] = useState('')
  const { data, error, isLoading, mutate } = useSWR<AdminUsersResponse>(view === 'users' ? '/api/admin/usage' : null, fetchUsers, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const { data: pageViewData, error: pageViewError, isLoading: pageViewLoading } = useSWR<AdminPageViewsResponse>(view === 'users' ? '/api/admin/pageviews' : null, fetchPageViews, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  const users = data?.users ?? []
  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return users
    return users.filter((user) => user.user_email.toLowerCase().includes(normalizedQuery))
  }, [query, users])
  const searchesToday = users.reduce((total, user) => total + user.searches_used, 0)

  async function saveLimit(user: AdminUser) {
    const rawLimit = limitDrafts[user.user_id] ?? String(user.daily_limit ?? 15)
    const dailyLimit = Number(rawLimit)
    if (!Number.isInteger(dailyLimit) || dailyLimit < 0 || dailyLimit > 1000) {
      setSaveError('Enter a whole-number limit from 0 to 1000.')
      return
    }

    setSaveError('')
    setSaveNotice('')
    setSavingUserId(user.user_id)
    try {
      const response = await fetch('/api/admin/limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.user_id, dailyLimit }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Search limit could not be saved.')
      setSaveNotice(`Daily result allowance updated for ${user.user_email}.`)
      setLimitDrafts((current) => {
        const next = { ...current }
        delete next[user.user_id]
        return next
      })
      await mutate()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Search limit could not be saved.')
    } finally {
      setSavingUserId(null)
    }
  }

  return (
    <div className="admin-users-layer">
      <button className="drawer-scrim" type="button" aria-label="Close user management" onClick={onClose} />
      <section className="admin-users-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-users-title" aria-describedby="admin-users-description">
        <header className="admin-users-header">
          <div>
            <span className="panel-kicker"><UsersRound size={14} /> MASTER ADMIN</span>
            <h2 id="admin-users-title">Users &amp; access</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close user management" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="admin-users-content">
          <p className="admin-users-description" id="admin-users-description">
            View daily unique businesses revealed, manage account result allowances, and review messages users sent through Transmit Signal.
          </p>
          <nav className="admin-users-tabs" aria-label="Admin views">
            <button className={view === 'users' ? 'admin-view-tab is-active' : 'admin-view-tab'} type="button" aria-pressed={view === 'users'} onClick={() => setView('users')}><UsersRound size={14} /> Users &amp; access</button>
            <button className={view === 'feedback' ? 'admin-view-tab is-active' : 'admin-view-tab'} type="button" aria-pressed={view === 'feedback'} onClick={() => setView('feedback')}><Inbox size={14} /> Feedback inbox</button>
          </nav>
          {view === 'users' ? <>
          <div className="admin-users-stats" aria-label="Account summary">
            <article><span>REGISTERED USERS</span><strong>{isLoading ? '—' : users.length}</strong></article>
            <article><span>RESULTS REVEALED TODAY · UTC</span><strong>{isLoading ? '—' : searchesToday}</strong></article>
            <article><span>AGGREGATE PAGE VIEWS · 30 DAYS</span><strong>{pageViewLoading ? '—' : pageViewData?.totalViews ?? 0}</strong></article>
            <article><span>DAILY AVERAGE</span><strong>{pageViewLoading ? '—' : pageViewData?.dailyAverage ?? 0}</strong></article>
          </div>
          <label className="admin-users-search">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">Filter registered users by email</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by email address" />
          </label>
          {isLoading ? <p className="admin-ledger-state" role="status">Loading registered users…</p> : error ? <p className="admin-ledger-state admin-ledger-error" role="alert">{error.message}</p> : (
            <div className="admin-ledger-table-wrap admin-users-table-wrap">
              <table className="admin-ledger-table admin-users-table">
                <thead><tr><th scope="col">ACCOUNT</th><th scope="col">RESULTS USED</th><th scope="col">RESULTS LEFT</th><th scope="col">DAILY RESULT LIMIT</th><th scope="col"><span className="sr-only">Save user limit</span></th></tr></thead>
                <tbody>
                  {visibleUsers.map((user) => (
                    <tr key={user.user_id}>
                      <td>{user.user_email}{user.is_admin && <span className="admin-owner-tag"><ShieldCheck size={11} /> MASTER ADMIN</span>}</td>
                      <td>{user.searches_used}</td>
                      <td>{user.is_admin ? <span className="unlimited-label">Unlimited</span> : Math.max(0, (user.daily_limit ?? 15) - user.searches_used)}</td>
                      <td>{user.is_admin ? <span className="unlimited-label">Unlimited</span> : <label className="sr-only" htmlFor={`user-limit-${user.user_id}`}>Daily result limit for {user.user_email}</label>}{!user.is_admin && <input id={`user-limit-${user.user_id}`} className="admin-limit-input" type="number" min="0" max="1000" step="1" value={limitDrafts[user.user_id] ?? String(user.daily_limit ?? 15)} onChange={(event) => setLimitDrafts((current) => ({ ...current, [user.user_id]: event.target.value }))} />}</td>
                      <td>{!user.is_admin && <button className="admin-limit-save" type="button" disabled={savingUserId === user.user_id} onClick={() => void saveLimit(user)}>{savingUserId === user.user_id ? 'SAVING…' : 'SAVE'}</button>}</td>
                    </tr>
                  ))}
                  {visibleUsers.length === 0 && <tr><td colSpan={5} className="admin-users-empty">{users.length ? 'No registered users match that email.' : 'No registered accounts yet.'}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {saveError && <p className="admin-users-feedback admin-users-error" role="alert">{saveError}</p>}
          {saveNotice && <p className="admin-users-feedback" role="status">{saveNotice}</p>}
          <p className="admin-users-privacy">Production page-view analytics are provided by Vercel Analytics in the project dashboard. This list contains registered accounts only, not anonymous visitor profiles.</p>
          </> : <AdminFeedbackInbox />}
        </div>
        <footer className="admin-users-footer"><span>USERS &amp; FEEDBACK · MASTER ADMIN ONLY</span><button className="toolbar-button" type="button" onClick={onClose}>Close</button></footer>
      </section>
    </div>
  )
}
