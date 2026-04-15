'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Calendar, PieChart } from 'lucide-react'
import { AppTopBar } from '@/components/app-top-bar'
import { MetricCard } from '@/components/metric-card'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { supabase } from '@/lib/supabase/client'
import { formatHeaderDate, getLocalDateString } from '@/lib/utils'

interface SupervisorCard {
  id: string
  name: string
  sites: number
  guards: number
  fillRate: number
  gaps: number
}

interface SiteToAttend {
  code: string
  name: string
  supervisor: string
  fillRate: number
  openSlots: number
}

export default function ManagerOverviewPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [dateStr] = useState(() => formatHeaderDate())
  const [managerName, setManagerName] = useState('User')
  const [sitesWithGaps, setSitesWithGaps] = useState(0)
  const [unfilledSlots, setUnfilledSlots] = useState(0)
  const [guardsOnLeave] = useState(0)
  const [guardsAbsent] = useState(0)
  const [orgFillRate, setOrgFillRate] = useState(0)
  const [supervisors, setSupervisors] = useState<SupervisorCard[]>([])
  const [sitesNeedingAttention, setSitesNeedingAttention] = useState<SiteToAttend[]>([])

  useEffect(() => {
    const fetchOverviewData = async () => {
      try {
        setLoading(true)

        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          router.replace('/')
          return
        }

        const [{ data: userData }, { data: sites }, { data: supervisorUsers }, { data: supSites }] =
          await Promise.all([
            supabase.from('users').select('full_name').eq('id', user.id).single(),
            supabase.from('sites').select('id, site_code, name'),
            supabase
              .from('users')
              .select('id, full_name, external_employee_code')
              .eq('external_role', 'OPERATIONS EXECUTIVE')
              .eq('is_active', true),
            supabase.from('supervisor_sites').select('supervisor_id, site_id'),
          ])

        if (userData?.full_name) setManagerName(userData.full_name)
        if (!sites || sites.length === 0) return

        const siteIds = sites.map((site) => site.id)
        const today = getLocalDateString()
        const { data: coverage } = await supabase
          .from('roster_coverage')
          .select('site_id, assigned, required_headcount, is_fulfilled')
          .in('site_id', siteIds)
          .eq('shift_date', today)

        const covData = coverage || []
        const totalRequired = covData.reduce((sum, coverageRow) => sum + coverageRow.required_headcount, 0)
        const totalAssigned = covData.reduce((sum, coverageRow) => sum + coverageRow.assigned, 0)

        const gapSites = siteIds.filter((id) => {
          const siteCov = covData.filter((coverageRow) => coverageRow.site_id === id)
          const required = siteCov.reduce((sum, coverageRow) => sum + coverageRow.required_headcount, 0)
          const assigned = siteCov.reduce((sum, coverageRow) => sum + coverageRow.assigned, 0)
          return required > assigned
        }).length

        setSitesWithGaps(gapSites)
        setUnfilledSlots(Math.max(0, totalRequired - totalAssigned))
        setOrgFillRate(totalRequired > 0 ? Math.round((totalAssigned / totalRequired) * 100) : 0)

        const supCards: SupervisorCard[] = (supervisorUsers || []).map((supervisor) => {
          const supSiteIds = (supSites || [])
            .filter((site) => site.supervisor_id === supervisor.id)
            .map((site) => site.site_id)
          const supCov = covData.filter((coverageRow) => supSiteIds.includes(coverageRow.site_id))
          const supRequired = supCov.reduce((sum, coverageRow) => sum + coverageRow.required_headcount, 0)
          const supAssigned = supCov.reduce((sum, coverageRow) => sum + coverageRow.assigned, 0)
          const supGaps = supSiteIds.filter((id) => {
            const siteCov = covData.filter((coverageRow) => coverageRow.site_id === id)
            const required = siteCov.reduce((sum, coverageRow) => sum + coverageRow.required_headcount, 0)
            const assigned = siteCov.reduce((sum, coverageRow) => sum + coverageRow.assigned, 0)
            return required > assigned
          }).length

          return {
            id: supervisor.id,
            name: supervisor.full_name,
            sites: supSiteIds.length,
            guards: 0,
            fillRate: supRequired > 0 ? Math.round((supAssigned / supRequired) * 100) : 0,
            gaps: supGaps,
          }
        })

        setSupervisors(supCards)

        const sitesAttention = sites
          .map((site) => {
            const siteCov = covData.filter((coverageRow) => coverageRow.site_id === site.id)
            const required = siteCov.reduce((sum, coverageRow) => sum + coverageRow.required_headcount, 0)
            const assigned = siteCov.reduce((sum, coverageRow) => sum + coverageRow.assigned, 0)
            const supervisorId = (supSites || []).find((assignment) => assignment.site_id === site.id)?.supervisor_id
            const supervisor = supervisorUsers?.find((person) => person.id === supervisorId)?.full_name || 'Unassigned'

            return {
              code: site.site_code,
              name: site.name,
              supervisor,
              fillRate: required > 0 ? Math.round((assigned / required) * 100) : 100,
              openSlots: Math.max(0, required - assigned),
            }
          })
          .filter((site) => site.fillRate < 100)
          .sort((a, b) => a.fillRate - b.fillRate)
          .slice(0, 5)

        setSitesNeedingAttention(sitesAttention)
      } catch (error) {
        console.error('[v0] Error fetching overview:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchOverviewData()
  }, [router])

  const stats = useMemo(
    () => [
      { label: 'Sites With Gaps Today', value: sitesWithGaps, tone: 'red' as const, icon: AlertCircle },
      { label: 'Unfilled Slots', value: unfilledSlots, tone: 'amber' as const, icon: AlertCircle },
      { label: 'Guards On Leave', value: guardsOnLeave, tone: 'blue' as const, icon: Calendar },
      { label: 'Guards Absent', value: guardsAbsent, tone: 'red' as const, icon: AlertCircle },
      { label: 'Org Fill Rate', value: `${orgFillRate}%`, tone: 'green' as const, icon: PieChart },
    ],
    [guardsAbsent, guardsOnLeave, orgFillRate, sitesWithGaps, unfilledSlots],
  )

  const getFillRateBadgeColor = (rate: number) => {
    if (rate >= 80) return 'bg-green-100 text-green-800'
    if (rate >= 50) return 'bg-amber-100 text-amber-800'
    return 'bg-red-100 text-red-800'
  }

  return (
    <>
      <AppTopBar date={dateStr} name={managerName} role="Manager" />

      <div className="p-4 sm:p-8">
        {loading ? (
          <div aria-live="polite" className="py-12 text-center text-slate-600">
            Loading Overview Data…
          </div>
        ) : (
          <>
            <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {stats.map((stat) => (
                <MetricCard key={stat.label} {...stat} />
              ))}
            </div>

            <section className="mb-8">
              <h2 className="mb-4 text-lg font-bold text-slate-900">By Supervisor</h2>
              {supervisors.length === 0 ? (
                <Card className="border-slate-200 p-6 text-center text-slate-600">
                  No supervisors found.
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {supervisors.map((supervisor) => (
                    <Card key={supervisor.id} className="border-slate-200 p-6">
                      <h3 className="mb-4 truncate font-medium text-slate-900">{supervisor.name}</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="text-slate-600">Sites:</span>
                          <span className="font-medium tabular-nums text-slate-900">{supervisor.sites}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-slate-600">Fill Rate:</span>
                          <Badge className={getFillRateBadgeColor(supervisor.fillRate)}>
                            {supervisor.fillRate}%
                          </Badge>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-slate-600">Gaps:</span>
                          <span className="font-medium tabular-nums text-red-600">{supervisor.gaps}</span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-4 text-lg font-bold text-slate-900">Sites Needing Attention</h2>
              <Card className="overflow-hidden border-slate-200">
                {sitesNeedingAttention.length === 0 ? (
                  <div className="p-6 text-center text-slate-600">
                    All sites are fully covered today.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow className="border-slate-200">
                          <TableHead className="font-semibold text-slate-700">Site Code</TableHead>
                          <TableHead className="font-semibold text-slate-700">Site Name</TableHead>
                          <TableHead className="font-semibold text-slate-700">Supervisor</TableHead>
                          <TableHead className="font-semibold text-slate-700">Fill Rate</TableHead>
                          <TableHead className="font-semibold text-slate-700">Open Slots</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sitesNeedingAttention.map((site) => (
                          <TableRow key={site.code} className="border-slate-200 hover:bg-slate-50">
                            <TableCell className="font-medium text-slate-900">{site.code}</TableCell>
                            <TableCell className="text-slate-900">{site.name}</TableCell>
                            <TableCell className="text-slate-700">{site.supervisor}</TableCell>
                            <TableCell>
                              <Badge className={getFillRateBadgeColor(site.fillRate)}>
                                {site.fillRate}%
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium tabular-nums text-red-600">{site.openSlots}</span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            </section>
          </>
        )}
      </div>
    </>
  )
}
