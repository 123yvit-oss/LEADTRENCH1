import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const MASTER_ADMIN_EMAIL = 'codey@quintacore.com'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in to view workspace feedback.' }, { status: 401 })
  }

  if (user.email?.toLowerCase() !== MASTER_ADMIN_EMAIL || !user.email_confirmed_at) {
    return NextResponse.json({ error: 'Master admin access required.' }, { status: 403 })
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[admin/feedback] Supabase service configuration is missing.')
    return NextResponse.json({ error: 'Feedback could not be loaded.' }, { status: 500 })
  }

  const adminClient = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const [{ data: feedback, error: feedbackError }, { data: accounts, error: accountsError }] = await Promise.all([
    adminClient
      .from('user_feedback')
      .select('id,user_id,category,message,created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.rpc('get_master_admin_usage'),
  ])

  if (feedbackError) {
    console.error('[admin/feedback] Query failed:', { code: feedbackError.code, message: feedbackError.message })
    return NextResponse.json({ error: 'Feedback could not be loaded. Check the server logs for details.' }, { status: 500 })
  }

  if (accountsError) {
    console.error('[admin/feedback] Account email lookup failed:', { code: accountsError.code, message: accountsError.message })
  }

  const emailByUserId = new Map(
    Array.isArray(accounts) ? accounts.map((account) => [account.user_id, account.user_email]) : [],
  )
  const items = (feedback ?? []).map((item) => ({
    ...item,
    user_email: emailByUserId.get(item.user_id) ?? null,
  }))

  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } })
}
