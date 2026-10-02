'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Crosshair,
  Filter,
  Gem,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  Users,
  X,
  Zap,
} from 'lucide-react'

type Profile = { firstName: string; lastName: string; email: string }
type Lead = {
  id: string
  company: string
  initials: string
  industry: string
  location: string
  size: string
  score: number
  signal: string
  bottleneck: string
  solution: string
  contact: string
  role: string
  revenue: string
  color: string
  stage: string
}

const PROFILE_KEY = 'leadtrench-profile-v1'

const industries = [
  'SaaS & Software',
  'Healthcare',
  'Financial Services',
  'Real Estate',
  'Manufacturing',
  'Logistics & Supply Chain',
  'E-commerce & Retail',
  'Legal Services',
  'Marketing & Advertising',
  'Construction',
  'Education & EdTech',
  'Hospitality',
  'Insurance',
  'Telecommunications',
  'Energy & Utilities',
  'Professional Services',
  'Automotive',
  'Biotech & Life Sciences',
  'Food & Beverage',
  'Cybersecurity',
]

const metros = [
  'All metros', 'New York, NY', 'Los Angeles, CA', 'Chicago, IL', 'Houston, TX',
  'Phoenix, AZ', 'Philadelphia, PA', 'San Antonio, TX', 'San Diego, CA', 'Dallas, TX',
  'San Jose, CA', 'Austin, TX', 'Jacksonville, FL', 'Fort Worth, TX', 'Columbus, OH',
  'Charlotte, NC', 'Indianapolis, IN', 'Seattle, WA', 'Denver, CO', 'Boston, MA',
  'Nashville, TN', 'Washington, DC', 'Newark, NJ (North)', 'Edison, NJ (Central)',
  'Cherry Hill, NJ (South)',
]

const leads: Lead[] = [
  {
    id: 'northstar', company: 'Northstar Health', initials: 'NH', industry: 'Healthcare',
    location: 'Newark, NJ (North)', size: '201–500 employees', score: 96,
    signal: 'Hiring 8 revenue operations roles',
    bottleneck: 'patient intake is fragmented across disconnected systems, creating slow response times and lost appointment opportunities.',
    solution: 'a connected intake workflow that routes every inquiry to the right team and makes follow-up measurable.',
    contact: 'Maya Chen', role: 'Chief Operating Officer', revenue: '$24M–$48M', color: 'teal', stage: 'High intent',
  },
  {
    id: 'orbit', company: 'Orbit Commerce', initials: 'OC', industry: 'E-commerce & Retail',
    location: 'New York, NY', size: '51–200 employees', score: 92,
    signal: 'Traffic up 38% — conversion flat',
    bottleneck: 'a growing volume of high-intent shoppers is dropping before checkout, while the team lacks a clear view of where the journey breaks.',
    solution: 'a focused conversion audit and automated recovery journeys that turn more existing traffic into completed orders.',
    contact: 'Daniel Brooks', role: 'VP, Growth', revenue: '$12M–$25M', color: 'violet', stage: 'High intent',
  },
  {
    id: 'meridian', company: 'Meridian Freight', initials: 'MF', industry: 'Logistics & Supply Chain',
    location: 'Edison, NJ (Central)', size: '501–1,000 employees', score: 89,
    signal: 'Expanding into 3 new markets',
    bottleneck: 'manual dispatch coordination is making it difficult to maintain reliable delivery windows as the network expands.',
    solution: 'an operations layer that consolidates dispatch signals, flags exceptions early, and gives customers clearer ETAs.',
    contact: 'Jordan Patel', role: 'Director of Operations', revenue: '$50M–$100M', color: 'blue', stage: 'New signal',
  },
  {
    id: 'clearwater', company: 'Clearwater Capital', initials: 'CC', industry: 'Financial Services',
    location: 'Philadelphia, PA', size: '51–200 employees', score: 86,
    signal: 'New digital transformation lead',
    bottleneck: 'client onboarding relies on repetitive document collection and handoffs that delay time-to-value for new accounts.',
    solution: 'a streamlined onboarding experience with secure document workflows and a transparent view of each account stage.',
    contact: 'Elena Torres', role: 'Managing Partner', revenue: '$18M–$35M', color: 'amber', stage: 'New signal',
  },
  {
    id: 'forge', company: 'Forge & Field', initials: 'FF', industry: 'Manufacturing',
    location: 'Chicago, IL', size: '201–500 employees', score: 82,
    signal: 'ERP migration announced',
    bottleneck: 'production and inventory teams are working from mismatched data during an ERP migration, creating avoidable planning gaps.',
    solution: 'a practical integration roadmap that keeps operational data consistent and surfaces inventory risk before it impacts production.',
    contact: 'Marcus Reed', role: 'Chief Technology Officer', revenue: '$40M–$80M', color: 'orange', stage: 'Emerging',
  },
  {
    id: 'kindred', company: 'Kindred Learning', initials: 'KL', industry: 'Education & EdTech',
    location: 'Cherry Hill, NJ (South)', size: '51–200 employees', score: 79,
    signal: 'Student retention initiative funded',
    bottleneck: 'learner engagement data lives in separate platforms, so advisors have limited warning before students disengage.',
    solution: 'a unified engagement view and timely outreach triggers that help advisors focus on students who need support.',
    contact: 'Avery James', role: 'VP, Student Success', revenue: '$8M–$16M', color: 'pink', stage: 'Emerging',
  },
  {
    id: 'atlas', company: 'Atlas Security', initials: 'AS', industry: 'Cybersecurity',
    location: 'Austin, TX', size: '201–500 employees', score: 76,
    signal: 'Sales team grew by 40%',
    bottleneck: 'a fast-growing sales team is qualifying inbound requests inconsistently and spending too much time on low-fit opportunities.',
    solution: 'a consistent qualification system that helps reps prioritize high-fit accounts and shorten the path to a meaningful conversation.',
    contact: 'Noah Williams', role: 'Chief Revenue Officer', revenue: '$30M–$60M', color: 'cyan', stage: 'Emerging',
  },
  {
    id: 'solstice', company: 'Solstice Energy', initials: 'SE', industry: 'Energy & Utilities',
    location: 'Denver, CO', size: '1,000+ employees', score: 73,
    signal: 'Customer portal RFP published',
    bottleneck: 'customers still depend on support agents for routine account questions and service updates.',
    solution: 'a self-service portal that brings account information and service updates together without adding friction for customers.',
    contact: 'Priya Shah', role: 'VP, Customer Experience', revenue: '$100M+', color: 'lime', stage: 'Emerging',
  },
]

const navItems = [
  { label: 'Command center', icon: LayoutDashboard },
  { label: 'Lead pipeline', icon: Crosshair },
  { label: 'Saved leads', icon: Star },
  { label: 'Market signals', icon: SlidersHorizontal },
]

function initialsFor(profile: Profile) {
  return `${profile.firstName[0] ?? ''}${profile.lastName[0] ?? ''}`.toUpperCase()
}

function AuthGate({ onCreate, onSignIn }: { onCreate: (profile: Profile) => void; onSignIn: (email: string) => void }) {
  const [mode, setMode] = useState<'create' | 'signin'>('create')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (mode === 'create') {
      onCreate({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim().toLowerCase() })
      return
    }
    onSignIn(email.trim().toLowerCase())
  }

  return (
    <main className="auth-page">
      <div className="auth-backdrop" />
      <section className="auth-shell" aria-labelledby="auth-title">
        <div className="auth-brand"><BrandMark /><span>LEADTRENCH</span></div>
        <div className="auth-card">
          <div className="auth-kicker"><span className="status-dot" /> PRIVATE INTELLIGENCE NETWORK</div>
          <h1 id="auth-title">DIG WHERE THE<br /><span>OPPORTUNITY HIDES</span></h1>
          <p className="auth-intro">A sharper way to find the right opportunity, in the right market, at the right moment.</p>
          <div className="auth-tabs" role="tablist" aria-label="Profile options">
            <button className={mode === 'create' ? 'auth-tab active' : 'auth-tab'} role="tab" aria-selected={mode === 'create'} onClick={() => { setMode('create'); setError('') }}>Create profile</button>
            <button className={mode === 'signin' ? 'auth-tab active' : 'auth-tab'} role="tab" aria-selected={mode === 'signin'} onClick={() => { setMode('signin'); setError('') }}>Sign in</button>
          </div>
          <form className="auth-form" onSubmit={submit}>
            {mode === 'create' && <div className="name-row">
              <label className="field-label">First name<input autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Alex" required /></label>
              <label className="field-label">Last name<input autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Morgan" required /></label>
            </div>}
            <label className="field-label">Work email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label>
            <label className="field-label">Password<input type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} required /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit">{mode === 'create' ? 'Create your profile' : 'Continue to workspace'}<ArrowRight size={16} /></button>
          </form>
          <div className="local-note"><ShieldCheck size={15} /><span>This profile is stored in this browser. Passwords are not saved or verified.</span></div>
        </div>
        <div className="auth-foot"><span>© 2025 LEADTRENCH INTELLIGENCE</span><span>BUILT FOR THE NEXT MOVE</span></div>
      </section>
    </main>
  )
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
}

function Sidebar({ profile, activeNav, onNavigate, onSettings, onSignOut, mobileOpen, onClose }: {
  profile: Profile
  activeNav: string
  onNavigate: (label: string) => void
  onSettings: () => void
  onSignOut: () => void
  mobileOpen: boolean
  onClose: () => void
}) {
  return <>
    {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-brand"><BrandMark /><span>LEADTRENCH</span><span className="brand-edition">INTEL</span><button className="icon-button sidebar-close" aria-label="Close navigation" onClick={onClose}><X size={17} /></button></div>
      <div className="workspace-switcher"><div className="workspace-icon"><Crosshair size={16} /></div><div className="workspace-copy"><strong>Growth workspace</strong><span>PRO PLAN</span></div><ChevronDown size={15} className="muted-icon" /></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        {navItems.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${activeNav === label ? 'selected' : ''}`} onClick={() => { onNavigate(label); onClose() }}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Saved leads' && <span className="nav-count">03</span>}</button>)}
      </nav>
      <div className="sidebar-lower">
        <div className="sidebar-profile"><div className="avatar">{initialsFor(profile)}</div><div className="profile-copy"><strong>{profile.firstName} {profile.lastName}</strong><span>{profile.email}</span></div><button className="icon-button profile-menu" aria-label="Account settings" onClick={onSettings}><ChevronDown size={15} /></button></div>
        <button className="sidebar-action" onClick={onSettings}><Settings size={16} />Account settings</button>
        <button className="sidebar-action signout" onClick={onSignOut}><LogOut size={16} />Sign out</button>
        <div className="platform-credit">Platform Architecture by Codey</div>
      </div>
    </aside>
  </>
}

function SearchControls({ industry, metro, query, onIndustry, onMetro, onQuery, onSearch }: {
  industry: string; metro: string; query: string
  onIndustry: (value: string) => void; onMetro: (value: string) => void
  onQuery: (value: string) => void; onSearch: () => void
}) {
  return <section className="search-panel" aria-label="Lead search">
    <div className="search-panel-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> OPPORTUNITY FINDER</div><h2>Where should we look?</h2></div><div className="search-panel-mark"><Target size={18} /><span>PRECISION SEARCH</span></div></div>
    <div className="search-controls">
      <label className="select-field"><span>INDUSTRY TRACK</span><span className="select-wrap"><BriefcaseBusiness size={16} /><select value={industry} onChange={(event) => onIndustry(event.target.value)} aria-label="Industry track"><option value="All industries">All industries</option>{industries.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={14} /></span></label>
      <label className="select-field"><span>METRO AREA</span><span className="select-wrap"><MapPin size={16} /><select value={metro} onChange={(event) => onMetro(event.target.value)} aria-label="Metro area">{metros.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={14} /></span></label>
      <label className="select-field search-keyword"><span>COMPANY OR SIGNAL</span><span className="select-wrap"><Search size={16} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Try a keyword, company, or signal" aria-label="Company or signal" onKeyDown={(event) => { if (event.key === 'Enter') onSearch() }} /></span></label>
      <button className="search-submit" onClick={onSearch}><Search size={17} />Find leads</button>
    </div>
    <div className="search-bottom"><span><span className="pulse-dot" /> SIGNALS UPDATED 14 MIN AGO</span><button onClick={() => { onIndustry('All industries'); onMetro('All metros'); onQuery(''); onSearch() }}>Reset filters <ArrowUpRight size={13} /></button></div>
  </section>
}

function LeadCard({ lead, saved, onOpen, onToggleSaved }: { lead: Lead; saved: boolean; onOpen: () => void; onToggleSaved: () => void }) {
  return <article className="lead-card" tabIndex={0} role="button" aria-label={`Open dossier for ${lead.company}`} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen() } }}>
    <div className="lead-card-top"><div className={`company-mark ${lead.color}`}>{lead.initials}</div><div className="lead-company"><h3>{lead.company}</h3><span>{lead.industry}</span></div><button className={`save-button ${saved ? 'saved' : ''}`} aria-label={saved ? `Remove ${lead.company} from saved leads` : `Save ${lead.company}`} onClick={(event) => { event.stopPropagation(); onToggleSaved() }}><Star size={16} fill={saved ? 'currentColor' : 'none'} /></button></div>
    <div className="lead-meta"><span><MapPin size={13} />{lead.location.replace(/ \(.+\)/, '')}</span><span><Users size={13} />{lead.size}</span></div>
    <div className="lead-signal"><span className="signal-icon"><Zap size={13} /></span><span>{lead.signal}</span></div>
    <div className="lead-card-footer"><div className="score-block"><span>FIT SCORE</span><strong>{lead.score}<small>/100</small></strong></div><span className={`stage-pill ${lead.stage === 'High intent' ? 'stage-hot' : lead.stage === 'New signal' ? 'stage-new' : ''}`}><span />{lead.stage}</span><ArrowUpRight size={16} className="card-arrow" /></div>
  </article>
}

function Dossier({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function generateMessage() {
    setCopied(false)
    setMessage(`Hi ${lead.contact.split(' ')[0]},\n\nI noticed ${lead.company} is growing, and ${lead.bottleneck}\n\nWe help teams like yours with ${lead.solution} Would you be open to a short conversation next week to see if there is a fit?\n\nBest,\n[Your name]`)
  }

  async function copyMessage() {
    if (!message) return
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = message
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const didCopy = document.execCommand('copy')
      textarea.remove()
      setCopied(didCopy)
    }
  }

  return <div className="drawer-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="dossier" role="dialog" aria-modal="true" aria-labelledby="dossier-title">
      <div className="dossier-topline"><span><Gem size={15} /> DOSSIER INTEL SYSTEM</span><button className="icon-button" onClick={onClose} aria-label="Close dossier"><X size={19} /></button></div>
      <div className="dossier-scroll">
        <div className="dossier-hero"><div className={`company-mark dossier-logo ${lead.color}`}>{lead.initials}</div><div><span className="eyebrow">OPPORTUNITY DOSSIER</span><h2 id="dossier-title">{lead.company}</h2><p>{lead.industry} <span className="dot-separator">·</span> {lead.location}</p></div><div className="dossier-score"><span>FIT</span><strong>{lead.score}</strong></div></div>
        <div className="dossier-status"><span className="pulse-dot" /> ACTIVE SIGNAL <span className="status-divider" /> UPDATED 14 MIN AGO</div>
        <section className="intel-section"><div className="section-heading"><span>01</span><h3>Executive snapshot</h3></div><p>{lead.company} is showing meaningful change in its {lead.industry.toLowerCase()} operation. Recent signal: <strong>{lead.signal.toLowerCase()}</strong>. The timing suggests a focused conversation may be relevant to its current growth priorities.</p></section>
        <section className="intel-section"><div className="section-heading"><span>02</span><h3>Potential bottleneck</h3></div><div className="bottleneck-box"><span className="bottleneck-icon"><Crosshair size={16} /></span><p>{lead.bottleneck}</p></div></section>
        <section className="intel-section"><div className="section-heading"><span>03</span><h3>Suggested contact</h3></div><div className="contact-card"><div className="contact-avatar">{lead.contact.split(' ').map((word) => word[0]).join('')}</div><div><strong>{lead.contact}</strong><span>{lead.role}</span></div><button className="text-icon-button" aria-label="View contact details"><ArrowUpRight size={15} /></button></div></section>
        <section className="intel-section"><div className="section-heading"><span>04</span><h3>Account profile</h3></div><div className="profile-facts"><div><span>COMPANY SIZE</span><strong>{lead.size}</strong></div><div><span>EST. REVENUE</span><strong>{lead.revenue}</strong></div><div><span>MARKET</span><strong>{lead.location}</strong></div><div><span>FIT SCORE</span><strong>{lead.score} / 100</strong></div></div></section>
        <section className="outreach-section"><div className="outreach-title"><span><Sparkles size={16} /> NEXT BEST ACTION</span><span className="ai-tag">AI ASSISTED</span></div><h3>Open a relevant conversation.</h3><p>Generate an outreach draft grounded in this account's business signal.</p><button className="generate-button" onClick={generateMessage}><Zap size={16} />GENERATE OUTREACH MESSAGE<ArrowRight size={15} /></button>
          {message && <div className="generated-message"><label htmlFor="outreach-message">PERSONALIZED DRAFT</label><textarea id="outreach-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={8} /><button className="copy-button" onClick={copyMessage}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'COPIED TO CLIPBOARD' : 'COPY TO CLIPBOARD'}</button></div>}
        </section>
        <p className="dossier-disclaimer"><ShieldCheck size={13} /> Signals in these sample records are provided for evaluation. Verify details before outreach.</p>
      </div>
    </aside>
  </div>
}

function SettingsPanel({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return <div className="drawer-layer settings-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="settings-heading"><div><div className="eyebrow">WORKSPACE PREFERENCES</div><h2 id="settings-title">Account settings</h2></div><button className="icon-button" aria-label="Close settings" onClick={onClose}><X size={19} /></button></div><div className="settings-profile"><div className="avatar large-avatar">{initialsFor(profile)}</div><div><strong>{profile.firstName} {profile.lastName}</strong><span>{profile.email}</span></div></div><div className="settings-note"><ShieldCheck size={16} /><p>This profile is saved only in this browser. Passwords are not saved or verified.</p></div><div className="settings-detail"><span>PROFILE NAME</span><strong>{profile.firstName} {profile.lastName}</strong></div><div className="settings-detail"><span>EMAIL ADDRESS</span><strong>{profile.email}</strong></div><button className="settings-done" onClick={onClose}>Done</button></section></div>
}

export function LeadtrenchApp() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [activeNav, setActiveNav] = useState('Command center')
  const [industry, setIndustry] = useState('All industries')
  const [metro, setMetro] = useState('All metros')
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [savedIds, setSavedIds] = useState<string[]>(['northstar', 'orbit', 'meridian'])
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchRun, setSearchRun] = useState(false)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PROFILE_KEY)
      if (stored) {
        const candidate = JSON.parse(stored) as Partial<Profile>
        if (typeof candidate.firstName === 'string' && typeof candidate.lastName === 'string' && typeof candidate.email === 'string') {
          setProfile({ firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email })
        }
      }
    } catch {
      window.localStorage.removeItem(PROFILE_KEY)
    } finally {
      setProfileLoaded(true)
    }
  }, [])

  const filteredLeads = useMemo(() => leads.filter((lead) => {
    if (activeNav === 'Saved leads' && !savedIds.includes(lead.id)) return false
    if (industry !== 'All industries' && lead.industry !== industry) return false
    if (metro !== 'All metros' && lead.location !== metro) return false
    if (appliedQuery) {
      const searchable = `${lead.company} ${lead.industry} ${lead.signal} ${lead.location} ${lead.contact}`.toLowerCase()
      if (!searchable.includes(appliedQuery.toLowerCase())) return false
    }
    return true
  }), [activeNav, appliedQuery, industry, metro, savedIds])

  function createProfile(newProfile: Profile) {
    try {
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(newProfile))
      setProfile(newProfile)
    } catch {
      setProfile(newProfile)
    }
  }

  function signIn(email: string) {
    const stored = window.localStorage.getItem(PROFILE_KEY)
    if (!stored) return
    const saved = JSON.parse(stored) as Profile
    if (saved.email !== email) return
    setProfile(saved)
  }

  function signOut() {
    window.localStorage.removeItem(PROFILE_KEY)
    setProfile(null)
    setActiveNav('Command center')
  }

  function toggleSaved(id: string) {
    setSavedIds((current) => current.includes(id) ? current.filter((savedId) => savedId !== id) : [...current, id])
  }

  function navigate(label: string) {
    setActiveNav(label)
    if (label === 'Market signals') {
      setIndustry('All industries')
      setMetro('All metros')
      setAppliedQuery('signal')
      setQuery('signal')
    }
  }

  function runSearch() {
    setAppliedQuery(query.trim())
    setSearchRun(true)
  }

  if (!profileLoaded) return <main className="loading-screen" aria-label="Loading LEADTRENCH"><BrandMark /><span>INITIALIZING INTELLIGENCE</span></main>
  if (!profile) return <AuthGate onCreate={createProfile} onSignIn={(email) => {
    const stored = window.localStorage.getItem(PROFILE_KEY)
    if (!stored) return
    try {
      const saved = JSON.parse(stored) as Profile
      if (saved.email === email) setProfile(saved)
    } catch {
      window.localStorage.removeItem(PROFILE_KEY)
    }
  }} />

  const isSavedView = activeNav === 'Saved leads'
  const title = activeNav === 'Market signals' ? 'Signals worth a closer look.' : isSavedView ? 'Your saved opportunities.' : 'Find the signal in the noise.'

  return <main className="app-shell">
    <div className="app-watermark" aria-hidden="true" />
    <Sidebar profile={profile} activeNav={activeNav} onNavigate={navigate} onSettings={() => setSettingsOpen(true)} onSignOut={signOut} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
    <section className="main-area">
      <header className="topbar"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={19} /></button><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={13} /><strong>{activeNav}</strong></div><div className="topbar-actions"><div className="system-status"><span className="pulse-dot" />SYSTEMS NOMINAL</div><button className="icon-button notification-button" aria-label="Notifications"><Bell size={17} /><span /></button><div className="top-avatar">{initialsFor(profile)}</div></div></header>
      <div className="content-wrap">
        <section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line" /> THURSDAY, OCTOBER 01, 2026</div><h1>Hello, {profile.firstName}<span className="greeting-period">.</span></h1><p>{title}</p></div><button className="help-link"><CircleHelp size={16} />How it works<ArrowUpRight size={13} /></button></section>
        <section className="metrics-row" aria-label="Pipeline overview"><div className="metric-card"><div className="metric-icon cyan"><Crosshair size={16} /></div><div className="metric-label">ACTIVE OPPORTUNITIES</div><div className="metric-value">08 <span>+2 this week</span></div><div className="metric-foot"><span className="metric-sparkline">▁▂▃▂▅▃▆▇</span><span>Across your markets</span></div></div><div className="metric-card"><div className="metric-icon violet-metric"><Zap size={16} /></div><div className="metric-label">AVG. FIT SCORE</div><div className="metric-value">84<span className="metric-unit">/100</span><span className="metric-change">+6.4%</span></div><div className="metric-foot"><span className="metric-sparkline violet-spark">▁▂▂▄▃▅▆▇</span><span>vs. last 30 days</span></div></div><div className="metric-card"><div className="metric-icon green-metric"><MapPin size={16} /></div><div className="metric-label">MARKETS TRACKED</div><div className="metric-value">12 <span>metros</span></div><div className="metric-foot"><span className="metric-locations"><i /><i /><i /><i /><i /></span><span>New Jersey is active</span></div></div><div className="metric-card metric-highlight"><div className="metric-label">NEXT BEST MOVE</div><div className="next-move-title"><span className="next-move-icon"><Sparkles size={15} /></span>Lead with the signal</div><p>Start with the change, not the pitch.</p><button onClick={() => setSelectedLead(leads[0])}>View recommendation<ArrowRight size={14} /></button><div className="metric-orbit" aria-hidden="true" /></div></section>
        <SearchControls industry={industry} metro={metro} query={query} onIndustry={setIndustry} onMetro={setMetro} onQuery={setQuery} onSearch={runSearch} />
        <section className="leads-section"><div className="leads-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> THE PIPELINE</div><h2>{isSavedView ? 'Saved opportunities' : activeNav === 'Market signals' ? 'Market signals' : 'Priority leads'} <span>{filteredLeads.length.toString().padStart(2, '0')}</span></h2></div><div className="lead-toolbar"><span className="sort-label"><ArrowDownUp size={14} />SORT BY</span><button className="sort-button">Highest fit <ChevronDown size={14} /></button><button className="filter-button" onClick={() => { setIndustry('All industries'); setMetro('All metros'); setQuery(''); setAppliedQuery('') }}><Filter size={15} /><span>Clear</span></button></div></div>
          <div className="pipeline-caption"><span>{searchRun ? 'SEARCH RESULTS' : 'CURATED FOR YOUR WORKSPACE'}</span><span><Clock3 size={13} /> Updated 14 min ago</span></div>
          {filteredLeads.length ? <div className="lead-grid">{filteredLeads.map((lead) => <LeadCard key={lead.id} lead={lead} saved={savedIds.includes(lead.id)} onOpen={() => setSelectedLead(lead)} onToggleSaved={() => toggleSaved(lead.id)} />)}</div> : <div className="empty-state"><div className="empty-icon"><Search size={20} /></div><h3>No matching leads yet</h3><p>Try a different industry, metro, or search term.</p><button onClick={() => { setIndustry('All industries'); setMetro('All metros'); setQuery(''); setAppliedQuery('') }}>Clear your search</button></div>}
          <div className="results-footer"><span>Showing <strong>{filteredLeads.length}</strong> of 248 opportunities</span><button onClick={() => { setIndustry('All industries'); setMetro('All metros'); setAppliedQuery(''); setQuery(''); setActiveNav('Lead pipeline') }}>Explore full pipeline<ArrowRight size={14} /></button></div>
        </section>
        <footer className="workspace-footer"><span>LEADTRENCH INTELLIGENCE <i /> DATA REFRESHED AUTOMATICALLY</span><span>YOUR WORKSPACE <span className="footer-separator">/</span> V 1.0.4</span></footer>
      </div>
    </section>
    {selectedLead && <Dossier lead={selectedLead} onClose={() => setSelectedLead(null)} />}
    {settingsOpen && <SettingsPanel profile={profile} onClose={() => setSettingsOpen(false)} />}
  </main>
}

export default LeadtrenchApp
