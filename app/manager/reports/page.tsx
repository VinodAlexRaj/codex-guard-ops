'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { LogOut, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { getLocalDateString } from '@/lib/utils'

interface SupervisorCoverage {
  name: string
  rate: number
  status: 'green' | 'amber' | 'red'
}

interface SiteGap {
  code: string
  name: string
  supervisor: string
  total: number
  filled: number
  gap: number
  rate: number
}

function firstRelated<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default function ManagerReportsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'coverage' | 'attendance' | 'leave'>('coverage')
  const [activePeriod, setActivePeriod] = useState('This month')
  const [activeSupervisor, setActiveSupervisor] = useState('All')
  const [loading, setLoading] = useState(false)
  const [dateStr, setDateStr] = useState('')
  const [managerName, setManagerName] = useState('User')
  
  // Coverage state
  const [avgFillRate, setAvgFillRate] = useState(0)
  const [totalSlots, setTotalSlots] = useState(0)
  const [filledSlots, setFilledSlots] = useState(0)
  const [unfilledSlots, setUnfilledSlots] = useState(0)
  const [supervisors, setSupervisors] = useState<SupervisorCoverage[]>([])
  const [sitesWithGaps, setSitesWithGaps] = useState<SiteGap[]>([])
  const [supervisorOptions, setSupervisorOptions] = useState<string[]>(['All'])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  // Set date on mount
  useEffect(() => {
    const todayDate = new Date()
    const formatted = todayDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    })
    setDateStr(formatted)
  }, [])

  // Fetch coverage data when tab is active
  useEffect(() => {
    if (activeTab !== 'coverage' || activePeriod !== 'This month') return

    const fetchCoverageData = async () => {
      try {
        setLoading(true)

        // Get manager name
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: userData } = await supabase
            .from('users')
            .select('full_name')
            .eq('id', user.id)
            .single()
          if (userData?.full_name) setManagerName(userData.full_name)
        }

        // Get current month range
        const today = getLocalDateString()
        const monthStart = today.substring(0, 7) + '-01'

        // Fetch coverage data
        const { data: coverage } = await supabase
          .from('roster_coverage')
          .select('site_id, shift_date, assigned, required_headcount')
          .gte('shift_date', monthStart)
          .lte('shift_date', today)

        // Fetch sites
        const { data: sites } = await supabase
          .from('sites')
          .select('id, site_code, name')

        // Fetch supervisor assignments
        const { data: supSites } = await supabase
          .from('supervisor_sites')
          .select('supervisor_id, site_id, users(full_name)')

        // Fetch supervisors
        const { data: supervisorsData } = await supabase
          .from('users')
          .select('id, full_name')
          .eq('external_role', 'OPERATIONS EXECUTIVE')

        // Calculate coverage stats
        const totalReq = (coverage || []).reduce((sum, c) => sum + c.required_headcount, 0)
        const totalAsgn = (coverage || []).reduce((sum, c) => sum + c.assigned, 0)
        const fillRate = totalReq > 0 ? Math.round((totalAsgn / totalReq) * 100) : 0

        setTotalSlots(totalReq)
        setFilledSlots(totalAsgn)
        setUnfilledSlots(totalReq - totalAsgn)
        setAvgFillRate(fillRate)

        // Build supervisor coverage stats
        const supMap = new Map((supervisorsData || []).map(s => [s.id, s.full_name]))
        const supSiteMap = new Map<string, number[]>()
        ;(supSites || []).forEach(ss => {
          const siteIds = supSiteMap.get(ss.supervisor_id) || []
          siteIds.push(ss.site_id)
          supSiteMap.set(ss.supervisor_id, siteIds)
        })

        const supCoverage: SupervisorCoverage[] = Array.from(supSiteMap.entries()).map(([supId, siteIds]) => {
          const supCov = (coverage || []).filter(c => siteIds.includes(c.site_id))
          const supReq = supCov.reduce((sum, c) => sum + c.required_headcount, 0)
          const supAsgn = supCov.reduce((sum, c) => sum + c.assigned, 0)
          const rate = supReq > 0 ? Math.round((supAsgn / supReq) * 100) : 100
          
          return {
            name: supMap.get(supId) || 'Unknown',
            rate,
            status: rate >= 90 ? 'green' : rate >= 70 ? 'amber' : 'red',
          }
        })

        setSupervisors(supCoverage)

        // Build sites with gaps
        const siteGaps: SiteGap[] = (sites || [])
          .map(site => {
            const siteCov = (coverage || []).filter(c => c.site_id === site.id)
            const total = siteCov.reduce((s, c) => s + c.required_headcount, 0)
            const filled = siteCov.reduce((s, c) => s + c.assigned, 0)
            const gap = total - filled
            const rate = total > 0 ? Math.round((filled / total) * 100) : 0
            const supervisorAssignment = (supSites || []).find(ss => ss.site_id === site.id)
            const supervisorUser = firstRelated(supervisorAssignment?.users)
            const supervisor = supervisorUser?.full_name || 'Unassigned'

            return {
              code: site.site_code,
              name: site.name,
              supervisor,
              total,
              filled,
              gap,
              rate,
            }
          })
          .filter(s => s.gap > 0)
          .sort((a, b) => a.rate - b.rate)
          .slice(0, 10)

        setSitesWithGaps(siteGaps)

        // Build supervisor filter options — only supervisors with at least 1 site assigned
        const supSiteData = supSites || []
        const supervisorOptions = (supervisorsData || [])
          .filter(sup => supSiteData.some(ss => ss.supervisor_id === sup.id))
          .map(sup => sup.full_name)
        setSupervisorOptions(['All', ...supervisorOptions])
      } catch (error) {
        console.error('[v0] Error fetching coverage data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchCoverageData()
  }, [activeTab, activePeriod])

  const getColorClass = (color: string) => {
    switch (color) {
      case 'green':
        return 'bg-green-600'
      case 'amber':
        return 'bg-amber-600'
      case 'red':
        return 'bg-red-600'
      case 'purple':
        return 'bg-purple-600'
      default:
        return 'bg-slate-600'
    }
  }

  const getRateBadgeClass = (rate: number) => {
    if (rate >= 90) return 'bg-green-100 text-green-700'
    if (rate >= 70) return 'bg-amber-100 text-amber-700'
    return 'bg-red-100 text-red-700'
  }

  const handleExportCSV = () => {
    alert('Export coming soon')
  }

  // Mock data for Attendance tab (keeping for now)
  const attendanceStats = [
    { label: 'On time', percentage: 78, color: 'green' },
    { label: 'Late', percentage: 12, color: 'amber' },
    { label: 'Absent', percentage: 7, color: 'red' },
    { label: 'On leave', percentage: 3, color: 'purple' },
  ]

  const guardAttendance = [
    { name: 'Ahmad Razif', onTime: 18, late: 2, absent: 1, otHours: '3.5 hrs', rate: 86 },
    { name: 'Siti Norizan', onTime: 20, late: 1, absent: 0, otHours: '0 hrs', rate: 95 },
    { name: 'Rajan Muthu', onTime: 19, late: 0, absent: 2, otHours: '1.5 hrs', rate: 90 },
    { name: 'Kamal Aizuddin', onTime: 15, late: 3, absent: 3, otHours: '0 hrs', rate: 71 },
    { name: 'Nora Baharom', onTime: 12, late: 1, absent: 0, otHours: '0 hrs', rate: 92 },
  ]

  const leaveStats = [
    { label: 'Total leave days', value: 156, color: 'blue' },
    { label: 'AL days', value: 98, color: 'purple' },
    { label: 'MC days', value: 42, color: 'red' },
    { label: 'EL/UL days', value: 16, color: 'amber' },
  ]

  const leaveByType = [
    { type: 'Annual Leave (AL)', percentage: 63, color: 'purple' },
    { type: 'Medical Leave (MC)', percentage: 27, color: 'red' },
    { type: 'Emergency Leave (EL)', percentage: 7, color: 'amber' },
    { type: 'Unpaid Leave (UL)', percentage: 3, color: 'slate' },
  ]

  const leaveUsageByGuard = [
    { name: 'Ahmad Razif', al: 8, mc: 2, el: 1, total: 11 },
    { name: 'Siti Norizan', al: 6, mc: 1, el: 0, total: 7 },
    { name: 'Rajan Muthu', al: 4, mc: 3, el: 2, total: 9 },
    { name: 'Kamal Aizuddin', al: 5, mc: 4, el: 0, total: 9 },
    { name: 'Nora Baharom', al: 10, mc: 2, el: 1, total: 13 },
  ]

  return (
    <>
      {/* Top Navigation */}
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

      {/* Page Content */}
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Reports</h1>
          <p className="text-slate-600">Coverage, attendance and leave analytics</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setActiveTab('coverage')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'coverage'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            Coverage
          </button>
          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'attendance'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            Attendance
          </button>
          <button
            onClick={() => setActiveTab('leave')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'leave'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            Leave
          </button>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'coverage' && (
            <div className="space-y-6">
              {/* Filter Row */}
              <div className="flex gap-8 items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">Period:</span>
                  <div className="flex gap-2">
                    {['This week', 'This month', 'Last month', 'Custom'].map((period) => (
                      <button
                        key={period}
                        onClick={() => setActivePeriod(period)}
                        className={`px-3 py-1 rounded text-xs font-medium transition ${
                          activePeriod === period
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                      >
                        {period}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">Supervisor:</span>
                  <div className="flex gap-2">
                    {supervisorOptions.map((supervisor) => (
                      <button
                        key={supervisor}
                        onClick={() => setActiveSupervisor(supervisor)}
                        className={`px-3 py-1 rounded text-xs font-medium transition ${
                          activeSupervisor === supervisor
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                      >
                        {supervisor}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ml-auto">
                  <Button
                    onClick={handleExportCSV}
                    variant="outline"
                    className="border-slate-300"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-4">
                <Card className="border-slate-200 p-4">
                  <p className="text-xs text-slate-600 mb-2">Avg fill rate</p>
                  <p className="text-3xl font-bold text-green-600">{avgFillRate}%</p>
                </Card>
                <Card className="border-slate-200 p-4">
                  <p className="text-xs text-slate-600 mb-2">Total slots</p>
                  <p className="text-3xl font-bold text-blue-600">{totalSlots.toLocaleString()}</p>
                </Card>
                <Card className="border-slate-200 p-4">
                  <p className="text-xs text-slate-600 mb-2">Filled slots</p>
                  <p className="text-3xl font-bold text-green-600">{filledSlots.toLocaleString()}</p>
                </Card>
                <Card className="border-slate-200 p-4">
                  <p className="text-xs text-slate-600 mb-2">Unfilled slots</p>
                  <p className="text-3xl font-bold text-red-600">{unfilledSlots.toLocaleString()}</p>
                </Card>
              </div>

              {/* Bar Chart */}
              <Card className="border-slate-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-6">Fill rate by supervisor</h3>
                <div className="space-y-4">
                  {supervisors.map((supervisor) => (
                    <div key={supervisor.name} className="flex items-center gap-4">
                      <div className="w-32 text-sm font-medium text-slate-700">{supervisor.name}</div>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 h-8 bg-slate-100 rounded flex items-center overflow-hidden">
                          <div
                            className={`h-full flex items-center justify-end pr-2 ${
                              supervisor.status === 'green'
                                ? 'bg-green-600'
                                : supervisor.status === 'amber'
                                  ? 'bg-amber-600'
                                  : 'bg-red-600'
                            }`}
                            style={{ width: `${supervisor.rate}%` }}
                          >
                            {supervisor.rate >= 50 && <span className="text-xs font-bold text-white">{supervisor.rate}%</span>}
                          </div>
                        </div>
                        {supervisor.rate < 50 && <span className="text-xs font-bold text-slate-900">{supervisor.rate}%</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Sites with Most Gaps Table */}
              <Card className="border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-900">Sites with most gaps</h3>
                </div>
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Site</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Supervisor</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Total</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Filled</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Gap</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sitesWithGaps.map((site) => (
                      <tr key={site.code} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="px-6 py-3">
                          <span className="font-mono text-sm font-semibold text-slate-900">{site.code}</span>
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-700">{site.supervisor}</td>
                        <td className="px-6 py-3 text-sm text-slate-700">{site.total}</td>
                        <td className="px-6 py-3 text-sm text-slate-700">{site.filled}</td>
                        <td className="px-6 py-3 text-sm font-medium text-red-600">{site.gap}</td>
                        <td className="px-6 py-3">
                          <Badge
                            variant="secondary"
                            className={`${
                              parseInt(site.rate) >= 80
                                ? 'bg-green-100 text-green-700'
                                : parseInt(site.rate) >= 50
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {site.rate}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          )}
          {activeTab === 'attendance' && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-4">
                {attendanceStats.map((stat) => (
                  <Card key={stat.label} className="border-slate-200 p-4">
                    <p className="text-xs text-slate-600 mb-2">{stat.label}</p>
                    <p
                      className={`text-3xl font-bold ${
                        stat.color === 'green'
                          ? 'text-green-600'
                          : stat.color === 'amber'
                            ? 'text-amber-600'
                            : stat.color === 'red'
                              ? 'text-red-600'
                              : 'text-purple-600'
                      }`}
                    >
                      {stat.percentage}%
                    </p>
                  </Card>
                ))}
              </div>

              {/* Attendance Breakdown Chart */}
              <Card className="border-slate-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-6">Attendance breakdown</h3>
                <div className="space-y-4">
                  {attendanceStats.map((stat) => (
                    <div key={stat.label} className="flex items-center gap-4">
                      <div className="w-24 text-sm font-medium text-slate-700">{stat.label}</div>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 h-8 bg-slate-100 rounded flex items-center overflow-hidden">
                          <div
                            className={`h-full flex items-center justify-end pr-2 ${getColorClass(stat.color)}`}
                            style={{ width: `${stat.percentage}%` }}
                          >
                            <span className="text-xs font-bold text-white">{stat.percentage}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Guard Attendance Table */}
              <Card className="border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-900">Guard attendance this period</h3>
                </div>
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Guard</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">On time</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Late</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Absent</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">OT hours</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guardAttendance.map((guard) => (
                      <tr key={guard.name} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="px-6 py-3 text-sm font-medium text-slate-900">{guard.name}</td>
                        <td className="px-6 py-3 text-sm text-slate-700">{guard.onTime}</td>
                        <td className="px-6 py-3 text-sm text-slate-700">{guard.late}</td>
                        <td className="px-6 py-3 text-sm text-slate-700">{guard.absent}</td>
                        <td className="px-6 py-3 text-sm text-slate-700">{guard.otHours}</td>
                        <td className="px-6 py-3">
                          <Badge variant="secondary" className={getRateBadgeClass(guard.rate)}>
                            {guard.rate}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          )}
          {activeTab === 'leave' && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-4">
                {leaveStats.map((stat) => (
                  <Card key={stat.label} className="border-slate-200 p-4">
                    <p className="text-xs text-slate-600 mb-2">{stat.label}</p>
                    <p
                      className={`text-3xl font-bold ${
                        stat.color === 'blue'
                          ? 'text-blue-600'
                          : stat.color === 'purple'
                            ? 'text-purple-600'
                            : stat.color === 'red'
                              ? 'text-red-600'
                              : 'text-amber-600'
                      }`}
                    >
                      {stat.value}
                    </p>
                  </Card>
                ))}
              </div>

              {/* Leave by Type Chart */}
              <Card className="border-slate-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-6">Leave by type</h3>
                <div className="space-y-4">
                  {leaveByType.map((leave) => (
                    <div key={leave.type} className="flex items-center gap-4">
                      <div className="w-40 text-sm font-medium text-slate-700">{leave.type}</div>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 h-8 bg-slate-100 rounded flex items-center overflow-hidden">
                          <div
                            className={`h-full flex items-center justify-end pr-2 ${
                              leave.color === 'purple'
                                ? 'bg-purple-600'
                                : leave.color === 'red'
                                  ? 'bg-red-600'
                                  : leave.color === 'amber'
                                    ? 'bg-amber-600'
                                    : 'bg-slate-400'
                            }`}
                            style={{ width: `${leave.percentage}%` }}
                          >
                            <span className="text-xs font-bold text-white">{leave.percentage}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Leave Usage by Guard Table */}
              <Card className="border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-900">Leave usage by guard</h3>
                </div>
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Guard</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">AL used</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">MC used</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">EL used</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Total days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaveUsageByGuard.map((guard) => (
                      <tr key={guard.name} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="px-6 py-3 text-sm font-medium text-slate-900">{guard.name}</td>
                        <td className="px-6 py-3 text-sm text-slate-700">{guard.al}</td>
                        <td className="px-6 py-3 text-sm text-slate-700">{guard.mc}</td>
                        <td className="px-6 py-3 text-sm text-slate-700">{guard.el}</td>
                        <td className="px-6 py-3 text-sm font-semibold text-slate-900">{guard.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
