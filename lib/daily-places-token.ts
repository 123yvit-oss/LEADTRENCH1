import { createHmac, timingSafeEqual } from 'node:crypto'

type DailyPlacesClaims = {
  userId: string
  usageDate: string
  ids: string[]
  signals: Record<string, unknown[]>
}

const PLACE_ID_PATTERN = /^(?:places\/)?[A-Za-z0-9_-]{1,180}$/

function getSigningSecret() {
  return process.env.SUPABASE_JWT_SECRET
}

function readVerifiedClaims(token: unknown, userId: string) {
  const secret = getSigningSecret()
  if (!secret || typeof token !== 'string' || token.length > 64_000) return null

  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) return null

  const providedSignature = Buffer.from(signature, 'base64url')
  const expectedSignature = createHmac('sha256', secret).update(payload).digest()
  if (providedSignature.length !== expectedSignature.length || !timingSafeEqual(providedSignature, expectedSignature)) return null

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as DailyPlacesClaims
    if (
      claims.userId !== userId
      || claims.usageDate !== new Date().toISOString().slice(0, 10)
      || !Array.isArray(claims.ids)
      || claims.ids.length > 200
      || claims.ids.some((id) => typeof id !== 'string' || !PLACE_ID_PATTERN.test(id))
    ) return null
    return claims
  } catch {
    return null
  }
}

export function createDailyPlacesToken(userId: string, places: Array<{ id?: string; needSignals?: unknown }>) {
  const secret = getSigningSecret()
  if (!secret) return null

  const ids = [...new Set(places.flatMap((place) => typeof place.id === 'string' && PLACE_ID_PATTERN.test(place.id) ? [place.id] : []))]
  const signals = Object.fromEntries(places.flatMap((place) =>
    typeof place.id === 'string' && PLACE_ID_PATTERN.test(place.id)
      ? [[place.id, Array.isArray(place.needSignals) ? place.needSignals : []]]
      : [],
  ))
  const claims: DailyPlacesClaims = {
    userId,
    usageDate: new Date().toISOString().slice(0, 10),
    ids,
    signals,
  }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function hasDailyPlacesSigningSecret() {
  return Boolean(getSigningSecret())
}

export function isValidPlacesId(id: string) {
  return PLACE_ID_PATTERN.test(id)
}

export function hasOnlyVerifiedDailyPlaceIds(token: unknown, userId: string, requestedIds: string[]) {
  const claims = readVerifiedClaims(token, userId)
  if (!claims) return false
  const approvedIds = new Set(claims.ids)
  return new Set(requestedIds).size === requestedIds.length && requestedIds.every((id) => approvedIds.has(id))
}

export function hasVerifiedDailyPlaceSignals(
  token: unknown,
  userId: string,
  places: Array<{ id: string; needSignals?: unknown }>,
) {
  const claims = readVerifiedClaims(token, userId)
  if (!claims || !claims.signals || !hasOnlyVerifiedDailyPlaceIds(token, userId, places.map((place) => place.id))) return false
  return places.every((place) => {
    const signedSignals = claims.signals[place.id] ?? []
    const submittedSignals = Array.isArray(place.needSignals) ? place.needSignals : []
    return JSON.stringify(signedSignals) === JSON.stringify(submittedSignals)
  })
}
