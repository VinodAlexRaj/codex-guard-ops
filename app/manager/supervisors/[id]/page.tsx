'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LogOut, ChevronLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { formatHeaderDate, getLocalDateString } from '@/lib/utils'

interface SupervisorDetail {
  id: string
  name: string
  role: string
  code: string
  status: string
  sites: number
  guards: number
  fillRateToday: number
  gapsToday: number
}

interface AssignedSite {
  code: string
  name: string
  fillRate: number
  openSlots: number
}

interface GuardUnderSupervisor {
  code: string
  name: string
  role: string
  status: string
}

export default function SupervisorDetailPage() {
  const router = useRouter()
  const params = useParams()
  const supervisorCode = params.id as string
  const [loading, setLoading] = useState(true)
  const [managerName, setManagerName] = useState('User')
  const [supervisor, setSupervisor] = useState<SupervisorDetail | null>(null)
  const [assignedSites, setAssignedSites] = useState<AssignedSite[]>([])
  const [guardsUnderSuper, setGuardsUnderSuper] = useState<GuardUnderSupervisor[]>([])
  const [dateStr] = useState(() => formatHeaderDate())

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  useEffect(() => {
    const fetchSupervisorDetail = async () => {
      try {
        setLoading(true)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.replace('/')
          return
        }

        const [{ data: managerData }, { data: supervisorUser }] = await Promise.all([
          supabase.from('users').select('full_name').eq('id', user.id).single(),
          supabase
            .from('users')
            .select('id, full_name, external_employee_code, external_role, is_active')
            .eq('external_employee_code', supervisorCode)
            .single(),
        ])

        if (managerData?.full_name) setManagerName(managerData.full_name)
        if (!supervisorUser) {
          setSupervisor(null)
          return
        }

        const { data: supSites } = await supabase
          .from('supervisor_sites')
          .select('site_id, sites(id, site_code, name)')
          .eq('supervisor_id', supervisorUser.id)

        const siteIds = (supSites || []).map((site) => site.site_id)
        const today = getLocalDateString()

        const [{ data: coverage }, { data: assignments }] = await Promise.all([
          siteIds.length > 0
            ? supabase
                .from('roster_coverage')
                .select('site_id, assigned, required_headcount')
                .in('site_id', siteIds)
                .eq('shift_date', today)
            : Promise.resolve({ data: [] }),
          siteIds.length > 0
            ? supabase
                .from('shift_assignments')
                .select('guard_id, site_id')
                .in('site_id', siteIds)
                .eq('is_cancelled', false)
            : Promise.resolve({ data: [] }),
        ])

        const covData = coverage || []
        const assignData = assignments || []
        const uniqueGuardIds = [...new Set(assignData.map((assignment) => assignment.guard_id))]
        const { data: guards } = uniqueGuardIds.length > 0
          ? await supabase
              .from('users')
              .select('id, full_name, external_employee_code, external_role, is_active')
              .in('id', uniqueGuardIds)
          : { data: [] }

        const sites: AssignedSite[] = (supSites || []).map((assignment) => {
          const site = Array.isArray(assignment.sites) ? assignment.sites[0] : assignment.sites
          const siteCoverage = covData.filter((row) => row.site_id === assignment.site_id)
          const required = siteCoverage.reduce((sum, row) => sum + row.required_headcount, 0)
          const assigned = siteCoverage.reduce((sum, row) => sum + row.assigned, 0)

          return {
            code: site?.site_code || 'N/A',
            name: site?.name || 'Unknown site',
            fillRate: required > 0 ? Math.round((assigned / required) * 100) : 0,
            openSlots: Math.max(0, required - assigned),
          }
        })

        const totalRequired = covData.reduce((sum, row) => sum + row.required_headcount, 0)
        const totalAssigned = covData.reduce((sum, row) => sum + row.assigned, 0)
        const totalGaps = sites.reduce((sum, site) => sum + site.openSlots, 0)

        setSupervisor({
          id: supervisorUser.id,
          name: supervisorUser.full_name,
          role: supervisorUser.external_role || 'Operations Executive',
          code: supervisorUser.external_employee_code || 'N/A',
          status: supervisorUser.is_active ? 'Active' : 'Inactive',
          sites: sites.length,
          guards: uniqueGuardIds.length,
          fillRateToday: totalRequired > 0 ? Math.round((totalAssigned / totalRequired) * 100) : 0,
          gapsToday: totalGaps,
        })
        setAssignedSites(sites)
        setGuardsUnderSuper((guards || []).map((guard) => ({
          code: guard.external_employee_code || 'N/A',
          name: guard.full_name,
          role: guard.external_role,
          status: guard.is_active ? 'Active' : 'Inactive',
        })))
      } catch (error) {
        console.error('[v0] Error fetching supervisor detail:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSupervisorDetail()
  }, [router, supervisorCode])

  const getFillRateBadgeColor = (rate: number) => {
    if (rate >= 80) return 'bg-green-100 text-green-800'
    if (rate >= 50) return 'bg-amber-100 text-amber-800'
    return 'bg-red-100 text-red-800'
  }

  const getStatusColor = (status: string) => {
    if (status === 'Active') return 'bg-green-100 text-green-700'
    if (status === 'On leave') return 'bg-amber-100 text-amber-700'
    return 'bg-slate-100 text-slate-700'
  }

  return (
    <>
      <header className="border-b border-slate-200 bg-white px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">{dateStr}</div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">{managerName}</p>
              <Badge variant="secondary" className="mt-1">
                Manager
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-slate-600 hover:text-slate-900"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white px-8 py-3">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-slate-600 hover:text-slate-900 pl-0"
        >
          <Link href="/manager/supervisors">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Supervisors
          </Link>
        </Button>
      </div>

      <div className="p-8">
        {loading ? (
          <div className="py-12 text-center text-slate-600">Loading supervisor details...</div>
        ) : !supervisor ? (
          <Card className="border-slate-200 p-8 text-center text-slate-600">
            Supervisor not found.
          </Card>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-slate-900 mb-3">{supervisor.name}</h1>
              <div className="flex items-center gap-2">
                <Badge className="bg-slate-200 text-slate-700 border-0">{supervisor.role}</Badge>
                <Badge className="bg-slate-200 text-slate-700 border-0">{supervisor.code}</Badge>
                <Badge className={`${getStatusColor(supervisor.status)} border-0`}>{supervisor.status}</Badge>
              </div>
            </div>

            <div className="mb-8 grid grid-cols-4 gap-4">
              <Card className="border-slate-200 p-4">
                <p className="text-sm text-slate-600 mb-2">Sites assigned</p>
                <p className="text-2xl font-bold text-blue-600">{supervisor.sites}</p>
              </Card>
              <Card className="border-slate-200 p-4">
                <p className="text-sm text-slate-600 mb-2">Guards managed</p>
                <p className="text-2xl font-bold text-blue-600">{supervisor.guards}</p>
              </Card>
              <Card className="border-slate-200 p-4">
                <p className="text-sm text-slate-600 mb-2">Fill rate today</p>
                <p className="text-2xl font-bold text-amber-600">{supervisor.fillRateToday}%</p>
              </Card>
              <Card className="border-slate-200 p-4">
                <p className="text-sm text-slate-600 mb-2">Gaps today</p>
                <p className="text-2xl font-bold text-red-600">{supervisor.gapsToday}</p>
              </Card>
            </div>

            <div className="mb-8">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Assigned sites</h2>
              <Card className="border-slate-200 overflow-hidden">
                {assignedSites.length === 0 ? (
                  <div className="p-6 text-center text-slate-600">No assigned sites found.</div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Site Code</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Site Name</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Fill rate</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Open slots</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignedSites.map((site) => (
                        <tr key={site.code} className="border-b border-slate-200 hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm font-medium text-slate-900">{site.code}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-900">{site.name}</td>
                          <td className="px-4 py-3">
                            <Badge className={`${getFillRateBadgeColor(site.fillRate)} border-0`}>
                              {site.fillRate}%
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-900">{site.openSlots}</td>
                          <td className="px-4 py-3">
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                              className="text-slate-700 border-slate-300 hover:bg-slate-50"
                            >
                              <Link href={`/supervisor/sites/${site.code}/schedule`}>Schedule</Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900 mb-4">Guards under this supervisor</h2>
              <Card className="border-slate-200 overflow-hidden">
                {guardsUnderSuper.length === 0 ? (
                  <div className="p-6 text-center text-slate-600">No assigned guards found.</div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Code</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Name</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Role</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {guardsUnderSuper.map((guard) => (
                        <tr key={`${guard.code}-${guard.name}`} className="border-b border-slate-200 hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm font-medium text-slate-900">{guard.code}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-900">{guard.name}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{guard.role}</td>
                          <td className="px-4 py-3">
                            <Badge className={`${getStatusColor(guard.status)} border-0`}>
                              {guard.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  )
}