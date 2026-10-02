import { createClient } from '@/lib/supabase/server'
import { hasOnlyVerifiedDailyPlaceIds, hasVerifiedDailyPlaceSignals, isValidPlacesId } from '@/lib/daily-places-token'
import { NextResponse } from 'next/server'

type DailyResultResponse = {
  session_id: string
  places: unknown[]
  results_used: number
  daily_limit: number
  resets_at: string
  unlimited: boolean
  has_more: boolean
}

type DailyResultPage = Omit<DailyResultResponse, 'session_id'>

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function formatQuota(record: Pick<DailyResultResponse, 'results_used' | 'daily_limit' | 'resets_at' | 'unlimited'>) {
  return {
    searchesUsed: record.results_used,
    dailyLimit: record.daily_limit,
    resetsAt: record.resets_at,
    unlimited: record.unlimited,
  }
}

function readPage(data: unknown): DailyResultResponse | null {
  const record = Array.isArray(data) ? data[0] : data
  if (!record || typeof record !== 'object') return null
  const candidate = record as Partial<DailyResultResponse>
  if (
    typeof candidate.session_id !== 'string'
    || !Array.isArray(candidate.places)
    || typeof candidate.results_used !== 'number'
    || typeof candidate.daily_limit !== 'number'
    || typeof candidate.resets_at !== 'string'
    || typeof candidate.unlimited !== 'boolean'
    || typeof candidate.has_more !== 'boolean'
  ) return null
  return candidate as DailyResultResponse
}

function readNextPage(data: unknown): DailyResultPage | null {
  const record = Array.isArray(data) ? data[0] : data
  if (!record || typeof record !== 'object') return null
  const candidate = record as Partial<DailyResultPage>
  if (
    !Array.isArray(candidate.places)
    || typeof candidate.results_used !== 'number'
    || typeof candidate.daily_limit !== 'number'
    || typeof candidate.resets_at !== 'string'
    || typeof candidate.unlimited !== 'boolean'
    || typeof candidate.has_more !== 'boolean'
  ) return null
  return candidate as DailyResultPage
}

export async function POST(request: Request) {
  let body: { requestId?: unknown; sessionId?: unknown; places?: unknown; resultToken?: unknown; searchContext?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid results request.' }, { status: 400 })
  }

  if (!isUuid(body.requestId)) {
    return NextResponse.json({ error: 'A valid page request ID is required.' }, { status: 400 })
  }

  const isInitialPage = body.sessionId === undefined || body.sessionId === null
  if (isInitialPage) {
    if (
      !Array.isArray(body.places)
      || body.places.length > 200
      || typeof body.resultToken !== 'string'
      || body.places.some((place) => {
        if (!place || typeof place !== 'object' || Array.isArray(place)) return true
        const candidate = place as { id?: unknown; company?: unknown }
        return typeof candidate.id !== 'string'
          || !isValidPlacesId(candidate.id)
          || typeof candidate.company !== 'string'
          || candidate.company.length > 300
      })
      || JSON.stringify(body.places).length > 512_000
    ) {
      return NextResponse.json({ error: 'The ranked results are invalid or too large.' }, { status: 400 })
    }
  } else if (!isUuid(body.sessionId)) {
    return NextResponse.json({ error: 'The result session is invalid. Start a new search.' }, { status: 400 })
  }

  let searchContext: { industry: string; city: string; metro: string } | null = null
  if (isInitialPage && body.searchContext !== undefined) {
    if (!body.searchContext || typeof body.searchContext !== 'object' || Array.isArray(body.searchContext)) {
      return NextResponse.json({ error: 'Search context is invalid.' }, { status: 400 })
    }
    const context = body.searchContext as { industry?: unknown; city?: unknown; metro?: unknown }
    if ([context.industry, context.city, context.metro].some((value) => typeof value !== 'string' || value.trim().length > 100)) {
      return NextResponse.json({ error: 'Search context must be 100 characters or fewer.' }, { status: 400 })
    }
    searchContext = {
      industry: (context.industry as string).trim(),
      city: (context.city as string).trim(),
      metro: (context.metro as string).trim(),
    }
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in to view businesses.' }, { status: 401 })
  }

  if (isInitialPage) {
    const requestedIds = (body.places as Array<{ id: string }>).map((place) => place.id)
    const submittedPlaces = body.places as Array<{ id: string; needSignals?: unknown }>
    if (
      !hasOnlyVerifiedDailyPlaceIds(body.resultToken, user.id, requestedIds)
      || !hasVerifiedDailyPlaceSignals(body.resultToken, user.id, submittedPlaces)
    ) {
      return NextResponse.json({ error: 'The Google Places results could not be verified. Run the search again.' }, { status: 400 })
    }
    const rankedPlaces = (body.places as Array<Record<string, unknown>>).map((place) => {
      const id = place.id as string
      return { ...place, id: id.startsWith('places/') ? id : `places/${id}` }
    })
    let storedPlaces = rankedPlaces
    if (searchContext && rankedPlaces.length > 0) {
      const placesWithSearchContext = [
        { ...rankedPlaces[0], _searchHistory: searchContext },
        ...rankedPlaces.slice(1),
      ]
      if (JSON.stringify(placesWithSearchContext).length <= 512_000) {
        storedPlaces = placesWithSearchContext
      }
    }
    const { data, error } = await supabase.rpc('create_daily_search_session', {
      p_places: storedPlaces,
      p_request_id: body.requestId,
    })
    if (error) {
      const status = error.code === '28000' ? 401 : error.code === '22023' ? 400 : 500
      return NextResponse.json({ error: status === 401 ? 'Confirm your email before viewing results.' : 'The first results could not be loaded.' }, { status })
    }
    const page = readPage(data)
    if (!page) return NextResponse.json({ error: 'Daily result usage could not be verified.' }, { status: 500 })
    if (page.places.length === 0 && !page.unlimited && page.results_used >= page.daily_limit) {
      return NextResponse.json({ error: 'You have reached your daily digging limit. Come back tomorrow for more opportunities.', code: 'DAILY_SEARCH_LIMIT', quota: formatQuota(page) }, { status: 429, headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json(
      { sessionId: page.session_id, places: page.places, quota: formatQuota(page), hasMore: page.has_more },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const { data, error } = await supabase.rpc('reveal_daily_search_session', {
    p_session_id: body.sessionId,
    p_request_id: body.requestId,
    p_page_size: 6,
  })
  if (error) {
    const status = error.code === '28000' ? 401 : error.code === '22023' ? 409 : 500
    return NextResponse.json({ error: status === 401 ? 'Confirm your email before viewing results.' : status === 409 ? 'This result session has expired. Start a new search.' : 'The next results could not be loaded.' }, { status })
  }
  const page = readNextPage(data)
  if (!page) return NextResponse.json({ error: 'Daily result usage could not be verified.' }, { status: 500 })
  return NextResponse.json(
    { places: page.places, quota: formatQuota(page), hasMore: page.has_more },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
