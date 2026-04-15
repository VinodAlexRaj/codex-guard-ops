import { NextResponse } from 'next/server'
import { fetchAllAirtableEmployees, type AirtableEmployee } from '@/lib/airtable/employees'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type SyncableEmployee = AirtableEmployee & {
  employeeCode: string
  fullName: string
}

function toUserPayload(employee: SyncableEmployee) {
  return {
    full_name: employee.fullName,
    external_employee_code: employee.employeeCode,
    external_role: employee.role,
    is_active: employee.isActive !== false,
    email: employee.email,
    phone: employee.phone,
  }
}

async function requireManager() {
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

  return null
}

export async function POST() {
  const authError = await requireManager()
  if (authError) return authError

  try {
    const employees = await fetchAllAirtableEmployees()
    const syncableEmployees: SyncableEmployee[] = []
    const skipped = {
      missingEmployeeCode: 0,
      missingFullName: 0,
      unmappedRole: 0,
    }

    for (const employee of employees) {
      if (!employee.employeeCode) {
        skipped.missingEmployeeCode += 1
        continue
      }

      if (!employee.fullName) {
        skipped.missingFullName += 1
        continue
      }

      if (employee.mappedRole === 'unmapped') {
        skipped.unmappedRole += 1
        continue
      }

      syncableEmployees.push({
        ...employee,
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
      })
    }

    const supabaseAdmin = createAdminClient()
    let inserted = 0
    let updated = 0

    for (const employee of syncableEmployees) {
      const payload = toUserPayload(employee)
      const { data: existingUser, error: existingError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('external_employee_code', employee.employeeCode)
        .limit(1)
        .maybeSingle()

      if (existingError) {
        return NextResponse.json(
          { error: `Failed to check ${employee.employeeCode}: ${existingError.message}` },
          { status: 500 },
        )
      }

      const mutation = existingUser
        ? supabaseAdmin.from('users').update(payload).eq('id', existingUser.id)
        : supabaseAdmin.from('users').insert(payload)

      const { error: mutationError } = await mutation

      if (mutationError) {
        return NextResponse.json(
          { error: `Failed to sync ${employee.employeeCode}: ${mutationError.message}` },
          { status: 500 },
        )
      }

      if (existingUser) {
        updated += 1
      } else {
        inserted += 1
      }
    }

    return NextResponse.json({
      totalFromAirtable: employees.length,
      synced: syncableEmployees.length,
      inserted,
      updated,
      skipped,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync Airtable employees' },
      { status: 500 },
    )
  }
}
