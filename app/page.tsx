'use client'

import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Crosshair,
  Database,
  Download,
  Filter,
  Globe2,
  History,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Settings,
  Sparkles,
  Target,
  UsersRound,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import type { FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { UniversalTransmissionModal } from '@/components/universal-transmission-modal'
import { AdminUserManagement } from '@/components/admin-user-management'
import { assessOpportunity, getEvidenceConfidenceLabel, getEvidenceDateLabel, rankLeadsByOpportunity, type OpportunitySignal, type OpportunityTier } from '@/lib/opportunity-assessment'
import { getPlacePhone } from '@/lib/places-search'

type Profile = { id: string; firstName: string; lastName: string; email: string }

type DailyQuota = { searchesUsed: number; dailyLimit: number; resetsAt: string; unlimited: boolean }
type SearchHistoryItem = {
  sessionId: string
  industry: string
  city: string
  metro: string
  createdAt: string
  resultCount: number
  totalCount: number
  expiresAt: string
}
type SearchHistoryResponse = { items: SearchHistoryItem[]; error?: string }
type AdminUsageUser = { user_id: string; user_email: string; searches_used: number; daily_limit: number | null; is_admin: boolean }
type AdminUsageResponse = { users: AdminUsageUser[]; error?: string }

const ADMIN_EMAIL = 'codey@quintacore.com'

function OpportunityStatusBadge({ tier, compact = false }: { tier: OpportunityTier; compact?: boolean }) {
  const statusClass = tier === 'TO WATCH' ? 'watch' : tier.toLowerCase()

  return (
    <span className={`opportunity-status-badge status-glow status-glow-${statusClass}${compact ? ' opportunity-status-compact' : ''}`}>
      <span className="status-glow-mark" aria-hidden="true" />
      {tier}
    </span>
  )
}

function profileFromUser(user: User): Profile {
  const email = user.email ?? ''
  const firstName = typeof user.user_metadata.first_name === 'string'
    ? user.user_metadata.first_name
    : email.split('@')[0] || 'Lead'
  const lastName = typeof user.user_metadata.last_name === 'string' ? user.user_metadata.last_name : ''
  return { id: user.id, firstName, lastName, email }
}

function getAuthErrorMessage(error: { code?: string; status?: number }, mode: 'signup' | 'signin') {
  if (error.code === 'email_not_confirmed') return 'Confirm your email using the link we sent before signing in.'
  if (error.code === 'weak_password') return 'Choose a stronger password with at least 8 characters.'
  if (error.status === 429 || error.code === 'over_request_rate_limit') return 'Too many attempts. Wait a moment, then try again.'
  return mode === 'signup'
    ? 'We could not create this account. Check your details and try again.'
    : 'We could not sign you in. Check your email and password, then try again.'
}
type Lead = {
  id: string
  company: string
  initials: string
  industry: string
  address: string
  officeHoursStatus: string
  statusTone: 'open' | 'closed' | 'unknown'
  businessStatus: string
  website?: string
  phone?: string
  color: string
  saved: boolean
  needSignals: OpportunitySignal[]
}

type HunterContact = {
  name: string
  email: string
  position: string
}

type PlacesSearchResult = {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  websiteUri?: string
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  businessStatus?: string
  currentOpeningHours?: { openNow?: boolean }
  needSignals?: OpportunitySignal[]
}

function getOfficeHoursStatus(place: PlacesSearchResult) {
  if (place.businessStatus === 'CLOSED_TEMPORARILY') {
    return { label: 'TEMPORARILY CLOSED', tone: 'closed' as const }
  }

  if (place.businessStatus === 'CLOSED_PERMANENTLY') {
    return { label: 'PERMANENTLY CLOSED', tone: 'closed' as const }
  }

  if (typeof place.currentOpeningHours?.openNow === 'boolean') {
    return {
      label: place.currentOpeningHours.openNow ? 'OPEN NOW' : 'CLOSED NOW',
      tone: place.currentOpeningHours.openNow ? 'open' as const : 'closed' as const,
    }
  }

  if (place.businessStatus === 'OPERATIONAL') {
    return { label: 'OPERATIONAL', tone: 'open' as const }
  }

  return { label: 'HOURS UNAVAILABLE', tone: 'unknown' as const }
}

function getSafeWebsite(value?: string) {
  if (!value) return undefined

  try {
    const website = new URL(value)
    if (!['http:', 'https:'].includes(website.protocol) || website.username || website.password) return undefined
    return website.href
  } catch {
    return undefined
  }
}

function getPhoneLink(value: string) {
  return `tel:${value.replace(/[^\d+]/g, '')}`
}

async function fetchHunterContacts(url: string): Promise<HunterContact[]> {
  const response = await fetch(url, { cache: 'no-store' })
  const data = (await response.json()) as { contacts?: HunterContact[]; error?: string }

  if (!response.ok) throw new Error(data.error || 'Hunter could not find verified executive contacts.')
  return data.contacts ?? []
}

function mapPlacesToLeads(places: PlacesSearchResult[], industry: string): Lead[] {
  const colors = ['cyan', 'violet', 'blue', 'orange', 'green', 'pink', 'lime']

  return places
    .filter((place) => place.id && place.displayName?.text)
    .map((place, index) => {
      const company = place.displayName!.text!
      const hours = getOfficeHoursStatus(place)

      return {
        id: place.id!,
        company,
        initials: company.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase(),
        industry: industry === 'All industries' ? 'Business' : industry,
        address: place.formattedAddress ?? 'Address unavailable',
        officeHoursStatus: hours.label,
        statusTone: hours.tone,
        businessStatus: place.businessStatus ?? 'UNKNOWN',
        website: getSafeWebsite(place.websiteUri),
        phone: getPlacePhone(place),
        color: colors[index % colors.length],
        saved: false,
        needSignals: place.needSignals ?? [],
      }
    })
}

function getLeadAssessment(lead: Lead) {
  return assessOpportunity(lead.needSignals, Date.now(), { company: lead.company, industry: lead.industry })
}

function getOpportunityScore(lead: Lead) {
  return getLeadAssessment(lead).score
}

function getLeadTier(lead: Lead) {
  return getLeadAssessment(lead).tier
}

function getLeadSignal(lead: Lead) {
  return getLeadAssessment(lead).signal
}

function getLeadTierSummary(lead: Lead) {
  const assessment = getLeadAssessment(lead)
  if (assessment.tier === 'HOT') {
    const hasOperationsHiring = assessment.evidence.some(
      (signal) => signal.kind === 'operations_hiring' || signal.kind === 'administrative_hiring',
    )
    return hasOperationsHiring ? 'Strong recent operations or administrative hiring' : 'Strong verified operational-need evidence'
  }
  if (assessment.tier === 'WARM') return 'Verified need signal with lower relevance or recency'
  return assessment.evidence.length ? 'Need evidence is stale or lower relevance' : 'No verified need signal yet'
}

function getLeadInsights(lead: Lead) {
  const assessment = getLeadAssessment(lead)
  const explanation = assessment.evidence.length
    ? 'The linked source verifies the signal; any workload or process effect not stated in the posting remains an inference.'
    : 'No hiring or workflow source was found. Google Places directory data does not verify operational need.'
  return { bottleneck: assessment.bottleneck, opportunity: assessment.opportunity, explanation, recommendation: assessment.recommendation }
}

function makeOutreach(lead: Lead, firstName: string) {
  const assessment = getLeadAssessment(lead)
  const signal = assessment.evidence[0]
  const recommendation = assessment.recommendation
  const roleContext = signal
    ? `I noticed the official source lists “${signal.title}”.`
    : 'I’m reaching out to learn how your team currently handles recurring operational work.'
  const emailBody = recommendation.supported
    ? `${roleContext} The posting names ${recommendation.tasks.join(', ')}. We provide ${recommendation.service} to cover that work while the role is being filled. ${recommendation.valueProposition}`
    : `${roleContext} I don’t want to assume what support would be useful from the signal alone. Before suggesting a service, I���d like to verify the responsibilities and workload described below.`
  const suggestedService = recommendation.supported
    ? recommendation.service
    : 'Needs further verification — no service proposed'
  const valueProposition = recommendation.supported
    ? recommendation.valueProposition
    : 'The detected signal alone does not support a specific service pitch. Verify the named responsibilities or workload first.'

  return [
    `Suggested service: ${suggestedService}`,
    `Specific value: ${valueProposition}`,
    `Personalized opening: ${roleContext}`,
    `Email: Hi ${lead.company} team,\n\n${emailBody}\n\nBest,\n${firstName || 'Your name'}`,
    `Call to action: ${recommendation.nextStep}`,
  ].join('\n\n')
}

const newIndustryFilters = [
  'Accounting & Tax Services',
  'Architecture & Engineering',
  'Agriculture & Agribusiness',
  'Business Consulting',
  'Childcare & Early Learning',
  'Veterinary & Animal Care',
  'Entertainment & Media',
  'Security & Facilities Management',
  'Wholesale & Distribution',
  'Personal Care & Wellness',
]

const industries = [
  'All industries',
  'Commercial Real Estate',
  'Healthcare & Medical',
  'Financial Services',
  'Legal Services',
  'Technology & SaaS',
  'Construction & Trades',
  'Manufacturing',
  'Logistics & Supply Chain',
  'Retail & E-commerce',
  'Hospitality & Hotels',
  'Education & Training',
  'Marketing & Advertising',
  'Insurance',
  'Automotive',
  'Home Services',
  'Energy & Utilities',
  'Food & Beverage',
  'Staffing & Recruiting',
  'Nonprofit & Associations',
  'Telecommunications',
  ...newIndustryFilters,
]

const newMetroFilters = [
  'Portland, Oregon',
  'Minneapolis, Minnesota',
  'Detroit, Michigan',
  'Cleveland, Ohio',
  'Columbus, Ohio',
  'Indianapolis, Indiana',
  'St. Louis, Missouri',
  'Kansas City, Missouri',
  'Baltimore, Maryland',
  'Pittsburgh, Pennsylvania',
  'Richmond, Virginia',
  'Tampa, Florida',
  'Orlando, Florida',
  'Jacksonville, Florida',
  'New Orleans, Louisiana',
  'Oklahoma City, Oklahoma',
  'Salt Lake City, Utah',
  'Las Vegas, Nevada',
  'San Jose, California',
  'Sacramento, California',
]

const metros = [
  'All metros',
  'Newark, NJ (North)',
  'Edison, NJ (Central)',
  'Cherry Hill, NJ (South)',
  'New York, NY',
  'Philadelphia, PA',
  'Boston, MA',
  'Washington, DC',
  'Chicago, IL',
  'Atlanta, GA',
  'Miami, FL',
  'Dallas, TX',
  'Austin, TX',
  'Houston, TX',
  'Denver, CO',
  'Seattle, WA',
  'San Francisco, CA',
  'Los Angeles, CA',
  'San Diego, CA',
  'Phoenix, AZ',
  'Charlotte, NC',
  'Nashville, TN',
  ...newMetroFilters,
]

const industryFilterCount = industries.length - 1
const metroFilterCount = metros.length - 1
const newIndustryFilterCount = newIndustryFilters.length
const newMetroFilterCount = newMetroFilters.length

export default function LeadtrenchApp() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup')
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [industry, setIndustry] = useState('All industries')
  const [metro, setMetro] = useState('Newark, NJ (North)')
  const [appliedIndustry, setAppliedIndustry] = useState('All industries')
  const [appliedMetro, setAppliedMetro] = useState('Newark, NJ (North)')
  const [leads, setLeads] = useState<Lead[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searchLimitReached, setSearchLimitReached] = useState(false)
  const [noNewResults, setNoNewResults] = useState(false)
  const [quota, setQuota] = useState<DailyQuota | null>(null)
  const [resultSessionId, setResultSessionId] = useState<string | null>(null)
  const [hasMoreResults, setHasMoreResults] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [openingHistoryId, setOpeningHistoryId] = useState<string | null>(null)
  const searchController = useRef<AbortController | null>(null)
  const searchRequest = useRef<{ requestId: string; industry: string; metro: string } | null>(null)
  const pageRequestId = useRef<string | null>(null)
  const isPagingResults = useRef(false)
  const [activeLead, setActiveLead] = useState<Lead | null>(null)
  const hunterUrl = activeLead?.website
    ? `/api/hunter-domain-search?website=${encodeURIComponent(activeLead.website)}`
    : null
  const { data: hunterContacts, error: hunterError, isLoading: isHunterLoading } = useSWR(
    hunterUrl,
    fetchHunterContacts,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const [outreach, setOutreach] = useState('')
  const [copied, setCopied] = useState(false)
  const [activeNav, setActiveNav] = useState('Overview')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [userManagementOpen, setUserManagementOpen] = useState(false)
  const [adminPanelTab, setAdminPanelTab] = useState<'users' | 'feedback'>('users')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({})
  const [savingLimitFor, setSavingLimitFor] = useState<string | null>(null)
  const isMasterAdmin = profile?.email.toLowerCase() === ADMIN_EMAIL
  const quotaKey = profile ? `/api/places?account=${encodeURIComponent(profile.id)}` : null
  const { data: quotaStatus, isLoading: isQuotaLoading } = useSWR<{ quota: DailyQuota }>(
    quotaKey,
    async (url: string) => {
      const response = await fetch(url, { cache: 'no-store' })
      const data = (await response.json()) as { quota?: DailyQuota; error?: string }
      if (!response.ok || !data.quota) throw new Error(data.error || 'Daily result usage could not be loaded.')
      return { quota: data.quota }
    },
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const currentQuota = quota ?? quotaStatus?.quota
  const historyKey = profile ? '/api/places/history' : null
  const { data: searchHistory, error: searchHistoryError, isLoading: isSearchHistoryLoading, mutate: refreshSearchHistory } = useSWR<SearchHistoryResponse>(
    historyKey,
    async (url: string) => {
      const response = await fetch(url, { cache: 'no-store' })
      const data = (await response.json()) as SearchHistoryResponse
      if (!response.ok) throw new Error(data.error || 'Search history could not be loaded.')
      return data
    },
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const adminUsageKey = isMasterAdmin && settingsOpen ? '/api/admin/usage' : null
  const { data: adminUsage, error: adminUsageError, isLoading: adminUsageLoading, mutate: refreshAdminUsage } = useSWR<AdminUsageResponse>(
    adminUsageKey,
    async (url: string) => {
      const response = await fetch(url, { cache: 'no-store' })
      const data = (await response.json()) as AdminUsageResponse
      if (!response.ok) throw new Error(data.error || 'Usage could not be loaded.')
      return data
    },
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )

  useEffect(() => {
    const client = createSupabaseClient()
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setProfile(session?.user ? profileFromUser(session.user) : null)
      setQuota(null)
      setIsReady(true)
    })

    void client.auth.getUser().then(({ data, error }) => {
      if (!error) {
        setProfile(data.user ? profileFromUser(data.user) : null)
        setQuota(null)
      }
      setIsReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    async function recordPageView() {
      try {
        await fetch('/api/admin/pageviews', { method: 'POST' })
      } catch (error) {
        console.error('[pageview] Failed to record page view:', error)
      }
    }
    void recordPageView()
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    if (!activeLead && !settingsOpen && !userManagementOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveLead(null)
        setSettingsOpen(false)
        setUserManagementOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeLead, settingsOpen, userManagementOpen])

  const visibleLeads = useMemo(() => {
    let filtered = leads
    if (activeNav === 'Saved leads') filtered = filtered.filter((lead) => lead.saved)
    if (appliedIndustry !== 'All industries') filtered = filtered.filter((lead) => lead.industry === appliedIndustry)
    return filtered
  }, [activeNav, appliedIndustry, leads])
  const sourcedNeedSignalCount = visibleLeads.filter((lead) => getLeadAssessment(lead).evidence.length > 0).length

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError('')
    setAuthNotice('')
    setIsAuthenticating(true)

    try {
      const client = createSupabaseClient()
      const normalizedEmail = email.trim().toLowerCase()
      if (authMode === 'signup') {
        const { data, error } = await client.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`,
            data: { first_name: firstName.trim(), last_name: lastName.trim() },
          },
        })

        if (error) {
          setAuthError(getAuthErrorMessage(error, 'signup'))
          return
        }

        if (data.session && data.user) {
          setProfile(profileFromUser(data.user))
          setPassword('')
        } else {
          setAuthNotice('If this address can be registered, a confirmation link will arrive by email. Confirm it before signing in.')
        }
        return
      }

      const { data, error } = await client.auth.signInWithPassword({ email: normalizedEmail, password })
      if (error) {
        setAuthError(getAuthErrorMessage(error, 'signin'))
        return
      }
      if (data.user) setProfile(profileFromUser(data.user))
      setPassword('')
    } catch {
      setAuthError('Authentication is temporarily unavailable. Please try again.')
    } finally {
      setIsAuthenticating(false)
    }
  }

  async function signOut() {
    try {
      const client = createSupabaseClient()
      const { error } = await client.auth.signOut()
      if (error) {
        setToast('Sign out failed. Please try again.')
        return
      }
      setProfile(null)
      setAuthMode('signin')
      setPassword('')
      setAuthError('')
      setAuthNotice('')
    } catch {
      setToast('Sign out failed. Please try again.')
    }
  }

  async function searchPlaces() {
    if (isSearching || searchController.current) return

    const searchIndustry = industry
    const selectedCity = metro === 'All metros' ? '' : metro.replace(/\s+\([^)]*\)$/, '').trim()
    setAppliedIndustry(searchIndustry)
    setAppliedMetro(metro)
    setActiveNav('Pipeline')
    setHasSearched(true)
    setSearchError('')
    setSearchLimitReached(false)
    setNoNewResults(false)
    setResultSessionId(null)
    pageRequestId.current = null
    setHasMoreResults(false)
    setIsSearching(true)
    const controller = new AbortController()
    const previousRequest = searchRequest.current
    const requestId = previousRequest?.industry === searchIndustry && previousRequest.metro === metro
      ? previousRequest.requestId
      : crypto.randomUUID()
    searchRequest.current = { requestId, industry: searchIndustry, metro }
    searchController.current = controller

    try {
      const response = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry: searchIndustry, city: selectedCity, requestId }),
        signal: controller.signal,
      })
      const data = (await response.json()) as { places?: PlacesSearchResult[]; resultToken?: string; error?: string; message?: string; code?: string; quota?: DailyQuota }
      if (data.quota) setQuota(data.quota)

      if (!response.ok) {
        setSearchLimitReached(data.code === 'DAILY_SEARCH_LIMIT' || data.error === 'QUOTA_EXCEEDED')
        throw new Error(data.message || data.error || 'Google Places search failed. Please try again.')
      }

      const rankedPlaces = rankLeadsByOpportunity(mapPlacesToLeads(data.places ?? [], searchIndustry))
      if (!data.resultToken) throw new Error('Google Places results could not be verified. Try the search again.')
      const pageResponse = await fetch('/api/places/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          places: rankedPlaces,
          resultToken: data.resultToken,
          searchContext: { industry: searchIndustry, city: selectedCity || 'All metros', metro },
        }),
        signal: controller.signal,
      })
      const pageData = (await pageResponse.json()) as { sessionId?: string; places?: Lead[]; quota?: DailyQuota; hasMore?: boolean; code?: string; error?: string }
      if (!pageResponse.ok || !pageData.sessionId) {
        setSearchLimitReached(pageResponse.status === 429 || pageData.code === 'DAILY_SEARCH_LIMIT')
        throw new Error(pageData.error || 'Ranked results could not be loaded.')
      }
      const firstPage = pageData.places ?? []
      setLeads(firstPage)
      setResultSessionId(pageData.sessionId)
      setHasMoreResults(pageData.hasMore ?? false)
      setNoNewResults(rankedPlaces.length > 0 && firstPage.length === 0)
      if (pageData.quota) setQuota(pageData.quota)
      searchRequest.current = null
      void refreshSearchHistory()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setLeads([])
      setSearchError(error instanceof Error ? error.message : 'Google Places search failed. Please try again.')
    } finally {
      if (searchController.current === controller) {
        searchController.current = null
        setIsSearching(false)
      }
    }
  }

  async function loadMoreResults() {
    if (!resultSessionId || !hasMoreResults || isPagingResults.current) return
    isPagingResults.current = true
    setIsLoadingMore(true)
    try {
      const requestId = pageRequestId.current ?? crypto.randomUUID()
      pageRequestId.current = requestId
      const response = await fetch('/api/places/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: resultSessionId, requestId }),
      })
      const data = (await response.json()) as { places?: Lead[]; quota?: DailyQuota; hasMore?: boolean; error?: string }
      if (!response.ok) throw new Error(data.error || 'The next results could not be loaded.')
      const nextPage = data.places ?? []
      setLeads((current) => {
        const seenIds = new Set(current.map((lead) => lead.id))
        const uniqueNextPage = nextPage.filter((lead) => {
          if (seenIds.has(lead.id)) return false
          seenIds.add(lead.id)
          return true
        })
        return [...current, ...uniqueNextPage]
      })
      setHasMoreResults(data.hasMore ?? false)
      pageRequestId.current = null
      if (data.quota) setQuota(data.quota)
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'The next results could not be loaded.')
    } finally {
      isPagingResults.current = false
      setIsLoadingMore(false)
    }
  }

  async function openSearchHistory(item: SearchHistoryItem) {
    setOpeningHistoryId(item.sessionId)
    try {
      const response = await fetch(`/api/places/history?sessionId=${encodeURIComponent(item.sessionId)}`, { cache: 'no-store' })
      const data = (await response.json()) as {
        places?: Lead[]
        context?: { industry: string; city: string; metro: string }
        error?: string
      }
      if (!response.ok || !data.context) throw new Error(data.error || 'This search could not be reopened.')

      const restoredIndustry = industries.includes(data.context.industry) ? data.context.industry : 'All industries'
      const restoredMetro = metros.includes(data.context.metro) ? data.context.metro : 'All metros'
      setIndustry(restoredIndustry)
      setMetro(restoredMetro)
      setAppliedIndustry('All industries')
      setAppliedMetro(restoredMetro)
      setLeads(data.places ?? [])
      setResultSessionId(null)
      pageRequestId.current = null
      searchRequest.current = null
      setHasMoreResults(false)
      setHasSearched(true)
      setNoNewResults(false)
      setSearchError('')
      setActiveNav('Pipeline')
      setMobileNavOpen(false)
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'This search could not be reopened.')
    } finally {
      setOpeningHistoryId(null)
    }
  }

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void searchPlaces()
  }

  function resetSearch() {
    searchController.current?.abort()
    searchController.current = null
    searchRequest.current = null
    pageRequestId.current = null
    setIsSearching(false)
    setIndustry('All industries')
    setMetro('All metros')
    setAppliedIndustry('All industries')
    setAppliedMetro('All metros')
    setActiveNav('Pipeline')
    setLeads([])
    setSearchError('')
    setSearchLimitReached(false)
    setNoNewResults(false)
    setResultSessionId(null)
    setHasMoreResults(false)
    setHasSearched(false)
  }

  function toggleSaved(leadId: string) {
    setLeads((current) => current.map((lead) => lead.id === leadId ? { ...lead, saved: !lead.saved } : lead))
    setActiveLead((current) => current?.id === leadId ? { ...current, saved: !current.saved } : current)
  }

  function openDossier(lead: Lead) {
    setActiveLead(lead)
    setOutreach(makeOutreach(lead, profile?.firstName ?? ''))
    setCopied(false)
  }


  async function copyOutreach() {
    if (!outreach) return
    try {
      await navigator.clipboard.writeText(outreach)
      setCopied(true)
      setToast('Outreach message copied to clipboard')
    } catch {
      setToast('Clipboard access is unavailable in this browser')
    }
  }

  async function saveDailyLimit(user: AdminUsageUser) {
    const draft = limitDrafts[user.user_id] ?? String(user.daily_limit ?? 15)
    const dailyLimit = Number(draft)
    if (!draft.trim() || !Number.isInteger(dailyLimit) || dailyLimit < 0 || dailyLimit > 1000) {
      setToast('Enter a whole-number limit from 0 to 1000')
      return
    }

    setSavingLimitFor(user.user_id)
    try {
      const response = await fetch('/api/admin/limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.user_id, dailyLimit }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Search limit could not be saved.')
      await refreshAdminUsage()
      setToast(`Daily limit updated for ${user.user_email}`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Search limit could not be saved.')
    } finally {
      setSavingLimitFor(null)
    }
  }

  function printReport() {
    window.print()
  }

  if (!isReady) {
    return <main className="boot-screen"><div className="boot-mark"><Crosshair size={19} /><span>LEAD<span className="accent-text">TRENCH</span></span></div><span className="boot-line" /></main>
  }

  if (!profile) {
    return (
      <main className="auth-screen">
        <div className="ambient-orb ambient-orb-one" />
        <div className="ambient-orb ambient-orb-two" />
        <div className="auth-layout">
        <section className="auth-card" aria-labelledby="auth-heading">
          <div className="brand-lockup"><span className="brand-symbol"><Crosshair size={20} strokeWidth={1.7} /></span><span>LEAD<span className="accent-text">TRENCH</span></span></div>
          <div className="auth-eyebrow"><span className="live-dot" /> BUSINESS INTELLIGENCE FOR THE NEXT MOVE</div>
          <h1 id="auth-heading">DIG WHERE THE<br /><span>OPPORTUNITY HIDES</span></h1>
          <p className="auth-description">{industryFilterCount} industry filters and {metroFilterCount} city filters, including {newIndustryFilterCount} new industries and {newMetroFilterCount} new cities. Sign in to search them.</p>
          <div className="auth-tabs" role="tablist" aria-label="Profile access">
            <button className={authMode === 'signup' ? 'auth-tab active' : 'auth-tab'} type="button" onClick={() => { setAuthMode('signup'); setAuthError(''); setAuthNotice('') }}>Create profile</button>
            <button className={authMode === 'signin' ? 'auth-tab active' : 'auth-tab'} type="button" onClick={() => { setAuthMode('signin'); setAuthError(''); setAuthNotice('') }}>Sign in</button>
          </div>
          <form className="auth-form" onSubmit={handleAuth}>
            {authMode === 'signup' && <div className="name-fields"><label className="field-label">First name<input autoComplete="given-name" maxLength={60} required value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Alex" /></label><label className="field-label">Last name<input autoComplete="family-name" maxLength={60} required value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Morgan" /></label></div>}
            <label className="field-label">Email address<span className="input-wrap"><Mail size={16} /><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></span></label>
            <label className="field-label">Password<span className="input-wrap"><LockKeyhole size={16} /><input type="password" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></span></label>
            {authError && <p className="form-error" role="alert">{authError}</p>}
            {authNotice && <p className="form-notice" role="status">{authNotice}</p>}
            <button type="submit" className="primary-button auth-submit" disabled={isAuthenticating} aria-busy={isAuthenticating}>{isAuthenticating ? 'Verifying account…' : authMode === 'signup' ? 'Create profile' : 'Enter workspace'}<ArrowRight size={16} /></button>
          </form>
          <div className="local-note"><ShieldCheck size={14} /><p>Secure sign-in with Supabase Auth. Passwords are encrypted and never stored in your browser.</p></div>
          <div className="auth-foot"><span>LEADTRENCH INTELLIGENCE PLATFORM</span><span>BUILT FOR THE NEXT MOVE</span></div>
        </section>
        <aside className="auth-feature-panel" aria-labelledby="auth-feature-heading">
          <div className="auth-feature-heading"><div className="auth-feature-kicker"><span className="live-dot" /> HOW LEADTRENCH WORKS</div><h2 id="auth-feature-heading">From market coverage to a more relevant conversation.</h2><p>Move from a focused local search to the context behind a business.</p></div>
          <div className="auth-preview-window">
            <div className="auth-preview-topbar"><span>OPPORTUNITY DISCOVERY</span><span><i /> SIGNAL PREVIEW</span></div>
            <div className="auth-preview-streams"><div><strong>{industryFilterCount}</strong><span>INDUSTRY FILTERS</span></div><div className="auth-preview-industry-grid"><span>Healthcare</span><span>Real estate</span><span>Manufacturing</span><span>+ {industryFilterCount - 3} more</span></div></div>
            <div className="auth-preview-regions"><span>NEW JERSEY PIPELINE FILTERS</span><div><span>North · Newark</span><span>Central · Edison</span><span>South · Cherry Hill</span></div></div>
            <section className="auth-preview-additions" aria-label="New industry and city filters">
              <div><span className="auth-preview-additions-label">{newIndustryFilterCount} NEW INDUSTRIES</span><div className="auth-preview-additions-list">{newIndustryFilters.map((filter) => <span key={filter}>{filter}</span>)}</div></div>
              <div><span className="auth-preview-additions-label">{newMetroFilterCount} NEW CITIES · {metroFilterCount} TOTAL</span><div className="auth-preview-additions-list">{newMetroFilters.map((filter) => <span key={filter}>{filter}</span>)}</div></div>
            </section>
            <button className="auth-preview-lead" type="button" aria-expanded={previewOpen} onClick={() => setPreviewOpen((current) => !current)}><span className="auth-preview-company"><span className="auth-preview-mark">SE</span><span><strong>SaaS Enterprise Node</strong><small>Technology · Newark, NJ</small></span></span><span>{previewOpen ? 'CLOSE DOSSIER' : 'OPEN DOSSIER'}<ArrowUpRight size={13} /></span></button>
            <section className="auth-results-preview" aria-label="Anonymized company search results">
              <div className="auth-results-toolbar"><span><i /> OPERATIONAL SIGNALS</span><span>ANONYMIZED BUSINESS DATA</span></div>
              <div className="auth-results-grid" role="table" aria-label="Anonymized company signal records">
                <div className="auth-results-header" role="row"><span role="columnheader">BUSINESS</span><span role="columnheader">INDUSTRY SIGNAL</span><span role="columnheader">STATUS</span></div>
                <div className="auth-result-row" role="row"><span className="auth-result-company" role="cell">Logistics Infrastructure Corp</span><span className="auth-result-stream" role="cell">Logistics<span>Fleet expansion</span></span><span className="signal-badge status-glow status-glow-hot" role="cell" aria-label="Hot signal"><span className="status-glow-mark" aria-hidden="true" />HOT SIGNAL</span></div>
                <div className="auth-result-row" role="row"><span className="auth-result-company" role="cell">SaaS Enterprise Node</span><span className="auth-result-stream" role="cell">Technology<span>Team growth</span></span><span className="signal-badge status-glow status-glow-warm" role="cell" aria-label="Warm signal"><span className="status-glow-mark" aria-hidden="true" />WARM SIGNAL</span></div>
                <div className="auth-result-row" role="row"><span className="auth-result-company" role="cell">Regional Manufacturing Group</span><span className="auth-result-stream" role="cell">Manufacturing<span>New operations</span></span><span className="signal-badge status-glow status-glow-watch" role="cell" aria-label="To watch"><span className="status-glow-mark" aria-hidden="true" />TO WATCH</span></div>
              </div>
              <div className="auth-results-foot"><span><i /> 3 anonymized businesses</span><span>{industryFilterCount} industry filters · {metroFilterCount} city filters</span></div>
            </section>
            {previewOpen && <div className="auth-preview-dossier"><div className="auth-preview-dossier-head"><span><ShieldCheck size={13} /> EXECUTIVE DOSSIER</span><span>LIVE LISTING</span></div><strong>Executive contacts and company context</strong><p>Open a result to review its business details, available executive contacts, and a message tailored to the company signal.</p><div className="auth-preview-message"><span>OUTREACH MESSAGE GENERATOR</span><p>“I noticed your team is expanding…”</p></div></div>}
          </div>
          <div className="auth-feature-foot"><span>01</span><span>Filter a region</span><i /><span>02</span><span>Open a business</span><i /><span>03</span><span>Build your message</span></div>
        </aside>
        </div>
        <section className="founder-manifesto" aria-labelledby="founder-manifesto-heading">
          <div className="founder-manifesto-inner">
            <h2 id="founder-manifesto-heading">A NOTE FROM THE FOUNDER</h2>
            <p>The mainstream data market is fundamentally broken. For years, platforms have buried businesses under massive, messy lists of cold, unverified phone numbers and bulk-scraped garbage, forcing you to waste weeks guessing where to look next. LeadTrench was built out of a simple goal: to change the game and actually help operators win.</p>
            <p>We did not build another bulk-scraper; we engineered a unified data intelligence engine smart enough to analyze operational blind spots, decide where the value hides, lead you straight to the correct decision-makers, and recommend your exact opening outreach message. This isn&apos;t just lead generation. This is automated telemetry that thinks ahead so you can execute with an unfair advantage.</p>
            <p>Welcome to the trench.</p>
            <footer className="founder-signature"><strong>Codey</strong><span>Founder &amp; Principal Systems Architect, LeadTrench</span></footer>
          </div>
        </section>
        <div className="auth-side-note"><span>LEADTRENCH INTELLIGENCE</span><span>INTELLIGENCE THAT MOVES WITH YOU</span></div>
      </main>
    )
  }

  return (
    <main className="dashboard-shell">
      <div className="background-mesh" aria-hidden="true" />
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-top">
          <a className="brand-lockup sidebar-brand" href="#overview" onClick={() => { setActiveNav('Overview'); setMobileNavOpen(false) }}><span className="brand-symbol"><Crosshair size={19} strokeWidth={1.7} /></span><span>LEAD<span className="accent-text">TRENCH</span></span></a>
          <div className="workspace-pill"><span className="workspace-avatar">{profile.firstName.slice(0, 1).toUpperCase()}</span><span className="workspace-name">{profile.firstName}&apos;s workspace</span></div>
          <div className="nav-label">WORKSPACE</div>
          <nav className="side-nav" aria-label="Main navigation">
            <button className={`nav-item ${activeNav === 'Overview' ? 'selected' : ''}`} onClick={() => { setActiveNav('Overview'); setMobileNavOpen(false) }}><LayoutDashboard size={17} /><span>Overview</span></button>
            <button className={`nav-item ${activeNav === 'Pipeline' ? 'selected' : ''}`} onClick={() => { setActiveNav('Pipeline'); setMobileNavOpen(false) }}><Crosshair size={17} /><span style={{ fontWeight: 600 }}>Lead Pipeline</span><span className="nav-count">{leads.length}</span></button>
            <button className={`nav-item ${activeNav === 'Saved leads' ? 'selected' : ''}`} onClick={() => { setActiveNav('Saved leads'); setAppliedIndustry('All industries'); setAppliedMetro('All metros'); setMobileNavOpen(false) }}><Target size={17} /><span>Saved leads</span><span className="nav-count">{leads.filter((lead) => lead.saved).length}</span></button>
            <button className={`nav-item ${activeNav === 'Search History' ? 'selected' : ''}`} onClick={() => { setActiveNav('Search History'); setMobileNavOpen(false) }}><History size={17} /><span>Search History</span><span className="nav-count">{searchHistory?.items.length ?? 0}</span></button>
          </nav>
          <div className="nav-label tools-label">INTELLIGENCE</div>
          <nav className="side-nav" aria-label="Intelligence navigation">
            <button className="nav-item" onClick={() => setToast('Signal monitoring is active for your workspace')}><Activity size={17} /><span>Buying signals</span><span className="nav-live">LIVE</span></button>
            <button className="nav-item" onClick={() => setToast('Market insights are being prepared for your workspace')}><BarChart3 size={17} /><span>Market insights</span></button>
          </nav>
        </div>
        <div className="sidebar-bottom">
          <button className="profile-card" onClick={() => setSettingsOpen(true)} aria-label="Open profile settings"><span className="profile-avatar">{profile.firstName.slice(0, 1)}{profile.lastName.slice(0, 1)}</span><span className="profile-copy"><strong>{profile.firstName} {profile.lastName}</strong><small>Master Admin</small></span><MoreHorizontal size={17} /></button>
          {isMasterAdmin && <button className="footer-action user-management-action" onClick={() => { setAdminPanelTab('users'); setUserManagementOpen(true); setMobileNavOpen(false) }}><UsersRound size={16} /><span>Users &amp; access</span></button>}
          <button className="footer-action" onClick={() => setSettingsOpen(true)}><Settings size={16} /><span>Account settings</span></button>
          <button className="footer-action" onClick={signOut}><LogOut size={16} /><span>Sign out</span></button>
          <div className="sidebar-credit">Platform Architecture by Codey</div>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={19} /></button>
          <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={13} /><strong>{activeNav === 'Overview' ? 'Overview' : activeNav}</strong></div>
          <div className="topbar-right"><div className="system-status"><span className="live-dot" /> SYSTEMS NOMINAL</div><button className="icon-button notification-button" type="button" aria-label={isMasterAdmin ? 'Open user feedback notifications' : 'Notifications'} title={isMasterAdmin ? 'Open user feedback inbox' : 'Notifications'} onClick={() => { if (isMasterAdmin) { setAdminPanelTab('feedback'); setUserManagementOpen(true) } else { setToast('There are no new workspace notifications.') } }}><Bell size={17} /></button><span className="top-avatar">{profile.firstName.slice(0, 1)}</span></div>
        </header>

        <div className="dashboard-content">
          <div className="page-heading"><div><div className="section-kicker"><span className="live-dot" /> YOUR SIGNAL ADVANTAGE</div><h1>Hello, {profile.firstName}<span className="greeting-period">!</span></h1><p>Here&apos;s where opportunity is taking shape today.</p></div><div className="date-stamp"><span>THURSDAY</span><strong>OCT 01, 2026</strong></div></div>

          <section className="metric-grid" aria-label="Live Google Places search summary">
            <article className="metric-card"><div className="metric-heading"><span>BUSINESSES FOUND</span><span className="metric-icon"><Crosshair size={16} /></span></div><div className="metric-value">{leads.length}</div><div className="metric-foot"><span>Google Places results</span></div></article>
            <article className="metric-card"><div className="metric-heading"><span>OPEN NOW</span><span className="metric-icon"><Zap size={16} /></span></div><div className="metric-value">{leads.filter((lead) => lead.officeHoursStatus === 'OPEN NOW').length}</div><div className="metric-foot"><span>Current opening status</span></div></article>
            <article className="metric-card"><div className="metric-heading"><span>STATUS AVAILABLE</span><span className="metric-icon"><BarChart3 size={16} /></span></div><div className="metric-value">{leads.filter((lead) => lead.statusTone !== 'unknown').length}</div><div className="metric-foot"><span>Business or hours status returned</span></div></article>
            <article className="metric-card"><div className="metric-heading"><span>SEARCH REGION</span><span className="metric-icon"><Globe2 size={16} /></span></div><div className="metric-value metric-region">{appliedMetro === 'All metros' ? 'All metros' : appliedMetro.replace(/\s+\([^)]*\)$/, '')}</div><div className="metric-foot"><span>Selected Places search area</span></div></article>
          </section>

          <section className="search-panel" aria-labelledby="search-heading">
            <div className="panel-heading"><div><div className="panel-kicker"><Search size={14} /> OPPORTUNITY DISCOVERY</div><h2 id="search-heading">Search the signal.</h2></div><button className="text-button" onClick={resetSearch}>Reset search <ArrowUpRight size={14} /></button></div>
            <form className="search-form" onSubmit={applySearch}>
              <label className="select-field"><span>INDUSTRY TRACK</span><span className="select-wrap"><Building2 size={16} /><select value={industry} onChange={(event) => setIndustry(event.target.value)}>{industries.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={15} /></span></label>
              <label className="select-field"><span>METRO / REGION</span><span className="select-wrap"><MapPin size={16} /><select value={metro} onChange={(event) => setMetro(event.target.value)}>{metros.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={15} /></span></label>
              <button type="submit" className="primary-button search-button" disabled={isSearching} aria-busy={isSearching}><Search size={16} />{isSearching ? 'Searching Places…' : 'Find opportunities'}</button>
            </form>
            <div className="search-foot"><span><span className="search-foot-dot" /> GOOGLE PLACES TEXT SEARCH</span><span>{currentQuota ? currentQuota.unlimited ? 'UNLIMITED RESULTS' : `DAILY DIGGING: ${currentQuota.searchesUsed} / ${currentQuota.dailyLimit} USED · RESETS ${new Date(currentQuota.resetsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })} UTC` : isMasterAdmin ? 'UNLIMITED RESULTS' : profile ? isQuotaLoading ? 'CHECKING DAILY ALLOWANCE…' : 'DAILY ALLOWANCE UNAVAILABLE' : 'DAILY DIGGING: 0 / 15 USED · RESETS AT MIDNIGHT UTC'}</span></div>
          </section>

          {activeNav === 'Search History' ? (
            <section className="search-history-section" aria-labelledby="search-history-heading">
              <div className="search-history-heading">
                <div>
                  <div className="panel-kicker"><History size={14} /> RECENT DISCOVERY SESSIONS</div>
                  <h2 id="search-history-heading">Search History</h2>
                  <p>Reopen results you have already revealed. Sessions are retained for up to 24 hours.</p>
                </div>
                <span className="history-retention"><span className="live-dot" /> USER-SCOPED</span>
              </div>
              {isSearchHistoryLoading ? (
                <div className="search-history-state" role="status"><span className="search-loading-spinner" />Loading saved searches…</div>
              ) : searchHistoryError ? (
                <div className="search-history-state search-history-error" role="alert">{searchHistoryError.message}</div>
              ) : searchHistory?.items.length ? (
                <div className="search-history-list">
                  {searchHistory.items.map((item) => (
                    <button className="search-history-card" key={item.sessionId} type="button" onClick={() => void openSearchHistory(item)} disabled={openingHistoryId === item.sessionId} aria-busy={openingHistoryId === item.sessionId}>
                      <span className="history-card-icon"><Search size={16} /></span>
                      <span className="history-card-main">
                        <span className="history-card-title"><strong>{item.industry}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time></span>
                        <span className="history-card-location"><MapPin size={13} /><span>{item.city}</span></span>
                      </span>
                      <span className="history-card-count"><strong>{item.resultCount}</strong><span>RETURNED</span><small>{item.totalCount} MATCHED</small></span>
                      <span className="history-card-action">{openingHistoryId === item.sessionId ? 'OPENING…' : 'VIEW RESULTS'}<ArrowRight size={14} /></span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="search-history-state"><span className="empty-icon"><History size={18} /></span><strong>No recent searches yet</strong><p>Your completed searches will appear here after results are loaded.</p></div>
              )}
            </section>
          ) : (
          <section className="pipeline-section" aria-labelledby="pipeline-heading">
            <div className="pipeline-heading"><div><div className="panel-kicker"><Database size={14} /> BUSINESS LISTINGS · FIT-BASED PRIORITY</div><h2 id="pipeline-heading">{activeNav === 'Saved leads' ? 'Your saved leads' : 'Business search results'} <span className="result-count">{visibleLeads.length.toString().padStart(2, '0')}</span></h2></div><div className="pipeline-actions"><button className="print-report-button" type="button" disabled={!activeLead || isHunterLoading} onClick={printReport}><Download size={15} />[ 📥 DOWNLOAD / PRINT REPORT ]</button><button className="toolbar-button" onClick={resetSearch}><Filter size={15} /> Reset search</button></div></div>
            <div className="lead-table-wrap">{!isSearching && !searchError && visibleLeads.length > 0 && <div className="need-coverage-note" role="note"><Activity size={14} /><p>{sourcedNeedSignalCount > 0 ? <><strong>{sourcedNeedSignalCount} result{sourcedNeedSignalCount === 1 ? '' : 's'} have linked need evidence.</strong> Signals are ranked by relevance and recency; operations and administrative hiring rank highest.</> : <><strong>No verified hiring or operational-need signals were returned.</strong> Google Places provides business listings, not job postings. These businesses remain TO WATCH until a current, linked source confirms a need.</>}</p></div>}{!isSearching && !searchError && visibleLeads.length > 0 && <div className="lead-table-head"><span>BUSINESS NAME</span><span>SEARCH INDUSTRY</span><span>FORMATTED ADDRESS</span><span>FIT SCORE / PRIORITY</span><span>VERIFIED NEED SIGNAL</span><span>OFFICE HOURS STATUS</span><span aria-label="Actions" /></div>}
              {isSearching ? <div className="search-loading" role="status"><span className="search-loading-spinner" /><span>Searching Google Places…</span></div> : searchError ? <div className="empty-state" role="alert"><strong className="empty-state-error">{searchLimitReached ? 'DAILY RESULT LIMIT REACHED' : 'SEARCH UNAVAILABLE'}</strong><p>{searchLimitReached ? 'You’ve reached your daily digging limit. Come back tomorrow for more opportunities.' : searchError}</p><button className="text-button" onClick={() => void searchPlaces()}>Try search again <ArrowRight size={14} /></button></div> : visibleLeads.length ? <div className="lead-list">{visibleLeads.map((lead) => <article className="lead-row" key={lead.id} role="button" tabIndex={0} onClick={() => openDossier(lead)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDossier(lead) } }} aria-label={`Open Google Places details for ${lead.company}`}>
                <div className="company-cell"><span className={`company-mark mark-${lead.color}`}>{lead.initials}</span><span className="company-copy"><strong>{lead.company}</strong><small>Google Places business listing{lead.phone && <> <span aria-hidden="true">·</span> <span className="result-phone">{lead.phone}</span></>}</small></span></div>
                <span className="industry-cell">{lead.industry}</span><span className="location-cell"><MapPin size={13} /><span className="address-text">{lead.address}</span></span><span className="score-cell" aria-label={`${getLeadTier(lead)} priority, fit score ${getOpportunityScore(lead)} out of 100`}><OpportunityStatusBadge tier={getLeadTier(lead)} /><strong>{getOpportunityScore(lead)}</strong></span><span className={`signal-cell ${getLeadAssessment(lead).evidence.length ? 'signal-verified' : 'signal-unverified'}`} title={getLeadSignal(lead)}><i />{getLeadSignal(lead)}</span><span className={`office-status status-${lead.statusTone}`}><i />{lead.officeHoursStatus}</span><button className={`save-lead-button ${lead.saved ? 'is-saved' : ''}`} aria-label={lead.saved ? `Remove ${lead.company} from saved leads` : `Save ${lead.company}`} onClick={(event) => { event.stopPropagation(); toggleSaved(lead.id) }}><Target size={16} /></button>
              </article>)}</div> : noNewResults ? <div className="empty-state"><strong>No new businesses in this search</strong><p>Matching businesses you have already revealed today are not shown or counted twice. Try a different location or industry.</p></div> : activeNav === 'Saved leads' ? <div className="empty-state"><span className="empty-icon"><Search size={20} /></span><strong>No saved businesses yet</strong><p>Save a Google Places result to keep it in your list.</p></div> : hasSearched ? <div className="empty-state zero-results" role="status"><strong>NO BUSINESS LISTINGS MATCHED</strong><p>No business listings matched this industry and location. Try broadening your search.</p><button className="text-button" onClick={resetSearch}>Reset search <ArrowRight size={14} /></button></div> : <div className="empty-state"><span className="empty-icon"><Search size={20} /></span><strong></strong><p>Choose an industry and market to load live business listings.</p></div>}
            </div>
            <footer className="table-footer"><span><strong>{visibleLeads.length}</strong> RANKED BUSINESSES REVEALED</span>{hasMoreResults && <button className="dig-deeper-button" type="button" onClick={() => void loadMoreResults()} disabled={isLoadingMore} aria-busy={isLoadingMore}>{isLoadingMore ? 'LOADING NEXT RESULTS…' : 'DIG DEEPER →'}</button>}</footer>
          </section>
          )}
          <footer className="main-footer"><span>LEADTRENCH INTELLIGENCE <i /> BUILT FOR YOUR NEXT MOVE</span><span>DIG WHERE THE OPPORTUNITY HIDES</span></footer>
        </div>
      </section>

      {activeLead && <div className="drawer-layer"><button className="drawer-scrim" aria-label="Close business details" onClick={() => setActiveLead(null)} /><aside className="dossier-drawer" role="dialog" aria-modal="true" aria-labelledby="dossier-title"><div className="drawer-topline"><span><span className="live-dot" /> DOSSIER INTEL SYSTEM</span><button className="icon-button" aria-label="Close business details" onClick={() => setActiveLead(null)}><X size={18} /></button></div><div className="drawer-scroll"><div className="dossier-company"><span className={`company-mark dossier-mark mark-${activeLead.color}`}>{activeLead.initials}</span><span className="dossier-industry">{activeLead.industry}</span><h2 id="dossier-title">{activeLead.company}</h2><div className="dossier-location"><MapPin size={14} />{activeLead.address}</div></div>
        <div className="dossier-score-card"><span className={`score-ring tier-ring-${getLeadTier(activeLead).toLowerCase().replaceAll(' ', '-')}`} aria-label={`${getLeadTier(activeLead)} priority, fit score ${getOpportunityScore(activeLead)} out of 100`}><span>{getOpportunityScore(activeLead)}</span><small>/100</small></span><div><span className="score-label">FIT SCORE <OpportunityStatusBadge tier={getLeadTier(activeLead)} compact /></span><strong>{getLeadTierSummary(activeLead)}</strong><small>Calculated from linked signal relevance, source confidence, and recency; directory completeness adds no points.</small></div></div>
        <div className="dossier-block"><div className="dossier-section-head"><span>01</span><h3>Signal detected</h3></div>{getLeadAssessment(activeLead).evidence.length ? <div className="verified-signal-list">{getLeadAssessment(activeLead).evidence.map((signal) => <article className="verified-signal-card" key={`${signal.sourceUrl}-${signal.title}`}><strong>{signal.title}</strong><p>{signal.kind.replaceAll('_', ' ')} · {getEvidenceConfidenceLabel(signal.confidence)}</p><span>{signal.source} </span>{signal.responsibilityEvidence?.length ? <p>Posting responsibilities: {signal.responsibilityEvidence.join(' · ')}</p> : null}<a href={getSafeWebsite(signal.sourceUrl)} target="_blank" rel="noreferrer">View source <ArrowUpRight size={12} /></a></article>)}</div> : <div className="signal-detail"><span className="signal-icon"><Activity size={16} /></span><div><strong>No verified hiring signal detected</strong><p>Google Places returned a business listing but no job posting or other sourced evidence of an operational need. This company stays TO WATCH until a current source confirms a need.</p></div></div>}</div>
        <div className="dossier-block bottleneck-block"><div className="dossier-section-head"><span>02</span><h3>Likely bottleneck</h3></div><p>{getLeadInsights(activeLead).bottleneck}</p><small className="insight-caveat">{getLeadInsights(activeLead).explanation}</small></div>
        <div className="dossier-block opportunity-block"><div className="dossier-section-head"><span>03</span><h3>Where you can help</h3></div><p>{getLeadInsights(activeLead).opportunity}</p><small className="insight-caveat">{getLeadInsights(activeLead).explanation}</small></div>
        <div className="dossier-block"><div className="dossier-section-head"><span>04</span><h3>Business details</h3></div><div className="snapshot-grid"><div><span>INDUSTRY SEARCH</span><strong>{activeLead.industry}</strong></div><div><span>BUSINESS STATUS</span><strong>{activeLead.businessStatus.replaceAll('_', ' ')}</strong></div><div><span>FORMATTED ADDRESS</span><strong>{activeLead.address}</strong></div><div><span>WEBSITE</span>{activeLead.website ? <a href={activeLead.website} target="_blank" rel="noreferrer" className="website-link">{activeLead.website.replace(/^https?:\/\//, '')}</a> : <strong>Not listed</strong>}</div><div><span>PHONE</span>{activeLead.phone ? <a className="website-link" href={getPhoneLink(activeLead.phone)}>{activeLead.phone}</a> : <strong>Not listed</strong>}</div><div><span>VERIFIED EMAIL</span>{isHunterLoading ? <strong>Searching…</strong> : hunterContacts?.[0] ? <a className="website-link" href={`mailto:${hunterContacts[0].email}`}>{hunterContacts[0].email}</a> : <strong>{hunterError ? 'Unavailable' : 'Not verified'}</strong>}</div></div></div>
        <div className="dossier-block" aria-live="polite"><div className="dossier-section-head"><span>05</span><h3>Verified executive contacts</h3></div>{!activeLead.website ? <div className="hunter-state">Google Places did not return an official website for this business.</div> : isHunterLoading ? <div className="hunter-state" role="status">Searching Hunter for verified executive emails…</div> : hunterError ? <div className="hunter-state hunter-error" role="alert">{hunterError.message}</div> : hunterContacts?.length ? <div className="executive-list">{hunterContacts.map((contact) => <article className="executive-card" key={contact.email}><span className="executive-avatar">{contact.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><span className="executive-copy"><strong>{contact.name}</strong><span>{contact.position}</span><a className="contact-route-button" href={`mailto:${contact.email}`}><Mail size={12} />{contact.email}</a></span><span className="verified-badge"><ShieldCheck size={12} /> VERIFIED</span></article>)}</div> : <div className="hunter-state">No verified executive contacts were found for this company domain.</div>}</div>
        <div className="dossier-block"><div className="dossier-section-head"><span>06</span><h3>About this data</h3></div><div className="signal-detail"><span className="signal-icon"><Activity size={16} /></span><div><strong>Google Places + Hunter</strong><p>Google Places supplies directory details only; it does not verify hiring or operational needs. A HOT or WARM tier requires a valid, linked hiring source. Operations and administrative postings receive the highest priority. Industry suggestions are hypotheses, not verified company facts.</p></div></div></div>
        <div className="outreach-block"><div className="outreach-title"><span className="outreach-icon"><Sparkles size={16} /></span><div><strong>Outreach studio</strong><small>Personalized to the current business and verified bottleneck result</small></div></div><div className="outreach-guidance"><div><span>BOTTLENECK RESULT</span><p>{getLeadInsights(activeLead).bottleneck}</p></div><div><span>HOW I CAN HELP</span><p>{getLeadInsights(activeLead).opportunity}</p></div></div>{outreach ? <div className="outreach-message" aria-live="polite">{outreach}</div> : <div className="outreach-empty"><Sparkles size={15} /><span>This draft avoids assuming an unverified bottleneck and suggests help only where the available evidence supports it.</span></div>}<button className="primary-button generate-button" onClick={() => { setOutreach(makeOutreach(activeLead, profile.firstName)); setCopied(false) }}><Zap size={16} />Regenerate tailored message</button>{outreach && <button className={`copy-button ${copied ? 'copied' : ''}`} onClick={copyOutreach}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied to clipboard' : 'Copy to clipboard'}</button>}</div>
        </div><div className="drawer-footer"><button className="print-report-button drawer-print-button" type="button" onClick={printReport} disabled={isHunterLoading}><Download size={15} />[DOWNLOAD / PRINT REPORT]</button><button className={`drawer-save-button ${activeLead.saved ? 'is-saved' : ''}`} onClick={() => toggleSaved(activeLead.id)}><Target size={15} />{activeLead.saved ? 'Saved business' : 'Save this business'}</button><span>This document and any attached lead data are confidential, proprietary to the company, and intended solely for the authorized user. Any unauthorized distribution or use of this data must comply with applicable data protection laws (including GDPR/CCPA), and data scraping or reverse-engineering of this report is strictly prohibited.</span></div></aside></div>}

      {activeLead && <article className="print-report"><header><p>LEADTRENCH · DOSSIER INTEL REPORT</p><h1>{activeLead.company}</h1><div>{activeLead.industry} · {activeLead.address}</div>{activeLead.website && <a href={activeLead.website}>{activeLead.website}</a>}{activeLead.phone && <div>Phone: {activeLead.phone}</div>}{hunterContacts?.[0] && <div>Verified email: {hunterContacts[0].email}</div>}</header><section><h2>Fit assessment</h2><p><strong>Fit Score:</strong> {getOpportunityScore(activeLead)}/100 · <strong>Priority:</strong> {getLeadTier(activeLead)}</p><p>{getLeadAssessment(activeLead).explanation}</p><p><strong>Verified hiring signal:</strong> {getLeadSignal(activeLead)}</p>{getLeadAssessment(activeLead).evidence.map((signal) => <div key={`${signal.sourceUrl}-${signal.title}`}><p><a href={getSafeWebsite(signal.sourceUrl)}>{signal.title} · {signal.source} · verified {getEvidenceDateLabel(signal.observedAt)}</a> — {getEvidenceConfidenceLabel(signal.confidence)}</p>{signal.responsibilityEvidence?.length ? <p><strong>Verified posting responsibilities:</strong> {signal.responsibilityEvidence.join(' · ')}</p> : null}</div>)}<p><strong>Likely bottleneck:</strong> {getLeadInsights(activeLead).bottleneck}</p><p><strong>Where you can help:</strong> {getLeadInsights(activeLead).opportunity}</p><p>The bottleneck and recommended approach above are based on cited evidence; any unverified process explanation remains a hypothesis. Google Places does not provide hiring evidence.</p></section><section><h2>Verified executive contacts</h2>{hunterContacts?.length ? <table><thead><tr><th>Name</th><th>Position</th><th>Verified email</th></tr></thead><tbody>{hunterContacts.map((contact) => <tr key={contact.email}><td>{contact.name}</td><td>{contact.position}</td><td>{contact.email}</td></tr>)}</tbody></table> : <p>{!activeLead.website ? 'No official website was listed in Google Places.' : hunterError ? 'Hunter contact lookup was unavailable.' : 'No verified executive contacts were found for this domain.'}</p>}</section>{outreach && <section><h2>Generated outreach message</h2><p className="print-outreach">{outreach}</p></section>}<footer>Business details: Google Places. Verified hiring signals, when present, link to their source. Hunter contacts are included only when an executive email is verified.</footer></article>}

      {userManagementOpen && isMasterAdmin && <AdminUserManagement initialView={adminPanelTab} onClose={() => setUserManagementOpen(false)} />}
      {settingsOpen && <div className="settings-layer"><button className="drawer-scrim" aria-label="Close account settings" onClick={() => setSettingsOpen(false)} /><section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="settings-head"><div><div className="panel-kicker"><Settings size={14} /> WORKSPACE</div><h2 id="settings-title">Account settings</h2></div><button className="icon-button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}><X size={18} /></button></div><div className="settings-content"><span className="settings-avatar">{profile.firstName.slice(0, 1)}{profile.lastName.slice(0, 1)}</span><div className="settings-profile"><strong>{profile.firstName} {profile.lastName}</strong><span>{profile.email}</span></div><p>Your account is secured by Supabase Auth. Search access is enforced by your signed-in account.</p>{isMasterAdmin && <section className="admin-ledger" aria-labelledby="admin-ledger-heading"><div className="admin-ledger-heading"><div><span className="panel-kicker"><ShieldCheck size={13} /> MASTER ADMIN</span><h3 id="admin-ledger-heading">Daily search ledger</h3></div><span className="admin-ledger-note">UTC · TODAY</span></div>{adminUsageLoading ? <p className="admin-ledger-state" role="status">Loading account usage…</p> : adminUsageError ? <p className="admin-ledger-state admin-ledger-error" role="alert">{adminUsageError.message}</p> : <div className="admin-ledger-table-wrap"><table className="admin-ledger-table"><thead><tr><th scope="col">ACCOUNT</th><th scope="col">USED</th><th scope="col">DAILY LIMIT</th><th scope="col"><span className="sr-only">Save limit</span></th></tr></thead><tbody>{adminUsage?.users.map((user) => <tr key={user.user_id}><td>{user.user_email}{user.is_admin && <span className="admin-owner-tag">MASTER ADMIN</span>}</td><td>{user.searches_used}</td><td>{user.is_admin ? <span className="unlimited-label">Unlimited</span> : <input className="admin-limit-input" type="number" inputMode="numeric" min="0" max="1000" aria-label={`Daily search limit for ${user.user_email}`} value={limitDrafts[user.user_id] ?? String(user.daily_limit ?? 15)} onChange={(event) => setLimitDrafts((current) => ({ ...current, [user.user_id]: event.target.value }))} />}</td><td>{!user.is_admin && <button className="admin-limit-save" type="button" disabled={savingLimitFor === user.user_id} onClick={() => void saveDailyLimit(user)}>{savingLimitFor === user.user_id ? 'Saving…' : 'Save'}</button>}</td></tr>)}</tbody></table></div>}</section>}<button className="footer-action settings-signout" onClick={() => { setSettingsOpen(false); void signOut() }}><LogOut size={16} /><span>Sign out of this device</span></button></div><div className="settings-bottom"><span>{isMasterAdmin ? 'MASTER ADMIN · AUTHENTICATED ACCOUNT' : 'SUPABASE AUTHENTICATED ACCOUNT'}</span><ShieldCheck size={15} /></div></section></div>}
      <UniversalTransmissionModal onSuccess={setToast} />
      {toast && <div className={`toast-message ${toast === 'Transmission received. The Trench welcomes you.' ? 'transmission-success' : ''}`} role="status"><Check size={15} />{toast}</div>}
    </main>
  )
}

