export type GooglePlaceResult = {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  websiteUri?: string
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  businessStatus?: string
  currentOpeningHours?: { openNow?: boolean }
}

type PlacesSearchResponse = {
  places?: GooglePlaceResult[]
  nextPageToken?: string
  error?: { message?: string; status?: string }
}

const PAGE_TOKEN_DELAY_MS = 1_000
const MAX_PAGE_TOKEN_RETRIES = 1

function isPageTokenNotReady(response: Response, data: PlacesSearchResponse) {
  return (response.status === 400 || data.error?.status === 'INVALID_ARGUMENT')
    && /page.?token/i.test(data.error?.message ?? '')
    && /(invalid|not valid|not ready|expired)/i.test(data.error?.message ?? '')
}

function wait(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

export type PlacesSearchWait = (milliseconds: number) => Promise<void>

export const GOOGLE_PLACES_PAGE_TOKEN_DELAY_MS = PAGE_TOKEN_DELAY_MS
export const GOOGLE_PLACES_MAX_PAGE_TOKEN_RETRIES = MAX_PAGE_TOKEN_RETRIES

export function isPlacesPageTokenNotReady(response: Response, data: PlacesSearchResponse) {
  return isPageTokenNotReady(response, data)
}

export function waitForPlacesPageToken(milliseconds: number) {
  return wait(milliseconds)
}

function asWaitResult(waiter: PlacesSearchWait, milliseconds: number) {
  return waiter(milliseconds)
}

function isResponseOk(response: Response) {
  return response.ok
}

function assertNever(_value: never): never {
  throw new Error('Unexpected search response state.')
}

function pageTokenRetryDelay(attempt: number) {
  return PAGE_TOKEN_DELAY_MS * (attempt + 1)
}

function hasMorePageToken(data: PlacesSearchResponse) {
  return Boolean(data.nextPageToken)
}

function shouldRetryPageToken(response: Response, data: PlacesSearchResponse, attempt: number) {
  return attempt < MAX_PAGE_TOKEN_RETRIES && isPageTokenNotReady(response, data)
}

function hasRepeatedPageToken(token: string | undefined, seenTokens: Set<string>) {
  return !token || seenTokens.has(token)
}

function addUniquePlaces(places: GooglePlaceResult[], seenPlaceIds: Set<string>, newPlaces: GooglePlaceResult[]) {
  for (const place of newPlaces) {
    if (!place.id || seenPlaceIds.has(place.id)) continue
    seenPlaceIds.add(place.id)
    places.push(place)
  }
}

function parseSearchResponse(data: unknown): PlacesSearchResponse {
  return data as PlacesSearchResponse
}

function getPlacesSearchError(data: PlacesSearchResponse, status: number) {
  return new PlacesSearchError(data.error?.message ?? 'Google Places could not complete this search.', status)
}

function getPageToken(data: PlacesSearchResponse) {
  return data.nextPageToken
}

function makeSearchBody(textQuery: string, pageToken: string | undefined) {
  return pageToken ? { textQuery, pageSize: 20, pageToken } : { textQuery, pageSize: 20 }
}

function makeSearchHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': apiKey,
    'X-Goog-FieldMask': PLACES_SEARCH_FIELD_MASK,
  }
}

async function fetchSearchPage(textQuery: string, apiKey: string, pageToken: string | undefined, fetcher: typeof fetch) {
  const response = await fetcher('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: makeSearchHeaders(apiKey),
    body: JSON.stringify(makeSearchBody(textQuery, pageToken)),
    cache: 'no-store',
  })
  const data = parseSearchResponse(await response.json())
  return { response, data }
}

async function requestSearchPage(textQuery: string, apiKey: string, pageToken: string | undefined, fetcher: typeof fetch, waiter: PlacesSearchWait) {
  if (pageToken) await asWaitResult(waiter, PAGE_TOKEN_DELAY_MS)

  for (let attempt = 0; ; attempt += 1) {
    const result = await fetchSearchPage(textQuery, apiKey, pageToken, fetcher)
    if (isResponseOk(result.response) || !shouldRetryPageToken(result.response, result.data, attempt)) return result
    await asWaitResult(waiter, pageTokenRetryDelay(attempt))
  }
}

export class PlacesSearchError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'PlacesSearchError'
    this.status = status
  }
}

export function getPlacePhone(place: Pick<GooglePlaceResult, 'nationalPhoneNumber' | 'internationalPhoneNumber'>) {
  return [place.nationalPhoneNumber, place.internationalPhoneNumber]
    .map((phone) => phone?.trim())
    .find((phone) => phone && /\d/.test(phone))
}

const PLACES_SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.businessStatus',
  'places.currentOpeningHours.openNow',
  'nextPageToken',
].join(',')

export async function searchPlacesPages(
  textQuery: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
  waiter: PlacesSearchWait = wait,
): Promise<GooglePlaceResult[]> {
  const places: GooglePlaceResult[] = []
  const seenPlaceIds = new Set<string>()
  const seenPageTokens = new Set<string>()
  let pageToken: string | undefined

  for (let page = 0; page < 3; page += 1) {
    let result: Awaited<ReturnType<typeof requestSearchPage>>
    try {
      result = await requestSearchPage(textQuery, apiKey, pageToken, fetcher, waiter)
    } catch (error) {
      if (places.length > 0) break
      throw error
    }

    if (!result.response.ok) {
      if (places.length > 0) break
      throw getPlacesSearchError(result.data, result.response.status)
    }

    addUniquePlaces(places, seenPlaceIds, result.data.places ?? [])

    const nextPageToken = getPageToken(result.data)
    if (!nextPageToken || hasRepeatedPageToken(nextPageToken, seenPageTokens)) break
    seenPageTokens.add(nextPageToken)
    pageToken = nextPageToken
  }

  return places
}
