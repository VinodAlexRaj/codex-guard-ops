'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppTopBar } from '@/components/app-top-bar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { supabase } from '@/lib/supabase/client'
import { formatHeaderDate } from '@/lib/utils'

type MappedRole = 'guard' | 'supervisor' | 'manager' | 'unmapped'

interface AirtableEmployeePreview {
  airtableId: string
  employeeCode: string | null
  fullName: string | null
  role: string | null
  mappedRole: MappedRole
  status: string | null
  isActive: boolean | null
  email: string | null
  phone: string | null
}

interface AirtableEmployeesResponse {
  count: number
  employees: AirtableEmployeePreview[]
  error?: string
}

interface SyncResult {
  totalFromAirtable: number
  synced: number
  inserted: number
  updated: number
  skipped: {
    missingEmployeeCode: number
    missingFullName: number
    unmappedRole: number
  }
  error?: string
}

const ROLE_FILTERS = ['All', 'Guard', 'Supervisor', 'Manager', 'Unmapped'] as const

function mappedRoleLabel(role: MappedRole) {
  if (role === 'guard') return 'Guard'
  if (role === 'supervisor') return 'Supervisor'
  if (role === 'manager') return 'Manager'
  return 'Unmapped'
}

function mappedRoleBadgeClass(role: MappedRole) {
  if (role === 'guard') return 'bg-teal-100 text-teal-700'
  if (role === 'supervisor') return 'bg-blue-100 text-blue-700'
  if (role === 'manager') return 'bg-purple-100 text-purple-700'
  return 'bg-red-100 text-red-700'
}

interface EmployeeTableProps {
  employees: AirtableEmployeePreview[]
  emptyMessage: string
}

function EmployeeTable({ employees, emptyMessage }: EmployeeTableProps) {
  return (
    <Card className="overflow-hidden border-slate-200">
      {employees.length === 0 ? (
        <div className="p-8 text-center text-slate-600">{emptyMessage}</div>
      ) : (
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="px-4 font-semibold text-slate-700">Code</TableHead>
              <TableHead className="px-4 font-semibold text-slate-700">Name</TableHead>
              <TableHead className="px-4 font-semibold text-slate-700">Airtable Role</TableHead>
              <TableHead className="px-4 font-semibold text-slate-700">Mapped Role</TableHead>
              <TableHead className="px-4 font-semibold text-slate-700">Status</TableHead>
              <TableHead className="px-4 font-semibold text-slate-700">Email</TableHead>
              <TableHead className="px-4 font-semibold text-slate-700">Phone</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => (
              <TableRow key={employee.airtableId} className="border-slate-200 hover:bg-slate-50">
                <TableCell className="px-4 font-mono text-sm text-slate-900">
                  {employee.employeeCode || 'N/A'}
                </TableCell>
                <TableCell className="px-4 font-medium text-slate-900">
                  {employee.fullName || 'Unnamed employee'}
                </TableCell>
                <TableCell className="px-4 text-slate-700">{employee.role || 'N/A'}</TableCell>
                <TableCell className="px-4">
                  <Badge className={`${mappedRoleBadgeClass(employee.mappedRole)} border-0`}>
                    {mappedRoleLabel(employee.mappedRole)}
                  </Badge>
                </TableCell>
                <TableCell className="px-4">
                  <Badge
                    className={
                      employee.isActive === false
                        ? 'border-0 bg-slate-200 text-slate-700'
                        : 'border-0 bg-green-100 text-green-700'
                    }
                  >
                    {employee.isActive === false ? 'Terminated' : 'Active'}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 text-slate-700">{employee.email || 'N/A'}</TableCell>
                <TableCell className="px-4 text-slate-700">{employee.phone || 'N/A'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}

export default function ManagerAirtableEmployeesPage() {
  const [dateStr] = useState(() => formatHeaderDate())
  const [managerName, setManagerName] = useState('User')
  const [employees, setEmployees] = useState<AirtableEmployeePreview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<(typeof ROLE_FILTERS)[number]>('All')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState('')

  useEffect(() => {
    const fetchPageData = async () => {
      try {
        setLoading(true)
        setError('')

        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          const { data: userData } = await supabase
            .from('users')
            .select('full_name')
            .eq('id', user.id)
            .single()

          if (userData?.full_name) setManagerName(userData.full_name)
        }

        const response = await fetch('/api/airtable/employees', { cache: 'no-store' })
        const payload = (await response.json()) as AirtableEmployeesResponse

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to fetch Airtable employees')
        }

        setEmployees(payload.employees)
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch Airtable employees')
      } finally {
        setLoading(false)
      }
    }

    fetchPageData()
  }, [])

  const handleSyncToSupabase = async () => {
    try {
      setSyncing(true)
      setSyncError('')
      setSyncResult(null)

      const response = await fetch('/api/airtable/employees/sync', {
        method: 'POST',
      })
      const payload = (await response.json()) as SyncResult

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to sync Airtable employees')
      }

      setSyncResult(payload)
    } catch (syncFetchError) {
      setSyncError(syncFetchError instanceof Error ? syncFetchError.message : 'Failed to sync Airtable employees')
    } finally {
      setSyncing(false)
    }
  }

  const stats = useMemo(() => {
    const byRole = {
      guard: employees.filter((employee) => employee.mappedRole === 'guard').length,
      supervisor: employees.filter((employee) => employee.mappedRole === 'supervisor').length,
      manager: employees.filter((employee) => employee.mappedRole === 'manager').length,
      unmapped: employees.filter((employee) => employee.mappedRole === 'unmapped').length,
    }
    const activeCount = employees.filter((employee) => employee.isActive !== false).length
    const terminatedCount = employees.filter((employee) => employee.isActive === false).length

    return [
      { label: 'Total employees', value: employees.length, className: 'text-slate-900' },
      { label: 'Active', value: activeCount, className: 'text-green-700' },
      { label: 'Terminated', value: terminatedCount, className: 'text-slate-700' },
      { label: 'Guards', value: byRole.guard, className: 'text-teal-700' },
      { label: 'Supervisors', value: byRole.supervisor, className: 'text-blue-700' },
      { label: 'Managers', value: byRole.manager, className: 'text-purple-700' },
      { label: 'Unmapped roles', value: byRole.unmapped, className: 'text-red-700' },
    ]
  }, [employees])

  const filteredEmployees = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return employees.filter((employee) => {
      const matchesSearch =
        !normalizedQuery ||
        Boolean(employee.fullName?.toLowerCase().includes(normalizedQuery)) ||
        Boolean(employee.employeeCode?.toLowerCase().includes(normalizedQuery)) ||
        Boolean(employee.role?.toLowerCase().includes(normalizedQuery)) ||
        Boolean(employee.email?.toLowerCase().includes(normalizedQuery))

      const matchesRole =
        roleFilter === 'All' || mappedRoleLabel(employee.mappedRole) === roleFilter

      return matchesSearch && matchesRole
    })
  }, [employees, roleFilter, searchQuery])

  const activeEmployees = useMemo(
    () => filteredEmployees.filter((employee) => employee.isActive !== false),
    [filteredEmployees],
  )
  const inactiveEmployees = useMemo(
    () => filteredEmployees.filter((employee) => employee.isActive === false),
    [filteredEmployees],
  )

  return (
    <>
      <AppTopBar date={dateStr} name={managerName} role="Manager" />

      <div className="p-4 sm:p-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
              Airtable Preview
            </p>
            <h1 className="text-3xl font-bold text-slate-900">Airtable Employees</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Preview employees from Airtable before syncing them into Guard Ops. Roles are mapped as Guard,
              Supervisor, Manager, or Unmapped.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search name, code, role, or email..."
              className="w-full lg:w-80"
            />
            <Button
              type="button"
              onClick={handleSyncToSupabase}
              disabled={loading || syncing || employees.length === 0}
              className="bg-teal-700 hover:bg-teal-800"
            >
              {syncing ? 'Syncing...' : 'Sync to Supabase'}
            </Button>
          </div>
        </div>

        {syncResult && (
          <Card className="mb-6 border-green-200 bg-green-50 p-4 text-sm text-green-800">
            Synced {syncResult.synced} employees: {syncResult.inserted} inserted, {syncResult.updated} updated.
            Skipped {syncResult.skipped.missingEmployeeCode + syncResult.skipped.missingFullName + syncResult.skipped.unmappedRole}
            {' '}records.
          </Card>
        )}

        {syncError && (
          <Card className="mb-6 border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {syncError}
          </Card>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="border-slate-200 p-4">
              <p className="text-xs text-slate-600">{stat.label}</p>
              <p className={`mt-2 text-3xl font-bold tabular-nums ${stat.className}`}>{stat.value}</p>
            </Card>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {ROLE_FILTERS.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setRoleFilter(role)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                roleFilter === role
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              {role}
            </button>
          ))}
        </div>

        {loading ? (
          <Card className="overflow-hidden border-slate-200">
            <div className="p-8 text-center text-slate-600">Loading Airtable employees...</div>
          </Card>
        ) : error ? (
          <Card className="overflow-hidden border-slate-200">
            <div className="p-8 text-center text-red-600">{error}</div>
          </Card>
        ) : (
          <>
            <section>
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Active Employees</h2>
                  <p className="text-sm text-slate-600">Emp Termination is not ticked in Airtable.</p>
                </div>
                <Badge className="border-0 bg-green-100 text-green-700">{activeEmployees.length} active</Badge>
              </div>
              <EmployeeTable
                employees={activeEmployees}
                emptyMessage="No active employees match the current filters."
              />
            </section>

            <section className="mt-8">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Not Active Employees</h2>
                  <p className="text-sm text-slate-600">Emp Termination is ticked in Airtable.</p>
                </div>
                <Badge className="border-0 bg-slate-200 text-slate-700">{inactiveEmployees.length} not active</Badge>
              </div>
              <EmployeeTable
                employees={inactiveEmployees}
                emptyMessage="No not-active employees match the current filters."
              />
            </section>

            <p className="mt-4 text-sm text-slate-600">
              Showing {filteredEmployees.length} of {employees.length} Airtable employees.
            </p>
          </>
        )}
      </div>
    </>
  )
}
