import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in to view workspace usage.' }, { status: 401 })
  }

  const { data, error } = await supabase.rpc('get_master_admin_usage')
  if (error) {
    console.error('[admin/usage] RPC failed:', { code: error.code, message: error.message })
    const status = error.code === '42501' ? 403 : 500
    const message = status === 403
      ? 'Master admin access required.'
      : error.code === '42883' || error.code === 'PGRST202'
        ? 'The admin usage API is still unavailable after a schema refresh. Reload and try again shortly.'
        : 'Usage could not be loaded. Check the server logs for the admin usage RPC error.'
    return NextResponse.json({ error: message }, { status })
  }

  if (!Array.isArray(data)) {
    console.error('[admin/usage] RPC returned a non-array response.')
    return NextResponse.json({ error: 'The admin usage function returned an unexpected response.' }, { status: 500 })
  }

  const users = data.map((row) => ({
    ...row,
    searches_used: Number(row.searches_used ?? 0),
    daily_limit: row.daily_limit == null ? null : Number(row.daily_limit),
    is_admin: Boolean(row.is_admin),
  }))

  return NextResponse.json({ users }, { headers: { 'Cache-Control': 'no-store' } })
}
