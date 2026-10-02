import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in to update search limits.' }, { status: 401 })
  }

  let body: { userId?: unknown; dailyLimit?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid limit request.' }, { status: 400 })
  }

  if (
    typeof body.userId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.userId) ||
    typeof body.dailyLimit !== 'number' ||
    !Number.isInteger(body.dailyLimit) ||
    body.dailyLimit < 0 ||
    body.dailyLimit > 1000
  ) {
    return NextResponse.json({ error: 'Choose a whole-number limit from 0 to 1000.' }, { status: 400 })
  }

  const { error } = await supabase.rpc('set_user_daily_search_limit', {
    p_user_id: body.userId,
    p_daily_limit: body.dailyLimit,
  })

  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '22023' ? 400 : 500
    const message = status === 403
      ? 'Master admin access required.'
      : status === 400
        ? 'That workspace or limit could not be updated.'
        : 'Search limit could not be saved.'
    return NextResponse.json({ error: message }, { status })
  }

  return NextResponse.json({ success: true })
}
