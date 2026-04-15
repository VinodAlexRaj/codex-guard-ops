import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type AppRole = 'manager' | 'supervisor'

function homeForRole(role: string | null | undefined) {
  if (role === 'manager') return '/manager/overview'
  if (role === 'supervisor') return '/supervisor/overview'
  return '/'
}

export async function requireRole(expectedRole: AppRole) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/')

  const { data: roleData, error } = await supabase
    .from('users_with_role')
    .select('role')
    .eq('id', user.id)
    .single()

  if (error || roleData?.role !== expectedRole) {
    redirect(homeForRole(roleData?.role))
  }

  return user
}
