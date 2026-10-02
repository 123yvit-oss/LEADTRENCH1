import { createClient } from '@/lib/supabase/server'
import { isIP } from 'node:net'
import { NextResponse } from 'next/server'

type HunterEmail = {
  value?: string
  first_name?: string
  last_name?: string
  position?: string
  seniority?: string
  verification?: { status?: string }
}

type HunterResponse = {
  data?: { emails?: HunterEmail[] }
}

function getCompanyDomain(websiteValue: string) {
  let website: URL
  try {
    website = new URL(websiteValue)
  } catch {
    return null
  }

  if (!['http:', 'https:'].includes(website.protocol) || website.username || website.password) return null

  const domain = website.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '')
  const labels = domain.split('.')
  if (
    domain.length > 253 ||
    isIP(domain) !== 0 ||
    labels.length < 2 ||
    labels.some((label) => label.length < 1 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
  ) {
    return null
  }

  return domain
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in to view executive contacts.' }, { status: 401 })
  }

  const apiKey = process.env.HUNTER_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Hunter is not configured for this project.' }, { status: 503 })
  }

  const websiteValue = new URL(request.url).searchParams.get('website') ?? ''
  const domain = getCompanyDomain(websiteValue)
  if (!domain) {
    return NextResponse.json({ error: 'A valid company website is required.' }, { status: 400 })
  }

  const endpoint = new URL('https://api.hunter.io/v2/domain-search')
  endpoint.searchParams.set('domain', domain)
  endpoint.searchParams.set('api_key', apiKey)

  try {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    })

    if (!response.ok) {
      if (response.status === 429) {
        return NextResponse.json({ error: 'Hunter rate limit reached. Please try again later.' }, { status: 429 })
      }
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json({ error: 'Hunter could not authenticate this request. Check the server API key.' }, { status: 502 })
      }
      return NextResponse.json({ error: 'Hunter could not complete the domain search.' }, { status: 502 })
    }

    const result = (await response.json()) as HunterResponse
    const executiveTitle = /\b(chief|ceo|cfo|coo|cto|cio|cmo|president|vice president|vp|director|owner|founder|co-founder|partner|principal|head of)\b/i
    const contacts = (result.data?.emails ?? [])
      .filter((person) => {
        const isVerified = person.verification?.status?.toLowerCase() === 'valid'
        const isExecutive = person.seniority?.toLowerCase() === 'executive' || executiveTitle.test(person.position ?? '')
        return isVerified && isExecutive && Boolean(person.value && (person.first_name || person.last_name))
      })
      .map((person) => ({
        name: [person.first_name, person.last_name].filter(Boolean).join(' '),
        email: person.value!.trim(),
        position: person.position?.trim() || 'Executive',
      }))
      .filter((person, index, all) => all.findIndex((other) => other.email.toLowerCase() === person.email.toLowerCase()) === index)

    return NextResponse.json({ contacts }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Could not reach Hunter. Please try again.' }, { status: 502 })
  }
}
