import assert from 'node:assert/strict'
import test from 'node:test'
import { PlacesSearchError, getPlacePhone, searchPlacesPages } from './places-search.ts'
import { assessOpportunity, rankLeadsByOpportunity } from './opportunity-assessment.ts'
import { enrichWithOfficialCareerSignals } from './official-career-signals.ts'
import { createDailyPlacesToken, hasVerifiedDailyPlaceSignals } from './daily-places-token.ts'

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('collects up to three pages, deduplicates IDs, and preserves phone data', async () => {
  const requests = []
  const pages = [
    jsonResponse({
      places: [
        { id: 'place-a', nationalPhoneNumber: '+1 212-555-0100' },
        { id: 'place-b', websiteUri: 'https://example.com' },
      ],
      nextPageToken: 'page-two',
    }),
    jsonResponse({
      places: [
        { id: 'place-a', nationalPhoneNumber: '+1 212-555-0100' },
        { id: 'place-c', internationalPhoneNumber: '+44 20 7946 0100' },
      ],
      nextPageToken: 'page-three',
    }),
    jsonResponse({ places: [{ id: 'place-d' }], nextPageToken: 'page-four' }),
  ]

  const places = await searchPlacesPages('Construction in Newark, NJ', 'test-key', async (_url, init) => {
    requests.push({ headers: init?.headers, body: JSON.parse(String(init?.body)) })
    return pages.shift()
  }, async () => {})

  assert.deepEqual(places.map((place) => place.id), ['place-a', 'place-b', 'place-c', 'place-d'])
  assert.equal(places[0].nationalPhoneNumber, '+1 212-555-0100')
  assert.equal(places[2].internationalPhoneNumber, '+44 20 7946 0100')
  assert.equal(requests.length, 3)
  assert.deepEqual(requests.map((request) => request.body.pageToken), [undefined, 'page-two', 'page-three'])
  assert.equal(requests[0].body.pageSize, 20)
  assert.match(new Headers(requests[0].headers).get('X-Goog-FieldMask'), /places\.nationalPhoneNumber/)
  assert.match(new Headers(requests[0].headers).get('X-Goog-FieldMask'), /places\.internationalPhoneNumber/)
})

test('uses the first valid source phone and falls back without inventing data', () => {
  assert.equal(getPlacePhone({ nationalPhoneNumber: '+1 212-555-0100' }), '+1 212-555-0100')
  assert.equal(getPlacePhone({ nationalPhoneNumber: 'not provided', internationalPhoneNumber: '+44 20 7946 0100' }), '+44 20 7946 0100')
  assert.equal(getPlacePhone({}), undefined)
})

test('keeps businesses without evidence and prioritizes verified operations hiring', () => {
  const places = [
    { id: 'watch', company: 'Dallas Commercial Realty', needSignals: [] },
    {
      id: 'hiring',
      company: 'Dallas Operations Group',
      needSignals: [{
        kind: 'operations_hiring',
        title: 'Operations Manager',
        source: 'Company careers page',
        sourceUrl: 'https://example.com/careers/operations-manager',
        observedAt: new Date().toISOString(),
        confidence: 'high',
        verified: true,
      }],
    },
  ]

  const ranked = rankLeadsByOpportunity(places)

  assert.deepEqual(ranked.map((place) => place.id), ['hiring', 'watch'])
  assert.equal(assessOpportunity(ranked[1].needSignals).tier, 'TO WATCH')
  assert.equal(assessOpportunity(ranked[1].needSignals).score, 0)
  assert.equal(assessOpportunity(ranked[0].needSignals).tier, 'HOT')
})

test('ties the recommendation to verified responsibilities and keeps unsupported hiring conditional', () => {
  const baseSignal = {
    source: 'Official careers page',
    sourceUrl: 'https://example.com/careers/operations-manager',
    observedAt: '2026-10-02T12:00:00.000Z',
    confidence: 'high',
    verified: true,
  }
  const withDuties = assessOpportunity([{
    ...baseSignal,
    kind: 'operations_hiring',
    title: 'Operations Manager',
    responsibilityEvidence: ['Coordinate scheduling, maintain CRM records, and prepare weekly reports.'],
  }], Date.parse('2026-10-02T12:00:00.000Z'), { company: 'Acme Dental', industry: 'Healthcare' })
  const withoutDuties = assessOpportunity([{
    ...baseSignal,
    kind: 'other_hiring',
    title: 'Marketing Associate',
  }], Date.parse('2026-10-02T12:00:00.000Z'), { company: 'Northstar Dental', industry: 'Healthcare' })

  assert.equal(withDuties.score, 80)
  assert.equal(withDuties.recommendation.supported, true)
  assert.match(withDuties.opportunity, /administrative and operations VA support/)
  assert.match(withDuties.opportunity, /calendar and appointment scheduling, records and data entry, report preparation/)
  assert.match(withDuties.bottleneck, /not that the current team is failing/)
  assert.equal(withoutDuties.recommendation.supported, false)
  assert.match(withoutDuties.opportunity, /do not pitch VA support if the role is unrelated/)
  assert.doesNotMatch(withoutDuties.opportunity, /Offer /)
  assert.notEqual(withDuties.bottleneck, withoutDuties.bottleneck)
})

test('discovers sourced hiring from official career pages without filtering businesses', async () => {
  const requestedUrls = []
  const places = await enrichWithOfficialCareerSignals([
    { id: 'place-a', displayName: { text: 'Dallas Commercial Realty' }, websiteUri: 'https://acme.com' },
    { id: 'place-b', displayName: { text: 'Another Dallas Realty' } },
  ], {
    now: () => new Date('2026-10-02T12:00:00.000Z'),
    resolveHost: async () => ['93.184.216.34'],
    fetcher: async (input) => {
      const url = new URL(String(input))
      requestedUrls.push(url.href)
      if (url.hostname === 'acme.com' && url.pathname === '/') {
        return new Response('<a href="/careers">Careers</a>', { headers: { 'content-type': 'text/html' } })
      }
      if (url.hostname === 'acme.com' && url.pathname === '/careers') {
        return new Response('<a href="/jobs/operations-manager">Operations Manager</a><a href="/jobs/marketing-associate">Marketing Associate</a>', { headers: { 'content-type': 'text/html' } })
      }
      return new Response('Not found', { status: 404 })
    },
  })

  assert.equal(places.length, 2)
  assert.equal(places[0].needSignals[0].kind, 'operations_hiring')
  assert.equal(places[0].needSignals[0].title, 'Operations Manager')
  assert.equal(places[0].needSignals[0].sourceUrl, 'https://acme.com/jobs/operations-manager')
  assert.equal(places[0].needSignals[0].verified, true)
  assert.equal(places[0].needSignals[0].observedAt, '2026-10-02T12:00:00.000Z')
  assert.deepEqual(places[1].needSignals, [])
  assert.ok(requestedUrls.includes('https://acme.com/careers'))
})

test('extracts responsibility evidence from an official ATS posting', async () => {
  const places = await enrichWithOfficialCareerSignals([
    { id: 'place-a', displayName: { text: 'Acme Dental' }, websiteUri: 'https://acme.com' },
  ], {
    now: () => new Date('2026-10-02T12:00:00.000Z'),
    resolveHost: async () => ['93.184.216.34'],
    fetcher: async (input) => {
      const url = new URL(String(input))
      if (url.hostname === 'acme.com') {
        return new Response('<a href="https://boards.greenhouse.io/acme">Careers</a>', { headers: { 'content-type': 'text/html' } })
      }
      if (url.hostname === 'boards-api.greenhouse.io') {
        return new Response(JSON.stringify({ jobs: [{
          title: 'Operations Manager',
          hostedUrl: 'https://boards.greenhouse.io/acme/jobs/1',
          content: '<p>Coordinate scheduling, maintain CRM records, and prepare weekly reports.</p>',
        }] }), { headers: { 'content-type': 'application/json' } })
      }
      return new Response('Not found', { status: 404 })
    },
  })

  assert.deepEqual(places[0].needSignals[0].responsibilityEvidence, [
    'Coordinate scheduling, maintain CRM records, and prepare weekly reports.',
  ])
})

test('enriches every discovered business, not only the first result batch', async () => {
  const businesses = Array.from({ length: 15 }, (_, index) => ({ id: `place-${index}`, displayName: { text: `Dallas Business ${index}` } }))
  const enriched = await enrichWithOfficialCareerSignals(businesses)

  assert.equal(enriched.length, 15)
  assert.deepEqual(enriched.map((place) => place.needSignals), Array.from({ length: 15 }, () => []))
})

test('does not fetch private-address business websites or discard the business', async () => {
  let fetchCount = 0
  const places = await enrichWithOfficialCareerSignals([
    { id: 'private-place', displayName: { text: 'Dallas Property Group' }, websiteUri: 'https://127.0.0.1/admin' },
  ], { fetcher: async () => { fetchCount += 1; return new Response('') } })

  assert.equal(places.length, 1)
  assert.deepEqual(places[0].needSignals, [])
  assert.equal(fetchCount, 0)
})

test('binds discovered evidence to the signed Places result token', () => {
  const previousSecret = process.env.SUPABASE_JWT_SECRET
  process.env.SUPABASE_JWT_SECRET = 'career-signal-test-secret'
  try {
    const signal = {
      kind: 'operations_hiring',
      title: 'Operations Manager',
      source: 'Official careers page',
      sourceUrl: 'https://acme.com/jobs/operations-manager',
      observedAt: '2026-10-02T12:00:00.000Z',
      confidence: 'high',
      verified: true,
    }
    const place = { id: 'ChIJplace', needSignals: [signal] }
    const token = createDailyPlacesToken('user-1', [place])

    assert.ok(token)
    assert.equal(hasVerifiedDailyPlaceSignals(token, 'user-1', [place]), true)
    assert.equal(hasVerifiedDailyPlaceSignals(token, 'user-1', [{ ...place, needSignals: [] }]), false)
    assert.equal(hasVerifiedDailyPlaceSignals(token, 'user-1', [{ ...place, needSignals: [{ ...signal, title: 'CEO' }] }]), false)
  } finally {
    if (previousSecret === undefined) delete process.env.SUPABASE_JWT_SECRET
    else process.env.SUPABASE_JWT_SECRET = previousSecret
  }
})

test('waits and retries a next-page token while Google is preparing it', async () => {
  let requestCount = 0
  const waitDurations = []
  const places = await searchPlacesPages('Automotive in Seattle, WA', 'test-key', async (_url, init) => {
    requestCount += 1
    const body = JSON.parse(String(init?.body))
    if (requestCount === 1) return jsonResponse({ places: [{ id: 'place-a', nationalPhoneNumber: '+1 206-555-0100' }], nextPageToken: 'page-two' })
    assert.equal(body.pageToken, 'page-two')
    if (requestCount === 2) {
      return jsonResponse({ error: { message: 'Invalid page token: not ready', status: 'INVALID_ARGUMENT' } }, 400)
    }
    return jsonResponse({ places: [{ id: 'place-b' }] })
  }, async (milliseconds) => { waitDurations.push(milliseconds) })

  assert.deepEqual(places.map((place) => place.id), ['place-a', 'place-b'])
  assert.equal(places[0].nationalPhoneNumber, '+1 206-555-0100')
  assert.equal(requestCount, 3)
  assert.deepEqual(waitDurations, [1_000, 1_000])
})

test('stops if Google repeats a page token', async () => {
  let requestCount = 0
  const places = await searchPlacesPages('Healthcare in Philadelphia, PA', 'test-key', async () => {
    requestCount += 1
    return jsonResponse({ places: [{ id: 'place-a' }], nextPageToken: 'repeat' })
  }, async () => {})

  assert.equal(places.length, 1)
  assert.equal(requestCount, 2)
})

test('keeps the first page if a later page fails', async () => {
  let requestCount = 0
  const places = await searchPlacesPages('Restaurants in Chicago, IL', 'test-key', async () => {
    requestCount += 1
    if (requestCount === 1) return jsonResponse({ places: [{ id: 'place-a' }], nextPageToken: 'page-two' })
    return jsonResponse({ error: { message: 'Temporary provider error' } }, 503)
  }, async () => {})

  assert.deepEqual(places.map((place) => place.id), ['place-a'])
  assert.equal(requestCount, 2)
})

test('preserves the provider message and status if the first page fails', async () => {
  await assert.rejects(
    searchPlacesPages('Businesses in Denver, CO', 'test-key', async () =>
      jsonResponse({ error: { message: 'Invalid Places API key' } }, 403)),
    (error) => error instanceof PlacesSearchError
      && error.message === 'Invalid Places API key'
      && error.status === 403,
  )
})

test('does not keep results without a Place ID', async () => {
  const places = await searchPlacesPages('Retail in Seattle, WA', 'test-key', async () =>
    jsonResponse({ places: [{ displayName: { text: 'No ID' } }, { id: 'place-valid' }] }))

  assert.deepEqual(places.map((place) => place.id), ['place-valid'])
})
