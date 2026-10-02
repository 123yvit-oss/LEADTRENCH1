import { createClient } from '@/lib/supabase/server'
import { createDailyPlacesToken, hasDailyPlacesSigningSecret } from '@/lib/daily-places-token'
import { PlacesSearchError, searchPlacesPages } from '@/lib/places-search'
import { enrichWithOfficialCareerSignals } from '@/lib/official-career-signals'
import { NextResponse } from 'next/server'

type SearchQuotaRecord = {
  results_used: number
  daily_limit: number
  resets_at: string
  unlimited: boolean
}

type SearchReservationRecord = SearchQuotaRecord & { reserved_count: number }

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function firstRecord<T>(data: unknown): T | null {
  const record = Array.isArray(data) ? data[0] : data
  return record && typeof record === 'object' ? record as T : null
}

async function releaseReservation(supabase: Awaited<ReturnType<typeof createClient>>, requestId: string) {
  await supabase.rpc('release_daily_result_search', { p_request_id: requestId })
}

function formatQuota(record: SearchQuotaRecord) {
  return {
    searchesUsed: record.results_used,
    dailyLimit: record.daily_limit,
    resetsAt: record.resets_at,
    unlimited: record.unlimited,
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in to view your daily result allowance.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  const { data, error } = await supabase.rpc('get_daily_result_quota')
  if (error) {
    const status = error.code === '28000' ? 401 : 500
    return NextResponse.json({ error: status === 401 ? 'Confirm your email before searching.' : 'Daily result usage could not be verified.' }, { status, headers: { 'Cache-Control': 'no-store' } })
  }

  const record = (Array.isArray(data) ? data[0] : data) as SearchQuotaRecord | null
  if (!record) return NextResponse.json({ error: 'Daily result usage could not be verified.' }, { status: 500 })
  return NextResponse.json({ quota: formatQuota(record) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  let textQuery: string
  let requestId: string
  try {
    const body = (await request.json()) as { industry?: unknown; city?: unknown; requestId?: unknown }
    if (!isUuid(body.requestId)) {
      return NextResponse.json({ error: 'A valid search request ID is required.' }, { status: 400 })
    }
    requestId = body.requestId
    const industry = typeof body.industry === 'string' ? body.industry.trim() : ''
    const city = typeof body.city === 'string' ? body.city.trim() : ''

    if (industry.length > 100 || city.length > 100) {
      return NextResponse.json({ error: 'Search terms must be 100 characters or fewer.' }, { status: 400 })
    }

    textQuery = [industry === 'All industries' ? 'businesses' : industry, city]
      .filter(Boolean)
      .join(' in ')

    if (textQuery.length < 2) {
      return NextResponse.json({ error: 'Choose an industry or city to search.' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid search request.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in to search businesses.' }, { status: 401 })
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Google Places is not configured for this project.' }, { status: 503 })
  }

  if (!hasDailyPlacesSigningSecret()) {
    return NextResponse.json({ error: 'Daily result verification is not configured for this project.' }, { status: 503 })
  }

  const { data: reservationData, error: reservationError } = await supabase.rpc('reserve_daily_result_search', {
    p_request_id: requestId,
  })
  if (reservationError) {
    const status = reservationError.code === '28000' ? 401 : 500
    return NextResponse.json(
      { error: status === 401 ? 'Confirm your email before searching.' : 'Daily result usage could not be verified.' },
      { status, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const reservation = firstRecord<SearchReservationRecord>(reservationData)
  if (!reservation || typeof reservation.reserved_count !== 'number') {
    return NextResponse.json({ error: 'Daily result usage could not be verified.' }, { status: 500 })
  }

  const quota = formatQuota(reservation)
  if (reservation.reserved_count === 0) {
    return NextResponse.json(
      {
        error: 'QUOTA_EXCEEDED',
        message: 'Daily search allowance reached.',
        code: 'DAILY_SEARCH_LIMIT',
        quota,
      },
      { status: 429, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const places = await searchPlacesPages(textQuery, apiKey)
    const enrichedPlaces = await enrichWithOfficialCareerSignals(places)

    const resultToken = createDailyPlacesToken(user.id, enrichedPlaces)
    if (!resultToken) {
      await releaseReservation(supabase, requestId)
      return NextResponse.json({ error: 'Daily result verification is not configured for this project.', quota }, { status: 503 })
    }
    return NextResponse.json({ places: enrichedPlaces, resultToken, quota }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    await releaseReservation(supabase, requestId)
    if (error instanceof PlacesSearchError) {
      return NextResponse.json(
        { error: error.message, quota },
        { status: error.status >= 500 ? 502 : error.status, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    return NextResponse.json({ error: 'Could not reach Google Places. Please try again.', quota }, { status: 502 })
  }
}
