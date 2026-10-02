import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type StoredSearchContext = {
  industry: string
  city: string
  metro: string
}

type StoredPlace = Record<string, unknown> & {
  id?: unknown
  industry?: unknown
  _searchHistory?: Partial<StoredSearchContext>
}

function isUuid(value: string | null): value is string {
  return value !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function readPlaces(value: unknown): StoredPlace[] {
  if (!Array.isArray(value)) return []
  return value.filter((place): place is StoredPlace => Boolean(place) && typeof place === 'object' && !Array.isArray(place))
}

function readContext(places: StoredPlace[]) {
  const saved = places.find((place) => place._searchHistory)?._searchHistory
  const firstIndustry = places.find((place) => typeof place.industry === 'string')?.industry
  const industry = typeof saved?.industry === 'string' ? saved.industry : typeof firstIndustry === 'string' ? firstIndustry : 'Industry unavailable'
  const city = typeof saved?.city === 'string' ? saved.city : 'City not recorded'
  const metro = typeof saved?.metro === 'string' ? saved.metro : 'All metros'
  return { industry, city, metro }
}

function countMatchingIds(places: StoredPlace[], ids: unknown) {
  const idSet = new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [])
  return new Set(places.flatMap((place) => typeof place.id === 'string' && idSet.has(place.id) ? [place.id] : [])).size
}

function toClientPlace(place: StoredPlace) {
  const { _searchHistory: _ignored, ...result } = place
  return result
}

export async function GET(request: Request) {
  const sessionClient = await createClient()
  const { data: { user }, error: authError } = await sessionClient.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in to view search history.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: 'Search history is not configured.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }

  const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const sessionId = new URL(request.url).searchParams.get('sessionId')
  const now = new Date().toISOString()

  if (sessionId !== null) {
    if (!isUuid(sessionId)) {
      return NextResponse.json({ error: 'This search history item is invalid.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    }

    const { data, error } = await admin
      .from('daily_search_sessions')
      .select('id, places, revealed_business_ids, created_at, expires_at')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .gt('expires_at', now)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'Search history could not be loaded.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
    }
    if (!data) {
      return NextResponse.json({ error: 'This search has expired or is no longer available.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    }

    const places = readPlaces(data.places)
    const revealedIds = new Set(Array.isArray(data.revealed_business_ids) ? data.revealed_business_ids.filter((id): id is string => typeof id === 'string') : [])
    const revealedPlaces = places
      .filter((place) => typeof place.id === 'string' && revealedIds.has(place.id))
      .map(toClientPlace)

    return NextResponse.json(
      { sessionId: data.id, places: revealedPlaces, context: readContext(places), createdAt: data.created_at },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const { data, error } = await admin
    .from('daily_search_sessions')
    .select('id, places, revealed_business_ids, created_at, expires_at')
    .eq('user_id', user.id)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: 'Search history could not be loaded.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }

  const items = (data ?? []).map((session) => {
    const places = readPlaces(session.places)
    return {
      sessionId: session.id,
      ...readContext(places),
      createdAt: session.created_at,
      resultCount: countMatchingIds(places, session.revealed_business_ids),
      totalCount: new Set(places.flatMap((place) => typeof place.id === 'string' ? [place.id] : [])).size,
      expiresAt: session.expires_at,
    }
  })

  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } })
}
