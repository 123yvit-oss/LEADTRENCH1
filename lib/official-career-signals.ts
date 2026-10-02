import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { OpportunitySignal } from '@/lib/opportunity-assessment'
import type { GooglePlaceResult } from '@/lib/places-search'

type CareerSignalPlace = GooglePlaceResult & { needSignals?: OpportunitySignal[] }
type FetchCareerOptions = {
  fetcher?: typeof fetch
  resolveHost?: (hostname: string) => Promise<string[]>
  now?: () => Date
  maxBusinesses?: number
}
type BoardJob = {
  title?: string
  text?: string
  hostedUrl?: string
  absolute_url?: string
  jobUrl?: string
  url?: string
  content?: string
  description?: string
  descriptionHtml?: string
  descriptionPlain?: string
  lists?: Array<{ text?: string; content?: string }>
}
type CareerLink = { href: string; label: string }

const REQUEST_TIMEOUT_MS = 1_800
const MAX_RESPONSE_BYTES = 512_000
const MAX_REDIRECTS = 3
const MAX_CAREER_PAGES = 1
const MAX_SIGNALS_PER_COMPANY = 2
const CAREER_PATH_PATTERN = /careers?|jobs?|join[ -]?(?:our )?team|work with us/i
const OPERATIONS_ROLE_PATTERN = /operations?|office manager|property manager|practice manager|business manager|facilit(?:y|ies) manager|process improvement/i
const ADMIN_ROLE_PATTERN = /administrative|administrator|executive assistant|office coordinator|operations coordinator|office administrator/i
const SUPPORT_ROLE_PATTERN = /customer (?:support|service)|client services?|help ?desk|call[ -]?center/i
const ATS_HOSTS = ['boards.greenhouse.io', 'jobs.lever.co', 'jobs.ashbyhq.com']

function isPublicIpv4(address: string) {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b, c] = octets
  return !(a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99)))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113))
}

function isPublicAddress(address: string) {
  const version = isIP(address)
  if (version === 4) return isPublicIpv4(address)
  if (version === 6) {
    const normalized = address.toLowerCase()
    return (normalized.startsWith('2') || normalized.startsWith('3')) && !normalized.startsWith('2001:db8:')
  }
  return false
}


async function readLimitedText(response: Response) {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) throw new Error('Career page exceeded the response size limit.')
  if (!response.body) return ''

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error('Career page exceeded the response size limit.')
    }
    chunks.push(value)
  }
  const combined = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(combined)
}

async function fetchPublicText(
  value: string,
  fetcher: typeof fetch,
  resolveHost: (hostname: string) => Promise<string[]>,
  accept: string,
) {
  let currentUrl = new URL(value)
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    if (currentUrl.protocol !== 'https:' || currentUrl.username || currentUrl.password) return null
    if (isIP(currentUrl.hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(currentUrl.hostname)) return null
    const addresses = await resolveHost(currentUrl.hostname)
    if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) return null

    const response = await fetcher(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: accept, 'User-Agent': 'LeadTrenchCareerSignalBot/1.0 (+https://leadtrench.com)' },
    })

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location || redirect === MAX_REDIRECTS) return null
      currentUrl = new URL(location, currentUrl)
      continue
    }
    if (!response.ok) return null
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html') && !contentType.includes('application/json') && !contentType.includes('text/plain')) return null
    return { url: currentUrl.href, text: await readLimitedText(response), contentType }
  }
  return null
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function stripHtml(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function isApprovedCareerHost(hostname: string) {
  return ATS_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))
}

function isSameOrSubdomain(hostname: string, officialHost: string) {
  return hostname === officialHost || hostname.endsWith(`.${officialHost}`)
}

function parseLinks(html: string, baseUrl: string, officialHost: string): CareerLink[] {
  const links: CareerLink[] = []
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi)) {
    const rawHref = decodeHtml(match[2]).trim()
    if (!rawHref || /^(?:mailto:|tel:|javascript:|#)/i.test(rawHref)) continue
    try {
      const url = new URL(rawHref, baseUrl)
      if (url.protocol !== 'https:' || url.username || url.password) continue
      if (!isSameOrSubdomain(url.hostname, officialHost) && !isApprovedCareerHost(url.hostname)) continue
      links.push({ href: url.href, label: stripHtml(match[3]).slice(0, 180) })
    } catch {
      continue
    }
  }
  return links
}

function boardFromUrl(value: string) {
  const url = new URL(value)
  const host = url.hostname.toLowerCase()
  const slug = url.pathname.split('/').filter(Boolean)[0]
  if (!slug) return null
  if (host === 'boards.greenhouse.io') return { provider: 'greenhouse' as const, slug }
  if (host === 'jobs.lever.co') return { provider: 'lever' as const, slug }
  if (host === 'jobs.ashbyhq.com') return { provider: 'ashby' as const, slug }
  return null
}

function classifyRole(title: string): OpportunitySignal['kind'] {
  if (OPERATIONS_ROLE_PATTERN.test(title)) return 'operations_hiring'
  if (ADMIN_ROLE_PATTERN.test(title)) return 'administrative_hiring'
  if (SUPPORT_ROLE_PATTERN.test(title)) return 'customer_support_hiring'
  return 'other_hiring'
}

const RESPONSIBILITY_PATTERN = /\b(?:schedule|scheduling|calendar|coordinate|coordination|inbox|email|data entry|records|reporting|reports|follow[- ]?up|customer inquiries|customer support|support tickets|onboard|onboarding|dispatch|bookkeeping|billing|payroll|inventory|order processing|answer calls|phone calls)\b/i

function extractResponsibilities(job: BoardJob) {
  const descriptions = [job.content, job.description, job.descriptionHtml, job.descriptionPlain]
  for (const item of job.lists ?? []) descriptions.push(item.text, item.content)
  const text = descriptions
    .filter((value): value is string => typeof value === 'string')
    .map(stripHtml)
    .join(' ')
    .slice(0, 24_000)
  if (!text) return undefined

  const evidence = [...new Set(text
    .split(/(?<=[.!?])\s+|[•\n\r;]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => RESPONSIBILITY_PATTERN.test(sentence))
    .map((sentence) => sentence.slice(0, 220)))].slice(0, 4)
  return evidence.length ? evidence : undefined
}

function toSignal(title: string, sourceUrl: string, source: string, observedAt: string, confidence: OpportunitySignal['confidence'], responsibilityEvidence?: string[]): OpportunitySignal {
  return { kind: classifyRole(title), title, source, sourceUrl, observedAt, confidence, verified: true, ...(responsibilityEvidence?.length ? { responsibilityEvidence } : {}) }
}

async function fetchBoardJobs(
  board: NonNullable<ReturnType<typeof boardFromUrl>>,
  fetcher: typeof fetch,
  resolveHost: (hostname: string) => Promise<string[]>,
) {
  const encodedSlug = encodeURIComponent(board.slug)
  const endpoint = board.provider === 'greenhouse'
    ? `https://boards-api.greenhouse.io/v1/boards/${encodedSlug}/jobs?content=true`
    : board.provider === 'lever'
      ? `https://api.lever.co/v0/postings/${encodedSlug}?mode=json`
      : `https://api.ashbyhq.com/posting-api/job-board/${encodedSlug}`
  const result = await fetchPublicText(endpoint, fetcher, resolveHost, 'application/json')
  if (!result) return []

  try {
    const data = JSON.parse(result.text) as { jobs?: BoardJob[]; results?: BoardJob[] }
    const jobs = Array.isArray(data) ? data as BoardJob[] : data.jobs ?? data.results ?? []
    return jobs.slice(0, 250).flatMap((job) => {
      const rawTitle = job.title ?? job.text
      const title = typeof rawTitle === 'string' ? stripHtml(rawTitle) : ''
      const url = job.hostedUrl ?? job.absolute_url ?? job.jobUrl ?? job.url
      if (!title || !url || !/^https:\/\//i.test(url)) return []
      return [{ title: title.slice(0, 180), url, responsibilityEvidence: extractResponsibilities(job) }]
    })
  } catch {
    return []
  }
}

async function getBusinessSignals(
  place: GooglePlaceResult,
  fetcher: typeof fetch,
  resolveHost: (hostname: string) => Promise<string[]>,
  observedAt: string,
) {
  if (!place.websiteUri) return []
  let website: URL
  try {
    website = new URL(place.websiteUri)
    if (website.protocol !== 'https:' || website.username || website.password || isIP(website.hostname)) return []
  } catch {
    return []
  }

  const listingUrls = new Set<string>([website.href])
  const homepage = await fetchPublicText(website.href, fetcher, resolveHost, 'text/html,application/json;q=0.9')
  if (homepage?.contentType.includes('text/html')) {
    const links = parseLinks(homepage.text, homepage.url, website.hostname)
    for (const link of links) {
      if (CAREER_PATH_PATTERN.test(`${link.label} ${link.href}`)) listingUrls.add(link.href)
      if (listingUrls.size >= MAX_CAREER_PAGES + 1) break
    }
  }

  const signals: OpportunitySignal[] = []
  const seenTitles = new Set<string>()
  for (const listingUrl of [...listingUrls].slice(0, MAX_CAREER_PAGES + 1)) {
    let listing: Awaited<ReturnType<typeof fetchPublicText>>
    try {
      const board = boardFromUrl(listingUrl)
      if (board) {
        const jobs = await fetchBoardJobs(board, fetcher, resolveHost)
        for (const job of jobs) {
          const titleKey = job.title.toLowerCase()
          if (seenTitles.has(titleKey)) continue
          seenTitles.add(titleKey)
          signals.push(toSignal(job.title, job.url, 'Official careers page', observedAt, 'high', job.responsibilityEvidence))
        }
        continue
      }

      listing = await fetchPublicText(listingUrl, fetcher, resolveHost, 'text/html,application/json;q=0.9')
    } catch {
      continue
    }
    if (!listing?.contentType.includes('text/html')) continue

    const links = parseLinks(listing.text, listing.url, website.hostname)
    const boardLinks = links.flatMap((link) => boardFromUrl(link.href) ? [link] : [])
    for (const link of boardLinks) {
      try {
        const board = boardFromUrl(link.href)
        if (!board) continue
        const jobs = await fetchBoardJobs(board, fetcher, resolveHost)
        for (const job of jobs) {
          const titleKey = job.title.toLowerCase()
          if (seenTitles.has(titleKey)) continue
          seenTitles.add(titleKey)
          signals.push(toSignal(job.title, job.url, 'Official careers page', observedAt, 'high', job.responsibilityEvidence))
        }
      } catch {
        continue
      }
    }

    for (const link of links) {
      if (!link.label || CAREER_PATH_PATTERN.test(link.label) || boardFromUrl(link.href)) continue
      const title = link.label
      if (!OPERATIONS_ROLE_PATTERN.test(title) && !ADMIN_ROLE_PATTERN.test(title) && !SUPPORT_ROLE_PATTERN.test(title) && !/\b(?:manager|director|assistant|coordinator|specialist|analyst|associate|representative|technician|accountant|engineer|agent|receptionist|dispatcher|supervisor)\b/i.test(title)) continue
      const titleKey = title.toLowerCase()
      if (seenTitles.has(titleKey)) continue
      seenTitles.add(titleKey)
      signals.push(toSignal(title, link.href, 'Official careers page', observedAt, 'medium'))

    }
  }

  const kindPriority: Record<OpportunitySignal['kind'], number> = {
    operations_hiring: 0,
    administrative_hiring: 1,
    customer_support_hiring: 2,
    other_hiring: 3,
    operations_expansion: 4,
    multiple_locations: 5,
    service_workload: 6,
    process_gap: 7,
  }
  return signals.sort((a, b) => kindPriority[a.kind] - kindPriority[b.kind]).slice(0, MAX_SIGNALS_PER_COMPANY)
}

export async function enrichWithOfficialCareerSignals<T extends GooglePlaceResult>(places: T[], options: FetchCareerOptions = {}): Promise<Array<T & { needSignals: OpportunitySignal[] }>> {
  const fetcher = options.fetcher ?? fetch
  const resolveHost = options.resolveHost ?? (async (hostname) => {
    const addresses = await lookup(hostname, { all: true, verbatim: true })
    return addresses.map(({ address }) => address)
  })
  const observedAt = (options.now?.() ?? new Date()).toISOString()
  const maxBusinesses = Math.max(0, Math.min(options.maxBusinesses ?? places.length, places.length))
  const results = places.map((place) => ({ ...place, needSignals: [] as OpportunitySignal[] }))
  let cursor = 0
  const workerCount = Math.min(10, maxBusinesses)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < maxBusinesses) {
      const index = cursor++
      try {
        results[index].needSignals = await getBusinessSignals(places[index], fetcher, resolveHost, observedAt)
      } catch {
        results[index].needSignals = []
      }
    }
  }))

  return results
}

export const careerSignalInternals = { classifyRole, isPublicAddress, parseLinks }

export type { OpportunitySignal }

