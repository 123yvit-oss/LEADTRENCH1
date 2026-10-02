export type GooglePlaceSearchResult = {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  websiteUri?: string
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  businessStatus?: string
  currentOpeningHours?: { openNow?: boolean }
}

type GooglePlacesSearchResponse = {
  places?: GooglePlaceSearchResult[]
  nextPageToken?: string
  error?: { message?: string }
}

export const GOOGLE_PLACES_MAX_SEARCH_PAGES = 3
export const GOOGLE_PLACES_FIELD_MASK = [
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

export type GooglePlacesSearchPageResult = {
  places: GooglePlaceSearchResult[]
  failure?: { status: number; message?: string }
}

export async function searchGooglePlaces(
  textQuery: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<GooglePlacesSearchPageResult> {
  const places: GooglePlaceSearchResult[] = []
  const seenPlaceIds = new Set<string>()
  const seenPageTokens = new Set<string>()
  let pageToken: string | undefined

  for (let page = 0; page < GOOGLE_PLACES_MAX_SEARCH_PAGES; page += 1) {
    let response: Response
    let data: GooglePlacesSearchResponse
    try {
      response = await fetcher('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': GOOGLE_PLACES_FIELD_MASK,
        },
        body: JSON.stringify(pageToken ? { textQuery, pageSize: 20, pageToken } : { textQuery, pageSize: 20 }),
        cache: 'no-store',
      })
      data = (await response.json()) as GooglePlacesSearchResponse
    } catch (error) {
      if (places.length > 0) break
      throw error
    }

    if (!response.ok) {
      if (places.length > 0) break
      return {
        places,
        failure: { status: response.status, message: data.error?.message },
      }
    }

    for (const place of data.places ?? []) {
      if (!place.id || seenPlaceIds.has(place.id)) continue
      seenPlaceIds.add(place.id)
      places.push(place)
    }

    const nextPageToken = data.nextPageToken
    if (!nextPageToken || seenPageTokens.has(nextPageToken)) break
    seenPageTokens.add(nextPageToken)
    pageToken = nextPageToken
  }

  return { places }
}
