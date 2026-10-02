import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type PageViewData = {
  view_date: string
  page_views: number
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in to view analytics.' }, { status: 401 })
  }

  const { data, error } = await supabase.rpc('get_daily_page_view_counts', { days_back: 30 })
  if (error) {
    console.error('[admin/pageviews] RPC failed:', { code: error.code, message: error.message })
    const status = error.code === '42501' ? 403 : 500
    const message = status === 403
      ? 'Admin access required.'
      : 'Page view analytics could not be loaded.'
    return NextResponse.json({ error: message }, { status })
  }

  const pageviews = Array.isArray(data) ? (data as PageViewData[]).map((row) => ({
    view_date: row.view_date,
    page_views: Number(row.page_views ?? 0),
  })) : []

  const totalViews = pageviews.reduce((sum, row) => sum + row.page_views, 0)
  const dailyAverage = pageviews.length > 0 ? Math.round(totalViews / pageviews.length) : 0

  return NextResponse.json({ pageviews, totalViews, dailyAverage }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST() {
  const supabase = await createClient()

  const { error } = await supabase.rpc('record_daily_page_view')
  if (error) {
    console.error('[admin/pageviews POST] RPC failed:', { code: error.code, message: error.message })
    return NextResponse.json({ error: 'Page view could not be recorded.' }, { status: 500 })
  }

  return NextResponse.json({ recorded: true })
}
