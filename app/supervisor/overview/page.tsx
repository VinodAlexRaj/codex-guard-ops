'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, PieChart } from 'lucide-react'
import { AppTopBar } from '@/components/app-top-bar'
import { MetricCard } from '@/components/metric-card'
import { SegmentedControl } from '@/components/segmented-control'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

const SITE_FILTERS = ['All', 'Urgent', 'Partial', 'Filled'] as const

type SiteFilter = (typeof SITE_FILTERS)[number]

interface SiteRow {
  code: string
  name: string
  id: string
  totalRequired: number
  totalAssigned: number
  fillRate: number
  openSlots: number
  shifts: ShiftStatus[]
}

interface ShiftStatus {
  name: string
  status: 'filled' | 'partial' | 'gap'
}

interface AbsentGuard {
  name: string
  siteCode: string
  shift: string
  status: 'absent' | 'leave'
}

interface CurrentUser {
  id: string
  full_name: string
}

export default function SupervisorOverviewPage() {
  const router = useRouter()
  const [activeFilter, setActiveFilter] = useState<SiteFilter>('All')
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [sitesWithGaps, setSitesWithGaps] = useState(0)
  const [unfilledSlots, setUnfilledSlots] = useState(0)
  const [guardsAbsent, setGuardsAbsent] = useState(0)
  const [fillRate, setFillRate] = useState(0)
  const [dateStr] = useState(() => formatHeaderDate())
  const [sitesData, setSitesData] = useState<SiteRow[]>([])
  const [absenceData, setAbsenceData] = useState<AbsentGuard[]>([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          router.replace('/')
          return
        }

        const [{ data: userData }, { data: supervisorSites }] = await Promise.all([
          supabase.from('users').select('id, full_name').eq('id', user.id).single(),
          supabase
            .from('supervisor_sites')
            .select('site_id, sites(id, site_code, name)')
            .eq('supervisor_id', user.id),
        ])

        if (userData) setCurrentUser(userData)

        if (!supervisorSites || supervisorSites.length === 0) {
          setSitesData([])
          setAbsenceData([])
          return
        }

        const siteMap: Record<string, { id: string; code: string; name: string }> = {}
        supervisorSites.forEach((assignment) => {
          const site = Array.isArray(assignment.sites) ? assignment.sites[0] : assignment.sites
          if (!site) return
          siteMap[assignment.site_id] = {
            id: site.id,
            code: site.site_code,
            name: site.name,
          }
        })

        const siteIds = supervisorSites.map((assignment) => assignment.site_id)
        const today = getLocalDateString()

        const [{ data: coverage }, { data: shiftDefs }, { data: absents }] = await Promise.all([
          supabase
            .from('roster_coverage')
            .select('site_id, shift_definition_id, assigned, required_headcount, is_fulfilled')
            .in('site_id', siteIds)
            .eq('shift_date', today),
          supabase
            .from('shift_definitions')
            .select('id, site_id, shift_name')
            .in('site_id', siteIds)
            .eq('is_active', true),
          supabase
            .from('attendance')
            .select(`
              id,
              status,
              shift_assignments(
                id,
                site_id,
                users(full_name),
                roster_slots(shift_definition_id, sites(site_code))
              )
            `)
            .eq('status', 'absent')
            .in('shift_assignments.site_id', siteIds),
        ])

        const siteRows: SiteRow[] = Object.values(siteMap).map((site) => {
          const siteCoverage = coverage?.filter((coverageRow) => coverageRow.site_id === site.id) || []
          const totalRequired = siteCoverage.reduce((sum, coverageRow) => sum + coverageRow.required_headcount, 0)
          const totalAssigned = siteCoverage.reduce((sum, coverageRow) => sum + coverageRow.assigned, 0)
          const siteShiftDefs = shiftDefs?.filter((shift) => shift.site_id === site.id) || []
          const shifts = siteShiftDefs.map((shiftDef) => {
            const covRow = siteCoverage.find((coverageRow) => coverageRow.shift_definition_id === shiftDef.id)
            const status: ShiftStatus['status'] = covRow?.is_fulfilled
              ? 'filled'
              : covRow && covRow.assigned > 0
                ? 'partial'
                : 'gap'

            return { name: shiftDef.shift_name, status }
          })

          return {
            code: site.code,
            name: site.name,
            id: site.id,
            totalRequired,
            totalAssigned,
            fillRate: totalRequired > 0 ? Math.round((totalAssigned / totalRequired) * 100) : 0,
            openSlots: Math.max(0, totalRequired - totalAssigned),
            shifts,
          }
        })

        setSitesData(siteRows)
        setSitesWithGaps(siteRows.filter((site) => site.openSlots > 0).length)
        setUnfilledSlots(siteRows.reduce((sum, site) => sum + site.openSlots, 0))
        setGuardsAbsent(absents?.length || 0)

        const globalTotalRequired = siteRows.reduce((sum, site) => sum + site.totalRequired, 0)
        const globalTotalAssigned = siteRows.reduce((sum, site) => sum + site.totalAssigned, 0)
        setFillRate(globalTotalRequired > 0 ? Math.round((globalTotalAssigned / globalTotalRequired) * 100) : 0)

        const absenceList: AbsentGuard[] = (absents || []).map((absence) => {
          const assignment = Array.isArray(absence.shift_assignments)
            ? absence.shift_assignments[0]
            : absence.shift_assignments
          const userRecord = Array.isArray(assignment?.users) ? assignment?.users[0] : assignment?.users
          const slotRecord = Array.isArray(assignment?.roster_slots)
            ? assignment?.roster_slots[0]
            : assignment?.roster_slots
          const siteRecord = Array.isArray(slotRecord?.sites) ? slotRecord?.sites[0] : slotRecord?.sites
          const shiftName = shiftDefs?.find((shift) => shift.id === slotRecord?.shift_definition_id)?.shift_name || 'Shift'

          return {
            name: userRecord?.full_name || 'Unknown',
            siteCode: siteRecord?.site_code || 'Unknown',
            shift: shiftName,
            status: 'absent',
          }
        })

        setAbsenceData(absenceList)
      } catch (error) {
        console.error('[v0] Error fetching overview data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router])

  const stats = useMemo(
    () => [
      { label: 'Sites With Gaps Today', value: sitesWithGaps, tone: 'red' as const, icon: AlertCircle },
      { label: 'Unfilled Slots Today', value: unfilledSlots, tone: 'amber' as const, icon: AlertCircle },
      { label: 'Guards Absent', value: guardsAbsent, tone: 'red' as const, icon: AlertCircle },
      { label: 'Overall Fill Rate', value: `${fillRate}%`, tone: 'green' as const, icon: PieChart },
    ],
    [fillRate, guardsAbsent, sitesWithGaps, unfilledSlots],
  )

  const filteredSites = useMemo(() => {
    if (activeFilter === 'Urgent') return sitesData.filter((site) => site.fillRate < 50)
    if (activeFilter === 'Partial') return sitesData.filter((site) => site.fillRate >= 50 && site.fillRate < 80)
    if (activeFilter === 'Filled') return sitesData.filter((site) => site.fillRate >= 80)
    return sitesData
  }, [activeFilter, sitesData])

  const handleSchedule = (siteCode: string) => {
    router.push(`/supervisor/sites/${siteCode}/schedule`)
  }

  const getFillRateBadgeColor = (rate: number) => {
    if (rate >= 80) return 'bg-green-100 text-green-800'
    if (rate >= 50) return 'bg-amber-100 text-amber-800'
    return 'bg-red-100 text-red-800'
  }

  const getShiftStatusColor = (status: ShiftStatus['status']) => {
    if (status === 'filled') return 'bg-green-100 text-green-700'
    if (status === 'partial') return 'bg-amber-100 text-amber-700'
    return 'bg-red-100 text-red-700'
  }

  const getShiftStatusSymbol = (status: ShiftStatus['status']) => {
    if (status === 'filled') return '\u2713'
    if (status === 'partial') return '~'
    return '\u2715'
  }

  return (
    <>
      <AppTopBar date={dateStr} name={currentUser?.full_name || 'User'} role="Supervisor" />

      <div className="p-4 sm:p-8">
        {loading ? (
          <div aria-live="polite" className="py-12 text-center text-slate-600">
            Loading Overview Data…
          </div>
        ) : sitesData.length === 0 ? (
          <div className="py-12 text-center text-slate-600">No sites assigned to you yet.</div>
        ) : (
          <>
            <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <MetricCard key={stat.label} {...stat} />
              ))}
            </div>

            <section className="mb-8">
              <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <h2 className="text-lg font-bold text-slate-900">Sites Needing Attention Today</h2>
                <SegmentedControl
                  label="Filter Sites"
                  value={activeFilter}
                  options={SITE_FILTERS}
                  onChange={setActiveFilter}
                />
              </div>

              <Card className="overflow-hidden border-slate-200">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow className="border-slate-200">
                        <TableHead className="font-semibold text-slate-700">Site Code</TableHead>
                        <TableHead className="font-semibold text-slate-700">Site Name</TableHead>
                        <TableHead className="font-semibold text-slate-700">Shifts Today</TableHead>
                        <TableHead className="font-semibold text-slate-700">Fill Rate</TableHead>
                        <TableHead className="font-semibold text-slate-700">Open Slots</TableHead>
                        <TableHead className="font-semibold text-slate-700">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSites.map((site) => (
                        <TableRow key={site.id} className="border-slate-200 hover:bg-slate-50">
                          <TableCell className="font-medium text-slate-900">{site.code}</TableCell>
                          <TableCell className="text-slate-900">{site.name}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              {site.shifts.map((shift) => (
                                <span
                                  key={`${site.id}-${shift.name}`}
                                  className={`rounded px-2 py-1 text-xs font-medium ${getShiftStatusColor(shift.status)}`}
                                >
                                  {shift.name} {getShiftStatusSymbol(shift.status)}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getFillRateBadgeColor(site.fillRate)}>{site.fillRate}%</Badge>
                          </TableCell>
                          <TableCell>
                            {site.openSlots === 0 ? (
                              <span className="font-medium text-green-600">Filled</span>
                            ) : (
                              <span className="font-medium tabular-nums text-red-600">{site.openSlots} open</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSchedule(site.code)}
                              className="border-teal-200 text-teal-600 hover:bg-teal-50"
                            >
                              Schedule
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </section>

            <section>
              <h2 className="mb-4 text-lg font-bold text-slate-900">Guards Absent Today</h2>
              <Card className="overflow-hidden border-slate-200">
                {absenceData.length === 0 ? (
                  <div className="p-6 text-center text-slate-600">No absences reported today.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow className="border-slate-200">
                          <TableHead className="font-semibold text-slate-700">Guard Name</TableHead>
                          <TableHead className="font-semibold text-slate-700">Site Code</TableHead>
                          <TableHead className="font-semibold text-slate-700">Shift</TableHead>
                          <TableHead className="font-semibold text-slate-700">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {absenceData.map((absence) => (
                          <TableRow key={`${absence.name}-${absence.siteCode}-${absence.shift}`} className="border-slate-200 hover:bg-slate-50">
                            <TableCell className="font-medium text-slate-900">{absence.name}</TableCell>
                            <TableCell className="text-slate-900">{absence.siteCode}</TableCell>
                            <TableCell className="text-slate-700">{absence.shift}</TableCell>
                            <TableCell>
                              {absence.status === 'leave' ? (
                                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                  On Leave (AL)
                                </Badge>
                              ) : (
                                <Button variant="outline" size="sm" className="border-teal-200 text-teal-600 hover:bg-teal-50">
                                  Find Replacement
                                </Button>
                              )}
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

