import { NextResponse } from 'next/server'
import { AirtableRequestError, fetchAllAirtableEmployees } from '@/lib/airtable/employees'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: roleData, error: roleError } = await supabase
    .from('users_with_role')
    .select('role')
    .eq('id', user.id)
    .single()

  if (roleError || roleData?.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const employees = await fetchAllAirtableEmployees()

    return NextResponse.json({
      count: employees.length,
      employees,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch employees'
    const status = error instanceof AirtableRequestError ? error.status : 500
    return NextResponse.json({ error: message }, { status })
  }
}
